import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const el = {
  connectStatus: document.querySelector("#connect-status"),
  portChip: document.querySelector("#port-chip"),
  portFixes: document.querySelector("#port-fixes"),
  firmwareSelect: document.querySelector("#firmware-select"),
  flashProgress: document.querySelector("#flash-progress"),
  flashStatus: document.querySelector("#flash-status"),
  midiSelect: document.querySelector("#midi-select"),
  bridgeStatus: document.querySelector("#bridge-status"),
  activity: document.querySelector("#activity"),
  logView: document.querySelector("#log-view"),
  btnScan: document.querySelector("#btn-scan"),
  btnFlash: document.querySelector("#btn-flash"),
  btnBackup: document.querySelector("#btn-backup"),
  btnRestore: document.querySelector("#btn-restore"),
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
  } catch (err) {
    addLog(`Device scan failed: ${err}`);
    el.connectStatus.textContent = "Could not scan serial ports.";
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
el.btnStartBridge.addEventListener("click", startBridge);
el.btnStopBridge.addEventListener("click", stopBridge);
el.btnTestNote.addEventListener("click", testNote);
el.btnCopy.addEventListener("click", copyLogs);
el.btnExport.addEventListener("click", exportDiagnostics);

async function init() {
  await bindEvents();
  await refreshDevice();
  await refreshFirmwareOptions();
  await refreshMidiOutputs();
}

init().catch((err) => {
  addLog(`Initialization failed: ${err}`);
});
