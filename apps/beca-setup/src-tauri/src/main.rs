#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod control;

use anyhow::{anyhow, Context};
use beca_bridge::dependency::{resolve_bridge_runtime, BridgeRuntimeInput};
use beca_bridge::list_midi_outputs as bridge_list_midi_outputs;
use beca_flasher::flash::{
    download_firmware, flash_firmware as run_flash, FlashCommandConfig, FlashTool,
};
use beca_flasher::{
    backup_nvs, detect_beca_ports, fetch_latest_manifest, parse_manifest, resolve_flash_tool,
    restore_nvs, select_best_port, FirmwareManifest,
};
use chrono::Utc;
use control::{
    control_request, control_snapshot, current_control_target, discover_beca_targets,
    select_control_target, ControlSnapshot, ControlTarget,
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs::{self, File};
use std::io::{ErrorKind, Read, Write};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::fs as tokio_fs;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use tracing::{error, info};
use zip::write::SimpleFileOptions;

const DEFAULT_FIRMWARE_REPO: &str = "fattyrecordingco/BECAfirmware";
const HARDWARE_ID: &str = "ESP32-PICO-V3";
const LATEST_STABLE_FIRMWARE: &str = "latest-stable";
const SERIAL_CTRL_BAUD: u32 = 115200;
const ESPFLASH_SIDECAR_VERSION: &str = "4.2.0";
const ESPTOOL_SIDECAR_VERSION: &str = "5.2.0";
const CONTROL_HTTP_CLIENT_TIMEOUT_MS: u64 = 6_000;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Clone)]
pub(crate) struct CachedControlSnapshot {
    pub snapshot: ControlSnapshot,
    pub captured_at: Instant,
    pub refresh_after: Duration,
}

#[derive(Clone)]
pub(crate) struct CachedControlError {
    pub message: String,
    pub happened_at: Instant,
}

struct RuntimeState {
    bridge_child: Mutex<Option<Child>>,
    serial_op_lock: Mutex<()>,
    manifest_cache: Mutex<Option<FirmwareManifest>>,
    latest_backup: Mutex<Option<PathBuf>>,
    log_file: Mutex<Option<PathBuf>>,
    log_guard: Mutex<Option<tracing_appender::non_blocking::WorkerGuard>>,
    control_targets: Mutex<Vec<ControlTarget>>,
    selected_control_target: Mutex<Option<String>>,
    control_http_client: Client,
    cached_control_snapshot: Mutex<Option<CachedControlSnapshot>>,
    last_control_error: Mutex<Option<CachedControlError>>,
    control_snapshot_refresh: Mutex<()>,
}

impl Default for RuntimeState {
    fn default() -> Self {
        let control_http_client = Client::builder()
            .timeout(Duration::from_millis(CONTROL_HTTP_CLIENT_TIMEOUT_MS))
            .pool_max_idle_per_host(0)
            .build()
            .unwrap_or_else(|_| Client::new());

        Self {
            bridge_child: Mutex::new(None),
            serial_op_lock: Mutex::new(()),
            manifest_cache: Mutex::new(None),
            latest_backup: Mutex::new(None),
            log_file: Mutex::new(None),
            log_guard: Mutex::new(None),
            control_targets: Mutex::new(Vec::new()),
            selected_control_target: Mutex::new(None),
            control_http_client,
            cached_control_snapshot: Mutex::new(None),
            last_control_error: Mutex::new(None),
            control_snapshot_refresh: Mutex::new(()),
        }
    }
}

impl RuntimeState {
    pub(crate) async fn bridge_running(&self) -> bool {
        let mut lock = self.bridge_child.lock().await;
        let Some(child) = lock.as_mut() else {
            return false;
        };

        match child.try_wait() {
            Ok(Some(_)) => {
                *lock = None;
                false
            }
            Ok(None) => true,
            Err(err) => {
                error!("failed to inspect bridge child state: {}", err);
                true
            }
        }
    }
}

#[derive(Debug, Serialize)]
struct DeviceDetectionResult {
    port_name: Option<String>,
    description: String,
    fixes: Vec<String>,
}

#[derive(Debug, Serialize)]
struct FirmwareOption {
    version: String,
    label: String,
    default: bool,
}

#[derive(Debug, Clone, Serialize)]
struct FlashProgress {
    percent: u8,
    message: String,
}

#[derive(Debug, Clone, Serialize)]
struct BridgeEvent {
    event: String,
    state: String,
    detail: String,
}

#[derive(Debug, Serialize)]
struct BridgeStatus {
    running: bool,
}

#[derive(Debug, Serialize)]
struct MidiOutOption {
    name: String,
}

#[derive(Debug, Serialize)]
struct WifiSetupInfo {
    mode: String,
    ip: String,
    name: String,
    ssid: String,
    wifi_error: String,
    wifi_hint: String,
}

#[derive(Debug, Deserialize)]
struct SerialWifiInfo {
    mode: Option<String>,
    ip: Option<String>,
    name: Option<String>,
    ssid: Option<String>,
    wifi_error: Option<String>,
    wifi_hint: Option<String>,
}

#[derive(Debug, Serialize)]
struct WifiProvisionResult {
    ok: bool,
    msg: String,
    hint: String,
}

async fn ensure_bridge_not_running(state: &State<'_, RuntimeState>) -> Result<(), String> {
    if state.bridge_running().await {
        return Err(
            "Bridge is running and owns the serial port. Stop Bridge, then retry Wi-Fi setup."
                .to_string(),
        );
    }
    Ok(())
}

async fn stop_bridge_child(state: &RuntimeState) -> Result<bool, String> {
    let mut lock = state.bridge_child.lock().await;
    let Some(mut child) = lock.take() else {
        return Ok(false);
    };

    match child.try_wait().map_err(err_to_string)? {
        Some(_) => return Ok(true),
        None => {}
    }

    if let Err(err) = child.kill().await {
        match child.try_wait().map_err(err_to_string)? {
            Some(_) => return Ok(true),
            None => return Err(err_to_string(err)),
        }
    }

    let _ = child.wait().await;
    Ok(true)
}

#[tauri::command]
async fn detect_beca_device() -> Result<DeviceDetectionResult, String> {
    let ports = detect_beca_ports();
    let candidate = select_best_port(&ports).filter(|port| port.likely_beca);

    let response = if let Some(port) = candidate {
        DeviceDetectionResult {
            port_name: Some(port.port_name),
            description: port.description,
            fixes: vec![],
        }
    } else {
        DeviceDetectionResult {
            port_name: None,
            description: String::new(),
            fixes: default_fix_suggestions(),
        }
    };

    Ok(response)
}

#[tauri::command]
async fn list_firmware_versions(
    app: AppHandle,
    state: State<'_, RuntimeState>,
) -> Result<Vec<FirmwareOption>, String> {
    let manifest = load_manifest(&app, &state).await.map_err(err_to_string)?;
    let latest = manifest
        .latest_stable_for_hardware(HARDWARE_ID)
        .ok_or_else(|| format!("No stable firmware found for {HARDWARE_ID}"))?;

    Ok(vec![FirmwareOption {
        version: LATEST_STABLE_FIRMWARE.to_string(),
        label: format!("Latest Stable {} (recommended)", latest.version),
        default: true,
    }])
}

#[tauri::command]
async fn flash_firmware(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    serial_port: String,
    firmware_version: String,
) -> Result<(), String> {
    if !firmware_version.eq_ignore_ascii_case(LATEST_STABLE_FIRMWARE) {
        return Err("This app can only flash the latest stable BECA firmware.".to_string());
    }

    ensure_bridge_not_running(&state).await?;
    let _serial_guard = state.serial_op_lock.lock().await;
    emit_flash_progress(&app, 10, "Loading latest stable firmware manifest...");
    let manifest = load_manifest(&app, &state).await.map_err(err_to_string)?;
    let firmware = manifest
        .latest_stable_for_hardware(HARDWARE_ID)
        .ok_or_else(|| format!("No stable firmware found for {HARDWARE_ID}"))?
        .clone();

    emit_flash_progress(&app, 30, "Downloading latest stable firmware binary...");
    let cache_dir = app_data_dir(&app)?.join("cache").join("firmware");
    let binary_path = download_firmware(&firmware, &cache_dir)
        .await
        .map_err(err_to_string)?;

    emit_flash_progress(&app, 65, "Preparing flash tool...");
    let (tool, tool_path) = resolve_flash_tool_for_app(&app).await?;

    let baud_plan: &[u32] = if cfg!(target_os = "windows") {
        &[460_800, 230_400, 115_200]
    } else {
        &[460_800, 230_400]
    };

    let mut last_error: Option<String> = None;
    for (idx, baud) in baud_plan.iter().enumerate() {
        let message = if idx == 0 {
            format!("Flashing firmware at {} baud. Do not unplug BECA...", baud)
        } else {
            format!("Flash retry at {} baud for stability...", baud)
        };
        emit_flash_progress(&app, 85, &message);

        let config = FlashCommandConfig {
            tool: tool.clone(),
            tool_path: tool_path.clone(),
            port: serial_port.clone(),
            baud: *baud,
            firmware_path: binary_path.clone(),
            offset: "0x0".to_string(),
        };

        match run_flash(&config).await {
            Ok(_) => {
                emit_flash_progress(&app, 100, "Flash complete.");
                return Ok(());
            }
            Err(err) => {
                last_error = Some(err_to_string(err));
                if idx + 1 < baud_plan.len() {
                    emit_flash_progress(&app, 82, "Retrying flash with safer serial settings...");
                    std::thread::sleep(Duration::from_millis(1200));
                }
            }
        }
    }
    let primary_error = last_error.unwrap_or_else(|| "Firmware flash failed.".to_string());
    if matches!(tool, FlashTool::Espflash) && is_flash_connect_error(&primary_error) {
        emit_flash_progress(
            &app,
            83,
            "espflash could not connect. Switching to esptool fallback...",
        );
        let esptool_path = ensure_esptool_sidecar(&app).await.map_err(err_to_string)?;

        let mut fallback_error: Option<String> = None;
        for (idx, baud) in baud_plan.iter().enumerate() {
            let message = if idx == 0 {
                format!("Fallback flash (esptool) at {} baud...", baud)
            } else {
                format!("Fallback retry (esptool) at {} baud...", baud)
            };
            emit_flash_progress(&app, 86, &message);

            let config = FlashCommandConfig {
                tool: FlashTool::Esptool,
                tool_path: esptool_path.clone(),
                port: serial_port.clone(),
                baud: *baud,
                firmware_path: binary_path.clone(),
                offset: "0x0".to_string(),
            };

            match run_flash(&config).await {
                Ok(_) => {
                    emit_flash_progress(&app, 100, "Flash complete.");
                    return Ok(());
                }
                Err(err) => {
                    fallback_error = Some(err_to_string(err));
                    if idx + 1 < baud_plan.len() {
                        emit_flash_progress(&app, 84, "Retrying esptool fallback...");
                        std::thread::sleep(Duration::from_millis(1200));
                    }
                }
            }
        }

        let fallback = fallback_error.unwrap_or_else(|| "esptool fallback failed.".to_string());
        return Err(format!(
            "{primary_error}\n\nesptool fallback also failed: {fallback}"
        ));
    }

    Err(primary_error)
}

#[tauri::command]
async fn backup_settings(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    serial_port: String,
) -> Result<String, String> {
    ensure_bridge_not_running(&state).await?;
    let _serial_guard = state.serial_op_lock.lock().await;
    let esptool_path = resolve_named_tool_for_app(&app, "esptool").ok_or_else(|| {
        "Backup tool is missing in this installer build (esptool sidecar not bundled). Flash/Wi-Fi setup still works.".to_string()
    })?;

    let backup_dir = app_data_dir(&app)?.join("backups");
    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
    let backup_path = backup_dir.join(format!("nvs-{}.bin", Utc::now().format("%Y%m%d-%H%M%S")));

    backup_nvs(
        &esptool_path,
        &serial_port,
        115200,
        &backup_path,
        "0x9000",
        "0x6000",
    )
    .await
    .map_err(err_to_string)?;

    *state.latest_backup.lock().await = Some(backup_path.clone());
    Ok(backup_path.display().to_string())
}

#[tauri::command]
async fn restore_settings(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    serial_port: String,
) -> Result<String, String> {
    ensure_bridge_not_running(&state).await?;
    let _serial_guard = state.serial_op_lock.lock().await;
    let esptool_path = resolve_named_tool_for_app(&app, "esptool").ok_or_else(|| {
        "Restore tool is missing in this installer build (esptool sidecar not bundled). Flash/Wi-Fi setup still works.".to_string()
    })?;

    let latest = latest_backup_file(&app, &state)
        .await
        .ok_or_else(|| "No backup file found. Run Backup Settings first.".to_string())?;

    restore_nvs(&esptool_path, &serial_port, 115200, &latest, "0x9000")
        .await
        .map_err(err_to_string)?;

    Ok(latest.display().to_string())
}

#[tauri::command]
async fn list_midi_outputs() -> Result<Vec<MidiOutOption>, String> {
    let outputs = bridge_list_midi_outputs().map_err(err_to_string)?;
    Ok(outputs
        .into_iter()
        .map(|out| MidiOutOption { name: out.name })
        .collect())
}

#[tauri::command]
fn backup_restore_available(app: AppHandle) -> bool {
    resolve_named_tool_for_app(&app, "esptool").is_some()
}

#[tauri::command]
async fn scan_wifi_networks(
    state: State<'_, RuntimeState>,
    serial_port: String,
) -> Result<Vec<String>, String> {
    ensure_bridge_not_running(&state).await?;
    let _serial_guard = state.serial_op_lock.lock().await;
    tokio::task::spawn_blocking(move || {
        let payload =
            run_serial_command_json(&serial_port, "@C WIFI_SCAN", "WIFI_SCAN", 20_000, 3)?;
        let mut list = Vec::new();
        if let Some(items) = payload.get("list").and_then(|v| v.as_array()) {
            for item in items {
                if let Some(ssid) = item.as_str() {
                    if !ssid.is_empty() && !list.iter().any(|s| s == ssid) {
                        list.push(ssid.to_string());
                    }
                }
            }
        }
        Ok::<Vec<String>, anyhow::Error>(list)
    })
    .await
    .map_err(err_to_string)?
    .map_err(err_to_string)
}

#[tauri::command]
async fn get_wifi_setup_info(
    state: State<'_, RuntimeState>,
    serial_port: String,
) -> Result<WifiSetupInfo, String> {
    ensure_bridge_not_running(&state).await?;
    let _serial_guard = state.serial_op_lock.lock().await;
    tokio::task::spawn_blocking(move || {
        let payload =
            run_serial_command_json(&serial_port, "@C WIFI_INFO", "WIFI_INFO", 18_000, 3)?;
        let info: SerialWifiInfo =
            serde_json::from_value(payload).context("invalid WIFI_INFO payload from device")?;
        Ok::<WifiSetupInfo, anyhow::Error>(WifiSetupInfo {
            mode: info.mode.unwrap_or_else(|| "ap".to_string()),
            ip: info.ip.unwrap_or_default(),
            name: info.name.unwrap_or_default(),
            ssid: info.ssid.unwrap_or_default(),
            wifi_error: info.wifi_error.unwrap_or_default(),
            wifi_hint: info.wifi_hint.unwrap_or_default(),
        })
    })
    .await
    .map_err(err_to_string)?
    .map_err(err_to_string)
}

#[tauri::command]
async fn save_wifi_credentials(
    state: State<'_, RuntimeState>,
    serial_port: String,
    name: String,
    ssid: String,
    pass: String,
) -> Result<WifiProvisionResult, String> {
    ensure_bridge_not_running(&state).await?;
    let _serial_guard = state.serial_op_lock.lock().await;
    tokio::task::spawn_blocking(move || {
        let safe_name = sanitize_serial_field(&name);
        let safe_ssid = sanitize_serial_field(&ssid);
        let safe_pass = sanitize_serial_field(&pass);
        let command = format!("@C WIFI_SAVE {}\t{}\t{}", safe_name, safe_ssid, safe_pass);
        let payload = run_serial_command_json(&serial_port, &command, "WIFI_SAVE", 25_000, 1)?;
        Ok::<WifiProvisionResult, anyhow::Error>(WifiProvisionResult {
            ok: json_flag(&payload, "ok"),
            msg: payload
                .get("msg")
                .and_then(|v| v.as_str())
                .unwrap_or("Wi-Fi setup command completed.")
                .to_string(),
            hint: payload
                .get("hint")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        })
    })
    .await
    .map_err(err_to_string)?
    .map_err(err_to_string)
}

#[tauri::command]
async fn forget_wifi_credentials(
    state: State<'_, RuntimeState>,
    serial_port: String,
) -> Result<WifiProvisionResult, String> {
    ensure_bridge_not_running(&state).await?;
    let _serial_guard = state.serial_op_lock.lock().await;
    tokio::task::spawn_blocking(move || {
        let payload =
            run_serial_command_json(&serial_port, "@C WIFI_FORGET", "WIFI_FORGET", 8_000, 1)?;
        Ok::<WifiProvisionResult, anyhow::Error>(WifiProvisionResult {
            ok: json_flag(&payload, "ok"),
            msg: payload
                .get("msg")
                .and_then(|v| v.as_str())
                .unwrap_or("Saved Wi-Fi removed.")
                .to_string(),
            hint: payload
                .get("hint")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        })
    })
    .await
    .map_err(err_to_string)?
    .map_err(err_to_string)
}

#[tauri::command]
async fn reboot_device(state: State<'_, RuntimeState>, serial_port: String) -> Result<(), String> {
    ensure_bridge_not_running(&state).await?;
    let _serial_guard = state.serial_op_lock.lock().await;
    tokio::task::spawn_blocking(move || {
        let _ = run_serial_command_json(&serial_port, "@C REBOOT", "REBOOT", 8_000, 1)?;
        Ok::<(), anyhow::Error>(())
    })
    .await
    .map_err(err_to_string)?
    .map_err(err_to_string)
}

#[tauri::command]
async fn start_bridge(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    serial_port: String,
    midi_port: String,
    microfreak_mode: bool,
    secondary_midi_port: Option<String>,
    secondary_microfreak_mode: bool,
) -> Result<(), String> {
    let bridge_path = resolve_binary_for_app(&app, "beca-bridge").map_err(err_to_string)?;
    let secondary_midi_port = secondary_midi_port
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    if secondary_midi_port
        .as_deref()
        .is_some_and(|port| port.eq_ignore_ascii_case(&midi_port))
    {
        return Err("Primary and mirrored MIDI outputs must be different devices.".to_string());
    }

    let decision = resolve_bridge_runtime(&BridgeRuntimeInput {
        bundled_native_bridge_exists: bridge_path.exists(),
        embedded_python_exists: false,
        python_binary_wheels_available: false,
    });

    if decision.mode == "unsupported" {
        return Err(decision.reason);
    }

    stop_bridge_child(state.inner()).await?;

    let mut cmd = Command::new(&bridge_path);
    cmd.arg("run")
        .arg("--serial-port")
        .arg(serial_port)
        .arg("--midi-port")
        .arg(midi_port);

    if microfreak_mode {
        cmd.arg("--microfreak-mode");
    }
    if let Some(port) = secondary_midi_port {
        cmd.arg("--secondary-midi-port").arg(port);
    }
    if secondary_microfreak_mode {
        cmd.arg("--secondary-microfreak-mode");
    }

    cmd.arg("--baud")
        .arg("115200")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    cmd.kill_on_drop(true);
    apply_background_process_flags(&mut cmd);

    let mut child = cmd
        .spawn()
        .with_context(|| format!("failed to launch bridge at {}", bridge_path.display()))
        .map_err(err_to_string)?;

    if let Some(stdout) = child.stdout.take() {
        spawn_bridge_stream_reader(app.clone(), stdout, "stdout");
    }

    if let Some(stderr) = child.stderr.take() {
        spawn_bridge_stream_reader(app.clone(), stderr, "stderr");
    }

    *state.bridge_child.lock().await = Some(child);
    emit_bridge_event(&app, "status", "connected", "Bridge process started");
    Ok(())
}

#[tauri::command]
async fn bridge_status(state: State<'_, RuntimeState>) -> Result<BridgeStatus, String> {
    Ok(BridgeStatus {
        running: state.bridge_running().await,
    })
}

#[tauri::command]
async fn stop_bridge(app: AppHandle, state: State<'_, RuntimeState>) -> Result<(), String> {
    if stop_bridge_child(state.inner()).await? {
        emit_bridge_event(&app, "status", "stopped", "Bridge stopped");
    }
    Ok(())
}

#[tauri::command]
async fn send_test_note(
    app: AppHandle,
    midi_port: String,
    secondary_midi_port: Option<String>,
) -> Result<(), String> {
    let bridge_path = resolve_binary_for_app(&app, "beca-bridge").map_err(err_to_string)?;
    let secondary_midi_port = secondary_midi_port
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    if secondary_midi_port
        .as_deref()
        .is_some_and(|port| port.eq_ignore_ascii_case(&midi_port))
    {
        return Err("Primary and mirrored MIDI outputs must be different devices.".to_string());
    }

    let mut cmd = Command::new(bridge_path);
    cmd.arg("test-note").arg("--midi-port").arg(midi_port);
    if let Some(port) = secondary_midi_port {
        cmd.arg("--secondary-midi-port").arg(port);
    }
    apply_background_process_flags(&mut cmd);
    let output = cmd.output().await.map_err(err_to_string)?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
async fn export_diagnostics(
    app: AppHandle,
    state: State<'_, RuntimeState>,
) -> Result<String, String> {
    let app_data = app_data_dir(&app)?;
    let diagnostics_dir = app_data.join("diagnostics");
    fs::create_dir_all(&diagnostics_dir).map_err(|e| e.to_string())?;

    let zip_path = diagnostics_dir.join(format!(
        "beca-diagnostics-{}.zip",
        Utc::now().format("%Y%m%d-%H%M%S")
    ));
    let file = File::create(&zip_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    if let Some(log_path) = state.log_file.lock().await.clone() {
        if log_path.exists() {
            let content = fs::read(&log_path).map_err(|e| e.to_string())?;
            zip.start_file("logs/beca.log", options)
                .map_err(|e| e.to_string())?;
            zip.write_all(&content).map_err(|e| e.to_string())?;
        }
    }

    let snapshot = serde_json::json!({
        "timestamp": Utc::now().to_rfc3339(),
        "firmware_repo": DEFAULT_FIRMWARE_REPO,
        "detected_ports": detect_beca_ports(),
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH
    });

    zip.start_file("diagnostics/system.json", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(snapshot.to_string().as_bytes())
        .map_err(|e| e.to_string())?;

    zip.finish().map_err(|e| e.to_string())?;
    Ok(zip_path.display().to_string())
}

fn default_fix_suggestions() -> Vec<String> {
    let mut fixes = vec![
        "Use a USB data cable (not charge-only).".to_string(),
        "Try a different USB port and reconnect BECA.".to_string(),
    ];

    #[cfg(target_os = "windows")]
    {
        fixes.push(
            "Install CH340 driver: https://www.wch-ic.com/downloads/CH341SER_EXE.html".to_string(),
        );
        fixes.push("Install CP210x driver: https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers".to_string());
        fixes.push("If COM port is busy, close Arduino Serial Monitor and retry.".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        fixes.push("Allow serial device access if macOS prompts for permission.".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        fixes.push(
            "If permission is denied, add your user to the dialout group and relogin.".to_string(),
        );
    }

    fixes
}

fn serial_port_candidates(port_name: &str) -> Vec<String> {
    #[cfg(target_os = "macos")]
    {
        let mut ports = vec![port_name.to_string()];
        if let Some(suffix) = port_name.strip_prefix("/dev/tty.") {
            ports.push(format!("/dev/cu.{suffix}"));
        } else if let Some(suffix) = port_name.strip_prefix("/dev/cu.") {
            ports.push(format!("/dev/tty.{suffix}"));
        }
        let mut uniq = Vec::with_capacity(ports.len());
        for item in ports {
            if !uniq.iter().any(|v| v == &item) {
                uniq.push(item);
            }
        }
        return uniq;
    }
    vec![port_name.to_string()]
}

async fn load_manifest(
    app: &AppHandle,
    state: &State<'_, RuntimeState>,
) -> anyhow::Result<FirmwareManifest> {
    {
        let cache = state.manifest_cache.lock().await;
        if let Some(manifest) = cache.clone() {
            return Ok(manifest);
        }
    }

    let cache_path = app_data_dir(app)
        .map_err(|e| anyhow!(e))?
        .join("cache")
        .join("firmware-manifest.json");

    if let Some(parent) = cache_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let manifest = match fetch_latest_manifest(DEFAULT_FIRMWARE_REPO).await {
        Ok(downloaded) => {
            let serialized = serde_json::to_string_pretty(&downloaded)?;
            if let Err(err) = tokio_fs::write(&cache_path, serialized).await {
                info!("manifest cache write skipped: {err}");
            }
            downloaded
        }
        Err(fetch_err) => {
            let cached = tokio_fs::read_to_string(&cache_path)
                .await
                .ok()
                .and_then(|raw| parse_manifest(&raw).ok());

            if let Some(cached_manifest) = cached {
                info!(
                    "manifest fetch failed for {DEFAULT_FIRMWARE_REPO}; using cached manifest: {fetch_err}"
                );
                cached_manifest
            } else {
                return Err(anyhow!(
                    "Firmware manifest fetch failed for repo '{DEFAULT_FIRMWARE_REPO}'. \
This is a GitHub release lookup issue (not BECA Wi-Fi). \
Ensure at least one recent published release includes 'firmware-manifest.json'. Details: {fetch_err}"
                ));
            }
        }
    };

    *state.manifest_cache.lock().await = Some(manifest.clone());
    Ok(manifest)
}

fn emit_flash_progress(app: &AppHandle, percent: u8, message: &str) {
    let payload = FlashProgress {
        percent,
        message: message.to_string(),
    };
    let _ = app.emit("flash-progress", payload);
}

fn emit_bridge_event(app: &AppHandle, event: &str, state: &str, detail: &str) {
    let payload = BridgeEvent {
        event: event.to_string(),
        state: state.to_string(),
        detail: detail.to_string(),
    };
    let _ = app.emit("bridge-status", payload);
}

fn apply_background_process_flags(cmd: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
}

fn spawn_bridge_stream_reader<R>(app: AppHandle, reader: R, source: &str)
where
    R: tokio::io::AsyncRead + Unpin + Send + 'static,
{
    let source_name = source.to_string();
    tokio::spawn(async move {
        let mut lines = BufReader::new(reader).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if let Ok(value) = serde_json::from_str::<Value>(&line) {
                if let Some(obj) = value.as_object() {
                    let event = obj
                        .get("event")
                        .and_then(|v| v.as_str())
                        .unwrap_or("status");
                    let state = obj
                        .get("state")
                        .and_then(|v| v.as_str())
                        .unwrap_or("running");
                    let detail = obj.get("detail").and_then(|v| v.as_str()).unwrap_or("");
                    emit_bridge_event(&app, event, state, detail);
                    continue;
                }
            }

            emit_bridge_event(&app, "log", &source_name, &line);
        }
    });
}

pub(crate) fn run_serial_command_json(
    serial_port: &str,
    command: &str,
    expected_tag: &str,
    timeout_ms: u64,
    max_attempts: u8,
) -> anyhow::Result<Value> {
    let requested_port = serial_port.to_string();
    let ports = serial_port_candidates(serial_port);
    let attempts = max_attempts.max(1);
    let total_deadline = Instant::now() + Duration::from_millis(timeout_ms);
    let is_wifi_scan_command = command.trim_start().starts_with("@C WIFI_SCAN");
    let is_runtime_control_command = matches!(
        expected_tag,
        "LIVE" | "STATE" | "PLANT" | "NOTES" | "DRUM" | "SET" | "PARAMS" | "SYNTH" | "SYNTH_TEST"
    );
    let allow_resend = matches!(expected_tag, "WIFI_INFO" | "WIFI_SCAN" | "PING");
    let mut per_attempt_timeout_ms = (timeout_ms / attempts as u64).max(2_200);
    if is_wifi_scan_command {
        per_attempt_timeout_ms = per_attempt_timeout_ms.max(7_000);
    }
    let port_settle_ms = if is_runtime_control_command {
        if cfg!(target_os = "macos") {
            320
        } else {
            160
        }
    } else if cfg!(target_os = "macos") {
        2_200
    } else {
        1_200
    };
    let resend_interval_ms = if cfg!(target_os = "macos") {
        1_300
    } else {
        900
    };
    let mut last_error: Option<String> = None;
    let mut last_port = requested_port.clone();
    let mut saw_any_line = false;

    for active_port in ports {
        for attempt in 1..=attempts {
            if Instant::now() >= total_deadline {
                break;
            }
            last_port = active_port.clone();

            let mut port = match serialport::new(&active_port, SERIAL_CTRL_BAUD)
                .timeout(Duration::from_millis(250))
                .open()
            {
                Ok(p) => p,
                Err(err) => {
                    let msg = format!("failed to open serial port {active_port}: {err}");
                    last_error = Some(msg.clone());
                    if is_port_busy_text(&msg) {
                        if attempt < attempts {
                            std::thread::sleep(Duration::from_millis(450));
                            continue;
                        }
                        return Err(anyhow!(
                            "serial port {active_port} is busy. Close Arduino Serial Monitor and stop BECA Bridge before Wi-Fi setup."
                        ));
                    }
                    if attempt < attempts {
                        std::thread::sleep(Duration::from_millis(300));
                        continue;
                    }
                    break;
                }
            };

            std::thread::sleep(Duration::from_millis(port_settle_ms));
            let _ = port.clear(serialport::ClearBuffer::Input);
            let mut line = Vec::<u8>::with_capacity(320);
            let mut byte = [0u8; 1];
            let remaining_ms = total_deadline
                .saturating_duration_since(Instant::now())
                .as_millis() as u64;
            let attempt_deadline = Instant::now()
                + Duration::from_millis(per_attempt_timeout_ms.min(remaining_ms.max(1)));
            let mut sent_once = false;
            let mut next_send_at = Instant::now();

            while Instant::now() < total_deadline && Instant::now() < attempt_deadline {
                if !sent_once || (allow_resend && Instant::now() >= next_send_at) {
                    port.write_all(command.as_bytes())
                        .with_context(|| format!("failed writing command to {active_port}"))?;
                    port.write_all(b"\n")
                        .with_context(|| format!("failed writing newline to {active_port}"))?;
                    port.flush()
                        .with_context(|| format!("failed flushing command to {active_port}"))?;
                    sent_once = true;
                    next_send_at = Instant::now() + Duration::from_millis(resend_interval_ms);
                }

                match port.read(&mut byte) {
                    Ok(0) => continue,
                    Ok(_) => {
                        let b = byte[0];
                        if b == b'\r' {
                            continue;
                        }
                        if b != b'\n' {
                            if line.len() < 4096 {
                                line.push(b);
                            } else {
                                line.clear();
                            }
                            continue;
                        }
                        if line.is_empty() {
                            continue;
                        }

                        let raw = String::from_utf8_lossy(&line).trim().to_string();
                        line.clear();
                        if raw.is_empty() {
                            continue;
                        }
                        saw_any_line = true;

                        if let Some(rest) = raw.strip_prefix("@R ") {
                            let mut split = rest.splitn(2, ' ');
                            let tag = split.next().unwrap_or("").trim();
                            let payload = split.next().unwrap_or("{}").trim();
                            if tag.eq_ignore_ascii_case(expected_tag) {
                                let value: Value =
                                    serde_json::from_str(payload).with_context(|| {
                                        format!(
                                            "invalid JSON payload for {expected_tag}: {payload}"
                                        )
                                    })?;
                                return Ok(value);
                            }
                            if tag.eq_ignore_ascii_case("ERR") {
                                let value: Value = serde_json::from_str(payload).unwrap_or_else(|_| {
                                    serde_json::json!({"ok":0,"msg":"device returned malformed error payload"})
                                });
                                let msg = value
                                    .get("msg")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("device returned an error");
                                return Err(anyhow!(msg.to_string()));
                            }
                        }
                    }
                    Err(err) => {
                        if matches!(err.kind(), ErrorKind::TimedOut | ErrorKind::WouldBlock) {
                            continue;
                        }
                        let msg = format!("serial read failed on {active_port}: {err}");
                        last_error = Some(msg.clone());
                        if is_port_busy_text(&msg) && attempt < attempts {
                            std::thread::sleep(Duration::from_millis(350));
                            break;
                        }
                        if is_port_busy_text(&msg) {
                            return Err(anyhow!(
                                "serial port {active_port} became busy. Close Serial Monitor/Bridge, wait 3 seconds, and retry."
                            ));
                        }
                        return Err(anyhow!(msg));
                    }
                }
            }

            if attempt < attempts {
                std::thread::sleep(Duration::from_millis(350));
            }
        }
    }

    if saw_any_line {
        return Err(anyhow!(format_serial_timeout_hint(
            expected_tag,
            &requested_port,
            &last_port,
            "No control response"
        )));
    }

    if let Some(err) = last_error {
        return Err(anyhow!(err));
    }

    Err(anyhow!(format_serial_timeout_hint(
        expected_tag,
        &requested_port,
        &last_port,
        "Timed out waiting for device response"
    )))
}

fn is_port_busy_text(input: &str) -> bool {
    let txt = input.to_ascii_lowercase();
    txt.contains("access is denied")
        || txt.contains("permission denied")
        || txt.contains("resource busy")
        || txt.contains("port is busy")
}

fn format_serial_timeout_hint(
    expected_tag: &str,
    requested_port: &str,
    active_port: &str,
    prefix: &str,
) -> String {
    if requested_port == active_port {
        return format!("{prefix} for {expected_tag} on {active_port}. Wait 10 seconds and retry.");
    }
    format!(
        "{prefix} for {expected_tag} on {active_port} (requested {requested_port}). Wait 10 seconds and retry."
    )
}

pub(crate) fn json_flag(payload: &Value, key: &str) -> bool {
    payload.get(key).map_or(false, |v| match v {
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_i64().unwrap_or(0) != 0,
        Value::String(s) => s == "1" || s.eq_ignore_ascii_case("true"),
        _ => false,
    })
}

fn sanitize_serial_field(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        if ch == '\t' || ch == '\r' || ch == '\n' {
            out.push(' ');
        } else {
            out.push(ch);
        }
    }
    out
}

async fn resolve_flash_tool_for_app(app: &AppHandle) -> Result<(FlashTool, PathBuf), String> {
    if let Some(found) = resolve_flash_tool_from_candidates(app) {
        return Ok(found);
    }

    if let Some(path) = resolve_tool_on_path("espflash") {
        return Ok((FlashTool::Espflash, path));
    }
    if let Some(path) = resolve_tool_on_path("esptool") {
        return Ok((FlashTool::Esptool, path));
    }

    emit_flash_progress(
        app,
        68,
        "Bundled flash tool missing. Repairing flash tool...",
    );
    match ensure_espflash_sidecar(app).await {
        Ok(path) => {
            emit_flash_progress(app, 72, "Flash tool repaired.");
            Ok((FlashTool::Espflash, path))
        }
        Err(err) => {
            error!("flash tool auto-repair failed: {err}");
            Err(format!(
                "No flash tool found. Auto-repair failed: {err}. Use installer build BECA_*_x64-setup.exe, or retry on a network that allows GitHub downloads."
            ))
        }
    }
}

fn resolve_flash_tool_from_candidates(app: &AppHandle) -> Option<(FlashTool, PathBuf)> {
    let dirs = candidate_binary_dirs(app);
    for dir in dirs {
        if cfg!(target_os = "windows") {
            let esptool = dir.join(executable_name("esptool"));
            if esptool.exists() {
                return Some((FlashTool::Esptool, esptool));
            }
        }
        if let Some(found) = resolve_flash_tool(&dir) {
            return Some(found);
        }
    }
    None
}

fn resolve_named_tool_for_app(app: &AppHandle, tool_name: &str) -> Option<PathBuf> {
    let file = executable_name(tool_name);
    candidate_binary_dirs(app)
        .into_iter()
        .map(|dir| dir.join(&file))
        .find(|path| path.exists())
        .or_else(|| resolve_tool_on_path(tool_name))
}

fn resolve_binary_for_app(app: &AppHandle, binary_name: &str) -> anyhow::Result<PathBuf> {
    let file = executable_name(binary_name);
    for dir in candidate_binary_dirs(app) {
        let candidate = dir.join(&file);
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    Err(anyhow!(
        "Binary {} was not found in bundled resources",
        file
    ))
}

fn candidate_binary_dirs(app: &AppHandle) -> Vec<PathBuf> {
    let mut dirs = vec![];

    if let Ok(resource_dir) = app.path().resource_dir() {
        dirs.push(resource_dir.join("binaries"));
        dirs.push(resource_dir);
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            dirs.push(parent.to_path_buf());
            dirs.push(parent.join("binaries"));
            dirs.push(parent.join("resources"));
            dirs.push(parent.join("resources").join("binaries"));
        }
    }

    if let Ok(data_dir) = app.path().app_data_dir() {
        dirs.push(data_dir.join("tools"));
    }

    dirs.push(PathBuf::from("apps/beca-setup/src-tauri/binaries"));
    dirs.push(PathBuf::from("tools/bridge/target/debug"));
    dirs.push(PathBuf::from("tools/flasher/target/debug"));

    let mut unique_dirs = Vec::with_capacity(dirs.len());
    for dir in dirs {
        if !unique_dirs.iter().any(|existing| existing == &dir) {
            unique_dirs.push(dir);
        }
    }
    unique_dirs
}

fn resolve_tool_on_path(tool_name: &str) -> Option<PathBuf> {
    let file = executable_name(tool_name);
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        let candidate = dir.join(&file);
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

fn is_flash_connect_error(input: &str) -> bool {
    let txt = input.to_ascii_lowercase();
    txt.contains("error while connecting to device")
        || txt.contains("failed to connect")
        || txt.contains("timed out waiting for packet header")
        || txt.contains("serial port")
}

fn espflash_download_url_for_target() -> Option<String> {
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    let triple = "x86_64-pc-windows-msvc";
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    let triple = "x86_64-apple-darwin";
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    let triple = "aarch64-apple-darwin";
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    let triple = "x86_64-unknown-linux-gnu";
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    let triple = "aarch64-unknown-linux-gnu";
    #[cfg(all(target_os = "linux", target_arch = "arm"))]
    let triple = "armv7-unknown-linux-gnueabihf";
    #[cfg(not(any(
        all(target_os = "windows", target_arch = "x86_64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "aarch64"),
        all(target_os = "linux", target_arch = "arm")
    )))]
    return None;

    Some(format!(
        "https://github.com/esp-rs/espflash/releases/download/v{ESPFLASH_SIDECAR_VERSION}/espflash-{triple}.zip"
    ))
}

fn esptool_download_url_for_target() -> Option<String> {
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        let asset = format!("esptool-v{ESPTOOL_SIDECAR_VERSION}-windows-amd64.zip");
        Some(format!(
            "https://github.com/espressif/esptool/releases/download/v{ESPTOOL_SIDECAR_VERSION}/{asset}"
        ))
    }

    #[cfg(not(all(target_os = "windows", target_arch = "x86_64")))]
    {
        None
    }
}

async fn ensure_espflash_sidecar(app: &AppHandle) -> anyhow::Result<PathBuf> {
    let tools_dir = app_data_dir(app).map_err(|e| anyhow!(e))?.join("tools");
    fs::create_dir_all(&tools_dir)?;

    let binary_name = executable_name("espflash");
    let binary_path = tools_dir.join(&binary_name);
    if binary_path.exists() {
        return Ok(binary_path);
    }

    let download_url = espflash_download_url_for_target().ok_or_else(|| {
        anyhow!(
            "unsupported platform for espflash auto-repair: {}-{}",
            std::env::consts::OS,
            std::env::consts::ARCH
        )
    })?;
    let archive_path = tools_dir.join(format!("espflash-{ESPFLASH_SIDECAR_VERSION}.zip"));

    info!("downloading espflash sidecar from {}", download_url);
    let client = Client::new();
    let response = client
        .get(&download_url)
        .header(
            "User-Agent",
            format!("beca-setup/{}", env!("CARGO_PKG_VERSION")),
        )
        .send()
        .await
        .context("failed to download espflash sidecar")?
        .error_for_status()
        .context("espflash download returned non-success status")?;
    let bytes = response
        .bytes()
        .await
        .context("failed to read espflash download")?;
    tokio_fs::write(&archive_path, &bytes)
        .await
        .with_context(|| {
            format!(
                "failed to write sidecar archive: {}",
                archive_path.display()
            )
        })?;

    let archive_path_for_extract = archive_path.clone();
    let binary_path_for_extract = binary_path.clone();
    tokio::task::spawn_blocking(move || {
        extract_sidecar_binary_from_zip(
            &archive_path_for_extract,
            &binary_path_for_extract,
            "espflash",
        )
    })
    .await
    .context("espflash extraction task failed")??;

    if !binary_path.exists() {
        return Err(anyhow!(
            "espflash extraction did not produce {}",
            binary_path.display()
        ));
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let mut perms = fs::metadata(&binary_path)?.permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&binary_path, perms)?;
    }

    Ok(binary_path)
}

async fn ensure_esptool_sidecar(app: &AppHandle) -> anyhow::Result<PathBuf> {
    if let Some(existing) = resolve_named_tool_for_app(app, "esptool") {
        return Ok(existing);
    }

    let tools_dir = app_data_dir(app).map_err(|e| anyhow!(e))?.join("tools");
    fs::create_dir_all(&tools_dir)?;

    let binary_name = executable_name("esptool");
    let binary_path = tools_dir.join(&binary_name);
    if binary_path.exists() {
        return Ok(binary_path);
    }

    let download_url = esptool_download_url_for_target().ok_or_else(|| {
        anyhow!(
            "unsupported platform for esptool fallback: {}-{}",
            std::env::consts::OS,
            std::env::consts::ARCH
        )
    })?;
    let archive_path = tools_dir.join(format!("esptool-{ESPTOOL_SIDECAR_VERSION}.zip"));

    info!("downloading esptool sidecar from {}", download_url);
    let client = Client::new();
    let response = client
        .get(&download_url)
        .header(
            "User-Agent",
            format!("beca-setup/{}", env!("CARGO_PKG_VERSION")),
        )
        .send()
        .await
        .context("failed to download esptool sidecar")?
        .error_for_status()
        .context("esptool download returned non-success status")?;
    let bytes = response
        .bytes()
        .await
        .context("failed to read esptool download")?;
    tokio_fs::write(&archive_path, &bytes)
        .await
        .with_context(|| {
            format!(
                "failed to write sidecar archive: {}",
                archive_path.display()
            )
        })?;

    let archive_path_for_extract = archive_path.clone();
    let binary_path_for_extract = binary_path.clone();
    tokio::task::spawn_blocking(move || {
        extract_sidecar_binary_from_zip(
            &archive_path_for_extract,
            &binary_path_for_extract,
            "esptool",
        )
    })
    .await
    .context("esptool extraction task failed")??;

    if !binary_path.exists() {
        return Err(anyhow!(
            "esptool extraction did not produce {}",
            binary_path.display()
        ));
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let mut perms = fs::metadata(&binary_path)?.permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&binary_path, perms)?;
    }

    Ok(binary_path)
}

fn extract_sidecar_binary_from_zip(
    archive_path: &Path,
    output_binary: &Path,
    binary_base: &str,
) -> anyhow::Result<()> {
    let archive_file = File::open(archive_path)
        .with_context(|| format!("failed to open archive: {}", archive_path.display()))?;
    let mut archive = zip::ZipArchive::new(archive_file).context("invalid sidecar zip archive")?;
    let expected_name = executable_name(binary_base);

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        if entry.is_dir() {
            continue;
        }
        let entry_name = entry.name().replace('\\', "/");
        if entry_name.ends_with(&format!("/{expected_name}")) || entry_name == expected_name {
            let mut out = File::create(output_binary).with_context(|| {
                format!(
                    "failed to create sidecar output: {}",
                    output_binary.display()
                )
            })?;
            std::io::copy(&mut entry, &mut out)
                .with_context(|| format!("failed to extract {}", expected_name))?;
            out.flush()?;
            return Ok(());
        }
    }

    Err(anyhow!(
        "downloaded sidecar archive did not contain {}",
        expected_name
    ))
}

fn executable_name(base: &str) -> String {
    if cfg!(target_os = "windows") {
        format!("{base}.exe")
    } else {
        base.to_string()
    }
}

async fn latest_backup_file(app: &AppHandle, state: &State<'_, RuntimeState>) -> Option<PathBuf> {
    if let Some(path) = state.latest_backup.lock().await.clone() {
        if path.exists() {
            return Some(path);
        }
    }

    let backup_dir = app_data_dir(app).ok()?.join("backups");
    let mut backups: Vec<_> = fs::read_dir(backup_dir)
        .ok()?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("bin"))
        .collect();

    backups.sort();
    backups.pop()
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("cannot resolve app data directory: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn init_logging(app: &AppHandle, state: &RuntimeState) -> anyhow::Result<()> {
    let log_dir = app_data_dir(app).map_err(|e| anyhow!(e))?.join("logs");
    fs::create_dir_all(&log_dir)?;
    let log_file = log_dir.join("beca.log");

    let file_appender = tracing_appender::rolling::never(&log_dir, "beca.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);
    let subscriber = tracing_subscriber::fmt()
        .with_ansi(false)
        .with_writer(non_blocking)
        .finish();

    let _ = tracing::subscriber::set_global_default(subscriber);
    info!("logging initialized");

    if let Ok(mut guard) = state.log_file.try_lock() {
        *guard = Some(log_file);
    }
    if let Ok(mut stored_guard) = state.log_guard.try_lock() {
        *stored_guard = Some(guard);
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn cleanup_stale_bridge_processes_on_startup() {
    let output = std::process::Command::new("taskkill")
        .args(["/IM", "beca-bridge.exe", "/F", "/T"])
        .output();

    match output {
        Ok(result) if result.status.success() => {
            info!("cleaned up stale BECA bridge processes on startup");
        }
        Ok(result) => {
            let stderr = String::from_utf8_lossy(&result.stderr);
            if !stderr.to_ascii_lowercase().contains("not found") {
                info!("stale bridge cleanup skipped: {}", stderr.trim());
            }
        }
        Err(err) => {
            info!("stale bridge cleanup unavailable: {}", err);
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn cleanup_stale_bridge_processes_on_startup() {}

fn err_to_string<E: std::fmt::Display>(err: E) -> String {
    err.to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(RuntimeState::default())
        .setup(|app| {
            let state: State<'_, RuntimeState> = app.state();
            let app_handle = app.handle();
            if let Err(err) = init_logging(&app_handle, state.inner()) {
                eprintln!("logging init failed: {err}");
            }
            cleanup_stale_bridge_processes_on_startup();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            detect_beca_device,
            discover_beca_targets,
            select_control_target,
            current_control_target,
            control_request,
            control_snapshot,
            list_firmware_versions,
            flash_firmware,
            backup_settings,
            restore_settings,
            backup_restore_available,
            list_midi_outputs,
            scan_wifi_networks,
            get_wifi_setup_info,
            save_wifi_credentials,
            forget_wifi_credentials,
            reboot_device,
            bridge_status,
            start_bridge,
            stop_bridge,
            send_test_note,
            export_diagnostics
        ])
        .build(tauri::generate_context!())
        .unwrap_or_else(|error| {
            error!("app runtime error: {}", error);
            panic!("tauri runtime error: {error}");
        });

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            let state = app_handle.state::<RuntimeState>();
            if let Err(err) = tauri::async_runtime::block_on(stop_bridge_child(state.inner())) {
                error!("failed to stop bridge on exit: {}", err);
            }
        }
    });
}

fn main() {
    run();
}
