import { BecaSerial, formatValue } from "./protocol.js";
import { WebUsbSerialProvider, shouldUseWebUsb } from "./webusb-serial.js";

const APP_VERSION = "1.2.0";
const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const FALLBACK_PARAMS = {
  modes: ["Notes", "Arpeggiator", "Chords", "Drum Machine"],
  scales: ["Major", "Minor", "Dorian", "Lydian", "Mixolydian", "Pent Minor", "Pent Major", "Harm Minor", "Phrygian", "Whole Tone", "Maj7", "Min7", "Dom7", "Sus2", "Sus4"],
  time_signatures: ["1-1", "2-2", "2-4", "3-4", "4-4", "5-4", "7-4", "6-8", "9-8", "12-8", "4-8", "4-16", "8-32"],
  note_lengths: ["1/32", "1/16", "1/8", "1/4", "1/2", "1 bar"],
  output_modes: ["BLE MIDI", "Serial MIDI", "Aux audio", "Serial MIDI + Aux", "Wi-Fi MIDI"],
  synth_presets: ["Warm Pad", "Soft Keys", "Bright Pluck", "Deep Bass", "Glass Bells", "Plant Choir", "Wide Lead", "Organic"],
  ranges: {
    bpm: [20, 240], swing: [0, 60], sens: [0, 0.5], lo: [1, 8], hi: [1, 8], rest: [0, 0.8],
    cutoff: [20, 18000], resonance: [0.1, 10], attack: [0, 5], decay: [0, 5], sustain: [0, 1], release: [0.01, 10],
    delay_ms: [0, 800], delay_feedback: [0, 0.95], delay_mix: [0, 1], drive: [0, 1], master: [0, 1], detune: [0, 8], gain_trim: [0.45, 1]
  }
};

const SYNTH_CONTROLS = [
  { key: "wave_a", label: "Oscillator A", type: "select", options: ["Sine", "Triangle", "Saw", "Square"] },
  { key: "wave_b", label: "Oscillator B", type: "select", options: ["Sine", "Triangle", "Saw", "Square"] },
  { key: "osc_mix", label: "Oscillator mix", min: 0, max: 1, step: 0.01, unit: "%", scale: 100 },
  { key: "mono", label: "Monophonic", type: "toggle" },
  { key: "voices", label: "Polyphony", min: 1, max: 12, step: 1 },
  { key: "attack", label: "Attack", step: 0.01, unit: " s" },
  { key: "decay", label: "Decay", step: 0.01, unit: " s" },
  { key: "sustain", label: "Sustain", step: 0.01, unit: "%", scale: 100 },
  { key: "release", label: "Release", step: 0.01, unit: " s" },
  { key: "filter", label: "Filter", type: "select", options: ["Low-pass", "High-pass", "Band-pass"] },
  { key: "cutoff", label: "Cutoff", step: 1, unit: " Hz" },
  { key: "resonance", label: "Resonance", step: 0.01 },
  { key: "reverb", label: "Reverb", min: 0, max: 1, step: 0.01, unit: "%", scale: 100 },
  { key: "delay_ms", label: "Delay time", step: 1, unit: " ms" },
  { key: "delay_feedback", label: "Delay feedback", step: 0.01, unit: "%", scale: 100 },
  { key: "delay_mix", label: "Delay mix", step: 0.01, unit: "%", scale: 100 },
  { key: "drive", label: "Drive", step: 0.01, unit: "%", scale: 100 },
  { key: "detune", label: "Detune", step: 0.01, unit: " ct" },
  { key: "gain_trim", label: "Gain trim", step: 0.01 },
  { key: "drumkit", label: "Drum kit", type: "select", options: ["Acoustic", "Electronic", "Organic"] }
];

const PERFORMANCE_CONTROLS = [
  { key: "mode", label: "Play mode", type: "select", optionKey: "modes", source: "state" },
  { key: "scale", label: "Scale", type: "select", optionKey: "scales", source: "state" },
  { key: "root", label: "Root note", type: "select", options: NOTE_NAMES, source: "state" },
  { key: "clock", label: "Plant clock", type: "toggle", source: "state" },
  { key: "bpm", label: "Tempo", step: 1, unit: " BPM", source: "state" },
  { key: "swing", label: "Swing", step: 1, unit: "%", source: "state" },
  { key: "sens", label: "Sensitivity", step: 0.01, source: "state" },
  { key: "lo", label: "Low octave", step: 1, source: "state" },
  { key: "hi", label: "High octave", step: 1, source: "state" },
  { key: "rest", label: "Rest chance", step: 0.01, unit: "%", scale: 100, source: "state" },
  { key: "nr", label: "Avoid repeats", type: "toggle", source: "state" },
  { key: "ts", label: "Time signature", type: "select", optionKey: "time_signatures", source: "state", transformOut: (value) => value.replace("/", "-") },
  { key: "note_length", label: "Note length", type: "select", optionKey: "note_lengths", source: "state", valueKey: "note_length_idx" }
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const isAndroid = shouldUseWebUsb();
const webUsbProvider = navigator.usb?.requestDevice ? new WebUsbSerialProvider(navigator.usb) : null;
const serialProvider = globalThis.__BECA_SERIAL__ ?? (isAndroid ? webUsbProvider ?? navigator.serial : navigator.serial ?? webUsbProvider);
const transport = new BecaSerial(serialProvider);
const transportName = serialProvider?.transportName ?? (serialProvider === navigator.serial ? "Web Serial" : "Android USB");
const model = { params: structuredClone(FALLBACK_PARAMS), state: {}, synth: {}, plant: {}, notes: {} };
const interaction = new Set();
const sendTimers = new Map();
const pendingReplies = new Map();
let verified = false;
let heartbeatTimer = null;
let statePollTimer = null;
let synthPollTimer = null;
let deferredInstall = null;
let toastTimer = null;
let consoleLines = 0;

function showToast(message, type = "") {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = `toast show ${type}`.trim();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = "toast"; }, 3400);
}

function setNotice(message = "", type = "warning") {
  const notice = $("#compatibilityNotice");
  notice.textContent = message;
  notice.className = message ? `notice ${type}` : "notice hidden";
}

function setUsbCheck(selector, value, state = "") {
  const element = $(selector);
  if (!element) return;
  element.textContent = value;
  element.className = state;
}

function selectedAdapterLabel() {
  const device = transport.port?.device;
  if (!device) return "Waiting for selection";
  const id = [device.vendorId, device.productId]
    .map((value) => Number(value).toString(16).padStart(4, "0").toUpperCase())
    .join(":");
  return `${device.productName || "USB serial"} · ${id}`;
}

async function refreshUsbDiagnostics() {
  const embeddedBrowser = /; wv\)|FBAN|FBAV|Instagram/i.test(navigator.userAgent);
  const usbReady = Boolean(webUsbProvider);
  const serialReady = Boolean(navigator.serial?.requestPort);
  setUsbCheck("#browserStatus", embeddedBrowser ? "In-app browser blocked" : usbReady ? "WebUSB ready" : serialReady ? "Web Serial fallback" : "USB API unavailable", embeddedBrowser || (!usbReady && !serialReady) ? "error" : "ok");
  setUsbCheck("#secureStatus", window.isSecureContext ? "HTTPS ready" : "HTTPS required", window.isSecureContext ? "ok" : "error");

  if (!usbReady) {
    setUsbCheck("#permissionStatus", serialReady ? "Requested on connect" : "Cannot request", serialReady ? "" : "error");
    return;
  }
  try {
    const devices = await navigator.usb.getDevices();
    if (devices.length) {
      setUsbCheck("#permissionStatus", `${devices.length} device${devices.length === 1 ? "" : "s"} approved`, "ok");
      const device = devices[0];
      const id = `${device.vendorId.toString(16).padStart(4, "0").toUpperCase()}:${device.productId.toString(16).padStart(4, "0").toUpperCase()}`;
      setUsbCheck("#adapterStatus", `${device.productName || "USB serial"} · ${id}`, "ok");
    }
  } catch (error) {
    setUsbCheck("#permissionStatus", "Permission check failed", "error");
    $("#usbDiagnostic").textContent = `Chrome could not inspect USB permissions: ${error.message || error}`;
  }
}

function logLine(message, kind = "in") {
  const log = $("#consoleLog");
  const line = document.createElement("p");
  line.className = `log-${kind}`;
  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = new Date().toLocaleTimeString([], { hour12: false });
  line.append(time, document.createTextNode(message));
  log.append(line);
  consoleLines += 1;
  while (consoleLines > 250 && log.firstElementChild) {
    log.firstElementChild.remove();
    consoleLines -= 1;
  }
  log.scrollTop = log.scrollHeight;
}

function setConnectedUi(connected) {
  $("#connectButton").classList.toggle("connected", connected);
  $("#connectButton span:last-child").textContent = connected ? "Disconnect" : "Connect USB";
  $("#deviceStatus").textContent = connected ? (verified ? "BECA connected" : "Checking device…") : "Not connected";
  $("#connectionMessage").textContent = connected
    ? (verified ? `Direct ${transportName} control is active. Your changes are sent to BECA in real time.` : "Opening the USB link and checking for BECA…")
    : isAndroid
      ? "Connect BECA with a USB-C OTG/data cable, then tap Connect USB and approve the device permission."
      : "Connect your device to BECA with a USB data cable.";
  $$('button[data-requires-connection], button[data-command], .preset-button, input[data-key], select[data-key], #muteButton, #testButton, #refreshButton, #resetPreset, #randomizeButton, #commandInput, #commandForm button[type="submit"]').forEach((element) => {
    element.disabled = !connected;
  });
  renderOutputModes();
}

function waitForReply(tag, timeoutMs = 3500) {
  return new Promise((resolve, reject) => {
    const old = pendingReplies.get(tag);
    if (old) clearTimeout(old.timer);
    const timer = setTimeout(() => {
      pendingReplies.delete(tag);
      reject(new Error(`BECA did not answer ${tag}. Check the cable and close other serial apps.`));
    }, timeoutMs);
    pendingReplies.set(tag, { resolve, timer });
  });
}

async function request(tag, awaitReply = false) {
  const reply = awaitReply ? waitForReply(tag) : null;
  await transport.send(tag);
  return reply;
}

async function verifyDevice() {
  const ping = request("PING", true);
  const payload = await ping;
  if (!payload?.ok) throw new Error("The selected serial device did not identify as BECA.");
  verified = true;
  setConnectedUi(true);
  await transport.send("TELEMETRY 1");
  await Promise.all([request("PARAMS"), request("STATE"), request("SYNTH"), request("PLANT"), request("NOTES")]);
  startPolling();
  setNotice();
  showToast("BECA connected over USB-C.");
}

function startPolling() {
  stopPolling();
  heartbeatTimer = setInterval(() => {
    if (!document.hidden && transport.connected) transport.send("PING").catch(handleError);
  }, 1500);
  statePollTimer = setInterval(() => {
    if (!document.hidden && transport.connected) {
      transport.send("STATE").then(() => transport.send("PLANT")).then(() => transport.send("NOTES")).catch(handleError);
    }
  }, 500);
  synthPollTimer = setInterval(() => {
    if (!document.hidden && transport.connected) transport.send("SYNTH").catch(handleError);
  }, 2000);
}

function stopPolling() {
  clearInterval(heartbeatTimer);
  clearInterval(statePollTimer);
  clearInterval(synthPollTimer);
  heartbeatTimer = statePollTimer = synthPollTimer = null;
}

function handleError(error) {
  const message = error?.message || String(error);
  logLine(message, "error");
  showToast(message, "error");
}

async function toggleConnection() {
  if (transport.connected) {
    await transport.disconnect();
    return;
  }
  try {
    setNotice();
    setUsbCheck("#permissionStatus", "Opening device picker…");
    setUsbCheck("#adapterStatus", "Waiting for Chrome…");
    await transport.connect();
    setUsbCheck("#permissionStatus", "Permission granted", "ok");
    setUsbCheck("#adapterStatus", selectedAdapterLabel(), "ok");
    setConnectedUi(true);
    await verifyDevice();
  } catch (error) {
    const friendlyError = connectionError(error);
    setUsbCheck("#permissionStatus", error?.name === "NotFoundError" ? "No device selected" : "Connection failed", "error");
    setUsbCheck("#adapterStatus", "Check cable / OTG mode", "error");
    $("#usbDiagnostic").textContent = friendlyError.message;
    handleError(friendlyError);
    await transport.disconnect(false);
    setNotice(friendlyError.message, "error");
  }
}

function connectionError(error) {
  if (error?.name === "NotFoundError") {
    return new Error("Chrome did not receive a BECA adapter selection. Reconnect BECA directly, enable USB/OTG host mode if your phone offers it, tap Connect USB again, and choose CH340/CH341, CP210x, FTDI, or Espressif USB Serial/JTAG.");
  }
  if (error?.name === "SecurityError") {
    return new Error("Android blocked USB access. Open this HTTPS app directly in Chrome, not inside another app, then allow the USB permission.");
  }
  if (/claim|busy|access|open/i.test(error?.message ?? "")) {
    return new Error(`${error.message} Close any serial-terminal app, reconnect BECA, and approve Chrome when Android asks which app may use the USB device.`);
  }
  return error instanceof Error ? error : new Error(String(error));
}

function receive(parsed) {
  logLine(parsed.raw, parsed.type === "error" || parsed.type === "malformed" ? "error" : parsed.type === "warning" ? "warning" : "in");
  if (parsed.type === "reply") {
    const waiter = pendingReplies.get(parsed.tag);
    if (waiter) {
      clearTimeout(waiter.timer);
      pendingReplies.delete(parsed.tag);
      waiter.resolve(parsed.payload);
    }
    if (parsed.tag === "PARAMS" && parsed.payload) {
      model.params = { ...model.params, ...parsed.payload, ranges: { ...model.params.ranges, ...parsed.payload.ranges } };
      renderAllControls();
    } else if (parsed.tag === "STATE" && parsed.payload) {
      model.state = parsed.payload;
      renderState();
    } else if (parsed.tag === "SYNTH" && parsed.payload) {
      model.synth = parsed.payload;
      renderSynth();
    } else if (parsed.tag === "PLANT" && parsed.payload) {
      model.plant = parsed.payload;
      renderPlant();
    } else if (parsed.tag === "NOTES" && parsed.payload) {
      model.notes = parsed.payload;
      renderNotes();
    } else if (parsed.tag === "SET" && parsed.payload && !parsed.payload.ok) {
      const message = parsed.payload.err || "BECA rejected the setting.";
      showToast(message, "error");
      request("STATE").then(() => request("SYNTH")).catch(handleError);
    }
  } else if (parsed.type === "telemetry") {
    if (parsed.telemetryType === "plant") {
      model.plant = { ...model.plant, ...parsed.payload };
      renderPlant();
    } else if (parsed.telemetryType === "midi") {
      if (parsed.payload.on) updateLastNote(parsed.payload.note, parsed.payload.vel);
    }
  } else if (parsed.type === "midi" && (parsed.status & 0xf0) === 0x90 && parsed.data2 > 0) {
    updateLastNote(parsed.data1, parsed.data2);
  }
}

function noteLabel(midi) {
  const value = Number(midi);
  if (!Number.isFinite(value) || value <= 0) return "—";
  return `${NOTE_NAMES[value % 12]}${Math.floor(value / 12) - 1}`;
}

function updateLastNote(note, velocity) {
  $("#noteStatus").textContent = `${noteLabel(note)} · ${velocity ?? 0}`;
}

function renderPlant() {
  const value = Math.max(0, Math.min(1, Number(model.plant.value ?? 0)));
  $("#plantValue").textContent = transport.connected ? value.toFixed(2) : "—";
  $("#energyRing").style.strokeDashoffset = String(427.26 * (1 - value));
  const connected = Number(model.plant.connected ?? model.state.plant_jack ?? 0) !== 0;
  $("#plantStatus").textContent = transport.connected ? (connected ? "Connected" : "Check plant") : "—";
}

function renderNotes() {
  const notes = Array.isArray(model.notes.notes) ? model.notes.notes : [];
  if (notes.length) updateLastNote(notes.at(-1), model.notes.last_vel ?? model.notes.vel);
  else if (model.notes.last) updateLastNote(model.notes.last, model.notes.last_vel);
}

function renderState() {
  const state = model.state;
  $("#outputStatus").textContent = state.outputname ?? model.params.output_modes?.[state.outputmode] ?? "—";
  $("#auxReadiness").textContent = !transport.connected
    ? "Waiting for device"
    : state.aux_ready
      ? (state.aux_jack ? "AUX connected" : "AUX ready")
      : `AUX ready in ${Math.ceil((state.aux_wait_ms ?? 0) / 1000)}s`;
  $("#muteButton span:last-child").textContent = state.io_muted ? "Unmute" : "Mute";
  $("#muteButton").classList.toggle("accent", Boolean(state.io_muted));
  $("#presetName").textContent = state.preset_name ?? model.synth.preset_name ?? "—";
  if (state.last) updateLastNote(state.last, state.vel);
  renderOutputModes();
  renderPresetSelection();
  applyModelToControls("state", state);
  renderModeRestrictions();
}

function renderSynth() {
  $("#presetName").textContent = model.synth.preset_name ?? model.state.preset_name ?? "—";
  const master = Number(model.synth.master ?? model.state.master);
  if (!interaction.has("master") && Number.isFinite(master)) {
    $("#master").value = String(master);
    $("#masterOutput").textContent = `${Math.round(master * 100)}%`;
  }
  applyModelToControls("synth", model.synth);
  renderPresetSelection();
}

function controlRange(def) {
  const range = model.params.ranges?.[def.key];
  return { min: def.min ?? range?.[0] ?? 0, max: def.max ?? range?.[1] ?? 1 };
}

function displayControlValue(def, raw) {
  const scaled = Number(raw) * (def.scale ?? 1);
  return `${formatValue(scaled, def.step && def.step < 0.1 ? 2 : 0)}${def.unit ?? ""}`;
}

function buildControl(def, source) {
  const card = document.createElement("article");
  card.className = "panel control-card";
  const valueKey = def.valueKey ?? def.key;
  if (def.type === "toggle") {
    card.innerHTML = `<div class="toggle-row"><label for="control-${def.key}">${def.label}</label><label class="switch"><input id="control-${def.key}" type="checkbox" data-key="${def.key}" data-value-key="${valueKey}" data-source="${source}"><span aria-hidden="true"></span></label></div>`;
  } else if (def.type === "select") {
    const options = def.options ?? model.params[def.optionKey] ?? [];
    card.innerHTML = `<label for="control-${def.key}"><span>${def.label}</span></label><select id="control-${def.key}" data-key="${def.key}" data-value-key="${valueKey}" data-source="${source}">${options.map((label, index) => `<option value="${def.key === "ts" ? String(label).replace("-", "/") : index}">${label}</option>`).join("")}</select>`;
  } else {
    const { min, max } = controlRange(def);
    card.innerHTML = `<label for="control-${def.key}"><span>${def.label}</span><output id="output-${def.key}">—</output></label><input id="control-${def.key}" class="range" type="range" min="${min}" max="${max}" step="${def.step ?? 0.01}" data-key="${def.key}" data-value-key="${valueKey}" data-source="${source}"><div class="range-labels"><span>${formatValue(min)}</span><span>${formatValue(max)}</span></div>`;
  }
  const input = card.querySelector("input, select");
  input.disabled = !transport.connected;
  input.addEventListener("pointerdown", () => interaction.add(def.key));
  input.addEventListener("pointerup", () => interaction.delete(def.key));
  input.addEventListener("blur", () => interaction.delete(def.key));
  input.addEventListener("input", () => {
    if (def.type !== "select" && def.type !== "toggle") {
      card.querySelector("output").textContent = displayControlValue(def, input.value);
      scheduleSet(def.key, input.value, def.transformOut);
    }
  });
  input.addEventListener("change", () => {
    const raw = def.type === "toggle" ? (input.checked ? "1" : "0") : input.value;
    scheduleSet(def.key, raw, def.transformOut, true);
  });
  return card;
}

function renderControlGroup(containerId, definitions, source) {
  const container = $(containerId);
  container.replaceChildren(...definitions.map((def) => buildControl(def, def.source ?? source)));
}

function renderAllControls() {
  renderControlGroup("#synthControls", SYNTH_CONTROLS, "synth");
  renderControlGroup("#performanceControls", PERFORMANCE_CONTROLS, "state");
  renderOutputModes();
  renderPresets();
  renderState();
  renderSynth();
}

function applyModelToControls(source, values) {
  $$(`[data-source="${source}"][data-key]`).forEach((input) => {
    const key = input.dataset.key;
    if (interaction.has(key)) return;
    const value = values[input.dataset.valueKey || key];
    if (value === undefined || value === null) return;
    if (input.type === "checkbox") input.checked = Boolean(Number(value));
    else input.value = String(value);
    const def = [...SYNTH_CONTROLS, ...PERFORMANCE_CONTROLS].find((item) => item.key === key);
    const output = input.closest(".control-card")?.querySelector("output");
    if (def && output) output.textContent = displayControlValue(def, value);
  });
}

function renderOutputModes() {
  const container = $("#outputModes");
  const current = Number(model.state.outputmode);
  const descriptions = ["Wireless MIDI", "USB MIDI data", "Onboard synth", "USB + onboard synth", "Network MIDI"];
  const modes = model.params.output_modes ?? FALLBACK_PARAMS.output_modes;
  container.replaceChildren(...modes.map((label, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `output-card${current === index ? " selected" : ""}`;
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", current === index ? "true" : "false");
    button.innerHTML = `<strong>${label || `Mode ${index}`}</strong><span>${descriptions[index] ?? "Output routing"}</span>`;
    const auxBlocked = (index === 2 || index === 3) && model.state.aux_ready === 0;
    button.disabled = !transport.connected || !label || auxBlocked;
    if (auxBlocked) button.title = `AUX starts in ${Math.ceil((model.state.aux_wait_ms ?? 0) / 1000)} seconds`;
    button.addEventListener("click", () => scheduleSet("outputmode", index, null, true));
    return button;
  }));
}

function renderPresets() {
  const presets = model.params.synth_presets ?? FALLBACK_PARAMS.synth_presets;
  $("#presetGrid").replaceChildren(...presets.map((name, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset-button";
    button.textContent = name;
    button.disabled = !transport.connected;
    button.dataset.preset = String(index);
    button.addEventListener("click", () => scheduleSet(model.params.live_preset ? "preset_live" : "preset", index, null, true));
    return button;
  }));
  renderPresetSelection();
}

function renderPresetSelection() {
  const selected = Number(model.synth.preset ?? model.state.preset);
  $$("[data-preset]").forEach((button) => button.classList.toggle("selected", Number(button.dataset.preset) === selected));
}

function renderModeRestrictions() {
  const auxOnly = Number(model.state.outputmode) === 2;
  const drumMode = $("#control-mode option[value=\"3\"]");
  if (drumMode) drumMode.disabled = auxOnly;
  const drumKit = $("#control-drumkit");
  if (drumKit) {
    drumKit.disabled = !transport.connected || auxOnly;
    drumKit.title = auxOnly ? "The firmware does not run drums through AUX-only mode." : "";
  }
}

function scheduleSet(key, rawValue, transform, immediate = false) {
  const value = transform ? transform(String(rawValue)) : rawValue;
  clearTimeout(sendTimers.get(key));
  const send = () => {
    sendTimers.delete(key);
    transport.send(`SET ${key} ${value}`).catch(handleError);
  };
  if (immediate) send();
  else sendTimers.set(key, setTimeout(send, 80));
}

function initTabs() {
  $$(".tab").forEach((button) => button.addEventListener("click", () => {
    $$(".tab").forEach((tab) => tab.classList.toggle("active", tab === button));
    $$(".tab-page").forEach((page) => page.classList.toggle("active", page.id === button.dataset.tab));
    history.replaceState(null, "", `#${button.dataset.tab}`);
  }));
  const requested = location.hash.slice(1);
  const button = $(`.tab[data-tab="${CSS.escape(requested)}"]`);
  if (button) button.click();
}

function initActions() {
  $("#connectButton").addEventListener("click", () => toggleConnection().catch(handleError));
  $("#refreshButton").addEventListener("click", () => Promise.all([request("PARAMS"), request("STATE"), request("SYNTH"), request("PLANT"), request("NOTES")]).then(() => showToast("Device state refreshed.")).catch(handleError));
  $("#muteButton").addEventListener("click", () => scheduleSet("mute", model.state.io_muted ? 0 : 1, null, true));
  $("#testButton").addEventListener("click", () => transport.send("SYNTH_TEST").catch(handleError));
  $("#resetPreset").addEventListener("click", () => scheduleSet("preset_reset", 1, null, true));
  $("#randomizeButton").addEventListener("click", () => transport.send("RANDOMIZE").catch(handleError));
  $("#master").addEventListener("pointerdown", () => interaction.add("master"));
  $("#master").addEventListener("pointerup", () => interaction.delete("master"));
  $("#master").addEventListener("input", (event) => {
    $("#masterOutput").textContent = `${Math.round(Number(event.target.value) * 100)}%`;
    scheduleSet("master", event.target.value);
  });
  $("#master").addEventListener("change", (event) => scheduleSet("master", event.target.value, null, true));
  $$("[data-command]").forEach((button) => button.addEventListener("click", () => transport.send(button.dataset.command).catch(handleError)));
  $("#commandForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $("#commandInput");
    transport.send(input.value).then(() => { input.value = ""; }).catch(handleError);
  });
  $("#clearConsole").addEventListener("click", () => {
    $("#consoleLog").replaceChildren();
    consoleLines = 0;
    logLine("Console cleared.", "system");
  });
}

function initInstall() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstall = event;
    $("#installButton").classList.remove("hidden");
  });
  $("#installButton").addEventListener("click", async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    $("#installButton").classList.add("hidden");
  });
}

function initCompatibility() {
  if (!transport.supported) {
    setNotice("This browser cannot request USB devices. Open the HTTPS app directly in current Chrome or Edge—not an embedded browser inside another app. iPhone and iPad browsers cannot access BECA's USB serial bridge.");
    $("#connectButton").disabled = true;
  } else if (!window.isSecureContext) {
    setNotice("USB access requires HTTPS. Open the published GitHub Pages app, or use localhost for development.", "error");
    $("#connectButton").disabled = true;
  } else if (isAndroid && webUsbProvider) {
    setNotice("USB is available. Connect BECA directly, tap Connect USB, select CH340/CH341, CP210x, FTDI, or Espressif USB Serial/JTAG, then approve Chrome and Android.");
  } else if (isAndroid) {
    setNotice("WebUSB is unavailable, so the app will use this browser's Web Serial fallback. Tap Connect USB and select BECA when prompted.");
  }
  refreshUsbDiagnostics();
}

transport.addEventListener("connect", () => {
  logLine("Serial port opened at 115200 baud.", "system");
  setUsbCheck("#permissionStatus", "Permission granted", "ok");
  setUsbCheck("#adapterStatus", selectedAdapterLabel(), "ok");
});
transport.addEventListener("sent", (event) => logLine(event.detail, "out"));
transport.addEventListener("line", (event) => receive(event.detail));
transport.addEventListener("transporterror", (event) => handleError(event.detail));
transport.addEventListener("disconnect", () => {
  verified = false;
  stopPolling();
  setConnectedUi(false);
  logLine("Serial connection closed.", "system");
  refreshUsbDiagnostics();
});

navigator.usb?.addEventListener?.("connect", () => refreshUsbDiagnostics());
navigator.usb?.addEventListener?.("disconnect", () => refreshUsbDiagnostics());

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && transport.connected) {
    transport.send("PING").then(() => transport.send("STATE")).catch(handleError);
  }
});
window.addEventListener("pagehide", () => { if (transport.connected) transport.disconnect(); });

$("#appVersion").textContent = `v${APP_VERSION}`;
initTabs();
initActions();
initInstall();
initCompatibility();
renderAllControls();
setConnectedUi(false);

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  const hadServiceWorkerController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.register("./service-worker.js").then((registration) => {
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          $("#updateButton").classList.remove("hidden");
          showToast("A controller update is ready.");
        }
      });
    });
    $("#updateButton").addEventListener("click", () => registration.waiting?.postMessage({ type: "SKIP_WAITING" }));
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing || !hadServiceWorkerController) return;
      refreshing = true;
      location.reload();
    });
  }).catch((error) => logLine(`Offline cache unavailable: ${error.message}`, "warning"));
}
