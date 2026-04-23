import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { mountControlSurface } from "./control-loader.js";

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
  midiMirrorSelect: document.querySelector("#midi-mirror-select"),
  microfreakMode: document.querySelector("#microfreak-mode"),
  midiMirrorMicrofreakMode: document.querySelector("#midi-mirror-microfreak-mode"),
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
  btnTestNote: document.querySelector("#btn-test-note"),
  btnCopy: document.querySelector("#btn-copy"),
  btnExport: document.querySelector("#btn-export"),
  btnDiscover: document.querySelector("#btn-discover"),
  btnOpenControl: document.querySelector("#btn-open-control"),
  btnOpenSetup: document.querySelector("#btn-open-setup"),
  btnRefreshControl: document.querySelector("#btn-refresh-control"),
  deviceSelect: document.querySelector("#device-select"),
  selectedTargetStatus: document.querySelector("#selected-target-status"),
  targetName: document.querySelector("#target-name"),
  targetTransport: document.querySelector("#target-transport"),
  targetDetail: document.querySelector("#target-detail"),
  transportPill: document.querySelector("#transport-pill"),
  controlHost: document.querySelector("#control-host"),
  controlStatus: document.querySelector("#control-status"),
  viewTabs: Array.from(document.querySelectorAll(".view-tab")),
  screens: Array.from(document.querySelectorAll("[data-screen-view]"))
};

const state = {
  selectedPort: null,
  logLines: [],
  flashInProgress: false,
  wifiOpInFlight: false,
  wifiCooldownUntil: 0,
  selectedTargetId: null,
  controlMounted: false,
  controlReady: false,
  controlIssue: "",
  bridgeConnected: false
};

const VIEW_STORAGE_KEY = "beca-active-screen";

function addLog(line) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  state.logLines.push(stamped);
  if (state.logLines.length > 500) {
    state.logLines.shift();
  }
  el.logView.textContent = state.logLines.join("\n");
}

function setActivity(active) {
  el.activity.classList.toggle("active", active);
}

function setConnectStatus(message, hasDevice) {
  el.connectStatus.textContent = message;
  el.connectStatus.classList.toggle("is-error", !hasDevice);
}

function setBridgeUi(connected, detail = "") {
  state.bridgeConnected = Boolean(connected);
  el.btnStartBridge.textContent = connected ? "disconnect bridge" : "connect bridge";
  el.btnStartBridge.classList.toggle("setup-button-danger", connected);
  el.btnStartBridge.classList.toggle("setup-button-solid", !connected);
  el.btnStartBridge.setAttribute("aria-pressed", connected ? "true" : "false");
  el.midiSelect.disabled = connected;
  el.midiMirrorSelect.disabled = connected;
  if (detail) {
    el.bridgeStatus.textContent = detail;
  } else {
    el.bridgeStatus.textContent = connected ? "bridge connected" : "bridge not running";
  }
}

async function refreshBridgeState() {
  try {
    const status = await invoke("bridge_status");
    setBridgeUi(Boolean(status?.running), status?.running ? "bridge connected" : "bridge not running");
  } catch (err) {
    addLog(`Bridge status check failed: ${err}`);
  }
}

function syncSetupTopIcons(screenName) {
  if (!el.btnOpenControl || !el.btnOpenSetup) return;
  const setupActive = screenName === "setup";
  el.btnOpenControl.classList.toggle("setup-top-icon-active", !setupActive);
  el.btnOpenControl.classList.toggle("setup-top-icon-muted", setupActive);
  el.btnOpenControl.disabled = !setupActive;
  el.btnOpenControl.setAttribute("aria-current", setupActive ? "false" : "page");

  el.btnOpenSetup.classList.toggle("setup-top-icon-active", setupActive);
  el.btnOpenSetup.classList.toggle("setup-top-icon-muted", !setupActive);
  el.btnOpenSetup.disabled = setupActive;
  el.btnOpenSetup.setAttribute("aria-current", setupActive ? "page" : "false");
}

function currentMirrorMidiPort() {
  const value = (el.midiMirrorSelect?.value || "").trim();
  return value || null;
}

function renderControlPlaceholder(message) {
  el.controlHost.innerHTML = `
    <div class="control-placeholder">
      <div class="control-placeholder-top">
        <div class="control-placeholder-logo" aria-hidden="true">
          <svg viewBox="0 0 498 372" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M397.017 323.145V137.412c0-2.944.935-4.876 2.805-5.795 2.244-1.104 6.358-1.656 12.342-1.656h70.689c5.984 0 9.911.552 11.781 1.656 2.244.919 3.366 2.851 3.366 5.795v185.733h-45.442v-55.747h-11.221v55.747h-44.32Zm44.32-173.866v98.524h11.221v-98.524h-11.221Z" fill="currentColor"/>
            <path d="M329.951 338.074h11.22V205.554h44.321v153.018c0 5.084-1.123 8.58-3.367 10.487-1.87 1.589-5.797 2.383-11.781 2.383h-70.688c-5.984 0-10.098-.794-12.342-2.383-1.87-1.907-2.805-5.403-2.805-10.487V50.63c0-5.085.935-8.422 2.805-10.011 2.244-1.907 6.358-2.86 12.342-2.86h70.688c5.984 0 9.911.953 11.781 2.86 2.244 1.589 3.367 4.926 3.367 10.011v145.39h-44.321V71.128h-11.22v266.946Z" fill="currentColor"/>
            <path d="M272.984 144.437v33.368h-55.541v122.51h11.22V187.816h44.321v145.867H172.001V0h100.983v134.903h-44.321V33.368h-11.22v111.069h55.541Z" fill="currentColor"/>
            <path d="M103.659 23.27v77.456h11.579V23.27h-11.579Zm0 100.726v85.434h11.579v-85.434h-11.579Zm45.16-13.297h-1.737v3.989h1.737c5.017 0 8.491.665 10.421 1.994 1.93 1.108 2.895 3.435 2.895 6.981v100.061c0 3.546-1.158 5.984-3.474 7.314-1.93 1.108-5.79 1.662-11.579 1.662H56.762V0h90.32c5.789 0 9.649.665 11.579 1.995 2.316 1.108 3.474 3.435 3.474 6.981v92.747c0 3.324-.965 5.651-2.895 6.981-1.93 1.33-5.404 1.995-10.421 1.995Z" fill="currentColor"/>
            <path fill-rule="evenodd" clip-rule="evenodd" d="M24.588 195.819c-12.009 0-21.744-9.735-21.744-21.744V92.865C2.844 80.856 12.579 71.121 24.588 71.121c12.009 0 21.744 9.735 21.744 21.744v81.21c0 12.009-9.735 21.744-21.744 21.744Zm-14.224-21.744c0 7.856 6.368 14.225 14.224 14.225 7.856 0 14.224-6.369 14.224-14.225V92.865c0-7.856-6.368-14.224-14.224-14.224-7.856 0-14.224 6.368-14.224 14.224v81.21Z" fill="currentColor"/>
            <path d="M24.588 16.854c13.579 0 24.588 11.008 24.588 24.588 0 13.579-11.009 24.587-24.588 24.587C11.008 66.029 0 55.021 0 41.442 0 27.862 11.008 16.854 24.588 16.854Z" fill="currentColor"/>
          </svg>
        </div>
        <div class="control-placeholder-actions">
          <button class="control-placeholder-icon control-placeholder-icon-active" type="button" aria-label="Control view">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 12h5l2.2-6 4.2 13 2.3-7H22" />
            </svg>
          </button>
          <button class="control-placeholder-icon control-placeholder-icon-muted" type="button" data-open-setup aria-label="Open setup">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1.2 1.2a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-1.7a1 1 0 0 1-1-1v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0l-1.2-1.2a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1 1 0 0 1-1-1v-1.7a1 1 0 0 1 1-1h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1.2-1.2a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h1.7a1 1 0 0 1 1 1v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1.2 1.2a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a1 1 0 0 1 1 1v1.7a1 1 0 0 1-1 1h-.2a1 1 0 0 0-.9.6Z" />
            </svg>
          </button>
        </div>
      </div>
      <div class="control-placeholder-body">
        <strong>Live control is not ready yet</strong>
        <p>${message}</p>
      </div>
    </div>
  `;
  el.controlHost.querySelector("[data-open-setup]")?.addEventListener("click", () => switchScreen("setup"));
}

function switchScreen(screenName) {
  window.localStorage.setItem(VIEW_STORAGE_KEY, screenName);
  syncSetupTopIcons(screenName);
  el.viewTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.screen === screenName);
  });
  el.screens.forEach((screen) => {
    screen.classList.toggle("active", screen.dataset.screenView === screenName);
  });
  if (screenName === "control") {
    ensureControlSurfaceLoaded().catch((err) => addLog(`Control screen open failed: ${err}`));
  }
}

function restoreScreen() {
  const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
  const active = el.screens.some((screen) => screen.dataset.screenView === saved) ? saved : "control";
  switchScreen(active);
}

async function ensureControlSurfaceLoaded() {
  if (!state.selectedTargetId) {
    renderControlPlaceholder("Select a BECA device first. The unified live surface will attach once a target is available.");
    state.controlMounted = false;
    el.controlStatus.textContent = "Select a BECA device first. The unified live surface will attach once a target is available.";
    return;
  }
  if (!state.controlReady) {
    renderControlPlaceholder(
      state.controlIssue ||
        "BECA was detected, but live control is not ready yet. Update firmware in Setup, then reconnect."
    );
    state.controlMounted = false;
    el.controlStatus.textContent =
      state.controlIssue ||
      "BECA was detected, but live control is not ready yet. Update firmware in Setup, then reconnect.";
    return;
  }
  if (state.controlMounted) return;
  el.controlStatus.textContent = "Loading the unified BECA live surface inside the desktop app.";
  try {
    await mountControlSurface(el.controlHost, {
      onOpenSetup: () => switchScreen("setup"),
      onStatus: (message) => {
        el.controlStatus.textContent = message;
      }
    });
    state.controlMounted = true;
  } catch (err) {
    el.controlStatus.textContent = `Control surface failed to load: ${err}`;
    addLog(`Control surface load failed: ${err}`);
  }
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

function describeTarget(target) {
  const parts = [];
  if (target.serial_port) parts.push(`USB ${target.serial_port}`);
  if (target.network_url) parts.push(target.network_url.replace(/^https?:\/\//, ""));
  return parts.join(" • ");
}

function updateTargetSummary(status) {
  const target = status?.target;
  state.selectedTargetId = status?.selected_id || null;
  state.controlReady = Boolean(target?.control_ready && status?.transport);
  state.controlIssue = target?.issue || status?.detail || "";

  if (!target) {
    state.controlReady = false;
    state.controlIssue = "";
    el.targetName.textContent = "No device selected";
    el.targetTransport.textContent = "--";
    el.targetDetail.textContent = "Refresh devices to look for BECA over USB and local Wi-Fi.";
    el.selectedTargetStatus.textContent = status?.detail || "Looking for BECA devices...";
    el.transportPill.textContent = "No device selected";
    return;
  }

  el.targetName.textContent = target.name || "BECA";
  el.targetTransport.textContent = status.transport ? status.transport.toUpperCase() : "--";
  el.targetDetail.textContent =
    describeTarget(target) || status.detail || "Device connected over the local network.";
  el.selectedTargetStatus.textContent = status.detail || "Device selected.";
  el.transportPill.textContent = status.transport
    ? `${status.transport.toUpperCase()} AUTO`
    : "Target needs attention";
}

async function refreshControlStatus({ forceReload = false } = {}) {
  try {
    const status = await invoke("current_control_target");
    updateTargetSummary(status);
    if (state.selectedTargetId && state.controlReady) {
      await ensureControlSurfaceLoaded();
      if (forceReload) {
        el.controlStatus.textContent = "BECA target updated. Control surface is using the latest selection.";
      }
    } else if (state.selectedTargetId) {
      await ensureControlSurfaceLoaded();
    }
  } catch (err) {
    addLog(`Control status refresh failed: ${err}`);
  }
}

async function refreshTargets({ forceReload = false } = {}) {
  try {
    const result = await invoke("discover_beca_targets");
    el.deviceSelect.innerHTML = "";

    if (!result.targets.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No BECA devices found yet";
      el.deviceSelect.appendChild(option);
      updateTargetSummary({ selected_id: null, target: null, transport: null, detail: "No BECA devices found yet." });
      addLog("Device discovery found no BECA targets.");
      return;
    }

    result.targets.forEach((target) => {
      const option = document.createElement("option");
      option.value = target.id;
      option.textContent = `${target.name} (${describeTarget(target) || target.source})`;
      if (result.selected_id === target.id) {
        option.selected = true;
      }
      el.deviceSelect.appendChild(option);
    });

    state.selectedTargetId = result.selected_id || result.targets[0]?.id || null;
    addLog(`Device discovery found ${result.targets.length} BECA target(s).`);
    await refreshControlStatus({ forceReload });
  } catch (err) {
    addLog(`Device discovery failed: ${err}`);
    el.selectedTargetStatus.textContent = "Could not scan for BECA devices on USB or Wi-Fi.";
  }
}

async function chooseTarget(targetId, { forceReload = false } = {}) {
  if (!targetId) return;
  try {
    const status = await invoke("select_control_target", { targetId });
    updateTargetSummary(status);
    await ensureControlSurfaceLoaded();
    if (state.controlReady) {
      el.controlStatus.textContent = "BECA target selected. Waiting for live state...";
    }
    addLog(`Selected control target: ${status?.target?.name || targetId}`);
  } catch (err) {
    addLog(`Selecting BECA target failed: ${err}`);
  }
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
      refreshTargets({ forceReload: true }).catch((err) => addLog(`Post-reboot network scan failed: ${err}`));
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
      setConnectStatus(`Detected BECA on ${state.selectedPort}`, true);
      el.portChip.textContent = result.description
        ? `Detected USB bridge: ${result.description}`
        : "USB serial bridge detected";
      el.portFixes.innerHTML = "";
    } else {
      setConnectStatus("BECA not detected yet.", false);
      el.portChip.textContent = "";
      el.portFixes.innerHTML = "";
      result.fixes.forEach((fix) => {
        const li = document.createElement("li");
        li.textContent = fix;
        el.portFixes.appendChild(li);
      });
    }

    addLog(`USB scan result: ${JSON.stringify(result)}`);
    setWifiControlsEnabled(Boolean(state.selectedPort) && !state.flashInProgress && !state.wifiOpInFlight);
    await refreshWifiSection();
  } catch (err) {
    addLog(`USB scan failed: ${err}`);
    setConnectStatus("Could not scan serial ports.", false);
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
    const currentPrimary = el.midiSelect.value;
    const currentMirror = currentMirrorMidiPort();
    el.midiSelect.innerHTML = "";
    el.midiMirrorSelect.innerHTML = "";

    const mirrorOff = document.createElement("option");
    mirrorOff.value = "";
    mirrorOff.textContent = "Off";
    el.midiMirrorSelect.appendChild(mirrorOff);

    outputs.forEach((port) => {
      const primaryOpt = document.createElement("option");
      primaryOpt.value = port.name;
      primaryOpt.textContent = port.name;
      if (port.name === currentPrimary) primaryOpt.selected = true;
      el.midiSelect.appendChild(primaryOpt);

      const mirrorOpt = document.createElement("option");
      mirrorOpt.value = port.name;
      mirrorOpt.textContent = port.name;
      if (port.name === currentMirror) mirrorOpt.selected = true;
      el.midiMirrorSelect.appendChild(mirrorOpt);
    });

    if (!el.midiSelect.value && outputs[0]) {
      el.midiSelect.value = outputs[0].name;
    }
    if (currentMirror && !Array.from(el.midiMirrorSelect.options).some((opt) => opt.value === currentMirror)) {
      el.midiMirrorSelect.value = "";
    }
    el.midiSelect.disabled = state.bridgeConnected;
    el.midiMirrorSelect.disabled = state.bridgeConnected;
    addLog(`Loaded ${outputs.length} MIDI outputs.`);
  } catch (err) {
    addLog(`MIDI list failed: ${err}`);
    if (!state.bridgeConnected) {
      setBridgeUi(false, "no MIDI outputs found");
    }
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
      refreshTargets({ forceReload: true }).catch((err) => addLog(`Network rescan after flash failed: ${err}`));
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
      refreshTargets({ forceReload: true }).catch((err) => addLog(`Post-forget network scan failed: ${err}`));
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
  if (state.bridgeConnected) {
    await stopBridge();
    return;
  }
  if (!state.selectedPort) {
    setBridgeUi(false, "connect BECA first");
    return;
  }
  if (state.flashInProgress || state.wifiOpInFlight) {
    setBridgeUi(false, "wait for flash or wi-fi setup to finish first");
    return;
  }
  const mirrorPort = currentMirrorMidiPort();
  if (mirrorPort && mirrorPort === el.midiSelect.value) {
    setBridgeUi(false, "choose a different mirrored MIDI output");
    return;
  }
  try {
    await invoke("start_bridge", {
      serialPort: state.selectedPort,
      midiPort: el.midiSelect.value,
      microfreakMode: el.microfreakMode.checked,
      secondaryMidiPort: mirrorPort,
      secondaryMicrofreakMode: Boolean(mirrorPort && el.midiMirrorMicrofreakMode.checked)
    });
    const detail = [
      el.microfreakMode.checked ? "primary MicroFreak mode" : null,
      mirrorPort ? `mirroring to ${mirrorPort}${el.midiMirrorMicrofreakMode.checked ? " (MicroFreak mode)" : ""}` : null
    ]
        .filter(Boolean)
      .join(" | ");
    addLog(`Bridge started${detail ? `: ${detail}` : "."}`);
    setBridgeUi(true, detail ? `bridge connected: ${detail}` : "bridge connected");
    await refreshControlStatus();
  } catch (err) {
    setBridgeUi(false, `bridge error: ${err}`);
    addLog(`Bridge start failed: ${err}`);
  }
}

async function stopBridge() {
  try {
    await invoke("stop_bridge");
    setBridgeUi(false, "bridge stopped");
    setActivity(false);
    addLog("Bridge stopped.");
    await refreshControlStatus();
  } catch (err) {
    addLog(`Bridge stop failed: ${err}`);
  }
}

async function testNote() {
  try {
    await invoke("send_test_note", {
      midiPort: el.midiSelect.value,
      secondaryMidiPort: currentMirrorMidiPort()
    });
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

  await listen("bridge-status", async (event) => {
    const payload = event.payload;
    if (!payload) return;
    if (payload.event === "status") {
      const nextConnected = payload.state === "connected" || payload.state === "running";
      setBridgeUi(nextConnected, payload.detail || (nextConnected ? "bridge connected" : "bridge stopped"));
      if (!nextConnected) {
        setActivity(false);
      }
      await refreshControlStatus();
    } else if (payload.event === "activity") {
      if (!state.bridgeConnected) {
        setBridgeUi(true, "bridge connected");
      }
      setActivity(true);
    }
    addLog(`Bridge event: ${JSON.stringify(payload)}`);
  });
}

function refreshControlSurfacePage() {
  window.localStorage.setItem(VIEW_STORAGE_KEY, "control");
  window.location.reload();
}

el.viewTabs.forEach((button) => {
  button.addEventListener("click", () => switchScreen(button.dataset.screen));
});

el.btnDiscover.addEventListener("click", () => refreshTargets({ forceReload: true }));
el.btnOpenControl.addEventListener("click", () => {
  switchScreen("control");
  ensureControlSurfaceLoaded().catch((err) => addLog(`Control surface failed to open: ${err}`));
});
el.btnOpenSetup?.addEventListener("click", () => {
  switchScreen("setup");
});
el.btnRefreshControl.addEventListener("click", refreshControlSurfacePage);
el.deviceSelect.addEventListener("change", (event) => {
  chooseTarget(event.target.value, { forceReload: true }).catch((err) =>
    addLog(`Device selection failed: ${err}`)
  );
});
el.btnScan.addEventListener("click", async () => {
  await refreshDevice();
  await refreshTargets({ forceReload: true });
});
el.btnFlash.addEventListener("click", () => doFlash());
el.btnFlashWifi.addEventListener("click", doFlashAndWifi);
el.btnBackup.addEventListener("click", doBackup);
el.btnRestore.addEventListener("click", doRestore);
el.btnWifiScan.addEventListener("click", scanWifi);
el.btnWifiSave.addEventListener("click", saveWifi);
el.btnWifiForget.addEventListener("click", forgetWifi);
el.btnStartBridge.addEventListener("click", startBridge);
el.btnTestNote.addEventListener("click", testNote);
el.btnCopy.addEventListener("click", copyLogs);
el.btnExport.addEventListener("click", exportDiagnostics);

async function init() {
  restoreScreen();
  setBridgeUi(false);
  resetWifiSection();
  await bindEvents();
  await refreshBridgeState();
  await refreshDevice();
  await refreshTargets({ forceReload: false });
  if (state.selectedTargetId) {
    await ensureControlSurfaceLoaded();
  }
  await refreshFirmwareOptions();
  await refreshBackupAvailability();
  await refreshMidiOutputs();
}

init().catch((err) => {
  addLog(`Initialization failed: ${err}`);
});
