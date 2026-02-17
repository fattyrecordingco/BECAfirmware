import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const el = {
  connectStatus: document.querySelector("#connect-status"),
  portChip: document.querySelector("#port-chip"),
  portFixes: document.querySelector("#port-fixes"),
  firmwareSelect: document.querySelector("#firmware-select"),
  flashProgress: document.querySelector("#flash-progress"),
  flashStatus: document.querySelector("#flash-status"),
  wifiStatus: document.querySelector("#wifi-status"),
  wifiName: document.querySelector("#wifi-name"),
  wifiSsid: document.querySelector("#wifi-ssid"),
  wifiSsidManual: document.querySelector("#wifi-ssid-manual"),
  wifiPass: document.querySelector("#wifi-pass"),
  midiSelect: document.querySelector("#midi-select"),
  bridgeStatus: document.querySelector("#bridge-status"),
  activity: document.querySelector("#activity"),
  logView: document.querySelector("#log-view"),
  btnScan: document.querySelector("#btn-scan"),
  btnFlash: document.querySelector("#btn-flash"),
  btnFlashWifi: document.querySelector("#btn-flash-wifi"),
  btnBackup: document.querySelector("#btn-backup"),
  btnRestore: document.querySelector("#btn-restore"),
  btnWifiScan: document.querySelector("#btn-wifi-scan"),
  btnWifiSave: document.querySelector("#btn-wifi-save"),
  btnWifiForget: document.querySelector("#btn-wifi-forget"),
  btnStartBridge: document.querySelector("#btn-start-bridge"),
  btnStopBridge: document.querySelector("#btn-stop-bridge"),
  btnTestNote: document.querySelector("#btn-test-note"),
  btnCopy: document.querySelector("#btn-copy"),
  btnExport: document.querySelector("#btn-export")
};

const state = {
  selectedPort: null,
  logLines: [],
  flashInProgress: false,
  wifiOpInFlight: false,
  wifiCooldownUntil: 0
};

function addLog(line) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  state.logLines.push(stamped);
  if (state.logLines.length > 400) {
    state.logLines.shift();
  }
  el.logView.textContent = state.logLines.join("\n");
}

function setActivity(active) {
  el.activity.classList.toggle("active", active);
}

function setWifiStatus(message, tone = "") {
  el.wifiStatus.textContent = message;
  el.wifiStatus.classList.remove("error", "ok");
  if (tone) el.wifiStatus.classList.add(tone);
}

function setWifiControlsEnabled(enabled) {
  const ready = enabled && Date.now() >= state.wifiCooldownUntil;
  el.btnWifiScan.disabled = !ready;
  el.btnWifiSave.disabled = !ready;
  el.btnWifiForget.disabled = !ready;
  el.btnFlashWifi.disabled = !ready;
  el.wifiName.disabled = !ready;
  el.wifiSsid.disabled = !ready;
  el.wifiSsidManual.disabled = !ready;
  el.wifiPass.disabled = !ready;
}

function setWifiCooldown(ms, message = "") {
  const duration = Math.max(0, Number(ms) || 0);
  state.wifiCooldownUntil = Date.now() + duration;
  if (message) {
    setWifiStatus(message, "ok");
  }
  setWifiControlsEnabled(Boolean(state.selectedPort) && !state.flashInProgress && !state.wifiOpInFlight);
  if (duration > 0) {
    setTimeout(() => {
      setWifiControlsEnabled(Boolean(state.selectedPort) && !state.flashInProgress && !state.wifiOpInFlight);
    }, duration + 200);
  }
}

function requireWifiReady(actionText) {
  const remaining = state.wifiCooldownUntil - Date.now();
  if (remaining <= 0) return false;
  const waitSec = Math.max(1, Math.ceil(remaining / 1000));
  setWifiStatus(`BECA is still rebooting. Wait ${waitSec}s before ${actionText}.`, "error");
  return true;
}

function resetWifiSection() {
  state.wifiCooldownUntil = 0;
  el.wifiName.value = "";
  el.wifiPass.value = "";
  el.wifiSsidManual.value = "";
  el.wifiSsid.innerHTML = '<option value="">Connect BECA first</option>';
  setWifiControlsEnabled(Boolean(state.selectedPort) && !state.flashInProgress && !state.wifiOpInFlight);
  setWifiStatus("Connect BECA first to configure Wi-Fi over USB.");
}

function wifiSetupFallbackMessage(err) {
  const text = String(err || "");
  const lower = text.toLowerCase();
  if (lower.includes("bridge is running")) {
    return "Stop Bridge in Step 4 before Wi-Fi setup.";
  }
  if (lower.includes("busy") || lower.includes("access is denied") || lower.includes("permission denied")) {
    return "Serial port is busy. Close Arduino Serial Monitor/other serial apps, stop Bridge, wait 3 seconds, then retry.";
  }
  if (lower.includes("no control response")) {
    return "BECA is rebooting or did not accept serial setup command yet. Wait 10 seconds, then retry.";
  }
  if (lower.includes("timed out waiting for device response")) {
    return "No serial setup response yet. Wait 10 seconds and retry. On macOS, use manual SSID entry + Flash + Save Wi-Fi.";
  }
  return `Wi-Fi setup command failed: ${text}`;
}

function currentSsidSelection() {
  const manual = (el.wifiSsidManual.value || "").trim();
  if (manual) return manual;
  return (el.wifiSsid.value || "").trim();
}

function currentWifiPayload() {
  return {
    name: (el.wifiName.value || "").trim(),
    ssid: currentSsidSelection(),
    pass: el.wifiPass.value || ""
  };
}

async function sendWifiSave(payload, { skipCooldownCheck = false } = {}) {
  if (!state.selectedPort) {
    setWifiStatus("Connect BECA first.", "error");
    return false;
  }
  if (!payload.ssid) {
    setWifiStatus("Choose or type a Wi-Fi network first.", "error");
    return false;
  }
  if (!skipCooldownCheck && requireWifiReady("saving Wi-Fi")) return false;
  if (state.flashInProgress || state.wifiOpInFlight) return false;

  state.wifiOpInFlight = true;
  setWifiControlsEnabled(false);
  setWifiStatus("Saving Wi-Fi and testing connection. This can take up to 15 seconds.");
  addLog(`Wi-Fi save requested for SSID ${payload.ssid}`);

  try {
    const result = await invoke("save_wifi_credentials", {
      serialPort: state.selectedPort,
      name: payload.name,
      ssid: payload.ssid,
      pass: payload.pass
    });

    if (!result.ok) {
      setWifiStatus(`${result.msg}${result.hint ? ` ${result.hint}` : ""}`, "error");
      addLog(`Wi-Fi save failed: ${JSON.stringify(result)}`);
      return false;
    }

    setWifiStatus(`${result.msg}${result.hint ? ` ${result.hint}` : ""}`, "ok");
    addLog("Wi-Fi save succeeded. Sending reboot command.");

    try {
      await invoke("reboot_device", { serialPort: state.selectedPort });
      addLog("Reboot command sent.");
    } catch (err) {
      addLog(`Reboot command failed: ${err}`);
    }

    setWifiCooldown(7000, "Wi-Fi saved. Waiting for BECA reboot.");
    setTimeout(() => {
      refreshDevice().catch((err) => addLog(`Post-reboot rescan failed: ${err}`));
    }, 7000);
    return true;
  } catch (err) {
    setWifiStatus(wifiSetupFallbackMessage(err), "error");
    addLog(`Wi-Fi save command failed: ${err}`);
    return false;
  } finally {
    state.wifiOpInFlight = false;
    setWifiControlsEnabled(Boolean(state.selectedPort) && !state.flashInProgress);
  }
}

async function refreshWifiNetworks(preferredSsid = "") {
  if (!state.selectedPort) {
    resetWifiSection();
    return;
  }
  if (requireWifiReady("rescanning networks")) return;

  if (state.wifiOpInFlight) return;
  state.wifiOpInFlight = true;
  setWifiControlsEnabled(false);

  try {
    const list = await invoke("scan_wifi_networks", { serialPort: state.selectedPort });
    el.wifiSsid.innerHTML = "";
    if (!list.length) {
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "No networks found";
      el.wifiSsid.appendChild(empty);
      addLog("Wi-Fi scan completed with no networks.");
      return;
    }

    list.forEach((ssid) => {
      const option = document.createElement("option");
      option.value = ssid;
      option.textContent = ssid;
      el.wifiSsid.appendChild(option);
    });

    if (preferredSsid && list.includes(preferredSsid)) {
      el.wifiSsid.value = preferredSsid;
    }
    addLog(`Wi-Fi networks loaded: ${list.length}`);
  } catch (err) {
    addLog(`Wi-Fi scan failed: ${err}`);
    setWifiStatus(wifiSetupFallbackMessage(err), "error");
  } finally {
    state.wifiOpInFlight = false;
    setWifiControlsEnabled(Boolean(state.selectedPort) && !state.flashInProgress);
  }
}

async function refreshWifiInfo() {
  if (!state.selectedPort) {
    resetWifiSection();
    return null;
  }
  if (requireWifiReady("requesting Wi-Fi info")) return null;

  if (state.wifiOpInFlight) return null;
  state.wifiOpInFlight = true;
  setWifiControlsEnabled(false);

  try {
    const info = await invoke("get_wifi_setup_info", { serialPort: state.selectedPort });
    el.wifiName.value = info.name || "";

    if (info.wifi_error) {
      setWifiStatus(`${info.wifi_error}${info.wifi_hint ? ` ${info.wifi_hint}` : ""}`, "error");
    } else if (info.ssid) {
      setWifiStatus(`Saved Wi-Fi: ${info.ssid}. Click Save and Reboot to update credentials.`, "ok");
    } else {
      setWifiStatus("No Wi-Fi saved yet. Pick a 2.4GHz network and save.");
    }

    addLog(`Wi-Fi info: ${JSON.stringify(info)}`);
    return info;
  } catch (err) {
    addLog(`Wi-Fi info failed: ${err}`);
    setWifiStatus(wifiSetupFallbackMessage(err), "error");
    return null;
  } finally {
    state.wifiOpInFlight = false;
    setWifiControlsEnabled(Boolean(state.selectedPort) && !state.flashInProgress);
  }
}

async function refreshWifiSection() {
  if (!state.selectedPort) {
    resetWifiSection();
    return;
  }

  const info = await refreshWifiInfo();
  if (info?.ssid && !el.wifiSsid.value) {
    const option = document.createElement("option");
    option.value = info.ssid;
    option.textContent = info.ssid;
    el.wifiSsid.innerHTML = "";
    el.wifiSsid.appendChild(option);
    el.wifiSsid.value = info.ssid;
  }
}

async function refreshDevice() {
  try {
    const result = await invoke("detect_beca_device");
    state.selectedPort = result?.port_name ?? null;

    if (state.selectedPort) {
      el.connectStatus.textContent = `Detected BECA on ${state.selectedPort}`;
      el.portChip.textContent = result.description
        ? `Detected USB bridge: ${result.description}`
        : "USB serial bridge detected";
      el.portFixes.innerHTML = "";
    } else {
      el.connectStatus.textContent = "BECA not detected yet.";
      el.portChip.textContent = "";
      el.portFixes.innerHTML = "";
      result.fixes.forEach((fix) => {
        const li = document.createElement("li");
        li.textContent = fix;
        el.portFixes.appendChild(li);
      });
    }

    addLog(`Device scan result: ${JSON.stringify(result)}`);
    setWifiControlsEnabled(Boolean(state.selectedPort) && !state.flashInProgress && !state.wifiOpInFlight);
    await refreshWifiSection();
  } catch (err) {
    addLog(`Device scan failed: ${err}`);
    el.connectStatus.textContent = "Could not scan serial ports.";
    resetWifiSection();
  }
}

async function refreshFirmwareOptions() {
  try {
    const options = await invoke("list_firmware_versions");
    el.firmwareSelect.innerHTML = "";
    options.forEach((item) => {
      const opt = document.createElement("option");
      opt.value = item.version;
      opt.textContent = item.label;
      if (item.default) opt.selected = true;
      el.firmwareSelect.appendChild(opt);
    });
    addLog("Firmware manifest loaded.");
  } catch (err) {
    addLog(`Failed to load firmware manifest: ${err}`);
    el.flashStatus.textContent =
      "Unable to load firmware list from GitHub releases. Check repo setup or internet, then retry.";
  }
}

async function refreshMidiOutputs() {
  try {
    const outputs = await invoke("list_midi_outputs");
    el.midiSelect.innerHTML = "";
    outputs.forEach((port) => {
      const opt = document.createElement("option");
      opt.value = port.name;
      opt.textContent = port.name;
      el.midiSelect.appendChild(opt);
    });
    addLog(`Loaded ${outputs.length} MIDI outputs.`);
  } catch (err) {
    addLog(`MIDI list failed: ${err}`);
    el.bridgeStatus.textContent = "No MIDI outputs found.";
  }
}

async function doFlash({ provisionAfterFlash = false } = {}) {
  if (!state.selectedPort) {
    el.flashStatus.textContent = "Connect BECA first.";
    return;
  }
  if (state.wifiOpInFlight) {
    el.flashStatus.textContent = "Wi-Fi setup is busy. Wait and retry flash.";
    return;
  }

  state.flashInProgress = true;
  setWifiControlsEnabled(false);
  const version = el.firmwareSelect.value;
  const wifiPayload = currentWifiPayload();
  if (provisionAfterFlash && !wifiPayload.ssid) {
    el.flashStatus.textContent = "Choose or type Wi-Fi SSID before Flash + Save Wi-Fi.";
    state.flashInProgress = false;
    setWifiControlsEnabled(Boolean(state.selectedPort) && !state.wifiOpInFlight);
    return;
  }
  el.flashProgress.value = 5;
  el.flashStatus.textContent = "Preparing flash...";
  addLog(
    provisionAfterFlash
      ? `Flash + Wi-Fi requested for ${version} on ${state.selectedPort}`
      : `Flash requested for ${version} on ${state.selectedPort}`
  );

  try {
    await invoke("flash_firmware", {
      serialPort: state.selectedPort,
      firmwareVersion: version
    });
    el.flashProgress.value = 100;
    el.flashStatus.textContent = provisionAfterFlash
      ? "Firmware flashed. Preparing Wi-Fi provisioning..."
      : "Firmware flashed successfully.";
    addLog("Flash succeeded.");
    const cooldownMs = provisionAfterFlash ? 16000 : 12000;
    setWifiCooldown(cooldownMs, "Firmware flashed. Waiting for BECA reboot before Wi-Fi setup.");

    if (provisionAfterFlash) {
      setTimeout(() => {
        sendWifiSave(wifiPayload, { skipCooldownCheck: true }).catch((err) =>
          addLog(`Flash + Wi-Fi provisioning failed: ${err}`)
        );
      }, cooldownMs + 500);
    }

    setTimeout(() => {
      refreshWifiSection().catch((err) => addLog(`Wi-Fi info refresh after flash failed: ${err}`));
    }, cooldownMs + 500);
  } catch (err) {
    el.flashStatus.textContent = `Flash failed: ${err}`;
    addLog(`Flash failed: ${err}`);
  } finally {
    state.flashInProgress = false;
    setWifiControlsEnabled(Boolean(state.selectedPort) && !state.wifiOpInFlight);
  }
}

async function refreshBackupAvailability() {
  try {
    const available = await invoke("backup_restore_available");
    if (!available) {
      el.btnBackup.disabled = true;
      el.btnRestore.disabled = true;
      addLog("Backup/Restore disabled: esptool sidecar is not bundled in this installer build.");
    }
  } catch (err) {
    addLog(`Backup tool check failed: ${err}`);
  }
}

async function doFlashAndWifi() {
  await doFlash({ provisionAfterFlash: true });
}

async function doBackup() {
  if (!state.selectedPort) return;
  try {
    const output = await invoke("backup_settings", { serialPort: state.selectedPort });
    addLog(`NVS backup created: ${output}`);
    el.flashStatus.textContent = "Backup complete.";
  } catch (err) {
    addLog(`Backup failed: ${err}`);
    el.flashStatus.textContent = "Backup failed. See details.";
  }
}

async function doRestore() {
  if (!state.selectedPort) return;
  try {
    await invoke("restore_settings", { serialPort: state.selectedPort });
    addLog("NVS restore complete.");
    el.flashStatus.textContent = "Restore complete.";
  } catch (err) {
    addLog(`Restore failed: ${err}`);
    el.flashStatus.textContent = "Restore failed. See details.";
  }
}

async function scanWifi() {
  if (state.flashInProgress) {
    setWifiStatus("Firmware is flashing. Wait for completion, then retry.", "error");
    return;
  }
  if (requireWifiReady("rescanning networks")) return;
  await refreshWifiNetworks(el.wifiSsid.value || "");
}

async function saveWifi() {
  await sendWifiSave(currentWifiPayload());
}

async function forgetWifi() {
  if (!state.selectedPort) {
    setWifiStatus("Connect BECA first.", "error");
    return;
  }
  if (requireWifiReady("forgetting Wi-Fi")) return;
  if (state.flashInProgress || state.wifiOpInFlight) return;

  state.wifiOpInFlight = true;
  setWifiControlsEnabled(false);
  try {
    const result = await invoke("forget_wifi_credentials", { serialPort: state.selectedPort });
    setWifiStatus(`${result.msg}${result.hint ? ` ${result.hint}` : ""}`, result.ok ? "ok" : "error");
    addLog(`Wi-Fi forget result: ${JSON.stringify(result)}`);
    setWifiCooldown(7000, "Wi-Fi removed. Waiting for BECA reboot.");
    setTimeout(() => {
      refreshDevice().catch((err) => addLog(`Post-forget rescan failed: ${err}`));
    }, 7000);
  } catch (err) {
    setWifiStatus(wifiSetupFallbackMessage(err), "error");
    addLog(`Wi-Fi forget failed: ${err}`);
  } finally {
    state.wifiOpInFlight = false;
    setWifiControlsEnabled(Boolean(state.selectedPort) && !state.flashInProgress);
  }
}

async function startBridge() {
  if (!state.selectedPort) {
    el.bridgeStatus.textContent = "Connect BECA first.";
    return;
  }
  if (state.flashInProgress || state.wifiOpInFlight) {
    el.bridgeStatus.textContent = "Wait for flash/Wi-Fi setup to finish before starting bridge.";
    return;
  }
  try {
    await invoke("start_bridge", {
      serialPort: state.selectedPort,
      midiPort: el.midiSelect.value
    });
    el.bridgeStatus.textContent = "Connected";
    addLog("Bridge started.");
  } catch (err) {
    el.bridgeStatus.textContent = `Bridge error: ${err}`;
    addLog(`Bridge start failed: ${err}`);
  }
}

async function stopBridge() {
  try {
    await invoke("stop_bridge");
    el.bridgeStatus.textContent = "Stopped";
    setActivity(false);
    addLog("Bridge stopped.");
  } catch (err) {
    addLog(`Bridge stop failed: ${err}`);
  }
}

async function testNote() {
  try {
    await invoke("send_test_note", { midiPort: el.midiSelect.value });
    addLog("Test note sent.");
  } catch (err) {
    addLog(`Test note failed: ${err}`);
  }
}

async function copyLogs() {
  try {
    await navigator.clipboard.writeText(state.logLines.join("\n"));
    addLog("Logs copied to clipboard.");
  } catch {
    addLog("Clipboard access denied. Use Export Diagnostics instead.");
  }
}

async function exportDiagnostics() {
  try {
    const path = await invoke("export_diagnostics");
    addLog(`Diagnostics exported: ${path}`);
  } catch (err) {
    addLog(`Diagnostics export failed: ${err}`);
  }
}

async function bindEvents() {
  await listen("flash-progress", (event) => {
    const payload = event.payload;
    if (payload && typeof payload.percent === "number") {
      el.flashProgress.value = payload.percent;
    }
    if (payload?.message) {
      el.flashStatus.textContent = payload.message;
      addLog(`Flash progress: ${payload.message}`);
    }
  });

  await listen("bridge-status", (event) => {
    const payload = event.payload;
    if (!payload) return;
    el.bridgeStatus.textContent = payload.detail || payload.state;
    setActivity(payload.event === "activity");
    addLog(`Bridge event: ${JSON.stringify(payload)}`);
  });
}

el.btnScan.addEventListener("click", refreshDevice);
el.btnFlash.addEventListener("click", doFlash);
el.btnFlashWifi.addEventListener("click", doFlashAndWifi);
el.btnBackup.addEventListener("click", doBackup);
el.btnRestore.addEventListener("click", doRestore);
el.btnWifiScan.addEventListener("click", scanWifi);
el.btnWifiSave.addEventListener("click", saveWifi);
el.btnWifiForget.addEventListener("click", forgetWifi);
el.btnStartBridge.addEventListener("click", startBridge);
el.btnStopBridge.addEventListener("click", stopBridge);
el.btnTestNote.addEventListener("click", testNote);
el.btnCopy.addEventListener("click", copyLogs);
el.btnExport.addEventListener("click", exportDiagnostics);

async function init() {
  resetWifiSection();
  await bindEvents();
  await refreshDevice();
  await refreshFirmwareOptions();
  await refreshBackupAvailability();
  await refreshMidiOutputs();
}

init().catch((err) => {
  addLog(`Initialization failed: ${err}`);
});
