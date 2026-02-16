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
  wifiPass: document.querySelector("#wifi-pass"),
  midiSelect: document.querySelector("#midi-select"),
  bridgeStatus: document.querySelector("#bridge-status"),
  activity: document.querySelector("#activity"),
  logView: document.querySelector("#log-view"),
  btnScan: document.querySelector("#btn-scan"),
  btnFlash: document.querySelector("#btn-flash"),
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
  logLines: []
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

function resetWifiSection() {
  el.wifiName.value = "";
  el.wifiPass.value = "";
  el.wifiSsid.innerHTML = '<option value="">Connect BECA first</option>';
  setWifiStatus("Connect BECA first to configure Wi-Fi over USB.");
}

function wifiSetupFallbackMessage(err) {
  const text = String(err || "");
  if (text.toLowerCase().includes("timed out waiting for device response")) {
    return "This firmware does not support USB Wi-Fi setup yet. Flash latest firmware, or use BECA-XXXX and http://192.168.4.1/setup.";
  }
  return `Wi-Fi setup command failed: ${text}`;
}

async function refreshWifiNetworks(preferredSsid = "") {
  if (!state.selectedPort) {
    resetWifiSection();
    return;
  }

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
  }
}

async function refreshWifiInfo() {
  if (!state.selectedPort) {
    resetWifiSection();
    return null;
  }

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
  }
}

async function refreshWifiSection() {
  if (!state.selectedPort) {
    resetWifiSection();
    return;
  }

  const info = await refreshWifiInfo();
  await refreshWifiNetworks(info?.ssid || "");
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

async function doFlash() {
  if (!state.selectedPort) {
    el.flashStatus.textContent = "Connect BECA first.";
    return;
  }

  const version = el.firmwareSelect.value;
  el.flashProgress.value = 5;
  el.flashStatus.textContent = "Preparing flash...";
  addLog(`Flash requested for ${version} on ${state.selectedPort}`);

  try {
    await invoke("flash_firmware", {
      serialPort: state.selectedPort,
      firmwareVersion: version
    });
    el.flashProgress.value = 100;
    el.flashStatus.textContent = "Firmware flashed successfully.";
    addLog("Flash succeeded.");
    setWifiStatus("Firmware updated. You can now set Wi-Fi in Step 3.");
    await refreshWifiSection();
  } catch (err) {
    el.flashStatus.textContent = `Flash failed: ${err}`;
    addLog(`Flash failed: ${err}`);
  }
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
  await refreshWifiNetworks(el.wifiSsid.value || "");
}

async function saveWifi() {
  if (!state.selectedPort) {
    setWifiStatus("Connect BECA first.", "error");
    return;
  }

  const ssid = (el.wifiSsid.value || "").trim();
  if (!ssid) {
    setWifiStatus("Choose a Wi-Fi network first.", "error");
    return;
  }

  setWifiStatus("Saving Wi-Fi and testing connection. This can take up to 15 seconds.");
  addLog(`Wi-Fi save requested for SSID ${ssid}`);

  try {
    const result = await invoke("save_wifi_credentials", {
      serialPort: state.selectedPort,
      name: (el.wifiName.value || "").trim(),
      ssid,
      pass: el.wifiPass.value || ""
    });

    if (!result.ok) {
      setWifiStatus(`${result.msg}${result.hint ? ` ${result.hint}` : ""}`, "error");
      addLog(`Wi-Fi save failed: ${JSON.stringify(result)}`);
      return;
    }

    setWifiStatus(`${result.msg}${result.hint ? ` ${result.hint}` : ""}`, "ok");
    addLog("Wi-Fi save succeeded. Sending reboot command.");

    try {
      await invoke("reboot_device", { serialPort: state.selectedPort });
      addLog("Reboot command sent.");
    } catch (err) {
      addLog(`Reboot command failed: ${err}`);
    }

    setTimeout(() => {
      refreshDevice().catch((err) => addLog(`Post-reboot rescan failed: ${err}`));
    }, 4500);
  } catch (err) {
    setWifiStatus(wifiSetupFallbackMessage(err), "error");
    addLog(`Wi-Fi save command failed: ${err}`);
  }
}

async function forgetWifi() {
  if (!state.selectedPort) {
    setWifiStatus("Connect BECA first.", "error");
    return;
  }

  try {
    const result = await invoke("forget_wifi_credentials", { serialPort: state.selectedPort });
    setWifiStatus(`${result.msg}${result.hint ? ` ${result.hint}` : ""}`, result.ok ? "ok" : "error");
    addLog(`Wi-Fi forget result: ${JSON.stringify(result)}`);
    setTimeout(() => {
      refreshDevice().catch((err) => addLog(`Post-forget rescan failed: ${err}`));
    }, 4500);
  } catch (err) {
    setWifiStatus(wifiSetupFallbackMessage(err), "error");
    addLog(`Wi-Fi forget failed: ${err}`);
  }
}

async function startBridge() {
  if (!state.selectedPort) {
    el.bridgeStatus.textContent = "Connect BECA first.";
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
  await refreshMidiOutputs();
}

init().catch((err) => {
  addLog(`Initialization failed: ${err}`);
});
