#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use anyhow::{anyhow, Context};
use beca_bridge::dependency::{resolve_bridge_runtime, BridgeRuntimeInput};
use beca_bridge::list_midi_outputs as bridge_list_midi_outputs;
use beca_flasher::flash::{download_firmware, flash_firmware as run_flash, FlashCommandConfig, FlashTool};
use beca_flasher::{
    backup_nvs, detect_beca_ports, fetch_latest_manifest, parse_manifest, resolve_flash_tool, restore_nvs,
    select_best_port, FirmwareManifest,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs::{self, File};
use std::io::{ErrorKind, Read, Write};
use std::path::PathBuf;
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
const SERIAL_CTRL_BAUD: u32 = 115200;

#[derive(Default)]
struct RuntimeState {
    bridge_child: Mutex<Option<Child>>,
    manifest_cache: Mutex<Option<FirmwareManifest>>,
    latest_backup: Mutex<Option<PathBuf>>,
    log_file: Mutex<Option<PathBuf>>,
    log_guard: Mutex<Option<tracing_appender::non_blocking::WorkerGuard>>,
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
    let latest_stable = manifest
        .latest_stable_for_hardware(HARDWARE_ID)
        .map(|fw| fw.version.clone());

    let mut options = vec![FirmwareOption {
        version: "latest-stable".to_string(),
        label: "Latest Stable (recommended)".to_string(),
        default: true,
    }];

    for fw in &manifest.firmware {
        if !fw
            .supported_hardware
            .iter()
            .any(|hw| hw.eq_ignore_ascii_case(HARDWARE_ID))
        {
            continue;
        }

        let mut label = format!("{} ({})", fw.version, fw.channel);
        if latest_stable.as_deref() == Some(&fw.version) {
            label.push_str(" - latest stable");
        }

        options.push(FirmwareOption {
            version: fw.version.clone(),
            label,
            default: false,
        });
    }

    Ok(options)
}

#[tauri::command]
async fn flash_firmware(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    serial_port: String,
    firmware_version: String,
) -> Result<(), String> {
    emit_flash_progress(&app, 10, "Loading firmware manifest...");
    let manifest = load_manifest(&app, &state).await.map_err(err_to_string)?;

    let firmware = if firmware_version.eq_ignore_ascii_case("latest-stable") {
        manifest
            .latest_stable_for_hardware(HARDWARE_ID)
            .ok_or_else(|| format!("No stable firmware found for {HARDWARE_ID}"))?
            .clone()
    } else {
        manifest
            .by_version_for_hardware(&firmware_version, HARDWARE_ID)
            .ok_or_else(|| format!("Firmware version {firmware_version} is unavailable"))?
            .clone()
    };

    emit_flash_progress(&app, 30, "Downloading firmware binary...");
    let cache_dir = app_data_dir(&app)?.join("cache").join("firmware");
    let binary_path = download_firmware(&firmware, &cache_dir)
        .await
        .map_err(err_to_string)?;

    emit_flash_progress(&app, 65, "Preparing flash tool...");
    let (tool, tool_path) = resolve_flash_tool_for_app(&app)?;

    let config = FlashCommandConfig {
        tool,
        tool_path,
        port: serial_port,
        baud: 460800,
        firmware_path: binary_path,
        offset: "0x0".to_string(),
    };

    emit_flash_progress(&app, 85, "Flashing firmware. Do not unplug BECA...");
    run_flash(&config).await.map_err(err_to_string)?;
    emit_flash_progress(&app, 100, "Flash complete.");
    Ok(())
}

#[tauri::command]
async fn backup_settings(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    serial_port: String,
) -> Result<String, String> {
    let esptool_path = resolve_named_tool_for_app(&app, "esptool").ok_or_else(|| {
        "Bundled esptool is missing. Backup requires esptool sidecar in app binaries.".to_string()
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
    let esptool_path = resolve_named_tool_for_app(&app, "esptool").ok_or_else(|| {
        "Bundled esptool is missing. Restore requires esptool sidecar in app binaries.".to_string()
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
async fn scan_wifi_networks(serial_port: String) -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(move || {
        let payload = run_serial_command_json(&serial_port, "@C WIFI_SCAN", "WIFI_SCAN", 20_000)?;
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
async fn get_wifi_setup_info(serial_port: String) -> Result<WifiSetupInfo, String> {
    tokio::task::spawn_blocking(move || {
        let payload = run_serial_command_json(&serial_port, "@C WIFI_INFO", "WIFI_INFO", 8_000)?;
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
    serial_port: String,
    name: String,
    ssid: String,
    pass: String,
) -> Result<WifiProvisionResult, String> {
    tokio::task::spawn_blocking(move || {
        let command = format!(
            "@C WIFI_SAVE name={}&ssid={}&pass={}",
            url_encode_component(&name),
            url_encode_component(&ssid),
            url_encode_component(&pass)
        );
        let payload = run_serial_command_json(&serial_port, &command, "WIFI_SAVE", 25_000)?;
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
async fn forget_wifi_credentials(serial_port: String) -> Result<WifiProvisionResult, String> {
    tokio::task::spawn_blocking(move || {
        let payload = run_serial_command_json(&serial_port, "@C WIFI_FORGET", "WIFI_FORGET", 8_000)?;
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
async fn reboot_device(serial_port: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let _ = run_serial_command_json(&serial_port, "@C REBOOT", "REBOOT", 8_000)?;
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
) -> Result<(), String> {
    let bridge_path = resolve_binary_for_app(&app, "beca-bridge").map_err(err_to_string)?;

    let decision = resolve_bridge_runtime(&BridgeRuntimeInput {
        bundled_native_bridge_exists: bridge_path.exists(),
        embedded_python_exists: false,
        python_binary_wheels_available: false,
    });

    if decision.mode == "unsupported" {
        return Err(decision.reason);
    }

    {
        let mut lock = state.bridge_child.lock().await;
        if let Some(mut child) = lock.take() {
            let _ = child.kill().await;
        }
    }

    let mut cmd = Command::new(&bridge_path);
    cmd.arg("run")
        .arg("--serial-port")
        .arg(serial_port)
        .arg("--midi-port")
        .arg(midi_port)
        .arg("--baud")
        .arg("115200")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

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
async fn stop_bridge(app: AppHandle, state: State<'_, RuntimeState>) -> Result<(), String> {
    let mut lock = state.bridge_child.lock().await;
    if let Some(mut child) = lock.take() {
        child.kill().await.map_err(err_to_string)?;
        emit_bridge_event(&app, "status", "stopped", "Bridge stopped");
    }
    Ok(())
}

#[tauri::command]
async fn send_test_note(app: AppHandle, midi_port: String) -> Result<(), String> {
    let bridge_path = resolve_binary_for_app(&app, "beca-bridge").map_err(err_to_string)?;
    let output = Command::new(bridge_path)
        .arg("test-note")
        .arg("--midi-port")
        .arg(midi_port)
        .output()
        .await
        .map_err(err_to_string)?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
async fn export_diagnostics(app: AppHandle, state: State<'_, RuntimeState>) -> Result<String, String> {
    let app_data = app_data_dir(&app)?;
    let diagnostics_dir = app_data.join("diagnostics");
    fs::create_dir_all(&diagnostics_dir).map_err(|e| e.to_string())?;

    let zip_path = diagnostics_dir.join(format!("beca-diagnostics-{}.zip", Utc::now().format("%Y%m%d-%H%M%S")));
    let file = File::create(&zip_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    if let Some(log_path) = state.log_file.lock().await.clone() {
        if log_path.exists() {
            let content = fs::read(&log_path).map_err(|e| e.to_string())?;
            zip.start_file("logs/beca-setup.log", options)
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
        fixes.push("Install CH340 driver: https://www.wch-ic.com/downloads/CH341SER_EXE.html".to_string());
        fixes.push("Install CP210x driver: https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers".to_string());
        fixes.push("If COM port is busy, close Arduino Serial Monitor and retry.".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        fixes.push("Allow serial device access if macOS prompts for permission.".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        fixes.push("If permission is denied, add your user to the dialout group and relogin.".to_string());
    }

    fixes
}

async fn load_manifest(app: &AppHandle, state: &State<'_, RuntimeState>) -> anyhow::Result<FirmwareManifest> {
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
                    let event = obj.get("event").and_then(|v| v.as_str()).unwrap_or("status");
                    let state = obj.get("state").and_then(|v| v.as_str()).unwrap_or("running");
                    let detail = obj.get("detail").and_then(|v| v.as_str()).unwrap_or("");
                    emit_bridge_event(&app, event, state, detail);
                    continue;
                }
            }

            emit_bridge_event(&app, "log", &source_name, &line);
        }
    });
}

fn run_serial_command_json(
    serial_port: &str,
    command: &str,
    expected_tag: &str,
    timeout_ms: u64,
) -> anyhow::Result<Value> {
    let mut port = serialport::new(serial_port, SERIAL_CTRL_BAUD)
        .timeout(Duration::from_millis(250))
        .open()
        .with_context(|| format!("failed to open serial port {serial_port}"))?;

    let _ = port.clear(serialport::ClearBuffer::All);
    port.write_all(command.as_bytes())
        .with_context(|| format!("failed writing command to {serial_port}"))?;
    port.write_all(b"\n")
        .with_context(|| format!("failed writing newline to {serial_port}"))?;
    port.flush()
        .with_context(|| format!("failed flushing command to {serial_port}"))?;

    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    let mut line = Vec::<u8>::with_capacity(320);
    let mut byte = [0u8; 1];

    while Instant::now() < deadline {
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

                if let Some(rest) = raw.strip_prefix("@R ") {
                    let mut split = rest.splitn(2, ' ');
                    let tag = split.next().unwrap_or("").trim();
                    let payload = split.next().unwrap_or("{}").trim();
                    if tag.eq_ignore_ascii_case(expected_tag) {
                        let value: Value = serde_json::from_str(payload)
                            .with_context(|| format!("invalid JSON payload for {expected_tag}: {payload}"))?;
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
                return Err(anyhow!(format!(
                    "serial read failed on {serial_port}: {err}"
                )));
            }
        }
    }

    Err(anyhow!(
        "Timed out waiting for device response ({expected_tag}). Flash latest firmware and retry Wi-Fi setup."
    ))
}

fn json_flag(payload: &Value, key: &str) -> bool {
    payload.get(key).map_or(false, |v| match v {
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_i64().unwrap_or(0) != 0,
        Value::String(s) => s == "1" || s.eq_ignore_ascii_case("true"),
        _ => false,
    })
}

fn url_encode_component(input: &str) -> String {
    let mut out = String::with_capacity(input.len() + 16);
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(char::from(byte))
            }
            b' ' => out.push('+'),
            _ => {
                let _ = std::fmt::Write::write_fmt(&mut out, format_args!("%{byte:02X}"));
            }
        }
    }
    out
}

fn resolve_flash_tool_for_app(app: &AppHandle) -> Result<(FlashTool, PathBuf), String> {
    let dirs = candidate_binary_dirs(app);
    for dir in dirs {
        if let Some(found) = resolve_flash_tool(&dir) {
            return Ok(found);
        }
    }

    Err("No bundled flash tool found. Expected espflash or esptool in app binaries.".to_string())
}

fn resolve_named_tool_for_app(app: &AppHandle, tool_name: &str) -> Option<PathBuf> {
    let file = executable_name(tool_name);
    candidate_binary_dirs(app)
        .into_iter()
        .map(|dir| dir.join(&file))
        .find(|path| path.exists())
}

fn resolve_binary_for_app(app: &AppHandle, binary_name: &str) -> anyhow::Result<PathBuf> {
    let file = executable_name(binary_name);
    for dir in candidate_binary_dirs(app) {
        let candidate = dir.join(&file);
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    Err(anyhow!("Binary {} was not found in bundled resources", file))
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
        }
    }

    dirs.push(PathBuf::from("apps/beca-setup/src-tauri/binaries"));
    dirs.push(PathBuf::from("tools/bridge/target/debug"));
    dirs.push(PathBuf::from("tools/flasher/target/debug"));
    dirs
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
    let log_file = log_dir.join("beca-setup.log");

    let file_appender = tracing_appender::rolling::never(&log_dir, "beca-setup.log");
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

fn err_to_string<E: std::fmt::Display>(err: E) -> String {
    err.to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(RuntimeState::default())
        .setup(|app| {
            let state: State<'_, RuntimeState> = app.state();
            let app_handle = app.handle();
            if let Err(err) = init_logging(&app_handle, state.inner()) {
                eprintln!("logging init failed: {err}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            detect_beca_device,
            list_firmware_versions,
            flash_firmware,
            backup_settings,
            restore_settings,
            list_midi_outputs,
            scan_wifi_networks,
            get_wifi_setup_info,
            save_wifi_credentials,
            forget_wifi_credentials,
            reboot_device,
            start_bridge,
            stop_bridge,
            send_test_note,
            export_diagnostics
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| {
            error!("app runtime error: {}", error);
            panic!("tauri runtime error: {error}");
        });
}

fn main() {
    run();
}
