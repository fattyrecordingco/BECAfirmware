import { BecaSerial, formatValue } from "./protocol.js";
import { WebUsbSerialProvider, shouldUseWebUsb } from "./webusb-serial.js";
import { PhoneAudio } from "./phone-audio.js";
import { BecaConnection } from "./tablet-link.js";
import { ARP_DEFAULTS } from "./plant-arp.js";
import { capabilities, connectionHelp } from "./compatibility.js";
import { appleNativeProvider } from "./apple-native.js";

const APP_VERSION = "1.6.0";
const phoneAudio = new PhoneAudio();
const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const LEAF_PATH = "M100 48.864C100 77.106 77.106 100 48.864 100H0V51.136C0 22.894 22.894 0 51.136 0H100v48.864ZM51.136 11.364c-21.965 0-39.772 17.807-39.772 39.772V81.17l42.005-42.005c2.219-2.219 5.817-2.219 8.036 0 2.219 2.219 2.219 5.817 0 8.036L19.967 88.636h28.897c21.965 0 39.772-17.807 39.772-39.772V11.364H51.136Z";
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
  { key: "wave_a", label: "Oscillator A", type: "select", options: ["Saw", "Square", "Triangle", "Sine"] },
  { key: "wave_b", label: "Oscillator B", type: "select", options: ["Saw", "Square", "Triangle", "Sine"] },
  { key: "osc_mix", label: "Oscillator mix", min: 0, max: 1, step: 0.01, unit: "%", scale: 100 },
  { key: "mono", label: "Monophonic", type: "toggle" },
  { key: "voices", label: "Polyphony", min: 1, max: 8, step: 1 },
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
  { key: "lo", label: "Low octave", min: 1, max: 8, step: 1, source: "state" },
  { key: "hi", label: "High octave", min: 1, max: 8, step: 1, source: "state" },
  { key: "rest", label: "Rest chance", step: 0.01, unit: "%", scale: 100, source: "state" },
  { key: "nr", label: "Avoid repeats", type: "toggle", source: "state" },
  { key: "ts", label: "Time signature", type: "select", optionKey: "time_signatures", source: "state", transformOut: (value) => value.replace("/", "-") },
  { key: "note_length", label: "Note length", type: "select", optionKey: "note_lengths", source: "state", valueKey: "note_length_idx" }
];
const DEVICE_CONTROLS = [
  { key: "sync", valueKey: "daw_sync", label: "DAW clock sync", type: "toggle" },
  { key: "bright", label: "LED brightness", min: 10, max: 255, step: 1 },
  { key: "fx", label: "LED effect", type: "select", optionKey: "led_effects" },
  { key: "pal", label: "LED palette", type: "select", optionKey: "led_palettes" },
  { key: "vs", label: "LED speed", min: 0, max: 255, step: 1 },
  { key: "vi", label: "LED intensity", min: 0, max: 255, step: 1 },
  { key: "encoder_setting", label: "Encoder controls", type: "select", options: ["Sensitivity", "Preset", "Scale", "Root", "Tempo", "Swing", "Rest", "Low octave", "High octave", "Time signature", "Note length", "Filter", "Resonance"] },
  { key: "encoder_volume_mode", label: "Encoder volume mode", type: "toggle" }
];
const ARP_CONTROLS = [
  { key: "arp_pattern", label: "Arp order", type: "select", options: ["Plant contour", "Rising", "Falling"] },
  { key: "arp_chord", label: "Chord size", type: "select", options: ["Triad", "Seventh"] },
  { key: "arp_span", label: "Arp octave span", min: 1, max: 3, step: 1 },
  { key: "arp_response", label: "Signal response", min: 0.05, max: 1, step: 0.01 }
];
const LOCAL_PERFORMANCE = new Set(["mode", "scale", "root", "lo", "hi", "drumsel", ...ARP_CONTROLS.map((c) => c.key)]);
const PAD_MODES = {
  tone: [{key:"cutoff", label:"Cutoff", min:80, max:12000, log:true, digits:0}, {key:"resonance", label:"Resonance", min:0.3, max:6, digits:1}],
  space: [{key:"delay_mix", label:"Delay", min:0, max:1, digits:2}, {key:"reverb", label:"Reverb", min:0, max:1, digits:2}],
  envelope: [{key:"attack", label:"Attack", min:0, max:5, digits:2}, {key:"release", label:"Release", min:0.01, max:10, digits:2}],
  texture: [{key:"osc_mix", label:"Oscillator mix", min:0, max:1, digits:2}, {key:"detune", label:"Detune", min:0, max:8, digits:2}]
};
let padMode = "tone";
const SENSITIVITY_CONTROL = { key: "sens", label: "Sensitivity", step: 0.01, source: "state" };

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const isAndroid = shouldUseWebUsb();
const webUsbProvider = navigator.usb?.requestDevice ? new WebUsbSerialProvider(navigator.usb) : null;
const nativeProvider = appleNativeProvider();
const serialProvider = nativeProvider ?? globalThis.__BECA_SERIAL__ ?? (isAndroid ? webUsbProvider ?? navigator.serial : navigator.serial ?? webUsbProvider);
const transport = new BecaConnection(new BecaSerial(serialProvider));
const transportName = serialProvider?.transportName ?? (serialProvider === navigator.serial ? "Web Serial" : "Android USB");
const model = { params: JSON.parse(JSON.stringify(FALLBACK_PARAMS)), state: {mode:0, scale:0, root:0, lo:2, hi:5, drumsel:255, ...ARP_DEFAULTS}, synth: {}, plant: {}, notes: {} };
const interaction = new Set();
const sendTimers = new Map();
const pendingReplies = new Map();
let verified = false;
let connecting = false;
let heartbeatTimer = null;
let statePollTimer = null;
let synthPollTimer = null;
let deferredInstall = null;
let toastTimer = null;
let consoleLines = 0;
let plantSamples = [];
let lastPlantSample = null;
let plantRenderFrame = null;
let padPointerId = null;
let padSendTimer = null;
let pendingPadValues = null;
let wasMuted = false;

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
  const caps = capabilities();
  setUsbCheck("#audioCapability", caps.audio ? "Web synth available" : "Update browser for audio", caps.audio ? "ok" : "error");
  setUsbCheck("#relayCapability", caps.relay ? "Computer link available" : "Computer link unavailable", caps.relay ? "ok" : "error");
  $("#connectionAdvice").textContent = connectionHelp($("#connectionIssue").value, caps);
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
  $("#listenButton").disabled = connecting || !capabilities().audio;
  $("#connectButton").disabled = connecting || (!connected && !transport.supported);
  $("#connectButton").classList.toggle("connected", connected);
  $("#connectButton span:last-child").textContent = connected ? "Disconnect" : nativeProvider ? "Connect BECA" : "Connect USB";
  $("#deviceStatus").textContent = connected ? (verified ? "BECA connected" : "Checking device…") : "Not connected";
  $("#connectionMessage").textContent = connected
    ? (verified ? `Direct ${transportName} control is active. Your changes are sent to BECA in real time.` : "Opening the USB link and checking for BECA…")
    : nativeProvider ? "Enter BECA’s Wi-Fi address above and select its MIDI source. No computer is needed."
    : !transport.supported ? "Use BECA’s direct Wi-Fi controller for settings and AUX, or native BLE-MIDI in a music app. The computer link supplies live input to this browser synth." : isAndroid
      ? "Connect BECA with a USB-C OTG/data cable, then tap Connect USB and approve the device permission."
      : "Connect your device to BECA with a USB data cable.";
  $$('button[data-requires-connection], button[data-command], .preset-button, .midi-leaf, input[data-key], select[data-key], #muteButton, #testButton, #refreshButton, #resetPreset, #randomizeButton, #commandInput, #commandForm button[type="submit"]').forEach((element) => {
    element.disabled = !connected || !verified;
  });
  $("#expressionPad").setAttribute("aria-disabled", String(!connected || !verified));
  enableLocalControls();
  renderOutputModes();
}

function enableLocalControls() {
  if (connecting || (transport.connected && !verified)) return;
  if (!phoneAudio.presets) return;
  $$('[data-source="synth"], .preset-button, #resetPreset, #testButton').forEach((element) => { element.disabled = false; });
  $$('[data-key]').filter((element) => LOCAL_PERFORMANCE.has(element.dataset.key)).forEach((element) => { element.disabled = false; });
  $$("[data-play-mode]").forEach((button) => { button.disabled = false; });
  renderModeRestrictions();
  $("#expressionPad").setAttribute("aria-disabled", "false");
  if (!capabilities().audio) $("#testButton").disabled = true;
}

function updateAudioStatus() {
  if (!capabilities().audio) {
    $("#listenButton").disabled = true;
    $("#audioStatus").textContent = "Live audio is not supported here. Use a current browser on HTTPS or localhost.";
    return;
  }
  const active = phoneAudio.enabled;
  $("#listenButton").textContent = active ? "Stop listening" : "Listen on this device";
  $("#listenButton").setAttribute("aria-pressed", String(active));
  $("#audioStatus").textContent = active
    ? phoneAudio.context?.state !== "running" ? "Audio paused by browser — tap Stop, then Listen to resume."
      : transport.connected ? nativeProvider ? "Live synth · select BECA’s native MIDI source above and BLE MIDI output" : "Live synth · select Serial MIDI or Serial MIDI + Aux for notes" : "Preview ready · connect BECA for live plant input"
    : "Sound is off. Tap Listen to enable this device’s audio.";
}

async function startPhoneAudio() {
  phoneAudio.setPerformance(model.state);
  await phoneAudio.start(model.synth);
  if (phoneAudio.enabled && transport.connected) scheduleSet("outputmode", serialProvider?.audioOutputMode ?? 1, null, true);
  updateAudioStatus();
}

function applyLocalSetting(key, value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return;
  if (["preset", "preset_live", "preset_reset"].includes(key)) {
    const index = key === "preset_reset" ? Number(model.synth.preset) : numeric;
    const preset = phoneAudio.presets?.[index];
    if (preset) {
      const master = model.synth.master;
      model.synth = { ...preset, ...(key === "preset_live" && master != null ? { master } : {}) };
      phoneAudio.panic();
    }
  } else if (key === "master" || SYNTH_CONTROLS.some((control) => control.key === key)) model.synth[key] = numeric;
  else if (key === "mute") { if (numeric) phoneAudio.panic(); }
  else if (LOCAL_PERFORMANCE.has(key)) {
    model.state[key] = numeric;
    if (key === "lo" && numeric > model.state.hi) model.state.hi = numeric;
    if (key === "hi" && numeric < model.state.lo) model.state.lo = numeric;
    phoneAudio.setPerformance(model.state);
    renderState();
  }
  phoneAudio.setParams(model.synth);
  renderSynth();
}

function waitForReply(tag, timeoutMs = 3500) {
  return new Promise((resolve, reject) => {
    const old = pendingReplies.get(tag);
    if (old) { clearTimeout(old.timer); old.reject(new Error(`A newer ${tag} request replaced this one.`)); }
    const timer = setTimeout(() => {
      pendingReplies.delete(tag);
      reject(new Error(`BECA did not answer ${tag}. ${nativeProvider ? "Check its Wi-Fi address and Local Network permission." : "Check the cable and close other serial apps."}`));
    }, timeoutMs);
    pendingReplies.set(tag, { resolve, reject, timer });
  });
}

async function request(tag, awaitReply = false) {
  const reply = awaitReply ? waitForReply(tag) : null;
  // A failed send must also settle its pending response timeout.
  if (reply) reply.catch(() => {});
  try { await transport.send(tag); }
  catch (error) {
    if (reply) {
      const waiter = pendingReplies.get(tag);
      if (waiter) { clearTimeout(waiter.timer); pendingReplies.delete(tag); waiter.reject(error); }
    }
    throw error;
  }
  return reply;
}

async function verifyDevice() {
  const ping = request("PING", true);
  const payload = await ping;
  if (!payload?.ok) throw new Error("The selected device did not identify as BECA.");
  await transport.send("TELEMETRY 1");
  await Promise.all(["PARAMS", "STATE", "SYNTH", "PLANT", "NOTES"].map((tag) => request(tag, true)));
  verified = true;
  connecting = false;
  setConnectedUi(true);
  startPolling();
  setNotice();
  showToast(transport.remote ? "BECA linked through computer." : nativeProvider ? "BECA connected directly over Wi-Fi." : "BECA connected over USB-C.");
  if (phoneAudio.enabled) scheduleSet("outputmode", serialProvider?.audioOutputMode ?? 1, null, true);
  updateAudioStatus();
}

function startPolling() {
  stopPolling();
  const busy = new Set();
  const poll = async (name, tags) => {
    if (document.hidden || !transport.connected || busy.has(name)) return;
    busy.add(name);
    try { for (const tag of tags) await transport.send(tag); }
    catch (error) { handleError(error); }
    finally { busy.delete(name); }
  };
  heartbeatTimer = setInterval(() => {
    poll("heartbeat", ["PING"]);
  }, 1500);
  statePollTimer = setInterval(() => {
    if (!document.hidden && transport.connected) {
      poll("state", ["STATE", "PLANT", "NOTES"]);
    }
  }, 500);
  synthPollTimer = setInterval(() => {
    poll("synth", ["SYNTH"]);
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
  if (connecting) return;
  if (transport.connected) {
    await transport.disconnect();
    return;
  }
  connecting = true;
  setConnectedUi(false);
  $$("[data-play-mode]").forEach((button) => { button.disabled = true; });
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
    $("#connectionHelp").open = true;
    setUsbCheck("#permissionStatus", error?.name === "NotFoundError" ? "No device selected" : "Connection failed", "error");
    setUsbCheck("#adapterStatus", "Check cable / OTG mode", "error");
    $("#usbDiagnostic").textContent = friendlyError.message;
    handleError(friendlyError);
    await transport.disconnect(false);
    setNotice(friendlyError.message, "error");
  } finally {
    connecting = false;
    setConnectedUi(transport.connected);
  }
}

function connectionError(error) {
  if (nativeProvider) return error instanceof Error ? error : new Error(String(error));
  if (error?.name === "NotFoundError") {
    return new Error("No USB adapter was selected. Check that BECA has power and enable OTG on OnePlus/OxygenOS if needed. If C-to-C gives no lights, follow the OTG adapter/cable steps in connection help. Then tap Connect USB and select CH340/CH341, CP210x, FTDI, or Espressif USB Serial/JTAG.");
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
      model.state = { ...model.state, ...parsed.payload };
      renderState();
    } else if (parsed.tag === "SYNTH" && parsed.payload) {
      model.synth = parsed.payload;
      phoneAudio.setParams(model.synth);
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
      const note = Number(parsed.payload.note);
      const notes = new Set(Array.isArray(model.notes.notes) ? model.notes.notes.map(Number) : []);
      if (parsed.payload.on) { notes.add(note); if (!phoneAudio.enabled) updateLastNote(note, parsed.payload.vel); }
      else notes.delete(note);
      model.notes = { ...model.notes, notes: [...notes], last: parsed.payload.on ? note : model.notes.last, last_vel: parsed.payload.vel ?? model.notes.last_vel };
      renderNotes();
    }
  } else if (parsed.type === "midi") {
    if (!model.state.io_muted) phoneAudio.midi([parsed.status, parsed.data1, parsed.data2]);
    if (!phoneAudio.enabled && (parsed.status & 0xf0) === 0x90 && parsed.data2 > 0) updateLastNote(parsed.data1, parsed.data2);
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
  phoneAudio.plant(model.plant.value, Boolean(Number(model.plant.connected)) && !model.state.io_muted && !model.plant.plant_auto_mute);
  phoneAudio.sensor(model.plant.raw, Number(model.plant.connected) !== 0 && !model.state.io_muted && !model.plant.plant_auto_mute);
  const value = Math.max(0, Math.min(1, Number(model.plant.value ?? 0)));
  $("#plantValue").textContent = transport.connected ? value.toFixed(2) : "—";
  const connected = Number(model.plant.connected ?? model.state.plant_jack ?? 0) !== 0;
  $("#plantStatus").textContent = transport.connected ? (connected ? "Connected" : "Check plant") : "—";
  if (transport.connected && Number.isFinite(value)) samplePlant(value);
}

function renderNotes() {
  const notes = phoneAudio.enabled ? [...phoneAudio.activeNotes] : Array.isArray(model.notes.notes) ? model.notes.notes : [];
  if (phoneAudio.enabled && phoneAudio.lastNote != null) updateLastNote(phoneAudio.lastNote, phoneAudio.lastVelocity);
  else if (notes.length) updateLastNote(notes[notes.length - 1], model.notes.last_vel ?? model.notes.vel);
  else if (model.notes.last) updateLastNote(model.notes.last, model.notes.last_vel);
  const activePitchClasses = new Set(notes.map((note) => Number(note) % 12));
  $$(".midi-leaf").forEach((leaf) => leaf.classList.toggle("playing", activePitchClasses.has(Number(leaf.dataset.note))));
  $("#midiReadout").textContent = notes.length ? notes.slice(0, 4).map(noteLabel).join(" · ") : "No notes";
}

function renderState() {
  const state = model.state;
  phoneAudio.setPerformance(state);
  if (state.io_muted && !wasMuted) phoneAudio.panic();
  wasMuted = Boolean(state.io_muted);
  $("#outputStatus").textContent = state.outputname ?? model.params.output_modes?.[state.outputmode] ?? "—";
  $("#auxReadiness").textContent = !transport.connected
    ? "Waiting for device"
    : state.aux_ready
      ? (state.aux_jack ? "AUX connected" : "AUX ready")
      : `AUX ready in ${Math.ceil((state.aux_wait_ms ?? 0) / 1000)}s`;
  $("#muteButton span:last-child").textContent = state.io_muted ? "Unmute" : "Mute";
  $("#muteButton").classList.toggle("accent", Boolean(state.io_muted));
  $("#presetName").textContent = state.preset_name ?? model.synth.preset_name ?? "—";
  if (state.last && !phoneAudio.enabled) updateLastNote(state.last, state.vel);
  renderOutputModes();
  renderPresetSelection();
  applyModelToControls("state", state);
  if (!interaction.has("sens") && Number.isFinite(Number(state.sens))) {
    $("#sensitivity").value = String(state.sens);
    $("#sensitivityOutput").textContent = Number(state.sens).toFixed(2);
  }
  renderMidiLeaves();
  renderModeRestrictions();
  $$("[data-drum-part]").forEach((input) => {
    input.disabled = connecting || (transport.connected && !verified) || Number(state.mode) !== 3 || (!transport.connected && !phoneAudio.presets);
    input.checked = (Number(state.drumsel ?? 255) & (1 << Number(input.dataset.drumPart))) !== 0;
  });
  $$("[data-play-mode]").forEach((button) => button.setAttribute("aria-pressed", String(Number(button.dataset.playMode) === Number(state.mode))));
}

function renderSynth() {
  $("#presetName").textContent = model.synth.preset_name ?? model.state.preset_name ?? "—";
  const master = Number(model.synth.master ?? model.state.master);
  if (!interaction.has("master") && Number.isFinite(master)) {
    $("#master").value = String(master);
    $("#masterOutput").textContent = `${Math.round(master * 100)}%`;
  }
  applyModelToControls("synth", model.synth);
  paintExpressionPad();
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
function paintKnob(input) {
  if (input.type !== "range") return;
  const fraction = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min) || 1);
  input.closest(".control-card")?.style.setProperty("--knob-angle", `${-135 + fraction * 270}deg`);
  input.setAttribute("aria-valuetext", input.closest(".control-card")?.querySelector("output")?.textContent ?? input.value);
}

function attachKnob(input, card) {
  if (input.type !== "range") return;
  card.classList.add("knob-card");
  const face = document.createElement("span");
  face.className = "knob-face";
  face.setAttribute("aria-hidden", "true");
  input.before(face);
  let drag = null;
  input.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || input.disabled) return;
    event.preventDefault();
    input.focus();
    input.setPointerCapture(event.pointerId);
    drag = { id:event.pointerId, y:event.clientY, value:Number(input.value) };
  });
  input.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const step = Number(input.step) || 1;
    const value = drag.value + (drag.y - event.clientY) / (event.shiftKey ? 1500 : 150) * (Number(input.max) - Number(input.min));
    input.value = String(Math.round(value / step) * step);
    input.dispatchEvent(new Event("input", {bubbles:true}));
  });
  const finish = () => {
    if (!drag) return;
    drag = null;
    interaction.delete(input.dataset.key);
    input.dispatchEvent(new Event("change", {bubbles:true}));
  };
  input.addEventListener("pointerup", finish);
  input.addEventListener("pointercancel", finish);
  input.addEventListener("lostpointercapture", finish);
  input.addEventListener("input", () => paintKnob(input));
  paintKnob(input);
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
  input.disabled = !transport.connected || !verified;
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
  attachKnob(input, card);
  return card;
}

function renderControlGroup(containerId, definitions, source) {
  const container = $(containerId);
  container.replaceChildren(...definitions.map((def) => buildControl(def, def.source ?? source)));
}

function renderAllControls() {
  renderControlGroup("#synthControls", SYNTH_CONTROLS, "synth");
  renderControlGroup("#performanceControls", PERFORMANCE_CONTROLS, "state");
  renderControlGroup("#deviceControls", DEVICE_CONTROLS, "state");
  renderControlGroup("#arpControls", ARP_CONTROLS, "state");
  renderOutputModes();
  renderPresets();
  renderState();
  renderSynth();
  enableLocalControls();
}

function applyModelToControls(source, values) {
  $$(`[data-source="${source}"][data-key]`).forEach((input) => {
    const key = input.dataset.key;
    if (interaction.has(key)) return;
    const value = values[input.dataset.valueKey || key];
    if (value === undefined || value === null) return;
    if (input.type === "checkbox") input.checked = Boolean(Number(value));
    else input.value = String(value);
    const def = [...SYNTH_CONTROLS, ...PERFORMANCE_CONTROLS, ...DEVICE_CONTROLS, ...ARP_CONTROLS, SENSITIVITY_CONTROL].find((item) => item.key === key);
    const output = input.closest(".control-card")?.querySelector("output");
    if (def && output) output.textContent = displayControlValue(def, value);
    paintKnob(input);
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
    button.disabled = !transport.connected || !verified || !label || auxBlocked;
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
    button.disabled = !transport.connected || !verified;
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
  if (connecting || (transport.connected && !verified)) {
    $$('[data-key], [data-play-mode], [data-drum-part], .midi-leaf').forEach((input) => { input.disabled = true; });
    return;
  }
  const auxOnly = Number(model.state.outputmode) === 2;
  const drumMode = $("#control-mode option[value=\"3\"]");
  if (drumMode) drumMode.disabled = auxOnly;
  const drumKit = $("#control-drumkit");
  if (drumKit) {
    drumKit.disabled = Number(model.state.mode) !== 3 || (!phoneAudio.presets && !transport.connected);
    drumKit.title = "Available only in Drum Machine mode.";
  }
  $$("[data-drum-part]").forEach((input) => { input.disabled = Number(model.state.mode) !== 3 || (!transport.connected && !phoneAudio.presets); });
  const drumButton = $('[data-play-mode="3"]');
  if (drumButton) drumButton.disabled = (transport.connected && auxOnly) || (!transport.connected && !phoneAudio.presets);
  $("#arpControls").querySelectorAll("input, select").forEach((input) => { input.disabled = Number(model.state.mode) !== 1; });
}

function scheduleSet(key, rawValue, transform, immediate = false) {
  if (connecting || (transport.connected && !verified)) return;
  const value = transform ? transform(String(rawValue)) : rawValue;
  applyLocalSetting(key, value);
  if (key.startsWith("arp_")) return;
  clearTimeout(sendTimers.get(key));
  if (!transport.connected) return;
  const send = () => {
    sendTimers.delete(key);
    transport.send(`SET ${key} ${value}`).catch(handleError);
  };
  if (immediate) send();
  else sendTimers.set(key, setTimeout(send, 80));
}

function samplePlant(value) {
  const now = performance.now();
  if (lastPlantSample && now - lastPlantSample.at < 300) return;
  if (lastPlantSample && Math.abs(value - lastPlantSample.value) < 0.002 && now - lastPlantSample.at < 1000) return;
  lastPlantSample = { value, at: now };
  plantSamples.push(lastPlantSample);
  plantSamples = plantSamples.filter((sample) => now - sample.at <= 24000).slice(-60);
  if (plantRenderFrame == null) plantRenderFrame = requestAnimationFrame(renderPlantScope);
}

function renderPlantScope() {
  plantRenderFrame = null;
  if (!plantSamples.length) return;
  const now = plantSamples[plantSamples.length - 1].at;
  const path = plantSamples.map((sample, index) => {
    const x = 600 - ((now - sample.at) / 24000) * 600;
    const y = 142 - sample.value * 134;
    return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  $("#plantTrace").setAttribute("d", path);
  const values = plantSamples.map((sample) => sample.value);
  const average = values.reduce((sum, item) => sum + item, 0) / values.length;
  const latest = values[values.length - 1];
  const previous = values[Math.max(0, values.length - 4)];
  $("#signalNow").textContent = `${Math.round(latest * 100)}%`;
  $("#signalAverage").textContent = `${Math.round(average * 100)}%`;
  $("#signalLow").textContent = `${Math.round(Math.min(...values) * 100)}%`;
  $("#signalHigh").textContent = `${Math.round(Math.max(...values) * 100)}%`;
  $("#signalTrend").textContent = latest > previous + 0.02 ? "Rising" : latest < previous - 0.02 ? "Falling" : "Steady";
}

function renderMidiLeaves() {
  const root = Number(model.state.root ?? 0);
  $$(".midi-leaf").forEach((leaf) => {
    const selected = Number(leaf.dataset.note) === root;
    leaf.classList.toggle("root", selected);
    leaf.setAttribute("aria-checked", String(selected));
    leaf.disabled = !transport.connected || !verified;
  });
}

function padValuesFromPoint(x, y) {
  return Object.fromEntries(PAD_MODES[padMode].map((axis, i) => {
    const value = Math.max(0, Math.min(1, i ? y : x));
    return [axis.key, Number((axis.log ? axis.min * Math.pow(axis.max / axis.min, value) : axis.min + value * (axis.max - axis.min)).toFixed(axis.digits))];
  }));
}

function padPointFromValues(values) {
  return PAD_MODES[padMode].map((axis) => {
    const value = Math.max(axis.min, Number(values[axis.key]) || axis.min);
    return Math.max(0, Math.min(1, axis.log ? Math.log(value / axis.min) / Math.log(axis.max / axis.min) : (value - axis.min) / (axis.max - axis.min)));
  });
}

function paintExpressionPad() {
  const pad = $("#expressionPad");
  const [x, y] = padPointFromValues(model.synth);
  pad.style.setProperty("--pad-x", `${(x * 100).toFixed(2)}%`);
  pad.style.setProperty("--pad-y", `${((1 - y) * 100).toFixed(2)}%`);
  $("#expressionValues").textContent = transport.connected || phoneAudio.presets ? padMode === "tone" ? `${Math.round(Number(model.synth.cutoff) || 80)} Hz / ${Number(model.synth.resonance ?? 0.3).toFixed(1)}` : PAD_MODES[padMode].map((axis) => `${axis.label} ${Number(model.synth[axis.key] ?? axis.min).toFixed(axis.digits)}`).join(" / ") : "Loading sound engine…";
  $(".pad-x-label").textContent = PAD_MODES[padMode][0].label;
  $(".pad-y-label").textContent = PAD_MODES[padMode][1].label;
}

function sendPadValues(values, immediate = false) {
  if (connecting || (transport.connected && !verified)) return;
  pendingPadValues = values;
  Object.assign(model.synth, values);
  applyModelToControls("synth", model.synth);
  paintExpressionPad();
  const send = () => {
    const next = pendingPadValues;
    pendingPadValues = null;
    padSendTimer = null;
    if (!next) return;
    phoneAudio.setParams(model.synth);
    if (!transport.connected) return;
    (async () => { for (const [key, value] of Object.entries(next)) await transport.send(`SET ${key} ${value}`); })().catch(handleError);
  };
  if (immediate) { clearTimeout(padSendTimer); send(); }
  else if (padSendTimer == null) padSendTimer = setTimeout(send, 250);
}

function moveExpressionPad(clientX, clientY) {
  const pad = $("#expressionPad");
  const rect = pad.getBoundingClientRect();
  sendPadValues(padValuesFromPoint((clientX - rect.left) / rect.width, 1 - (clientY - rect.top) / rect.height));
}

function initVisualControls() {
  $("#playgroundMode").addEventListener("change", (event) => {
    if (pendingPadValues) sendPadValues(pendingPadValues, true);
    padMode = event.target.value;
    paintExpressionPad();
    $("#expressionPad").setAttribute("aria-label", `${PAD_MODES[padMode].map((a) => a.label).join(" and ")} trackpad`);
  });
  $$("[data-play-mode]").forEach((button) => button.addEventListener("click", () => scheduleSet("mode", button.dataset.playMode, null, true)));
  const leaves = NOTE_NAMES.map((name, note) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "midi-leaf";
    button.dataset.note = String(note);
    button.setAttribute("role", "radio");
    button.setAttribute("aria-label", `${name} root note`);
    button.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="${LEAF_PATH}"></path></svg><span>${name}</span>`;
    button.addEventListener("click", () => {
      model.state.root = note;
      renderMidiLeaves();
      scheduleSet("root", note, null, true);
    });
    return button;
  });
  $("#midiLeaves").replaceChildren(...leaves);

  const pad = $("#expressionPad");
  pad.addEventListener("pointerdown", (event) => {
    if ((!transport.connected && !phoneAudio.presets) || event.button !== 0 || padPointerId != null) return;
    event.preventDefault();
    padPointerId = event.pointerId;
    pad.setPointerCapture(event.pointerId);
    pad.focus();
    moveExpressionPad(event.clientX, event.clientY);
  });
  pad.addEventListener("pointermove", (event) => { if (event.pointerId === padPointerId) moveExpressionPad(event.clientX, event.clientY); });
  const stop = (event) => {
    if (event.pointerId !== padPointerId) return;
    moveExpressionPad(event.clientX, event.clientY);
    clearTimeout(padSendTimer);
    sendPadValues(pendingPadValues ?? padValuesFromPoint(...padPointFromValues(model.synth)), true);
    padPointerId = null;
  };
  pad.addEventListener("pointerup", stop);
  pad.addEventListener("pointercancel", () => { padPointerId = null; });
  pad.addEventListener("lostpointercapture", () => { padPointerId = null; });
  pad.addEventListener("keydown", (event) => {
    if ((!transport.connected && !phoneAudio.presets) || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const [x, y] = padPointFromValues(model.synth);
    const step = event.shiftKey ? 0.01 : 0.04;
    sendPadValues(padValuesFromPoint(x + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0), y + (event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0)), true);
  });
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
  $("#drumParts").replaceChildren(...["Kick", "Snare", "Closed hat", "Open hat", "Low tom", "High tom", "Ride", "Crash"].map((name, part) => {
    const label = document.createElement("label");
    label.innerHTML = `<input type="checkbox" data-drum-part="${part}" disabled> ${name}`;
    label.querySelector("input").addEventListener("change", () => {
      const mask = $$("[data-drum-part]").reduce((value, input) => value | (input.checked ? 1 << Number(input.dataset.drumPart) : 0), 0);
      model.state.drumsel = mask;
      scheduleSet("drumsel", mask, null, true);
    });
    return label;
  }));
  $("#listenButton").addEventListener("click", async () => {
    const button = $("#listenButton");
    button.disabled = true;
    try { if (phoneAudio.enabled) phoneAudio.stop(); else await startPhoneAudio(); }
    catch (error) { phoneAudio.stop(); handleError(error); }
    finally { button.disabled = false; }
  });
  $("#panicButton").addEventListener("click", () => phoneAudio.panic());
  phoneAudio.addEventListener("statechange", updateAudioStatus);
  phoneAudio.addEventListener("noteschange", () => {
    renderNotes();
    $("#arpReadout").textContent = phoneAudio.arp.chord.length ? `${phoneAudio.arp.chord.map(noteLabel).join(" · ")} — ${phoneAudio.arp.order}` : "Waiting for the next note. Plant energy chooses the chord; signal contour chooses its order.";
  });
  phoneAudio.addEventListener("engineerror", () => handleError(new Error("Audio engine stopped. Reload to restart.")));
  $("#connectButton").addEventListener("click", () => toggleConnection().catch(handleError));
  $("#refreshButton").addEventListener("click", () => Promise.all([request("PARAMS"), request("STATE"), request("SYNTH"), request("PLANT"), request("NOTES")]).then(() => showToast("Device state refreshed.")).catch(handleError));
  $("#muteButton").addEventListener("click", () => scheduleSet("mute", model.state.io_muted ? 0 : 1, null, true));
  $("#testButton").addEventListener("click", async () => {
    try { if (!phoneAudio.enabled) await startPhoneAudio(); phoneAudio.test(); }
    catch (error) { handleError(error); }
  });
  $("#resetPreset").addEventListener("click", () => scheduleSet("preset_reset", 1, null, true));
  $("#randomizeButton").addEventListener("click", () => transport.send("RANDOMIZE").catch(handleError));
  $("#master").addEventListener("pointerdown", () => interaction.add("master"));
  $("#master").addEventListener("pointerup", () => interaction.delete("master"));
  $("#master").addEventListener("input", (event) => {
    $("#masterOutput").textContent = `${Math.round(Number(event.target.value) * 100)}%`;
    scheduleSet("master", event.target.value);
  });
  $("#master").addEventListener("change", (event) => scheduleSet("master", event.target.value, null, true));
  $("#sensitivity").addEventListener("pointerdown", () => interaction.add("sens"));
  $("#sensitivity").addEventListener("pointerup", () => interaction.delete("sens"));
  $("#sensitivity").addEventListener("blur", () => interaction.delete("sens"));
  $("#sensitivity").addEventListener("input", (event) => {
    $("#sensitivityOutput").textContent = Number(event.target.value).toFixed(2);
    scheduleSet("sens", event.target.value);
  });
  $("#sensitivity").addEventListener("change", (event) => scheduleSet("sens", event.target.value, null, true));
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
  const caps = capabilities();
  if (nativeProvider) {
    $("#appleConnectionHelp").hidden = true;
    $("#connectionHelp").hidden = true;
    $(".tablet-link").hidden = true;
    return;
  }
  $("#connectionIssue").addEventListener("change", () => refreshUsbDiagnostics());
  if (!caps.relay) {
    ["#linkOffer", "#linkAnswer", "#linkFinish"].forEach((id) => { $(id).disabled = true; });
    $("#linkStatus").textContent = "The computer link needs WebRTC on HTTPS. Update your browser or open this app in another supported browser.";
  }
  if (!transport.supported) {
    setNotice(`${caps.audio ? "Sound previews are available." : "Update your browser for sound previews."} For live BECA input, open ‘Link an iPad or tablet through a computer’ below${caps.relay ? "." : " in a browser with WebRTC support."} Direct USB requires a browser with WebUSB or Web Serial access; iPad/iPhone browsers cannot use this board’s USB serial adapter.`);
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
  logLine(nativeProvider ? "Opened direct Apple Wi-Fi control and native MIDI." : "Serial port opened at 115200 baud.", "system");
  setUsbCheck("#permissionStatus", "Permission granted", "ok");
  setUsbCheck("#adapterStatus", selectedAdapterLabel(), "ok");
});
transport.addEventListener("remoteconnect", () => {
  $("#connectButton").disabled = false;
  verifyDevice().then(() => {
    $("#connectionMessage").textContent = "Live plant input and controls are linked through your computer.";
    showToast("BECA linked through computer.");
  }).catch(handleError);
});
transport.addEventListener("linkstate", () => {
  if (!transport.remote && transport.usb.connected) {
    if (transport.channel?.readyState === "open") stopPolling();
    else startPolling();
  }
  $("#linkStatus").textContent = transport.channel?.readyState === "open"
    ? "Linked. Keep the computer page open and awake. Tap Listen on the device you want to hear."
    : "Not linked. Use the three steps above on the same local network.";
});
for (const [id, action] of [
  ["linkOffer", () => transport.offer()],
  ["linkAnswer", () => transport.answer($("#linkInput").value)],
  ["linkFinish", () => transport.finish($("#linkInput").value)]
]) {
  $(`#${id}`).addEventListener("click", async () => {
    const button = $(`#${id}`);
    button.disabled = true;
    $("#linkStatus").textContent = "Preparing local connection…";
    try {
      const code = await action();
      if (code) $("#linkOutput").value = code;
      $("#linkStatus").textContent = code ? "Code ready. Copy it to the other device and continue the steps above." : "Connecting… If this does not connect, check both devices are on the same non-isolated network.";
    } catch (error) { $("#linkStatus").textContent = error.message; }
    finally { button.disabled = false; }
  });
}
$("#linkClose").addEventListener("click", () => transport.closeLink());
$("#linkCopy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("#linkOutput").value); showToast("Link code copied."); }
  catch { $("#linkOutput").select(); showToast("Select and copy the code manually."); }
});
transport.addEventListener("sent", (event) => logLine(event.detail, "out"));
transport.addEventListener("line", (event) => receive(event.detail));
transport.addEventListener("transporterror", (event) => handleError(event.detail));
transport.addEventListener("disconnect", () => {
  for (const waiter of pendingReplies.values()) { clearTimeout(waiter.timer); waiter.reject(new Error("BECA disconnected before replying.")); }
  pendingReplies.clear();
  phoneAudio.stop();
  sendTimers.forEach(clearTimeout);
  sendTimers.clear();
  clearTimeout(padSendTimer);
  padSendTimer = null;
  pendingPadValues = null;
  model.notes = {};
  model.plant = {};
  plantSamples = [];
  lastPlantSample = null;
  $("#plantTrace").setAttribute("d", "");
  for (const id of ["signalNow", "signalAverage", "signalLow", "signalHigh"]) $(`#${id}`).textContent = "—";
  $("#signalTrend").textContent = "Waiting";
  verified = false;
  stopPolling();
  setConnectedUi(false);
  logLine("BECA connection closed.", "system");
  refreshUsbDiagnostics();
  renderNotes();
  renderPlant();
});

navigator.usb?.addEventListener?.("connect", () => refreshUsbDiagnostics());
navigator.usb?.addEventListener?.("disconnect", () => refreshUsbDiagnostics());

document.addEventListener("visibilitychange", () => {
  if (document.hidden) phoneAudio.stop();
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
initVisualControls();
renderAllControls();
setConnectedUi(false);
phoneAudio.load().then((presets) => {
  if (!transport.connected) {
    model.params.synth_presets = presets.map((preset) => preset.preset_name);
    model.synth = { ...presets[0] };
  }
  renderAllControls();
  updateAudioStatus();
}).catch((error) => { $("#audioStatus").textContent = error.message; handleError(error); });

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
