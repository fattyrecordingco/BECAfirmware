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

const runtime = {
  mode: "http",
  ip: "192.168.4.1",
  port: 80,
  autoReconnect: true,
  emitMode: "reemit", // reemit | monitor
  connected: false,
  statePollMs: 250,
  fastPollMs: 40,
  stateTimer: null,
  fastTimer: null,
  setTimer: null,
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
};

function nowMs() {
  return Date.now();
}

function emitStatus(state, detail) {
  maxApi.outlet(["status", state, detail || ""]);
}

function emitJson(tag, data) {
  maxApi.outlet([tag, JSON.stringify(data || {})]);
}

function emitPlant(data) {
  const value = Number(data.value || 0);
  const raw = Number(data.raw || 0);
  const raw2 = Number(data.raw2 || 0);
  maxApi.outlet(["plant", value, raw, raw2]);
}

function emitMidiStatus(payload) {
  const note = Number(payload.note || 0);
  const vel = Number(payload.vel || 0);
  const ch = Number(payload.ch || 1);
  const on = !!payload.on;
  maxApi.outlet(["midi_event", on ? 1 : 0, note, vel, ch]);
}

function emitMidiBytes(on, note, vel, ch) {
  const chan = Math.max(1, Math.min(16, Number(ch || 1)));
  const status = (on ? 0x90 : 0x80) | ((chan - 1) & 0x0f);
  const data1 = Math.max(0, Math.min(127, Number(note || 0))) & 0x7f;
  const data2 = Math.max(0, Math.min(127, Number(vel || 0))) & 0x7f;
  maxApi.outlet(["midi_bytes", status, data1, data2]);
}

function normalizeMode(mode) {
  if (mode === "serial") return "serial";
  if (mode === "mock") return "mock";
  return "http";
}

function stopHttpTimers() {
  if (runtime.stateTimer) clearInterval(runtime.stateTimer);
  if (runtime.fastTimer) clearInterval(runtime.fastTimer);
  if (runtime.setTimer) clearInterval(runtime.setTimer);
  runtime.stateTimer = null;
  runtime.fastTimer = null;
  runtime.setTimer = null;
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
          try {
            resolve(payload ? JSON.parse(payload) : {});
          } catch (err) {
            reject(new Error(`Invalid JSON from ${path}: ${payload}`));
          }
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
  const vel = Number(snapshot.vel || snapshot.last_vel || 96);
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
    try {
      const state = JSON.parse(payloadRaw);
      emitJson("state", state);
      runtime.connected = true;
      return;
    } catch (err) {
      emitStatus("warn", `Bad STATE JSON: ${payloadRaw}`);
      return;
    }
  }

  if (tag === "PLANT") {
    try {
      emitPlant(JSON.parse(payloadRaw));
      return;
    } catch (err) {
      emitStatus("warn", `Bad PLANT JSON: ${payloadRaw}`);
      return;
    }
  }

  if (tag === "NOTES") {
    try {
      applyNotesSnapshot(JSON.parse(payloadRaw));
      return;
    } catch (err) {
      emitStatus("warn", `Bad NOTES JSON: ${payloadRaw}`);
      return;
    }
  }

  if (tag === "SET" && payloadRaw.includes("\"ok\":0")) {
    emitStatus("warn", payloadRaw);
  }
}

function handleSerialLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return;

  if (trimmed.startsWith("{")) {
    try {
      const evt = JSON.parse(trimmed);
      if (evt.type === "plant") {
        emitPlant(evt);
        return;
      }
      if (evt.type === "midi") {
        emitMidiStatus(evt);
        if (runtime.emitMode === "reemit") {
          emitMidiBytes(!!evt.on, Number(evt.note || 0), Number(evt.on ? evt.vel || 0 : 0), Number(evt.ch || 1));
        }
        return;
      }
      if (evt.type === "state") {
        emitJson("state", evt);
      }
      return;
    } catch (err) {
      emitStatus("warn", `Malformed JSON line: ${trimmed}`);
      return;
    }
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
      reject(new Error("serialport module missing. Install in ableton/m4l/code with npm install serialport"));
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
    const [plant, notes] = await Promise.all([
      requestJson("GET", "/api/plant", ""),
      requestJson("GET", "/api/notes", ""),
    ]);
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

function beginHttpMode() {
  stopAllTimers();
  runtime.mode = "http";
  runtime.connected = true;
  runtime.stateTimer = setInterval(pollHttpState, runtime.statePollMs);
  runtime.fastTimer = setInterval(pollHttpFast, runtime.fastPollMs);
  runtime.setTimer = setInterval(flushPendingSetQueue, 25);
  pollHttpState();
  pollHttpFast();
}

async function beginSerialMode(path, baudRate) {
  stopAllTimers();
  runtime.mode = "serial";

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
  runtime.stateTimer = setInterval(() => sendSerialControl("STATE"), runtime.statePollMs);
  runtime.fastTimer = setInterval(() => {
    sendSerialControl("PLANT");
    sendSerialControl("NOTES");
  }, runtime.fastPollMs);
  runtime.setTimer = setInterval(flushPendingSetQueue, 25);

  sendSerialControl("STATE");
  if (runtime.serialTelemetryEnabled) sendSerialControl("TELEMETRY 1");
  emitStatus("connected", path ? `serial ${path}` : "serial (external patch transport)");
}

function beginMockMode() {
  stopAllTimers();
  runtime.mode = "mock";
  runtime.connected = true;
  runtime.mockTimer = setInterval(() => {
    const t = nowMs() / 1000;
    const value = 0.5 + 0.45 * Math.sin(t * 1.7);
    const raw = Math.floor(800 + value * 2500);
    emitPlant({ value, raw, raw2: raw + 32 });

    if (Math.random() < 0.12) {
      const note = 48 + Math.floor(Math.random() * 24);
      const vel = 70 + Math.floor(Math.random() * 56);
      const ch = 1;
      if (runtime.emitMode === "reemit") {
        emitMidiBytes(true, note, vel, ch);
        setTimeout(() => emitMidiBytes(false, note, 0, ch), 180 + Math.floor(Math.random() * 220));
      }
      emitMidiStatus({ on: true, note, vel, ch });
    }

    emitJson("state", {
      ver: 0,
      mode: 0,
      scale: 0,
      root: 0,
      bpm: 120,
      swing: 8,
      lo: 3,
      hi: 6,
      outputmode: 0,
      outputname: "BLE",
      io_muted: 0,
      daw_sync: 0,
      daw_lock: 0,
      aux_ready: 1,
      aux_wait_ms: 0,
    });
  }, runtime.fastPollMs);
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
  runtime.ip = String(ip || runtime.ip);
  runtime.port = Number(port || runtime.port);
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

maxApi.addHandler("serial_line", (line) => {
  // Optional external serial ingest path.
  handleSerialLine(line);
});

maxApi.addHandler("request_state", () => {
  if (runtime.mode === "serial") sendSerialControl("STATE");
  else if (runtime.mode === "http") pollHttpState();
});

maxApi.addHandler("request_fast", () => {
  if (runtime.mode === "serial") {
    sendSerialControl("PLANT");
    sendSerialControl("NOTES");
  } else if (runtime.mode === "http") {
    pollHttpFast();
  }
});

maxApi.addHandler("enable_serial_telemetry", (flag) => {
  runtime.serialTelemetryEnabled = Number(flag || 0) !== 0;
  if (runtime.mode === "serial") {
    sendSerialControl(`TELEMETRY ${runtime.serialTelemetryEnabled ? 1 : 0}`);
  }
});

emitStatus("ready", "beca_control_node loaded");
