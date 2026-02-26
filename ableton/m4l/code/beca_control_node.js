"use strict";

let maxApi;
try {
  maxApi = require("max-api");
} catch (err) {
  maxApi = {
    addHandler: () => {},
    outlet: (...args) => console.log("[outlet]", ...args),
    post: (...args) => console.log("[post]", ...args),
  };
}

const http = require("http");
const https = require("https");
const { URLSearchParams } = require("url");

let SerialPortClass = null;
let ReadlineParserClass = null;
try {
  const serialportPkg = require("serialport");
  SerialPortClass = serialportPkg.SerialPort || serialportPkg;
  ReadlineParserClass = serialportPkg.ReadlineParser || null;
} catch (err) {
  SerialPortClass = null;
  ReadlineParserClass = null;
}

const FALLBACK_PARAMS = {
  modes: ["Notes", "Arpeggiator", "Chords", "Drum Machine"],
  scales: [
    "Major",
    "Minor",
    "Dorian",
    "Lydian",
    "Mixolydian",
    "Pent Minor",
    "Pent Major",
    "Harm Minor",
    "Phrygian",
    "Whole Tone",
    "Maj7",
    "Min7",
    "Dom7",
    "Sus2",
    "Sus4",
  ],
  time_signatures: ["1-1", "2-2", "2-4", "3-4", "4-4", "5-4", "7-4", "6-8", "9-8", "12-8", "4-8", "4-16", "8-32"],
  output_modes: ["BLE", "SERIAL", "AUX OUT"],
  clock_modes: ["Internal", "Plant"],
  synth_presets: ["Fatty Neon Lead", "Prism Poly Lead", "Verdant Pad", "Forest Choir Pad", "Thick Mono Bass", "Rubber Bass"],
  ranges: {
    bpm: [20, 240],
    swing: [0, 60],
    sens: [0, 0.5],
    lo: [1, 9],
    hi: [1, 9],
    rest: [0, 0.8],
    bright: [10, 255],
    cutoff: [20, 18000],
    resonance: [0.1, 10],
    attack: [0, 5],
    decay: [0, 5],
    sustain: [0, 1],
    release: [0.01, 10],
    delay_ms: [0, 800],
    delay_feedback: [0, 0.95],
    delay_mix: [0, 1],
    drive: [0, 1],
    master: [0, 1],
    detune: [0, 8],
    gain_trim: [0.45, 1],
  },
};

const DEFAULT_SYNTH = {
  preset: 0,
  preset_name: "Fatty Neon Lead",
  wave_a: 0,
  wave_b: 1,
  osc_mix: 0.5,
  mono: 1,
  voices: 1,
  attack: 0.03,
  decay: 0.18,
  sustain: 0.72,
  release: 0.2,
  filter: 0,
  cutoff: 6400,
  resonance: 1.0,
  reverb: 0.15,
  delay_ms: 120,
  delay_feedback: 0.2,
  delay_mix: 0.1,
  drive: 0.2,
  master: 0.7,
  detune: 2,
  gain_trim: 0.95,
  drumkit: 0,
};

const runtime = {
  mode: "http",
  ip: "192.168.4.1",
  port: 80,
  autoReconnect: true,
  emitMode: "reemit", // reemit | monitor
  connected: false,
  statePollMs: 250,
  fastPollMs: 40,
  synthPollMs: 700,
  paramsPollMs: 3000,
  stateTimer: null,
  fastTimer: null,
  setTimer: null,
  synthTimer: null,
  paramsTimer: null,
  mockTimer: null,
  pendingSet: [],
  lastSetSentAt: 0,
  lastHttpError: "",
  activeNotes: new Map(),
  serialPortPath: "",
  serialBaud: 115200,
  serialPort: null,
  serialParser: null,
  serialTelemetryEnabled: false,
  serialStatusTicker: 0,
  params: { ...FALLBACK_PARAMS },
  synth: { ...DEFAULT_SYNTH },
  mockState: {
    ver: 0,
    ble: 1,
    midimode: 0,
    outputmode: 0,
    outputname: "BLE",
    io_muted: 0,
    daw_sync: 0,
    daw_lock: 0,
    clock: 0,
    mode: 0,
    scale: 0,
    root: 0,
    bpm: 120,
    swing: 8,
    bright: 154,
    sens: 0.2,
    lo: 3,
    hi: 6,
    fx: 0,
    fxname: "Gradient Flow",
    pal: 0,
    palname: "Rainbow",
    vs: 160,
    vi: 210,
    rest: 0.12,
    nr: 1,
    aux_ready: 1,
    aux_wait_ms: 0,
    ts: "4/4",
    last: "60",
    vel: 96,
    drumsel: 255,
  },
};

function nowMs() {
  return Date.now();
}

function asNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function emitStatus(state, detail) {
  maxApi.outlet(["status", state, detail || ""]);
}

function emitJson(tag, data) {
  maxApi.outlet([tag, JSON.stringify(data || {})]);
}

function emitPlant(data) {
  const value = asNumber(data.value, 0);
  const raw = asNumber(data.raw, 0);
  const raw2 = asNumber(data.raw2, 0);
  maxApi.outlet(["plant", value, raw, raw2]);
}

function emitMidiStatus(payload) {
  const note = asNumber(payload.note, 0);
  const vel = asNumber(payload.vel, 0);
  const ch = asNumber(payload.ch, 1);
  const on = !!payload.on;
  maxApi.outlet(["midi_event", on ? 1 : 0, note, vel, ch]);
}

function emitMidiBytes(on, note, vel, ch) {
  const chan = Math.max(1, Math.min(16, asNumber(ch, 1)));
  const status = (on ? 0x90 : 0x80) | ((chan - 1) & 0x0f);
  const data1 = Math.max(0, Math.min(127, asNumber(note, 0))) & 0x7f;
  const data2 = Math.max(0, Math.min(127, asNumber(vel, 0))) & 0x7f;
  maxApi.outlet(["midi_bytes", status, data1, data2]);
}

function normalizeMode(mode) {
  if (mode === "serial") return "serial";
  if (mode === "mock") return "mock";
  return "http";
}

function safeJsonParse(input) {
  try {
    return JSON.parse(String(input || ""));
  } catch (err) {
    return null;
  }
}

function stopHttpTimers() {
  if (runtime.stateTimer) clearInterval(runtime.stateTimer);
  if (runtime.fastTimer) clearInterval(runtime.fastTimer);
  if (runtime.setTimer) clearInterval(runtime.setTimer);
  if (runtime.synthTimer) clearInterval(runtime.synthTimer);
  if (runtime.paramsTimer) clearInterval(runtime.paramsTimer);
  runtime.stateTimer = null;
  runtime.fastTimer = null;
  runtime.setTimer = null;
  runtime.synthTimer = null;
  runtime.paramsTimer = null;
}

function stopMockTimer() {
  if (runtime.mockTimer) clearInterval(runtime.mockTimer);
  runtime.mockTimer = null;
}

function closeSerialPort() {
  if (runtime.serialParser) {
    try {
      runtime.serialParser.removeAllListeners();
    } catch (err) {
      // no-op
    }
  }
  runtime.serialParser = null;

  if (runtime.serialPort) {
    try {
      runtime.serialPort.removeAllListeners();
      if (runtime.serialPort.isOpen) runtime.serialPort.close();
    } catch (err) {
      // no-op
    }
  }
  runtime.serialPort = null;
}

function stopAllTimers() {
  stopHttpTimers();
  stopMockTimer();
}

function baseUrl() {
  return `http://${runtime.ip}:${runtime.port}`;
}

function requestJson(method, path, formBody, timeoutMs = 1200) {
  const url = new URL(path, baseUrl());
  const transport = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const body = formBody || "";
    const req = transport.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        timeout: timeoutMs,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let payload = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          payload += chunk;
        });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode > 299) {
            reject(new Error(`HTTP ${res.statusCode}: ${payload || "no body"}`));
            return;
          }
          if (!payload) {
            resolve({});
            return;
          }
          const parsed = safeJsonParse(payload);
          if (!parsed) {
            reject(new Error(`Invalid JSON from ${path}: ${payload}`));
            return;
          }
          resolve(parsed);
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error(`Timeout for ${path}`));
    });
    req.on("error", (err) => reject(err));
    if (body.length) req.write(body);
    req.end();
  });
}

function sendSerialTextLine(line) {
  const msg = `${line}\n`;
  if (runtime.serialPort && runtime.serialPort.isOpen) {
    runtime.serialPort.write(msg, (err) => {
      if (err) emitStatus("error", `serial write failed: ${err.message}`);
    });
    return;
  }
  // Fallback path for patches that handle serial I/O themselves.
  maxApi.outlet(["serial_write", line]);
}

function sendSerialControl(command) {
  sendSerialTextLine(`@C ${command}`);
}

function updateParams(paramsLike) {
  runtime.params = {
    ...FALLBACK_PARAMS,
    ...(paramsLike || {}),
    ranges: {
      ...FALLBACK_PARAMS.ranges,
      ...((paramsLike && paramsLike.ranges) || {}),
    },
  };
  emitJson("params", runtime.params);
}

function updateSynth(synthLike) {
  runtime.synth = {
    ...DEFAULT_SYNTH,
    ...(synthLike || {}),
  };
  emitJson("synth", runtime.synth);
}

function flushPendingSetQueue() {
  if (!runtime.pendingSet.length) return;
  const minGapMs = 66; // ~15 updates/sec max
  const waitMs = Math.max(0, minGapMs - (nowMs() - runtime.lastSetSentAt));
  if (waitMs > 0) return;

  const next = runtime.pendingSet.shift();
  runtime.lastSetSentAt = nowMs();

  if (runtime.mode === "serial") {
    sendSerialControl(`SET ${next.key} ${next.value}`);
    return;
  }

  if (runtime.mode === "mock") {
    applyMockParam(next.key, next.value);
    return;
  }

  if (runtime.mode !== "http") return;

  const body = new URLSearchParams({ key: String(next.key), value: String(next.value) }).toString();
  requestJson("POST", "/api/set", body)
    .then((state) => {
      emitJson("state", state);
      runtime.connected = true;
    })
    .catch((err) => {
      runtime.lastHttpError = err.message;
      runtime.connected = false;
      emitStatus("error", err.message);
    });
}

function queueSet(key, value) {
  const deduped = runtime.pendingSet.filter((item) => item.key !== key);
  deduped.push({ key, value });
  runtime.pendingSet = deduped;
}

function applyNotesSnapshot(snapshot) {
  const notes = Array.isArray(snapshot.notes)
    ? snapshot.notes.map((n) => Number(n)).filter((n) => Number.isFinite(n))
    : [];
  const vel = asNumber(snapshot.vel || snapshot.last_vel, 96);
  const ch = 1;

  const nextSet = new Set(notes);
  for (const note of runtime.activeNotes.keys()) {
    if (!nextSet.has(note)) {
      runtime.activeNotes.delete(note);
      if (runtime.emitMode === "reemit") {
        emitMidiBytes(false, note, 0, ch);
      }
      emitMidiStatus({ on: false, note, vel: 0, ch });
    }
  }

  for (const note of notes) {
    if (!runtime.activeNotes.has(note)) {
      runtime.activeNotes.set(note, vel);
      if (runtime.emitMode === "reemit") {
        emitMidiBytes(true, note, vel, ch);
      }
      emitMidiStatus({ on: true, note, vel, ch });
    }
  }

  maxApi.outlet(["note_grid", notes.join(","), vel, ch]);
}

function parseSerialMidiHex(line) {
  const parts = line.trim().split(/\s+/);
  if (parts.length !== 4 || parts[0] !== "@M") return null;
  const status = parseInt(parts[1], 16);
  const data1 = parseInt(parts[2], 16) & 0x7f;
  const data2 = parseInt(parts[3], 16) & 0x7f;
  if (!Number.isFinite(status)) return null;
  const ch = (status & 0x0f) + 1;
  const kind = status & 0xf0;
  if (kind === 0x90 && data2 > 0) return { on: true, note: data1, vel: data2, ch };
  if (kind === 0x80 || (kind === 0x90 && data2 === 0)) return { on: false, note: data1, vel: 0, ch };
  return null;
}

function handleSerialResponse(tag, payloadRaw) {
  if (tag === "STATE") {
    const parsed = safeJsonParse(payloadRaw);
    if (!parsed) {
      emitStatus("warn", `Bad STATE JSON: ${payloadRaw}`);
      return;
    }
    emitJson("state", parsed);
    runtime.connected = true;
    return;
  }

  if (tag === "PARAMS") {
    const parsed = safeJsonParse(payloadRaw);
    if (!parsed) {
      emitStatus("warn", `Bad PARAMS JSON: ${payloadRaw}`);
      return;
    }
    updateParams(parsed);
    runtime.connected = true;
    return;
  }

  if (tag === "SYNTH") {
    const parsed = safeJsonParse(payloadRaw);
    if (!parsed) {
      emitStatus("warn", `Bad SYNTH JSON: ${payloadRaw}`);
      return;
    }
    updateSynth(parsed);
    runtime.connected = true;
    return;
  }

  if (tag === "PLANT") {
    const parsed = safeJsonParse(payloadRaw);
    if (!parsed) {
      emitStatus("warn", `Bad PLANT JSON: ${payloadRaw}`);
      return;
    }
    emitPlant(parsed);
    return;
  }

  if (tag === "NOTES") {
    const parsed = safeJsonParse(payloadRaw);
    if (!parsed) {
      emitStatus("warn", `Bad NOTES JSON: ${payloadRaw}`);
      return;
    }
    applyNotesSnapshot(parsed);
    return;
  }

  if (tag === "SET") {
    const parsed = safeJsonParse(payloadRaw);
    if (parsed && parsed.ok === 0) {
      emitStatus("warn", payloadRaw);
    }
    return;
  }
}

function handleSerialLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return;

  if (trimmed.startsWith("{")) {
    const evt = safeJsonParse(trimmed);
    if (!evt) {
      emitStatus("warn", `Malformed JSON line: ${trimmed}`);
      return;
    }
    if (evt.type === "plant") {
      emitPlant(evt);
      return;
    }
    if (evt.type === "midi") {
      emitMidiStatus(evt);
      if (runtime.emitMode === "reemit") {
        emitMidiBytes(!!evt.on, asNumber(evt.note, 0), asNumber(evt.on ? evt.vel : 0, 0), asNumber(evt.ch, 1));
      }
      return;
    }
    if (evt.type === "state") {
      emitJson("state", evt);
      return;
    }
    if (evt.type === "synth") {
      updateSynth(evt);
      return;
    }
    if (evt.type === "params") {
      updateParams(evt);
      return;
    }
    return;
  }

  if (trimmed.startsWith("@R ")) {
    const firstSpace = trimmed.indexOf(" ", 3);
    if (firstSpace < 0) return;
    const tag = trimmed.substring(3, firstSpace);
    const payload = trimmed.substring(firstSpace + 1).trim();
    handleSerialResponse(tag, payload);
    return;
  }

  if (trimmed.startsWith("@M ")) {
    const evt = parseSerialMidiHex(trimmed);
    if (!evt) return;
    emitMidiStatus(evt);
    if (runtime.emitMode === "reemit") {
      emitMidiBytes(!!evt.on, evt.note, evt.on ? evt.vel : 0, evt.ch);
    }
  }
}

function attachSerialListeners(portObj) {
  portObj.on("error", (err) => {
    emitStatus("error", `serial error: ${err.message}`);
  });

  if (ReadlineParserClass) {
    const parser = portObj.pipe(new ReadlineParserClass({ delimiter: "\n" }));
    parser.on("data", (line) => handleSerialLine(line));
    runtime.serialParser = parser;
  } else {
    let buffer = "";
    portObj.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let idx = buffer.indexOf("\n");
      while (idx >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        handleSerialLine(line);
        idx = buffer.indexOf("\n");
      }
    });
  }
}

function openSerialPort(path, baudRate) {
  return new Promise((resolve, reject) => {
    if (!SerialPortClass) {
      reject(new Error("serialport module missing. Run npm install in ableton/m4l/code"));
      return;
    }

    closeSerialPort();
    const serial = new SerialPortClass({ path, baudRate, autoOpen: false });
    attachSerialListeners(serial);
    serial.open((err) => {
      if (err) {
        reject(err);
        return;
      }
      runtime.serialPort = serial;
      runtime.serialPortPath = path;
      runtime.serialBaud = baudRate;
      resolve();
    });
  });
}

async function listSerialPorts() {
  if (!SerialPortClass || typeof SerialPortClass.list !== "function") {
    emitStatus("warn", "serialport module not available");
    maxApi.outlet(["serial_ports_list"]);
    maxApi.outlet(["serial_ports", JSON.stringify([])]);
    return;
  }

  try {
    const ports = await SerialPortClass.list();
    const list = ports.map((p) => p.path);
    maxApi.outlet(["serial_ports_list", ...list]);
    maxApi.outlet(["serial_ports", JSON.stringify(list)]);
  } catch (err) {
    emitStatus("error", `serial list failed: ${err.message}`);
    maxApi.outlet(["serial_ports_list"]);
    maxApi.outlet(["serial_ports", JSON.stringify([])]);
  }
}

async function pollHttpState() {
  if (runtime.mode !== "http") return;
  try {
    const state = await requestJson("GET", "/api/state", "");
    emitJson("state", state);
    runtime.connected = true;
    emitStatus("connected", `${runtime.ip}:${runtime.port}`);
  } catch (err) {
    runtime.connected = false;
    runtime.lastHttpError = err.message;
    emitStatus("error", err.message);
    if (!runtime.autoReconnect) stopHttpTimers();
  }
}

async function pollHttpFast() {
  if (runtime.mode !== "http") return;
  try {
    const [plant, notes] = await Promise.all([requestJson("GET", "/api/plant", ""), requestJson("GET", "/api/notes", "")]);
    emitPlant(plant);
    applyNotesSnapshot(notes);
    runtime.connected = true;
  } catch (err) {
    runtime.connected = false;
    runtime.lastHttpError = err.message;
    emitStatus("error", err.message);
    if (!runtime.autoReconnect) stopHttpTimers();
  }
}

async function pollHttpParams() {
  if (runtime.mode !== "http") return;
  try {
    const params = await requestJson("GET", "/api/params", "");
    updateParams(params);
  } catch (err) {
    emitStatus("warn", `params unavailable: ${err.message}`);
  }
}

async function pollHttpSynth() {
  if (runtime.mode !== "http") return;
  try {
    const synth = await requestJson("GET", "/api/synth", "");
    updateSynth(synth);
  } catch (err) {
    emitStatus("warn", `synth unavailable: ${err.message}`);
  }
}

function beginHttpMode() {
  stopAllTimers();
  runtime.mode = "http";
  runtime.connected = false;
  runtime.stateTimer = setInterval(pollHttpState, runtime.statePollMs);
  runtime.fastTimer = setInterval(pollHttpFast, runtime.fastPollMs);
  runtime.paramsTimer = setInterval(pollHttpParams, runtime.paramsPollMs);
  runtime.synthTimer = setInterval(pollHttpSynth, runtime.synthPollMs);
  runtime.setTimer = setInterval(flushPendingSetQueue, 25);
  pollHttpState();
  pollHttpFast();
  pollHttpParams();
  pollHttpSynth();
}

function serialSnapshotTick() {
  runtime.serialStatusTicker += 1;
  sendSerialControl("STATE");
  if ((runtime.serialStatusTicker % 10) === 1) sendSerialControl("PARAMS");
  if ((runtime.serialStatusTicker % 6) === 2) sendSerialControl("SYNTH");
}

async function beginSerialMode(path, baudRate) {
  stopAllTimers();
  runtime.mode = "serial";
  runtime.serialStatusTicker = 0;

  if (path && path.length) {
    try {
      await openSerialPort(path, baudRate || 115200);
      emitStatus("connected", `${path} @ ${baudRate || 115200}`);
    } catch (err) {
      runtime.connected = false;
      emitStatus("error", `serial open failed: ${err.message}`);
      return;
    }
  }

  runtime.connected = true;
  runtime.stateTimer = setInterval(serialSnapshotTick, runtime.statePollMs);
  runtime.fastTimer = setInterval(() => {
    sendSerialControl("PLANT");
    sendSerialControl("NOTES");
  }, runtime.fastPollMs);
  runtime.synthTimer = setInterval(() => sendSerialControl("SYNTH"), runtime.synthPollMs);
  runtime.paramsTimer = setInterval(() => sendSerialControl("PARAMS"), runtime.paramsPollMs);
  runtime.setTimer = setInterval(flushPendingSetQueue, 25);

  sendSerialControl("STATE");
  sendSerialControl("PARAMS");
  sendSerialControl("SYNTH");
  sendSerialControl("PLANT");
  sendSerialControl("NOTES");
  if (runtime.serialTelemetryEnabled) sendSerialControl("TELEMETRY 1");
  emitStatus("connected", path ? `serial ${path}` : "serial (external patch transport)");
}

function applyMockParam(key, value) {
  const k = String(key || "").toLowerCase();
  const v = String(value || "");
  const state = runtime.mockState;
  const synth = runtime.synth;

  const intV = Math.round(Number(v));
  const floatV = Number(v);

  if (k === "bpm") state.bpm = Math.max(20, Math.min(240, Number.isFinite(intV) ? intV : state.bpm));
  else if (k === "swing") state.swing = Math.max(0, Math.min(60, Number.isFinite(intV) ? intV : state.swing));
  else if (k === "scale") state.scale = Math.max(0, Math.min(14, Number.isFinite(intV) ? intV : state.scale));
  else if (k === "root") state.root = Math.max(0, Math.min(11, Number.isFinite(intV) ? intV : state.root));
  else if (k === "mode") state.mode = Math.max(0, Math.min(3, Number.isFinite(intV) ? intV : state.mode));
  else if (k === "clock") state.clock = Math.max(0, Math.min(1, Number.isFinite(intV) ? intV : state.clock));
  else if (k === "lo") state.lo = Math.max(1, Math.min(9, Number.isFinite(intV) ? intV : state.lo));
  else if (k === "hi") state.hi = Math.max(1, Math.min(9, Number.isFinite(intV) ? intV : state.hi));
  else if (k === "fx") state.fx = Math.max(0, Math.min(9, Number.isFinite(intV) ? intV : state.fx));
  else if (k === "pal") state.pal = Math.max(0, Math.min(20, Number.isFinite(intV) ? intV : state.pal));
  else if (k === "vs") state.vs = Math.max(0, Math.min(255, Number.isFinite(intV) ? intV : state.vs));
  else if (k === "vi") state.vi = Math.max(0, Math.min(255, Number.isFinite(intV) ? intV : state.vi));
  else if (k === "bright") state.bright = Math.max(10, Math.min(255, Number.isFinite(intV) ? intV : state.bright));
  else if (k === "rest") state.rest = Math.max(0, Math.min(0.8, Number.isFinite(floatV) ? floatV : state.rest));
  else if (k === "sens") state.sens = Math.max(0, Math.min(0.5, Number.isFinite(floatV) ? floatV : state.sens));
  else if (k === "nr") state.nr = intV ? 1 : 0;
  else if (k === "mute" || k === "io_muted") state.io_muted = intV ? 1 : 0;
  else if (k === "sync" || k === "daw_sync") state.daw_sync = intV ? 1 : 0;
  else if (k === "outputmode") {
    state.outputmode = Math.max(0, Math.min(2, Number.isFinite(intV) ? intV : state.outputmode));
    state.outputname = state.outputmode === 0 ? "BLE" : state.outputmode === 1 ? "SERIAL" : "AUX";
  }
  else if (k === "drumsel") state.drumsel = Math.max(0, Math.min(255, Number.isFinite(intV) ? intV : state.drumsel));
  else if (k in synth) {
    synth[k] = Number.isFinite(floatV) ? floatV : v;
  }

  state.ver = (Number(state.ver) || 0) + 1;
  emitJson("state", state);
  updateSynth(synth);
}

function beginMockMode() {
  stopAllTimers();
  runtime.mode = "mock";
  runtime.connected = true;
  runtime.activeNotes.clear();
  updateParams(FALLBACK_PARAMS);
  updateSynth(runtime.synth);

  runtime.mockTimer = setInterval(() => {
    const t = nowMs() / 1000;
    const value = 0.5 + 0.45 * Math.sin(t * 1.7);
    const raw = Math.floor(800 + value * 2500);
    emitPlant({ value, raw, raw2: raw + 32 });

    if (Math.random() < 0.1) {
      const note = 48 + Math.floor(Math.random() * 24);
      const vel = 70 + Math.floor(Math.random() * 56);
      const ch = 1;
      if (runtime.emitMode === "reemit") {
        emitMidiBytes(true, note, vel, ch);
        setTimeout(() => emitMidiBytes(false, note, 0, ch), 160 + Math.floor(Math.random() * 220));
      }
      emitMidiStatus({ on: true, note, vel, ch });
      runtime.mockState.last = String(note);
      runtime.mockState.vel = vel;
      maxApi.outlet(["note_grid", String(note), vel, ch]);
    }

    runtime.mockState.ver += 1;
    emitJson("state", runtime.mockState);
  }, runtime.fastPollMs);

  runtime.setTimer = setInterval(flushPendingSetQueue, 25);
  emitStatus("connected", "mock");
}

function disconnectAll() {
  stopAllTimers();
  closeSerialPort();
  runtime.connected = false;
  runtime.pendingSet = [];
  runtime.activeNotes.clear();
  emitStatus("disconnected", "");
}

maxApi.addHandler("connect_http", (ip, port) => {
  runtime.ip = String(ip || runtime.ip).trim() || runtime.ip;
  runtime.port = Math.max(1, Number(port || runtime.port) || runtime.port);
  beginHttpMode();
});

maxApi.addHandler("connect_serial", (port, baud) => {
  const path = String(port || "").trim();
  const baudRate = Number(baud || runtime.serialBaud || 115200);
  beginSerialMode(path, baudRate);
});

maxApi.addHandler("list_serial_ports", () => {
  listSerialPorts();
});

maxApi.addHandler("connect_mock", () => {
  beginMockMode();
});

maxApi.addHandler("disconnect", () => {
  disconnectAll();
});

maxApi.addHandler("set_mode", (mode) => {
  const next = normalizeMode(String(mode || "http").toLowerCase());
  if (next === "serial") beginSerialMode(runtime.serialPortPath, runtime.serialBaud);
  else if (next === "mock") beginMockMode();
  else beginHttpMode();
});

maxApi.addHandler("set_auto_reconnect", (flag) => {
  runtime.autoReconnect = Number(flag || 0) !== 0;
});

maxApi.addHandler("set_emit_mode", (mode) => {
  const next = String(mode || "reemit").toLowerCase();
  runtime.emitMode = next === "monitor" ? "monitor" : "reemit";
});

maxApi.addHandler("set_param", (key, value) => {
  if (typeof key === "undefined") return;
  queueSet(String(key), String(value));
});

maxApi.addHandler("manual_note", (on, note, vel, ch) => {
  const active = Number(on || 0) !== 0;
  const midiNote = asNumber(note, 60);
  const midiVel = asNumber(vel, active ? 100 : 0);
  const midiCh = asNumber(ch, 1);
  emitMidiStatus({ on: active, note: midiNote, vel: midiVel, ch: midiCh });
  emitMidiBytes(active, midiNote, midiVel, midiCh);
});

maxApi.addHandler("serial_line", (line) => {
  // Optional external serial ingest path.
  handleSerialLine(line);
});

maxApi.addHandler("request_state", () => {
  if (runtime.mode === "serial") sendSerialControl("STATE");
  else if (runtime.mode === "http") pollHttpState();
  else if (runtime.mode === "mock") emitJson("state", runtime.mockState);
});

maxApi.addHandler("request_fast", () => {
  if (runtime.mode === "serial") {
    sendSerialControl("PLANT");
    sendSerialControl("NOTES");
  } else if (runtime.mode === "http") {
    pollHttpFast();
  }
});

maxApi.addHandler("request_params", () => {
  if (runtime.mode === "serial") sendSerialControl("PARAMS");
  else if (runtime.mode === "http") pollHttpParams();
  else emitJson("params", runtime.params);
});

maxApi.addHandler("request_synth", () => {
  if (runtime.mode === "serial") sendSerialControl("SYNTH");
  else if (runtime.mode === "http") pollHttpSynth();
  else emitJson("synth", runtime.synth);
});

maxApi.addHandler("enable_serial_telemetry", (flag) => {
  runtime.serialTelemetryEnabled = Number(flag || 0) !== 0;
  if (runtime.mode === "serial") {
    sendSerialControl(`TELEMETRY ${runtime.serialTelemetryEnabled ? 1 : 0}`);
  }
});

updateParams(FALLBACK_PARAMS);
updateSynth(DEFAULT_SYNTH);
emitStatus("ready", "beca_control_node loaded");
