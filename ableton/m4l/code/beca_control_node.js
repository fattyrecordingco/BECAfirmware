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
const os = require("os");
const dns = require("dns");
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
  ip: "beca-blk.local",
  deviceName: "beca-blk",
  port: 80,
  autoReconnect: true,
  emitMode: "monitor", // monitor | reemit
  connected: false,
  httpLegacy: false,
  legacySseReq: null,
  legacySseRes: null,
  legacySseBuffer: "",
  legacySseEvent: "message",
  legacySseData: [],
  legacySseRestartTimer: null,
  lastConnectedHost: "",
  lastStatusToken: "",
  infoTick: 0,
  statePollMs: 500,
  fastPollMs: 140,
  synthPollMs: 2500,
  paramsPollMs: 3000,
  discoveryCooldownMs: 1200,
  discoveryTimeoutMs: 950,
  stateTimer: null,
  fastTimer: null,
  setTimer: null,
  setStateSyncTimer: null,
  synthTimer: null,
  paramsTimer: null,
  mockTimer: null,
  discoveryTimer: null,
  discoveryInFlight: false,
  lastDiscoveryAt: 0,
  pollInFlight: {
    state: false,
    fast: false,
    params: false,
    synth: false,
  },
  pendingSet: [],
  setInFlight: false,
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

function normalizeHostValue(input) {
  let host = String(input || "").trim();
  if (!host) return "";

  if (host.startsWith("http://")) host = host.substring(7);
  else if (host.startsWith("https://")) host = host.substring(8);

  const slashIdx = host.indexOf("/");
  if (slashIdx >= 0) host = host.substring(0, slashIdx);

  const colonIdx = host.indexOf(":");
  if (colonIdx >= 0) host = host.substring(0, colonIdx);

  return host.trim();
}

function normalizeDeviceName(input) {
  let name = String(input || "").trim();
  if (!name) return "";
  if (name.endsWith(".local")) name = name.slice(0, -6);
  return name.trim();
}

function isPrivateIpv4(ip) {
  const parts = String(ip || "").split(".").map((v) => Number(v));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return false;
}

function isIpv4Host(host) {
  const parts = String(host || "").split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    const n = Number(part);
    return Number.isInteger(n) && n >= 0 && n <= 255;
  });
}

function buildDiscoveryCandidates(ipHints) {
  const candidates = [];
  const seen = new Set();
  const add = (value) => {
    const host = normalizeHostValue(value);
    if (!host || seen.has(host)) return;
    seen.add(host);
    candidates.push(host);
  };

  add(runtime.lastConnectedHost);
  add(runtime.ip);

  if (Array.isArray(ipHints)) {
    ipHints.forEach((hint) => add(hint));
  }

  const name = normalizeDeviceName(runtime.deviceName);
  if (name) {
    add(name);
    add(`${name}.local`);
  }

  // Common defaults / aliases.
  add("beca.local");
  add("beca");
  add("beca-blk.local");
  add("beca-blk");
  add("192.168.0.11");
  add("192.168.4.1");

  // Best-effort subnet probing for zero-config DHCP networks.
  const interfaces = os.networkInterfaces ? os.networkInterfaces() : {};
  const prefixes = new Set();
  Object.keys(interfaces || {}).forEach((ifaceName) => {
    const list = interfaces[ifaceName] || [];
    list.forEach((entry) => {
      if (!entry || entry.internal) return;
      const family = String(entry.family || "");
      if (family !== "IPv4" && family !== "4") return;
      if (!isPrivateIpv4(entry.address)) return;
      const parts = String(entry.address).split(".");
      if (parts.length !== 4) return;
      prefixes.add(`${parts[0]}.${parts[1]}.${parts[2]}`);
    });
  });

  const subnetSweep = [1, 2, 3, 4, 5, 8, 10, 11, 12, 16, 20, 24, 30, 40, 50, 64, 80, 96, 100, 120, 150, 180, 200];
  for (const prefix of prefixes) {
    for (const host of subnetSweep) add(`${prefix}.${host}`);
  }

  // Fallback scanning in case Max's networkInterfaces() is incomplete.
  const fallbackPrefixes = ["192.168.0", "192.168.1", "192.168.4"];
  fallbackPrefixes.forEach((prefix) => {
    [1, 2, 4, 8, 10, 11, 20, 24, 40, 50, 80, 100].forEach((host) => add(`${prefix}.${host}`));
  });

  return candidates;
}

function resolveHostIpv4(host, timeoutMs = 420) {
  const safeHost = normalizeHostValue(host);
  if (!safeHost.length) return Promise.resolve("");
  if (isIpv4Host(safeHost)) return Promise.resolve(safeHost);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(normalizeHostValue(value || ""));
    };
    const timer = setTimeout(() => finish(""), Math.max(180, Number(timeoutMs) || 420));
    dns.lookup(safeHost, { family: 4 }, (err, address) => {
      clearTimeout(timer);
      if (err || !address) {
        finish("");
        return;
      }
      finish(address);
    });
  });
}

async function discoveryIpHints() {
  const out = [];
  const seen = new Set();
  const add = (value) => {
    const ip = normalizeHostValue(value);
    if (!ip.length || seen.has(ip)) return;
    seen.add(ip);
    out.push(ip);
  };

  const name = normalizeDeviceName(runtime.deviceName);
  const localName = name ? `${name}.local` : "";
  const names = [runtime.ip, runtime.lastConnectedHost, localName, "beca-blk.local", "beca.local"];

  for (const host of names) {
    const safeHost = normalizeHostValue(host);
    if (!safeHost.length) continue;
    if (isIpv4Host(safeHost)) {
      add(safeHost);
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const resolved = await resolveHostIpv4(safeHost, 380);
    if (resolved.length) add(resolved);
  }

  return out;
}

function looksLikeBecaState(payload) {
  if (!payload || typeof payload !== "object") return false;
  const keys = ["mode", "scale", "root", "bpm", "outputmode"];
  let score = 0;
  keys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(payload, key)) score += 1;
  });
  return score >= 3;
}

function looksLikeBecaInfo(payload) {
  if (!payload || typeof payload !== "object") return false;
  const maybeName = String(payload.name || "").toLowerCase();
  const hasIp = !!normalizeHostValue(payload.ip || "");
  const hasMode = typeof payload.mode !== "undefined";
  const hasMidiMode = typeof payload.midimode !== "undefined";
  const hasOutput = typeof payload.outputmode !== "undefined";
  if (maybeName.includes("beca") && hasIp) return true;
  if (hasIp && hasMode && (hasMidiMode || hasOutput)) return true;
  return false;
}

function emitStatus(state, detail) {
  const token = `${String(state || "")}|${String(detail || "")}`;
  if (runtime.lastStatusToken === token) return;
  runtime.lastStatusToken = token;
  maxApi.outlet(["status", state, detail || ""]);
  emitTarget();
}

function postDebug(line) {
  try {
    maxApi.post(`[BECA] ${String(line || "")}`);
  } catch (err) {
    // no-op in non-Max test environments
  }
}

function emitTarget() {
  maxApi.outlet([
    "target",
    String(runtime.ip || ""),
    String(runtime.port || ""),
    String(runtime.deviceName || ""),
    runtime.connected ? 1 : 0,
    String(runtime.lastConnectedHost || ""),
    String(runtime.mode || ""),
  ]);
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

function clearLegacySseRestartTimer() {
  if (runtime.legacySseRestartTimer) clearTimeout(runtime.legacySseRestartTimer);
  runtime.legacySseRestartTimer = null;
}

function stopLegacyEventStream() {
  clearLegacySseRestartTimer();
  runtime.legacySseBuffer = "";
  runtime.legacySseEvent = "message";
  runtime.legacySseData = [];

  if (runtime.legacySseRes) {
    try {
      runtime.legacySseRes.removeAllListeners();
      runtime.legacySseRes.destroy();
    } catch (err) {
      // no-op
    }
  }
  runtime.legacySseRes = null;

  if (runtime.legacySseReq) {
    try {
      runtime.legacySseReq.removeAllListeners();
      runtime.legacySseReq.destroy();
    } catch (err) {
      // no-op
    }
  }
  runtime.legacySseReq = null;
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
  stopLegacyEventStream();
  runtime.setInFlight = false;
  if (runtime.setStateSyncTimer) clearTimeout(runtime.setStateSyncTimer);
  runtime.setStateSyncTimer = null;
  if (runtime.discoveryTimer) clearTimeout(runtime.discoveryTimer);
  runtime.discoveryTimer = null;
  runtime.discoveryInFlight = false;
  runtime.pollInFlight.state = false;
  runtime.pollInFlight.fast = false;
  runtime.pollInFlight.params = false;
  runtime.pollInFlight.synth = false;
}

function requestJsonTarget(host, port, method, path, formBody, timeoutMs = 1200) {
  const safeHost = normalizeHostValue(host) || runtime.ip;
  const safePort = Math.max(1, Number(port || runtime.port) || runtime.port);
  const url = new URL(path, `http://${safeHost}:${safePort}`);
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

function requestJson(method, path, formBody, timeoutMs = 1200) {
  return requestJsonTarget(runtime.ip, runtime.port, method, path, formBody, timeoutMs);
}

function requestTextTarget(host, port, method, path, formBody, timeoutMs = 1200) {
  const safeHost = normalizeHostValue(host) || runtime.ip;
  const safePort = Math.max(1, Number(port || runtime.port) || runtime.port);
  const url = new URL(path, `http://${safeHost}:${safePort}`);
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
          resolve(payload || "");
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

function requestText(method, path, formBody, timeoutMs = 1200) {
  return requestTextTarget(runtime.ip, runtime.port, method, path, formBody, timeoutMs);
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

function legacyFlag(value) {
  return Number(value || 0) !== 0 ? 1 : 0;
}

function buildLegacyGetPath(key, value) {
  const k = String(key || "").toLowerCase();
  const v = String(value || "");
  const n = Math.round(Number(v));
  const f = Number(v);

  if (k === "mode") return `/mode?i=${Math.max(0, Math.min(3, Number.isFinite(n) ? n : 0))}`;
  if (k === "clock") return `/clock?v=${Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0))}`;
  if (k === "scale") return `/scale?i=${Math.max(0, Math.min(14, Number.isFinite(n) ? n : 0))}`;
  if (k === "root") return `/root?semi=${Math.max(0, Math.min(11, Number.isFinite(n) ? n : 0))}`;
  if (k === "bpm") return `/bpm?v=${Math.max(20, Math.min(240, Number.isFinite(n) ? n : 120))}`;
  if (k === "swing") return `/swing?v=${Math.max(0, Math.min(60, Number.isFinite(n) ? n : 0))}`;
  if (k === "bright") return `/b?v=${Math.max(10, Math.min(255, Number.isFinite(n) ? n : 154))}`;
  if (k === "sens") return `/s?v=${Number.isFinite(f) ? f : 0.2}`;
  if (k === "lo") return `/lo?v=${Math.max(1, Math.min(9, Number.isFinite(n) ? n : 3))}`;
  if (k === "hi") return `/hi?v=${Math.max(1, Math.min(9, Number.isFinite(n) ? n : 6))}`;
  if (k === "fx") return `/fxset?i=${Math.max(0, Math.min(9, Number.isFinite(n) ? n : 0))}`;
  if (k === "pal") return `/pal?i=${Math.max(0, Math.min(31, Number.isFinite(n) ? n : 0))}`;
  if (k === "vs") return `/visspd?v=${Math.max(0, Math.min(255, Number.isFinite(n) ? n : 160))}`;
  if (k === "vi") return `/visint?v=${Math.max(0, Math.min(255, Number.isFinite(n) ? n : 200))}`;
  if (k === "rest") return `/rest?v=${Math.max(0, Math.min(0.8, Number.isFinite(f) ? f : 0.12))}`;
  if (k === "nr") return `/norep?v=${legacyFlag(v)}`;
  if (k === "ts") return `/ts?v=${encodeURIComponent(String(v).replace("/", "-"))}`;
  if (k === "drumsel") return `/drumsel?mask=${Math.max(0, Math.min(255, Number.isFinite(n) ? n : 255))}`;
  return "";
}

function isSynthSetKey(key) {
  const k = String(key || "").toLowerCase();
  if (k === "preset_reset") return true;
  if (Object.prototype.hasOwnProperty.call(DEFAULT_SYNTH, k)) return true;
  return false;
}

function scheduleLegacySseRestart(reason, delayMs = 800) {
  if (runtime.mode !== "http" || !runtime.httpLegacy || !runtime.autoReconnect) return;
  clearLegacySseRestartTimer();
  runtime.legacySseRestartTimer = setTimeout(() => {
    runtime.legacySseRestartTimer = null;
    if (runtime.mode !== "http" || !runtime.httpLegacy) return;
    emitStatus("connecting", reason || "restarting event stream");
    startLegacyEventStream();
  }, Math.max(0, Number(delayMs) || 0));
}

function dispatchLegacySseEvent(eventName, dataPayload) {
  const name = String(eventName || "message").trim().toLowerCase();
  const data = String(dataPayload || "");

  if (name === "hello") {
    runtime.connected = true;
    runtime.lastConnectedHost = runtime.ip;
    emitTarget();
    emitStatus("connected", `${runtime.ip}:${runtime.port}`);
    return;
  }

  if (name === "state") {
    const parsed = safeJsonParse(data);
    if (!parsed) return;
    emitJson("state", parsed);
    runtime.connected = true;
    runtime.lastConnectedHost = runtime.ip;
    emitTarget();
    return;
  }

  if (name === "scope") {
    const cleaned = String(data).trim().replace(/[^0-9eE+\-.]/g, "");
    if (!cleaned.length) return;
    const val = Number(cleaned);
    if (!Number.isFinite(val)) return;
    emitPlant({ value: val, raw: 0, raw2: 0 });
    return;
  }

  if (name === "note") {
    const parts = data.split("|");
    const held = Number(parts[0] || 0) === 1;
    const vel = asNumber(parts[1] || 96, 96);
    const csv = String(parts[3] || "").trim();
    const notes = csv.length
      ? csv
          .split(",")
          .map((x) => Number(x))
          .filter((x) => Number.isFinite(x))
      : [];
    applyNotesSnapshot({ notes: held ? notes : [], vel });
    return;
  }
}

function handleLegacySseLine(rawLine) {
  const line = String(rawLine || "").replace(/\r$/, "");
  if (!line.length) {
    const payload = runtime.legacySseData.join("\n");
    if (payload.length || runtime.legacySseEvent !== "message") {
      dispatchLegacySseEvent(runtime.legacySseEvent, payload);
    }
    runtime.legacySseEvent = "message";
    runtime.legacySseData = [];
    return;
  }
  if (line.startsWith("event:")) {
    runtime.legacySseEvent = line.substring(6).trim() || "message";
    return;
  }
  if (line.startsWith("data:")) {
    runtime.legacySseData.push(line.substring(5).trim());
  }
}

function startLegacyEventStream() {
  if (runtime.mode !== "http" || !runtime.httpLegacy) return;
  if (runtime.legacySseReq || runtime.legacySseRes) return;

  const host = normalizeHostValue(runtime.ip) || normalizeHostValue(runtime.lastConnectedHost);
  if (!host) return;
  const port = Math.max(1, Number(runtime.port || 80) || 80);
  const url = new URL("/events", `http://${host}:${port}`);
  const transport = url.protocol === "https:" ? https : http;

  const req = transport.request(
    {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: "GET",
      timeout: 2500,
      headers: {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      },
    },
    (res) => {
      if (res.statusCode < 200 || res.statusCode > 299) {
        emitStatus("warn", `events unavailable: HTTP ${res.statusCode}`);
        try {
          res.resume();
        } catch (err) {
          // no-op
        }
        runtime.legacySseReq = null;
        runtime.legacySseRes = null;
        scheduleLegacySseRestart("events retry", 1200);
        return;
      }

      runtime.legacySseReq = req;
      runtime.legacySseRes = res;
      runtime.connected = true;
      runtime.lastConnectedHost = runtime.ip;
      emitTarget();

      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        runtime.legacySseBuffer += String(chunk || "");
        let idx = runtime.legacySseBuffer.indexOf("\n");
        while (idx >= 0) {
          const line = runtime.legacySseBuffer.slice(0, idx);
          runtime.legacySseBuffer = runtime.legacySseBuffer.slice(idx + 1);
          handleLegacySseLine(line);
          idx = runtime.legacySseBuffer.indexOf("\n");
        }
      });

      const onStreamClose = () => {
        runtime.legacySseReq = null;
        runtime.legacySseRes = null;
        runtime.legacySseBuffer = "";
        if (runtime.mode === "http" && runtime.httpLegacy) {
          scheduleLegacySseRestart("events reconnect", 900);
        }
      };

      res.on("end", onStreamClose);
      res.on("close", onStreamClose);
      res.on("error", () => {
        onStreamClose();
      });
    }
  );

  req.on("timeout", () => {
    req.destroy(new Error("events timeout"));
  });
  req.on("error", (err) => {
    runtime.legacySseReq = null;
    runtime.legacySseRes = null;
    runtime.connected = false;
    emitTarget();
    emitStatus("warn", `events error: ${err.message}`);
    scheduleLegacySseRestart("events retry", 1200);
  });
  req.end();
}

function enableLegacyHttpMode(reason) {
  if (runtime.mode !== "http") return;
  if (runtime.httpLegacy) return;
  runtime.httpLegacy = true;
  if (runtime.stateTimer) clearInterval(runtime.stateTimer);
  if (runtime.fastTimer) clearInterval(runtime.fastTimer);
  if (runtime.paramsTimer) clearInterval(runtime.paramsTimer);
  runtime.stateTimer = null;
  runtime.fastTimer = null;
  runtime.paramsTimer = null;
  emitStatus("warn", reason || "legacy HTTP profile active");
  startLegacyEventStream();
  refreshHttpInfo();
  pollHttpSynth();
}

async function sendLegacySet(key, value) {
  const k = String(key || "").toLowerCase();
  const v = String(value || "");

  if (k === "outputmode") {
    const body = new URLSearchParams({ mode: v }).toString();
    const response = await requestJson("POST", "/api/outputmode", body, 1200);
    if (typeof response.value !== "undefined") {
      emitJson("state", { outputmode: asNumber(response.value, 0) });
    }
    return;
  }

  if (k === "mute" || k === "io_muted") {
    const body = new URLSearchParams({ v: String(legacyFlag(v)) }).toString();
    const response = await requestJson("POST", "/api/mute", body, 1200);
    if (typeof response.io_muted !== "undefined") {
      emitJson("state", { io_muted: asNumber(response.io_muted, 0) });
    }
    return;
  }

  if (k === "sync" || k === "daw_sync") {
    const body = new URLSearchParams({ v: String(legacyFlag(v)) }).toString();
    await requestJson("POST", "/api/sync", body, 1200);
    return;
  }

  if (isSynthSetKey(k)) {
    const patch = new URLSearchParams();
    if (k === "preset_reset") patch.set("reset", legacyFlag(v) ? "1" : "0");
    else patch.set(k, v);
    const synth = await requestJson("POST", "/api/synth", patch.toString(), 1200);
    updateSynth(synth);
    return;
  }

  const path = buildLegacyGetPath(k, v);
  if (path.length) {
    await requestText("GET", path, "", 1200);
    return;
  }

  const body = new URLSearchParams({ key: String(k), value: String(v) }).toString();
  await requestJson("POST", "/api/set", body, 1200);
}

function flushPendingSetQueue() {
  if (runtime.setInFlight) return;
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

  runtime.setInFlight = true;
  sendLegacySet(next.key, next.value)
    .then(() => {
      // Keep modern polling flow active while writing through legacy-style endpoints.
      finalizeSetSuccess(next, null, false);
    })
    .catch((legacyErr) => {
      const legacyMsg = String((legacyErr && legacyErr.message) || legacyErr || "legacy set failed");
      postDebug(`set legacy failed key=${next.key} value=${next.value} err=${legacyMsg}`);
      if (runtime.httpLegacy) {
        handleSetFailure(next, legacyErr, true);
        return;
      }

      // Last resort: try modern /api/set path for unknown/new keys.
      const body = new URLSearchParams({ key: String(next.key), value: String(next.value) }).toString();
      requestJson("POST", "/api/set", body)
        .then((state) => {
          postDebug(`set modern fallback ok key=${next.key} value=${next.value}`);
          finalizeSetSuccess(next, state, false);
        })
        .catch((modernErr) => {
          const modernMsg = String((modernErr && modernErr.message) || modernErr || "modern set failed");
          postDebug(`set modern fallback failed key=${next.key} err=${modernMsg}`);
          handleSetFailure(next, `legacy:${legacyMsg} | modern:${modernMsg}`, false);
        });
    });
}

function queueSet(key, value) {
  const deduped = runtime.pendingSet.filter((item) => item.key !== key);
  deduped.push({ key, value, attempts: 0 });
  runtime.pendingSet = deduped;
}

function scheduleSetStateSync(delayMs = 110) {
  if (runtime.mode !== "http") return;
  if (runtime.httpLegacy) return;
  if (runtime.setStateSyncTimer) clearTimeout(runtime.setStateSyncTimer);
  runtime.setStateSyncTimer = setTimeout(() => {
    runtime.setStateSyncTimer = null;
    pollHttpState();
  }, Math.max(40, Number(delayMs) || 110));
}

function isRetryableSetError(messageLike) {
  const msg = String(messageLike || "");
  if (!msg.length) return true;
  if (
    msg.startsWith("HTTP 400")
    || msg.startsWith("HTTP 401")
    || msg.startsWith("HTTP 403")
    || msg.startsWith("HTTP 404")
    || msg.startsWith("HTTP 409")
    || msg.startsWith("HTTP 422")
  ) {
    return false;
  }
  const low = msg.toLowerCase();
  if (low.includes("timeout")) return true;
  if (low.includes("socket")) return true;
  if (low.includes("econn")) return true;
  if (low.includes("enotfound")) return true;
  if (low.includes("ehostunreach")) return true;
  if (low.includes("network")) return true;
  if (low.includes("invalid json from /api/set")) return true;
  if (low.includes("http 429")) return true;
  if (low.includes("http 500")) return true;
  if (low.includes("http 502")) return true;
  if (low.includes("http 503")) return true;
  if (low.includes("http 504")) return true;
  return true;
}

function requeueSet(next, reason, legacyMode) {
  const attempts = Math.max(0, Number(next && next.attempts) || 0) + 1;
  if (attempts > 4) {
    emitStatus("error", `set ${next.key} failed: ${String(reason || "unknown")}`);
    return;
  }
  runtime.pendingSet.unshift({
    key: String(next.key),
    value: String(next.value),
    attempts,
  });
  if (runtime.mode === "http" && runtime.autoReconnect && !runtime.connected) {
    const backoffMs = 80 + attempts * 130;
    scheduleDiscovery(`set retry ${next.key}`, backoffMs);
  }
  if (attempts === 1) {
    emitStatus("warn", `retrying ${next.key}`);
  }
}

function finalizeSetSuccess(next, statePayload, legacyMode) {
  runtime.setInFlight = false;
  if (statePayload && looksLikeBecaState(statePayload)) {
    emitJson("state", statePayload);
  } else if (!legacyMode) {
    scheduleSetStateSync(110);
  }
  runtime.connected = true;
  runtime.lastHttpError = "";
  runtime.lastConnectedHost = runtime.ip;
  emitTarget();
}

function handleSetFailure(next, err, legacyMode) {
  runtime.setInFlight = false;
  const msg = String((err && err.message) || err || "set failed");
  runtime.lastHttpError = msg;
  postDebug(`set failed key=${next.key} value=${next.value} err=${msg}`);
  if (isRetryableSetError(msg)) {
    requeueSet(next, msg, legacyMode);
    return;
  }
  emitStatus("warn", `set ${next.key} failed: ${msg}`);
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

async function probeHostForBeca(host, port) {
  const safeHost = normalizeHostValue(host);
  try {
    const info = await requestJsonTarget(host, port, "GET", "/api/info", "", runtime.discoveryTimeoutMs);
    if (!looksLikeBecaInfo(info)) return null;
    let adoptedHost = normalizeHostValue(info.ip || "");
    if (!adoptedHost.length && !isIpv4Host(safeHost)) {
      adoptedHost = await resolveHostIpv4(safeHost, 380);
    }
    return {
      host: safeHost,
      adoptedHost,
      source: "info",
      info,
    };
  } catch (err) {
    // fall through to /api/state probe for firmware that lacks /api/info
  }

  try {
    const state = await requestJsonTarget(host, port, "GET", "/api/state", "", runtime.discoveryTimeoutMs);
    if (looksLikeBecaState(state)) {
      let adoptedHost = "";
      if (!isIpv4Host(safeHost)) {
        adoptedHost = await resolveHostIpv4(safeHost, 380);
      }
      return {
        host: safeHost,
        adoptedHost,
        source: "state",
        info: null,
      };
    }
  } catch (err) {
    return null;
  }

  return null;
}

async function probeCandidateBatch(candidates, port, maxConcurrent) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const parallel = Math.max(1, Number(maxConcurrent) || 1);
  let index = 0;
  let found = null;

  async function worker() {
    while (!found) {
      const current = index;
      index += 1;
      if (current >= candidates.length) return;
      const host = candidates[current];
      // eslint-disable-next-line no-await-in-loop
      const probe = await probeHostForBeca(host, port);
      if (probe) {
        found = probe;
        return;
      }
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(parallel, candidates.length); i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return found;
}

async function findResponsiveHost(candidates, port) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const headSize = Math.min(28, candidates.length);
  const head = candidates.slice(0, headSize);
  const tail = candidates.slice(headSize);

  const quick = await probeCandidateBatch(head, port, 10);
  if (quick) return quick;
  if (!tail.length) return null;
  return probeCandidateBatch(tail, port, 12);
}

function scheduleDiscovery(reason, delayMs = 80) {
  if (runtime.mode !== "http" || !runtime.autoReconnect) return;
  if (runtime.discoveryTimer) clearTimeout(runtime.discoveryTimer);
  runtime.discoveryTimer = setTimeout(() => {
    runtime.discoveryTimer = null;
    discoverAndAdoptHost(reason).catch(() => {});
  }, Math.max(0, Number(delayMs) || 0));
}

async function discoverAndAdoptHost(reason) {
  if (runtime.mode !== "http") return false;
  if (runtime.connected) return false;
  if (runtime.discoveryInFlight) return false;

  const elapsed = nowMs() - runtime.lastDiscoveryAt;
  if (elapsed < runtime.discoveryCooldownMs) return false;

  runtime.discoveryInFlight = true;
  runtime.lastDiscoveryAt = nowMs();
  emitStatus("discovering", reason || "searching for BECA");

  try {
    const hints = await discoveryIpHints();
    const candidates = buildDiscoveryCandidates(hints);
    const found = await findResponsiveHost(candidates, runtime.port);
    if (!found || !found.host) {
      emitStatus("warn", "auto-discovery did not find BECA");
      return false;
    }

    const resolvedHost = normalizeHostValue(found.adoptedHost) || normalizeHostValue(found.host);
    if (found.info && found.info.name) {
      const maybeName = normalizeDeviceName(found.info.name);
      if (maybeName) runtime.deviceName = maybeName;
    }
    runtime.ip = resolvedHost;
    runtime.lastConnectedHost = resolvedHost;
    emitTarget();
    if (resolvedHost !== normalizeHostValue(found.host)) {
      emitStatus("identified", `${found.host} -> ${resolvedHost}:${runtime.port}`);
    } else {
      emitStatus("identified", `${resolvedHost}:${runtime.port}`);
    }
    emitStatus("connecting", `${resolvedHost}:${runtime.port}`);
    pollHttpState();
    pollHttpFast();
    pollHttpParams();
    pollHttpSynth();
    return true;
  } finally {
    runtime.discoveryInFlight = false;
  }
}

async function refreshHttpInfo() {
  if (runtime.mode !== "http") return;
  try {
    const info = await requestJson("GET", "/api/info", "", 900);
    if (!looksLikeBecaInfo(info)) return;

    const maybeIp = normalizeHostValue(info.ip || "");
    if (maybeIp && maybeIp !== runtime.ip) {
      runtime.ip = maybeIp;
      runtime.lastConnectedHost = maybeIp;
      emitTarget();
      emitStatus("identified", `${maybeIp}:${runtime.port}`);
    }

    if (info.name) {
      const maybeName = normalizeDeviceName(info.name);
      if (maybeName) runtime.deviceName = maybeName;
    }
    emitTarget();
  } catch (err) {
    // /api/info is optional for older firmware; ignore quietly.
  }
}

async function pollHttpState() {
  if (runtime.mode !== "http") return;
  if (runtime.httpLegacy) return;
  if (runtime.setInFlight || runtime.pendingSet.length) return;
  if (runtime.pollInFlight.state) return;
  runtime.pollInFlight.state = true;
  try {
    const state = await requestJson("GET", "/api/state", "");
    emitJson("state", state);
    runtime.connected = true;
    runtime.lastConnectedHost = runtime.ip;
    emitTarget();
    emitStatus("connected", `${runtime.ip}:${runtime.port}`);
    runtime.infoTick = (runtime.infoTick + 1) % 16;
    if (runtime.infoTick === 1) refreshHttpInfo();
  } catch (err) {
    if (String(err.message || "").startsWith("HTTP 302")) {
      enableLegacyHttpMode("/api/state unavailable, using event stream");
      runtime.connected = true;
      emitTarget();
      return;
    }
    runtime.connected = false;
    runtime.lastHttpError = err.message;
    emitTarget();
    emitStatus("error", err.message);
    if (!runtime.autoReconnect) stopHttpTimers();
    else scheduleDiscovery("http retry");
  } finally {
    runtime.pollInFlight.state = false;
  }
}

async function pollHttpFast() {
  if (runtime.mode !== "http") return;
  if (runtime.httpLegacy) return;
  if (runtime.setInFlight || runtime.pendingSet.length) return;
  if ((nowMs() - runtime.lastSetSentAt) < 140) return;
  if (runtime.pollInFlight.fast) return;
  runtime.pollInFlight.fast = true;
  try {
    const [plant, notes] = await Promise.all([requestJson("GET", "/api/plant", ""), requestJson("GET", "/api/notes", "")]);
    emitPlant(plant);
    applyNotesSnapshot(notes);
    runtime.connected = true;
    emitTarget();
  } catch (err) {
    if (String(err.message || "").startsWith("HTTP 302")) {
      enableLegacyHttpMode("/api/plant or /api/notes unavailable");
      return;
    }
    runtime.connected = false;
    runtime.lastHttpError = err.message;
    emitTarget();
    if (!runtime.autoReconnect) stopHttpTimers();
  } finally {
    runtime.pollInFlight.fast = false;
  }
}

async function pollHttpParams() {
  if (runtime.mode !== "http") return;
  if (runtime.httpLegacy) return;
  if (runtime.pollInFlight.params) return;
  runtime.pollInFlight.params = true;
  try {
    const params = await requestJson("GET", "/api/params", "");
    updateParams(params);
  } catch (err) {
    if (runtime.httpLegacy) return;
    if (String(err.message || "").startsWith("HTTP 302")) {
      enableLegacyHttpMode("/api/params unavailable");
      return;
    }
    emitStatus("warn", `params unavailable: ${err.message}`);
  } finally {
    runtime.pollInFlight.params = false;
  }
}

async function pollHttpSynth() {
  if (runtime.mode !== "http") return;
  if (runtime.pollInFlight.synth) return;
  runtime.pollInFlight.synth = true;
  try {
    const synth = await requestJson("GET", "/api/synth", "");
    updateSynth(synth);
  } catch (err) {
    if (runtime.httpLegacy) return;
    emitStatus("warn", `synth unavailable: ${err.message}`);
  } finally {
    runtime.pollInFlight.synth = false;
  }
}

function beginHttpMode() {
  stopAllTimers();
  runtime.mode = "http";
  runtime.httpLegacy = false;
  runtime.connected = false;
  runtime.infoTick = 0;
  emitTarget();
  runtime.stateTimer = setInterval(pollHttpState, runtime.statePollMs);
  runtime.fastTimer = setInterval(pollHttpFast, runtime.fastPollMs);
  runtime.paramsTimer = setInterval(pollHttpParams, runtime.paramsPollMs);
  runtime.synthTimer = setInterval(pollHttpSynth, runtime.synthPollMs);
  runtime.setTimer = setInterval(flushPendingSetQueue, 25);
  pollHttpState();
  pollHttpFast();
  pollHttpParams();
  pollHttpSynth();
  scheduleDiscovery("http startup", 180);
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
  runtime.httpLegacy = false;
  runtime.serialStatusTicker = 0;
  emitTarget();

  if (path && path.length) {
    try {
      await openSerialPort(path, baudRate || 115200);
      emitStatus("connected", `${path} @ ${baudRate || 115200}`);
    } catch (err) {
      runtime.connected = false;
      emitTarget();
      emitStatus("error", `serial open failed: ${err.message}`);
      return;
    }
  }

  runtime.connected = true;
  emitTarget();
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
  runtime.httpLegacy = false;
  runtime.connected = true;
  emitTarget();
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
  runtime.httpLegacy = false;
  runtime.connected = false;
  emitTarget();
  runtime.pendingSet = [];
  runtime.activeNotes.clear();
  emitStatus("disconnected", "");
}

maxApi.addHandler("connect_http", (ip, port) => {
  const host = normalizeHostValue(ip);
  if (host) runtime.ip = host;
  const fromLocalName = runtime.ip.endsWith(".local");
  if (fromLocalName) runtime.deviceName = normalizeDeviceName(runtime.ip);
  runtime.port = Math.max(1, Number(port || runtime.port) || runtime.port);
  emitTarget();
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
  if (runtime.mode === "http" && runtime.autoReconnect && !runtime.connected) {
    scheduleDiscovery("auto reconnect enabled", 30);
  }
});

maxApi.addHandler("set_emit_mode", (mode) => {
  const next = String(mode || "reemit").toLowerCase();
  runtime.emitMode = next === "monitor" ? "monitor" : "reemit";
});

maxApi.addHandler("set_param", (key, value) => {
  if (typeof key === "undefined") return;
  queueSet(String(key), String(value));
});

maxApi.addHandler("set_http_host", (host) => {
  const next = normalizeHostValue(host);
  if (!next.length) return;
  runtime.ip = next;
  emitTarget();
  if (runtime.mode === "http" && runtime.autoReconnect && !runtime.connected) {
    scheduleDiscovery("host updated", 20);
  }
});

maxApi.addHandler("set_http_port", (port) => {
  runtime.port = Math.max(1, Number(port || runtime.port) || runtime.port);
  emitTarget();
  if (runtime.mode === "http" && runtime.autoReconnect && !runtime.connected) {
    scheduleDiscovery("port updated", 20);
  }
});

maxApi.addHandler("set_device_name", (name) => {
  const next = normalizeDeviceName(name);
  if (!next.length) return;
  runtime.deviceName = next;
  emitTarget();
  if (runtime.mode === "http" && runtime.autoReconnect && !runtime.connected) {
    scheduleDiscovery("device name updated", 20);
  }
});

maxApi.addHandler("auto_connect", () => {
  if (runtime.mode === "http" && !runtime.connected) {
    scheduleDiscovery("auto-connect", 0);
  }
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

maxApi.addHandler("request_target", () => {
  emitTarget();
  if (runtime.mode === "http" && runtime.autoReconnect && !runtime.connected) {
    scheduleDiscovery("target request", 0);
  }
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
emitTarget();
emitStatus("ready", "beca_control_node loaded");
scheduleDiscovery("initial startup", 250);
