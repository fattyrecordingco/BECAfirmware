use crate::{run_serial_command_json, CachedControlError, CachedControlSnapshot, RuntimeState};
use anyhow::{anyhow, Context};
use beca_flasher::detect_beca_ports;
use if_addrs::{get_if_addrs, IfAddr};
use reqwest::header::CONTENT_TYPE;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::State;
use tokio::sync::Semaphore;

const NETWORK_SCAN_TIMEOUT_MS: u64 = 450;
const CONTROL_HTTP_TIMEOUT_MS: u64 = 1400;
const SNAPSHOT_REFRESH_MS_NETWORK: u64 = 42;
const SNAPSHOT_REFRESH_MS_SERIAL: u64 = 118;
const SNAPSHOT_REFRESH_MS_FALLBACK: u64 = 84;
const SNAPSHOT_STALE_GRACE_MS: u64 = 1800;
const SNAPSHOT_ERROR_BACKOFF_MS: u64 = 260;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControlTarget {
    pub id: String,
    pub name: String,
    pub serial_port: Option<String>,
    pub network_url: Option<String>,
    pub ip: Option<String>,
    pub ssid: Option<String>,
    pub description: String,
    pub source: String,
    pub control_ready: bool,
    pub serial_ready: bool,
    pub network_ready: bool,
    pub issue: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ControlDiscoveryResult {
    pub targets: Vec<ControlTarget>,
    pub selected_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ControlSelectionStatus {
    pub selected_id: Option<String>,
    pub target: Option<ControlTarget>,
    pub transport: Option<String>,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ControlResponse {
    pub status: u16,
    pub body: String,
    pub content_type: String,
    pub transport: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ControlSnapshot {
    pub state: Value,
    pub plant: Value,
    pub notes: Value,
    pub drum: Value,
    pub transport: String,
    pub target: Option<ControlTarget>,
    pub stale: bool,
    pub age_ms: u64,
    pub issue: Option<String>,
}

#[tauri::command]
pub async fn discover_beca_targets(
    state: State<'_, RuntimeState>,
) -> Result<ControlDiscoveryResult, String> {
    let bridge_running = state.bridge_child.lock().await.is_some();
    let serial_probe_guard = state.serial_op_lock.try_lock().ok();
    let serial_targets =
        discover_serial_targets(bridge_running, serial_probe_guard.is_some()).await;
    drop(serial_probe_guard);
    let network_targets = discover_network_targets().await;
    let targets = merge_targets(serial_targets, network_targets);

    {
        let mut stored = state.control_targets.lock().await;
        *stored = targets.clone();
    }

    let selected_id = {
        let mut selected = state.selected_control_target.lock().await;
        let keep_current = selected
            .as_ref()
            .and_then(|id| targets.iter().find(|target| target.id == *id))
            .map(|target| target.id.clone());

        let next = keep_current.or_else(|| targets.first().map(|target| target.id.clone()));
        *selected = next.clone();
        next
    };
    invalidate_control_snapshot_cache(&state).await;

    Ok(ControlDiscoveryResult {
        targets,
        selected_id,
    })
}

#[tauri::command]
pub async fn select_control_target(
    state: State<'_, RuntimeState>,
    target_id: String,
) -> Result<ControlSelectionStatus, String> {
    let targets = state.control_targets.lock().await.clone();
    let selected = targets
        .iter()
        .find(|target| target.id == target_id)
        .cloned()
        .ok_or_else(|| {
            "Selected BECA target is no longer available. Refresh devices and retry.".to_string()
        })?;

    *state.selected_control_target.lock().await = Some(selected.id.clone());
    invalidate_control_snapshot_cache(&state).await;
    build_selection_status(&state, Some(selected)).await
}

#[tauri::command]
pub async fn current_control_target(
    state: State<'_, RuntimeState>,
) -> Result<ControlSelectionStatus, String> {
    let target = active_target(&state).await;
    build_selection_status(&state, target).await
}

#[tauri::command]
pub async fn control_request(
    state: State<'_, RuntimeState>,
    method: String,
    path: String,
    query: Option<BTreeMap<String, String>>,
    form: Option<BTreeMap<String, String>>,
) -> Result<ControlResponse, String> {
    let response = execute_control_request(
        &state,
        &method,
        &path,
        query.unwrap_or_default(),
        form.unwrap_or_default(),
    )
    .await
    .map_err(|err| err.to_string())?;

    if method.eq_ignore_ascii_case("POST") {
        invalidate_control_snapshot_cache(&state).await;
    }

    Ok(response)
}

#[tauri::command]
pub async fn control_snapshot(state: State<'_, RuntimeState>) -> Result<ControlSnapshot, String> {
    let target = active_target(&state)
        .await
        .ok_or_else(|| "No BECA target selected. Refresh devices first.".to_string())?;
    let now = Instant::now();

    if let Some(snapshot) = maybe_cached_snapshot(&state, &target, now).await {
        return Ok(snapshot);
    }

    let _refresh_guard = state.control_snapshot_refresh.lock().await;
    if let Some(cached) = state.cached_control_snapshot.lock().await.clone() {
        let cached_target_id = cached.snapshot.target.as_ref().map(|item| item.id.as_str());
        if cached_target_id == Some(target.id.as_str()) {
            let age = Instant::now().saturating_duration_since(cached.captured_at);
            if age <= cached.refresh_after {
                return Ok(decorate_snapshot(&cached.snapshot, age, false, None));
            }
        }
    }

    match fetch_live_snapshot(&state, &target).await {
        Ok(snapshot) => {
            *state.last_control_error.lock().await = None;
            let cached = CachedControlSnapshot {
                refresh_after: snapshot_refresh_window(&snapshot.transport),
                captured_at: Instant::now(),
                snapshot: snapshot.clone(),
            };
            *state.cached_control_snapshot.lock().await = Some(cached);
            Ok(snapshot)
        }
        Err(err) => {
            let issue = compact_snapshot_issue(err.to_string());
            *state.last_control_error.lock().await = Some(CachedControlError {
                message: issue.clone(),
                happened_at: Instant::now(),
            });
            if let Some(snapshot) = stale_snapshot_after_error(&state, &target, &issue).await {
                return Ok(snapshot);
            }
            Err(issue)
        }
    }
}

async fn build_selection_status(
    _state: &State<'_, RuntimeState>,
    target: Option<ControlTarget>,
) -> Result<ControlSelectionStatus, String> {
    if let Some(target) = target {
        let transport = preferred_transport(&target);
        let detail = match transport {
            Some("network") => {
                let mut detail = if target.network_ready {
                    format!(
                        "Live control is running over Wi-Fi at {}.",
                        target.network_url.clone().unwrap_or_default()
                    )
                } else {
                    format!(
                        "Live control will use Wi-Fi at {}.",
                        target.network_url.clone().unwrap_or_default()
                    )
                };
                if let Some(serial_port) = target.serial_port.as_deref() {
                    detail.push_str(&format!(
                        " USB on {serial_port} stays free for smoother serial MIDI."
                    ));
                }
                detail
            }
            Some("serial") => {
                let mut detail = format!(
                    "Live control is running over USB serial on {}.",
                    target.serial_port.clone().unwrap_or_default()
                );
                if let Some(url) = target.network_url.as_deref() {
                    detail.push_str(&format!(
                        " Wi-Fi control at {url} can take over automatically when available."
                    ));
                }
                detail.push_str(" Stop Bridge first if you need direct serial control.");
                detail
            }
            _ => target
                .issue
                .clone()
                .unwrap_or_else(|| network_only_control_issue(&target)),
        };

        return Ok(ControlSelectionStatus {
            selected_id: Some(target.id.clone()),
            target: Some(target),
            transport: transport.map(str::to_string),
            detail,
        });
    }

    Ok(ControlSelectionStatus {
        selected_id: None,
        target: None,
        transport: None,
        detail: "No BECA device is selected yet. Refresh devices and connect one.".to_string(),
    })
}

async fn active_target(state: &State<'_, RuntimeState>) -> Option<ControlTarget> {
    let selected_id = state.selected_control_target.lock().await.clone();
    let targets = state.control_targets.lock().await.clone();

    if let Some(selected_id) = selected_id {
        if let Some(found) = targets.iter().find(|target| target.id == selected_id) {
            return Some(found.clone());
        }
    }

    targets.into_iter().next()
}

async fn invalidate_control_snapshot_cache(state: &State<'_, RuntimeState>) {
    *state.cached_control_snapshot.lock().await = None;
    *state.last_control_error.lock().await = None;
}

fn snapshot_refresh_window(transport: &str) -> Duration {
    match transport {
        "network" => Duration::from_millis(SNAPSHOT_REFRESH_MS_NETWORK),
        "serial" => Duration::from_millis(SNAPSHOT_REFRESH_MS_SERIAL),
        _ => Duration::from_millis(SNAPSHOT_REFRESH_MS_FALLBACK),
    }
}

fn decorate_snapshot(
    snapshot: &ControlSnapshot,
    age: Duration,
    stale: bool,
    issue: Option<String>,
) -> ControlSnapshot {
    let mut next = snapshot.clone();
    next.age_ms = age.as_millis().min(u128::from(u64::MAX)) as u64;
    next.stale = stale;
    next.issue = issue;
    next
}

fn compact_snapshot_issue(issue: String) -> String {
    let trimmed = issue.trim();
    if trimmed.is_empty() {
        return "Live control stalled briefly. Retrying.".to_string();
    }
    if trimmed.len() > 180 {
        format!("{}...", &trimmed[..177])
    } else {
        trimmed.to_string()
    }
}

async fn maybe_cached_snapshot(
    state: &State<'_, RuntimeState>,
    target: &ControlTarget,
    now: Instant,
) -> Option<ControlSnapshot> {
    let cached = state.cached_control_snapshot.lock().await.clone()?;
    let cached_target_id = cached.snapshot.target.as_ref().map(|item| item.id.as_str());
    if cached_target_id != Some(target.id.as_str()) {
        return None;
    }

    let age = now.saturating_duration_since(cached.captured_at);
    if age <= cached.refresh_after {
        return Some(decorate_snapshot(&cached.snapshot, age, false, None));
    }

    if age > Duration::from_millis(SNAPSHOT_STALE_GRACE_MS) {
        return None;
    }

    let refresh_in_flight = match state.control_snapshot_refresh.try_lock() {
        Ok(guard) => {
            drop(guard);
            false
        }
        Err(_) => true,
    };

    let recent_error = state.last_control_error.lock().await.clone();
    if refresh_in_flight {
        let issue = recent_error.map(|err| err.message);
        return Some(decorate_snapshot(&cached.snapshot, age, true, issue));
    }

    if let Some(error_state) = recent_error {
        if now.saturating_duration_since(error_state.happened_at)
            <= Duration::from_millis(SNAPSHOT_ERROR_BACKOFF_MS)
        {
            return Some(decorate_snapshot(
                &cached.snapshot,
                age,
                true,
                Some(error_state.message),
            ));
        }
    }

    None
}

async fn stale_snapshot_after_error(
    state: &State<'_, RuntimeState>,
    target: &ControlTarget,
    issue: &str,
) -> Option<ControlSnapshot> {
    let cached = state.cached_control_snapshot.lock().await.clone()?;
    let cached_target_id = cached.snapshot.target.as_ref().map(|item| item.id.as_str());
    if cached_target_id != Some(target.id.as_str()) {
        return None;
    }
    let age = Instant::now().saturating_duration_since(cached.captured_at);
    if age > Duration::from_millis(SNAPSHOT_STALE_GRACE_MS) {
        return None;
    }
    Some(decorate_snapshot(
        &cached.snapshot,
        age,
        true,
        Some(format!(
            "Using the last live data while reconnecting. {issue}"
        )),
    ))
}

async fn execute_control_request(
    state: &State<'_, RuntimeState>,
    method: &str,
    path: &str,
    query: BTreeMap<String, String>,
    form: BTreeMap<String, String>,
) -> anyhow::Result<ControlResponse> {
    let target = active_target(state)
        .await
        .ok_or_else(|| anyhow!("No BECA target selected. Refresh devices first."))?;

    let primary = preferred_transport(&target);
    if let Some(transport) = primary {
        let primary_result = match transport {
            "serial" => request_over_serial(state, &target, method, path, &query, &form).await,
            "network" => request_over_network(state, &target, method, path, &query, &form).await,
            _ => Err(anyhow!("Unsupported BECA control transport: {transport}")),
        };
        match primary_result {
            Ok(response) => return Ok(response),
            Err(err) => {
                if let Some(fallback) = fallback_transport(&target, transport) {
                    return match fallback {
                        "serial" => {
                            request_over_serial(state, &target, method, path, &query, &form)
                                .await
                                .map_err(|_| err)
                        }
                        "network" => {
                            request_over_network(state, &target, method, path, &query, &form)
                                .await
                                .map_err(|_| err)
                        }
                        _ => Err(err),
                    };
                }
                return Err(err);
            }
        };
    }

    Err(anyhow!(target
        .issue
        .clone()
        .unwrap_or_else(|| network_only_control_issue(&target))))
}

async fn execute_snapshot_request(
    state: &State<'_, RuntimeState>,
    target: &ControlTarget,
) -> anyhow::Result<(
    ControlResponse,
    ControlResponse,
    ControlResponse,
    ControlResponse,
)> {
    let primary = preferred_transport(target).ok_or_else(|| {
        anyhow!(target
            .issue
            .clone()
            .unwrap_or_else(|| network_only_control_issue(target)))
    })?;

    let primary_result = match primary {
        "serial" => snapshot_over_serial(state, target).await,
        "network" => snapshot_over_network_target(state, target).await,
        _ => Err(anyhow!("Unsupported BECA snapshot transport: {primary}")),
    };

    match primary_result {
        Ok(snapshot) => Ok(snapshot),
        Err(primary_err) => {
            if let Some(fallback) = fallback_transport(target, primary) {
                let fallback_result = match fallback {
                    "serial" => snapshot_over_serial(state, target).await,
                    "network" => snapshot_over_network_target(state, target).await,
                    _ => Err(anyhow!("Unsupported BECA snapshot transport: {fallback}")),
                };
                return fallback_result.map_err(|_| primary_err);
            }
            Err(primary_err)
        }
    }
}

async fn fetch_live_snapshot(
    state: &State<'_, RuntimeState>,
    target: &ControlTarget,
) -> anyhow::Result<ControlSnapshot> {
    let (state_res, plant_res, notes_res, drum_res) =
        execute_snapshot_request(state, target).await?;

    Ok(ControlSnapshot {
        state: parse_json_body(&state_res.body),
        plant: parse_json_body(&plant_res.body),
        notes: parse_json_body(&notes_res.body),
        drum: parse_json_body(&drum_res.body),
        transport: state_res.transport,
        target: Some(target.clone()),
        stale: false,
        age_ms: 0,
        issue: None,
    })
}

async fn request_over_network(
    state: &State<'_, RuntimeState>,
    target: &ControlTarget,
    method: &str,
    path: &str,
    query: &BTreeMap<String, String>,
    form: &BTreeMap<String, String>,
) -> anyhow::Result<ControlResponse> {
    let url = target
        .network_url
        .as_deref()
        .ok_or_else(|| anyhow!(network_only_control_issue(target)))?;
    network_request_with_client(&state.control_http_client, url, method, path, query, form).await
}

async fn request_over_serial(
    state: &State<'_, RuntimeState>,
    target: &ControlTarget,
    method: &str,
    path: &str,
    query: &BTreeMap<String, String>,
    form: &BTreeMap<String, String>,
) -> anyhow::Result<ControlResponse> {
    let port = target
        .serial_port
        .as_deref()
        .ok_or_else(|| anyhow!("No BECA serial port is available for live control."))?;
    serial_request(state, port, method, path, query, form).await
}

async fn snapshot_over_network_target(
    state: &State<'_, RuntimeState>,
    target: &ControlTarget,
) -> anyhow::Result<(
    ControlResponse,
    ControlResponse,
    ControlResponse,
    ControlResponse,
)> {
    let url = target
        .network_url
        .as_deref()
        .ok_or_else(|| anyhow!(network_only_control_issue(target)))?;
    snapshot_over_network_with_client(&state.control_http_client, url).await
}

#[cfg(test)]
async fn network_request(
    base_url: &str,
    method: &str,
    path: &str,
    query: &BTreeMap<String, String>,
    form: &BTreeMap<String, String>,
) -> anyhow::Result<ControlResponse> {
    let client = Client::builder()
        .timeout(Duration::from_millis(CONTROL_HTTP_TIMEOUT_MS))
        .build()
        .context("failed to create HTTP client")?;
    network_request_with_client(&client, base_url, method, path, query, form).await
}

async fn network_request_with_client(
    client: &Client,
    base_url: &str,
    method: &str,
    path: &str,
    query: &BTreeMap<String, String>,
    form: &BTreeMap<String, String>,
) -> anyhow::Result<ControlResponse> {
    let url = format!("{}{}", base_url.trim_end_matches('/'), path);
    let upper = method.to_ascii_uppercase();

    let request = match upper.as_str() {
        "POST" => client.post(&url),
        _ => client.get(&url),
    };

    let request = if !query.is_empty() {
        request.query(query)
    } else {
        request
    };
    let request = if upper == "POST" && !form.is_empty() {
        request.form(form)
    } else {
        request
    };

    let response = request
        .send()
        .await
        .with_context(|| format!("failed to reach {}", url))?;
    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("text/plain")
        .to_string();
    let body = response.text().await.unwrap_or_default();

    Ok(ControlResponse {
        status,
        body,
        content_type,
        transport: "network".to_string(),
    })
}

async fn snapshot_over_network_with_client(
    client: &Client,
    base_url: &str,
) -> anyhow::Result<(
    ControlResponse,
    ControlResponse,
    ControlResponse,
    ControlResponse,
)> {
    let empty_query = BTreeMap::new();
    let empty_form = BTreeMap::new();
    let live = network_request_with_client(
        client,
        base_url,
        "GET",
        "/api/live",
        &empty_query,
        &empty_form,
    )
    .await?;
    split_live_snapshot_response(live)
}

async fn snapshot_over_serial(
    state: &State<'_, RuntimeState>,
    target: &ControlTarget,
) -> anyhow::Result<(
    ControlResponse,
    ControlResponse,
    ControlResponse,
    ControlResponse,
)> {
    let serial_port = target
        .serial_port
        .as_deref()
        .ok_or_else(|| anyhow!("No BECA serial port is available for live control."))?;
    let empty_query = BTreeMap::new();
    let empty_form = BTreeMap::new();
    let live = serial_request(
        state,
        serial_port,
        "GET",
        "/api/live",
        &empty_query,
        &empty_form,
    )
    .await?;
    split_live_snapshot_response(live)
}

fn parse_json_body(body: &str) -> Value {
    serde_json::from_str(body).unwrap_or_else(|_| json!({ "ok": 0, "raw": body }))
}

fn split_live_snapshot_response(
    response: ControlResponse,
) -> anyhow::Result<(
    ControlResponse,
    ControlResponse,
    ControlResponse,
    ControlResponse,
)> {
    let live = parse_json_body(&response.body);
    let transport = response.transport.clone();
    let content_type = "application/json".to_string();

    let section_response = |key: &str| ControlResponse {
        status: response.status,
        body: live
            .get(key)
            .cloned()
            .unwrap_or_else(|| json!({}))
            .to_string(),
        content_type: content_type.clone(),
        transport: transport.clone(),
    };

    Ok((
        section_response("state"),
        section_response("plant"),
        section_response("notes"),
        section_response("drum"),
    ))
}

fn preferred_transport(target: &ControlTarget) -> Option<&'static str> {
    if target.network_ready {
        return Some("network");
    }
    if target.serial_ready {
        return Some("serial");
    }
    if target.network_url.is_some() {
        return Some("network");
    }
    None
}

fn fallback_transport(target: &ControlTarget, primary: &str) -> Option<&'static str> {
    match primary {
        "serial" => {
            if target.network_ready || target.network_url.is_some() {
                Some("network")
            } else {
                None
            }
        }
        "network" => {
            if target.serial_ready {
                Some("serial")
            } else {
                None
            }
        }
        _ => None,
    }
}

fn network_only_control_issue(target: &ControlTarget) -> String {
    let mut detail =
        "Live control stays on BECA's local Wi-Fi connection so USB serial can stay dedicated to MIDI."
            .to_string();
    if let Some(url) = target.network_url.as_deref() {
        detail.push_str(&format!(" The last known control address is {url}."));
    } else {
        detail.push_str(
            " Finish Wi-Fi setup in Setup, make sure this computer is on the same network, then refresh devices.",
        );
    }
    detail
}

async fn discover_serial_targets(
    bridge_running: bool,
    serial_probe_allowed: bool,
) -> Vec<ControlTarget> {
    let ports = detect_beca_ports();
    let likely_ports: Vec<_> = ports.into_iter().filter(|port| port.likely_beca).collect();
    let mut targets = Vec::with_capacity(likely_ports.len());

    for port in likely_ports {
        let mut target = ControlTarget {
            id: format!("serial:{}", port.port_name),
            name: if port.description.is_empty() {
                format!("BECA ({})", port.port_name)
            } else {
                format!("BECA ({})", port.description)
            },
            serial_port: Some(port.port_name.clone()),
            network_url: None,
            ip: None,
            ssid: None,
            description: port.description.clone(),
            source: "serial".to_string(),
            control_ready: false,
            serial_ready: false,
            network_ready: false,
            issue: None,
        };

        if bridge_running {
            target.issue = Some(
                "Bridge is running and owns USB serial. Live Control can continue over Wi-Fi; stop Bridge for offline USB control."
                    .to_string(),
            );
        } else if serial_probe_allowed {
            let port_name = port.port_name.clone();
            if let Ok(info) = tokio::task::spawn_blocking(move || {
                run_serial_command_json(&port_name, "@C WIFI_INFO", "WIFI_INFO", 2_500, 1)
            })
            .await
            .unwrap_or_else(|_| Err(anyhow!("serial probe task failed")))
            {
                apply_wifi_info(&mut target, &info);
            }

            let state_port = port.port_name.clone();
            if tokio::task::spawn_blocking(move || {
                run_serial_command_json(&state_port, "@C STATE", "STATE", 2_500, 1)
            })
            .await
            .unwrap_or_else(|_| Err(anyhow!("serial state probe task failed")))
            .is_ok()
            {
                target.serial_ready = true;
                target.control_ready = true;
                target.issue = None;
            }

            if let Some(url) = target.network_url.clone() {
                match probe_network_control(&url).await {
                    Ok(()) => {
                        target.network_ready = true;
                        target.control_ready = true;
                        target.issue = None;
                    }
                    Err(err) => {
                        if !target.serial_ready {
                            target.issue = Some(describe_control_probe_error("Wi-Fi", &err));
                        }
                    }
                }
            }
        }

        targets.push(target);
    }

    targets
}

async fn discover_network_targets() -> Vec<ControlTarget> {
    let client = match Client::builder()
        .timeout(Duration::from_millis(NETWORK_SCAN_TIMEOUT_MS))
        .build()
    {
        Ok(client) => client,
        Err(_) => return Vec::new(),
    };

    let scan_urls = match local_scan_urls() {
        Ok(urls) => urls,
        Err(_) => return Vec::new(),
    };

    let gate = Arc::new(Semaphore::new(40));
    let mut tasks = Vec::with_capacity(scan_urls.len());

    for url in scan_urls {
        let client = client.clone();
        let gate = gate.clone();
        tasks.push(tokio::spawn(async move {
            let permit = gate.acquire_owned().await.ok()?;
            let _permit = permit;
            probe_network_target(&client, &url).await.ok()
        }));
    }

    let mut found = Vec::new();
    for task in tasks {
        if let Ok(Some(target)) = task.await {
            found.push(target);
        }
    }
    found
}

async fn probe_network_target(client: &Client, base_url: &str) -> anyhow::Result<ControlTarget> {
    let url = format!("{}/api/info", base_url.trim_end_matches('/'));
    let response = client
        .get(&url)
        .send()
        .await
        .with_context(|| format!("failed to probe {}", base_url))?;

    if !response.status().is_success() {
        return Err(anyhow!("{} did not return a successful response", url));
    }

    let body = response.text().await.unwrap_or_default();
    let info: Value = serde_json::from_str(&body).context("invalid /api/info JSON")?;
    let mut target = ControlTarget {
        id: format!("network:{base_url}"),
        name: "BECA".to_string(),
        serial_port: None,
        network_url: Some(base_url.to_string()),
        ip: base_url_host(base_url),
        ssid: None,
        description: "Wi-Fi device".to_string(),
        source: "network".to_string(),
        control_ready: false,
        serial_ready: false,
        network_ready: false,
        issue: None,
    };
    apply_wifi_info(&mut target, &info);
    match probe_network_control(base_url).await {
        Ok(()) => {
            target.network_ready = true;
            target.control_ready = true;
        }
        Err(err) => {
            target.issue = Some(describe_control_probe_error("Wi-Fi", &err));
        }
    }
    Ok(target)
}

fn merge_targets(
    serial_targets: Vec<ControlTarget>,
    network_targets: Vec<ControlTarget>,
) -> Vec<ControlTarget> {
    let mut merged = serial_targets;

    for network in network_targets {
        if let Some(existing) = merged
            .iter_mut()
            .find(|candidate| same_beca(candidate, &network))
        {
            if existing.network_url.is_none() {
                existing.network_url = network.network_url.clone();
            }
            if existing.ip.is_none() {
                existing.ip = network.ip.clone();
            }
            if existing.ssid.is_none() {
                existing.ssid = network.ssid.clone();
            }
            if existing.name == "BECA" && network.name != "BECA" {
                existing.name = network.name.clone();
            }
            existing.control_ready |= network.control_ready;
            existing.serial_ready |= network.serial_ready;
            existing.network_ready |= network.network_ready;
            if existing.control_ready {
                existing.issue = None;
            } else if existing.issue.is_none() && network.issue.is_some() {
                existing.issue = network.issue.clone();
            }
            existing.source = "serial+network".to_string();
            continue;
        }

        merged.push(network);
    }

    merged.sort_by(|left, right| left.name.cmp(&right.name));
    merged
}

fn same_beca(left: &ControlTarget, right: &ControlTarget) -> bool {
    if let (Some(left_ip), Some(right_ip)) = (&left.ip, &right.ip) {
        if left_ip == right_ip {
            return true;
        }
    }

    let left_name = left.name.trim().to_ascii_lowercase();
    let right_name = right.name.trim().to_ascii_lowercase();
    !left_name.is_empty() && left_name == right_name
}

fn apply_wifi_info(target: &mut ControlTarget, payload: &Value) {
    if let Some(name) = payload.get("name").and_then(|value| value.as_str()) {
        if !name.trim().is_empty() {
            target.name = name.trim().to_string();
        }
    }
    if let Some(ssid) = payload.get("ssid").and_then(|value| value.as_str()) {
        if !ssid.trim().is_empty() {
            target.ssid = Some(ssid.trim().to_string());
        }
    }
    if let Some(ip) = payload.get("ip").and_then(|value| value.as_str()) {
        let ip = ip.trim();
        if !ip.is_empty() && ip != "0.0.0.0" {
            target.ip = Some(ip.to_string());
            target.network_url = Some(format!("http://{ip}"));
        }
    }
    if let Some(mode) = payload.get("mode").and_then(|value| value.as_str()) {
        if !mode.trim().is_empty() {
            target.description = format!("{} mode", mode.trim().to_uppercase());
        }
    }
}

async fn probe_network_control(base_url: &str) -> anyhow::Result<()> {
    let client = Client::builder()
        .timeout(Duration::from_millis(CONTROL_HTTP_TIMEOUT_MS))
        .build()
        .context("failed to create HTTP probe client")?;
    let url = format!("{}/api/state", base_url.trim_end_matches('/'));
    let response = client
        .get(&url)
        .send()
        .await
        .with_context(|| format!("failed to probe {url}"))?;

    if !response.status().is_success() {
        return Err(anyhow!("{} returned HTTP {}", url, response.status()));
    }

    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let body = response.text().await.unwrap_or_default();
    if !content_type.contains("json") {
        return Err(anyhow!(
            "legacy browser page responded instead of the live control JSON API"
        ));
    }

    let payload: Value = serde_json::from_str(&body).context("invalid /api/state JSON")?;
    validate_state_payload(&payload)
}

fn validate_state_payload(payload: &Value) -> anyhow::Result<()> {
    let object = payload
        .as_object()
        .ok_or_else(|| anyhow!("control probe returned non-object JSON"))?;
    if object.contains_key("mode") || object.contains_key("bpm") || object.contains_key("sens") {
        Ok(())
    } else {
        Err(anyhow!(
            "device did not expose the unified control state fields"
        ))
    }
}

fn describe_control_probe_error(transport_label: &str, err: &anyhow::Error) -> String {
    let message = err.to_string();
    let lower = message.to_ascii_lowercase();
    if lower.contains("unknown command")
        || lower.contains("legacy browser page")
        || lower.contains("did not expose the unified control state fields")
    {
        return format!(
            "{transport_label} found BECA, but the installed firmware is too old for the unified desktop control surface. Flash the latest firmware in Setup, then reconnect."
        );
    }
    if lower.contains("timed out")
        || lower.contains("failed to reach")
        || lower.contains("failed to probe")
    {
        return format!(
            "{transport_label} found BECA, but the live control API did not answer in time. Reboot BECA or flash the latest firmware, then retry."
        );
    }
    format!("{transport_label} found BECA, but live control is unavailable right now: {message}")
}

fn base_url_host(base_url: &str) -> Option<String> {
    base_url
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .split('/')
        .next()
        .map(str::to_string)
}

fn local_scan_urls() -> anyhow::Result<Vec<String>> {
    let mut urls = BTreeSet::new();

    for iface in get_if_addrs().context("unable to inspect local network adapters")? {
        let ip = match iface.addr {
            IfAddr::V4(v4) => v4.ip,
            _ => continue,
        };

        if ip.is_loopback() || ip.is_link_local() {
            continue;
        }

        let octets = ip.octets();
        for host in 1..=254 {
            if host == octets[3] {
                continue;
            }
            urls.insert(format!(
                "http://{}.{}.{}.{}",
                octets[0], octets[1], octets[2], host
            ));
        }
    }

    Ok(urls.into_iter().collect())
}

async fn serial_request(
    state: &State<'_, RuntimeState>,
    serial_port: &str,
    method: &str,
    path: &str,
    _query: &BTreeMap<String, String>,
    form: &BTreeMap<String, String>,
) -> anyhow::Result<ControlResponse> {
    let upper = method.to_ascii_uppercase();

    let (command, expected_tag, timeout_ms) = match (upper.as_str(), path) {
        ("GET", "/api/live") => ("@C LIVE".to_string(), "LIVE", 2_500),
        ("GET", "/api/state") => ("@C STATE".to_string(), "STATE", 2_500),
        ("GET", "/api/plant") => ("@C PLANT".to_string(), "PLANT", 2_500),
        ("GET", "/api/notes") => ("@C NOTES".to_string(), "NOTES", 2_500),
        ("GET", "/api/drum") => ("@C DRUM".to_string(), "DRUM", 2_500),
        ("GET", "/api/params") => ("@C PARAMS".to_string(), "PARAMS", 2_500),
        ("GET", "/api/synth") => ("@C SYNTH".to_string(), "SYNTH", 2_500),
        ("GET", "/api/synth/test") => ("@C SYNTH_TEST".to_string(), "SYNTH_TEST", 4_000),
        ("POST", "/api/set") => {
            let key = form
                .get("key")
                .ok_or_else(|| anyhow!("key and value required"))?;
            let value = form
                .get("value")
                .ok_or_else(|| anyhow!("key and value required"))?;
            (format!("@C SET {key} {value}"), "SET", 2_500)
        }
        ("POST", "/api/sync") => {
            let value = form
                .get("value")
                .or_else(|| form.get("sync"))
                .ok_or_else(|| anyhow!("sync value required"))?;
            (format!("@C SET sync {value}"), "SET", 2_500)
        }
        _ => {
            return Err(anyhow!(
                "serial control route is not implemented for {} {}",
                upper,
                path
            ))
        }
    };

    let body = serial_json_command(state, serial_port, &command, expected_tag, timeout_ms)
        .await?
        .to_string();

    Ok(ControlResponse {
        status: 200,
        body,
        content_type: "application/json".to_string(),
        transport: "serial".to_string(),
    })
}

async fn serial_json_command(
    state: &State<'_, RuntimeState>,
    serial_port: &str,
    command: &str,
    expected_tag: &str,
    timeout_ms: u64,
) -> anyhow::Result<Value> {
    if state.bridge_child.lock().await.is_some() {
        return Err(anyhow!(
            "Bridge is running and owns the serial port. Stop Bridge or use Wi-Fi live control."
        ));
    }

    let _serial_guard = state.serial_op_lock.lock().await;

    let port = serial_port.to_string();
    let command = command.to_string();
    let expected = expected_tag.to_string();

    tokio::task::spawn_blocking(move || {
        run_serial_command_json(&port, &command, &expected, timeout_ms, 1)
    })
    .await
    .context("serial control task failed")?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};
    use std::thread;
    use std::time::{Duration, Instant};

    fn spawn_mock_server() -> (String, Arc<Mutex<i32>>, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock server");
        let addr = listener.local_addr().expect("mock server addr");
        listener
            .set_nonblocking(true)
            .expect("mock server nonblocking");
        let bpm = Arc::new(Mutex::new(120));
        let bpm_for_thread = bpm.clone();

        let handle = thread::spawn(move || {
            let started = Instant::now();
            while started.elapsed() < Duration::from_secs(3) {
                let Ok((mut stream, _peer)) = listener.accept() else {
                    thread::sleep(Duration::from_millis(20));
                    continue;
                };
                let mut buf = [0u8; 4096];
                let n = stream.read(&mut buf).expect("read request");
                let req = String::from_utf8_lossy(&buf[..n]);
                let first_line = req.lines().next().unwrap_or_default().to_string();
                let body = req.split("\r\n\r\n").nth(1).unwrap_or_default();

                let (status, content_type, payload) = if first_line.starts_with("GET /api/info") {
                    (
                        "200 OK",
                        "application/json",
                        format!(
                            "{{\"name\":\"Mock BECA\",\"mode\":\"sta\",\"ip\":\"{}\",\"ssid\":\"StudioWiFi\"}}",
                            addr.ip()
                        ),
                    )
                } else if first_line.starts_with("GET /api/state") {
                    let current_bpm = *bpm_for_thread.lock().expect("lock bpm");
                    (
                        "200 OK",
                        "application/json",
                        format!("{{\"bpm\":{},\"mode\":0}}", current_bpm),
                    )
                } else if first_line.starts_with("POST /api/set") {
                    let form = body
                        .split('&')
                        .filter_map(|part| part.split_once('='))
                        .collect::<BTreeMap<_, _>>();
                    if form.get("key") == Some(&"bpm") {
                        let next = form
                            .get("value")
                            .and_then(|value| value.parse::<i32>().ok())
                            .unwrap_or(120);
                        *bpm_for_thread.lock().expect("lock bpm") = next;
                    }
                    ("200 OK", "application/json", "{\"ok\":1}".to_string())
                } else {
                    (
                        "404 Not Found",
                        "application/json",
                        "{\"ok\":0}".to_string(),
                    )
                };

                let response = format!(
                    "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    payload.len(),
                    payload
                );
                stream
                    .write_all(response.as_bytes())
                    .expect("write response");
            }
        });

        (format!("http://{}", addr), bpm, handle)
    }

    fn spawn_legacy_mock_server() -> (String, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind legacy mock server");
        let addr = listener.local_addr().expect("legacy mock server addr");
        listener
            .set_nonblocking(true)
            .expect("legacy mock server nonblocking");

        let handle = thread::spawn(move || {
            let started = Instant::now();
            while started.elapsed() < Duration::from_secs(3) {
                let Ok((mut stream, _peer)) = listener.accept() else {
                    thread::sleep(Duration::from_millis(20));
                    continue;
                };
                let mut buf = [0u8; 4096];
                let n = stream.read(&mut buf).expect("read request");
                let req = String::from_utf8_lossy(&buf[..n]);
                let first_line = req.lines().next().unwrap_or_default().to_string();

                let (status, content_type, payload) = if first_line.starts_with("GET /api/info") {
                    (
                        "200 OK",
                        "application/json",
                        format!(
                            "{{\"name\":\"Legacy BECA\",\"mode\":\"sta\",\"ip\":\"{}\",\"ssid\":\"StudioWiFi\"}}",
                            addr.ip()
                        ),
                    )
                } else if first_line.starts_with("GET /api/state") {
                    (
                        "200 OK",
                        "text/html",
                        "<!doctype html><title>Legacy Control</title>".to_string(),
                    )
                } else {
                    (
                        "404 Not Found",
                        "application/json",
                        "{\"ok\":0}".to_string(),
                    )
                };

                let response = format!(
                    "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    payload.len(),
                    payload
                );
                stream
                    .write_all(response.as_bytes())
                    .expect("write response");
            }
        });

        (format!("http://{}", addr), handle)
    }

    #[tokio::test]
    async fn network_request_reads_and_writes_mock_beca_state() {
        let (base_url, bpm, handle) = spawn_mock_server();

        let initial = network_request(
            &base_url,
            "GET",
            "/api/state",
            &BTreeMap::new(),
            &BTreeMap::new(),
        )
        .await
        .expect("initial state");
        assert!(initial.body.contains("\"bpm\":120"));

        let mut form = BTreeMap::new();
        form.insert("key".to_string(), "bpm".to_string());
        form.insert("value".to_string(), "145".to_string());
        let post = network_request(&base_url, "POST", "/api/set", &BTreeMap::new(), &form)
            .await
            .expect("set bpm");
        assert_eq!(post.status, 200);
        assert_eq!(*bpm.lock().expect("lock bpm"), 145);

        let next = network_request(
            &base_url,
            "GET",
            "/api/state",
            &BTreeMap::new(),
            &BTreeMap::new(),
        )
        .await
        .expect("next state");
        assert!(next.body.contains("\"bpm\":145"));

        handle.join().expect("mock server join");
    }

    #[tokio::test]
    async fn probe_network_target_reads_device_identity() {
        let (base_url, _bpm, handle) = spawn_mock_server();
        let target = probe_network_target(&Client::new(), &base_url)
            .await
            .expect("probe target");

        assert_eq!(target.name, "Mock BECA");
        assert_eq!(target.network_url.as_deref(), Some("http://127.0.0.1"));
        assert_eq!(target.ssid.as_deref(), Some("StudioWiFi"));
        assert!(target.control_ready);
        assert!(target.network_ready);
        assert!(target.issue.is_none());

        handle.join().expect("mock server join");
    }

    #[tokio::test]
    async fn probe_network_target_marks_legacy_control_as_incompatible() {
        let (base_url, handle) = spawn_legacy_mock_server();
        let target = probe_network_target(&Client::new(), &base_url)
            .await
            .expect("probe target");

        assert_eq!(target.name, "Legacy BECA");
        assert!(!target.control_ready);
        assert!(!target.network_ready);
        assert!(target
            .issue
            .as_deref()
            .unwrap_or_default()
            .contains("too old"));

        handle.join().expect("legacy mock server join");
    }
}
