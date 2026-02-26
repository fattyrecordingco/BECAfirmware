autowatch = 1;
inlets = 1;
outlets = 1;

mgraphics.init();
mgraphics.relative_coords = 0;
mgraphics.autofill = 0;

var NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

var COLORS = {
  bg: [0.11, 0.12, 0.13, 1],
  panel: [0.16, 0.17, 0.19, 1],
  panelAlt: [0.14, 0.15, 0.17, 1],
  border: [0.28, 0.29, 0.31, 1],
  text: [0.90, 0.91, 0.92, 1],
  subtext: [0.68, 0.70, 0.73, 1],
  accent: [0.21, 0.62, 0.95, 1],
  ok: [0.21, 0.75, 0.44, 1],
  warn: [0.93, 0.58, 0.22, 1],
  err: [0.90, 0.34, 0.34, 1],
};

var ui = {
  mode: "http",
  emitMode: "reemit",
  autoReconnect: 1,
  serialTelemetry: 0,
  ip: "192.168.4.1",
  port: "80",
  serialPort: "",
  baud: "115200",
  statusState: "ready",
  statusDetail: "idle",
  connected: 0,
  page: 0,
  state: {
    mode: 0,
    scale: 0,
    root: 0,
    lo: 3,
    hi: 6,
    bpm: 120,
    swing: 0,
    sens: 0.2,
    clock: 0,
    outputmode: 0,
    io_muted: 0,
    daw_sync: 0,
    fx: 0,
    vs: 160,
    vi: 210,
    rest: 0.1,
    nr: 1,
    drumsel: 255,
    last: "60",
    vel: 96,
    ts: "4/4",
  },
  synth: {
    preset: 0,
    wave_a: 0,
    wave_b: 1,
    osc_mix: 0.5,
    mono: 1,
    voices: 1,
    attack: 0.03,
    decay: 0.2,
    sustain: 0.7,
    release: 0.2,
    filter: 0,
    cutoff: 6400,
    resonance: 1,
    reverb: 0.1,
    delay_ms: 100,
    delay_feedback: 0.2,
    delay_mix: 0.1,
    drive: 0.2,
    master: 0.7,
    detune: 2,
    gain_trim: 0.95,
    drumkit: 0,
  },
  params: {
    modes: ["Notes", "Arpeggiator", "Chords", "Drum Machine"],
    scales: ["Major", "Minor", "Dorian", "Lydian", "Mixolydian", "Pent Minor", "Pent Major", "Harm Minor", "Phrygian", "Whole Tone", "Maj7", "Min7", "Dom7", "Sus2", "Sus4"],
    time_signatures: ["4-4", "3-4", "5-4", "6-8"],
    output_modes: ["BLE", "SERIAL", "AUX OUT"],
    clock_modes: ["Internal", "Plant"],
    synth_presets: ["Fatty Neon Lead", "Prism Poly Lead", "Verdant Pad"],
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
  },
  serialPorts: [],
  serialPortIndex: -1,
  plantVal: 0,
  plantRaw: 0,
  plantRaw2: 0,
  plantBuffer: [],
  plantBufferMax: 220,
  lastMidi: { on: 0, note: 0, vel: 0, ch: 1 },
  activeNotes: {},
  noteGridCsv: "",
  editingField: "",
  dragInfo: null,
  hotspots: [],
  lastParamSentAt: {},
};

var perfControls = [
  { id: "mode", label: "Play Mode", type: "choice", source: "state", key: "mode", options: "modes", sendKey: "mode" },
  { id: "scale", label: "Scale", type: "choice", source: "state", key: "scale", options: "scales", sendKey: "scale" },
  { id: "root", label: "Root", type: "choice", source: "state", key: "root", optionsArray: NOTE_NAMES, sendKey: "root" },
  { id: "clock", label: "Clock", type: "choice", source: "state", key: "clock", options: "clock_modes", sendKey: "clock" },
  { id: "bpm", label: "BPM", type: "slider", source: "state", key: "bpm", minKey: "bpm", maxKey: "bpm", step: 1, sendKey: "bpm" },
  { id: "swing", label: "Swing", type: "slider", source: "state", key: "swing", minKey: "swing", maxKey: "swing", step: 1, sendKey: "swing" },
  { id: "sens", label: "Sensitivity", type: "slider", source: "state", key: "sens", minKey: "sens", maxKey: "sens", step: 0.01, sendKey: "sens" },
  { id: "lo", label: "Octave Low", type: "slider", source: "state", key: "lo", minKey: "lo", maxKey: "lo", step: 1, sendKey: "lo" },
  { id: "hi", label: "Octave High", type: "slider", source: "state", key: "hi", minKey: "hi", maxKey: "hi", step: 1, sendKey: "hi" },
  { id: "preset", label: "Preset", type: "choice", source: "synth", key: "preset", options: "synth_presets", sendKey: "preset" },
  { id: "outputmode", label: "Output", type: "choice", source: "state", key: "outputmode", options: "output_modes", sendKey: "outputmode" },
  { id: "mute", label: "Mute I/O", type: "toggle", source: "state", key: "io_muted", sendKey: "mute" },
  { id: "sync", label: "DAW Sync", type: "toggle", source: "state", key: "daw_sync", sendKey: "sync" },
  { id: "fx", label: "FX Index", type: "slider", source: "state", key: "fx", min: 0, max: 9, step: 1, sendKey: "fx" },
  { id: "vs", label: "Visual Speed", type: "slider", source: "state", key: "vs", min: 0, max: 255, step: 1, sendKey: "vs" },
  { id: "vi", label: "Visual Intensity", type: "slider", source: "state", key: "vi", min: 0, max: 255, step: 1, sendKey: "vi" },
  { id: "rest", label: "Rest Probability", type: "slider", source: "state", key: "rest", minKey: "rest", maxKey: "rest", step: 0.01, sendKey: "rest" },
  { id: "nr", label: "Avoid Repeats", type: "toggle", source: "state", key: "nr", sendKey: "nr" },
  { id: "drumsel", label: "Drum Select Mask", type: "drummask", source: "state", key: "drumsel", sendKey: "drumsel" },
];

var engineControls = [
  { id: "wave_a", label: "Wave A", type: "slider", source: "synth", key: "wave_a", min: 0, max: 3, step: 1, sendKey: "wave_a" },
  { id: "wave_b", label: "Wave B", type: "slider", source: "synth", key: "wave_b", min: 0, max: 3, step: 1, sendKey: "wave_b" },
  { id: "osc_mix", label: "Osc Mix", type: "slider", source: "synth", key: "osc_mix", min: 0, max: 1, step: 0.01, sendKey: "osc_mix" },
  { id: "mono", label: "Mono", type: "toggle", source: "synth", key: "mono", sendKey: "mono" },
  { id: "voices", label: "Voices", type: "slider", source: "synth", key: "voices", min: 1, max: 12, step: 1, sendKey: "voices" },
  { id: "attack", label: "Attack", type: "slider", source: "synth", key: "attack", minKey: "attack", maxKey: "attack", step: 0.01, sendKey: "attack" },
  { id: "decay", label: "Decay", type: "slider", source: "synth", key: "decay", minKey: "decay", maxKey: "decay", step: 0.01, sendKey: "decay" },
  { id: "sustain", label: "Sustain", type: "slider", source: "synth", key: "sustain", minKey: "sustain", maxKey: "sustain", step: 0.01, sendKey: "sustain" },
  { id: "release", label: "Release", type: "slider", source: "synth", key: "release", minKey: "release", maxKey: "release", step: 0.01, sendKey: "release" },
  { id: "filter", label: "Filter", type: "slider", source: "synth", key: "filter", min: 0, max: 2, step: 1, sendKey: "filter" },
  { id: "cutoff", label: "Cutoff", type: "slider", source: "synth", key: "cutoff", minKey: "cutoff", maxKey: "cutoff", step: 1, sendKey: "cutoff" },
  { id: "resonance", label: "Resonance", type: "slider", source: "synth", key: "resonance", minKey: "resonance", maxKey: "resonance", step: 0.01, sendKey: "resonance" },
  { id: "reverb", label: "Reverb", type: "slider", source: "synth", key: "reverb", min: 0, max: 1, step: 0.01, sendKey: "reverb" },
  { id: "delay_ms", label: "Delay ms", type: "slider", source: "synth", key: "delay_ms", minKey: "delay_ms", maxKey: "delay_ms", step: 1, sendKey: "delay_ms" },
  { id: "delay_feedback", label: "Delay FB", type: "slider", source: "synth", key: "delay_feedback", minKey: "delay_feedback", maxKey: "delay_feedback", step: 0.01, sendKey: "delay_feedback" },
  { id: "delay_mix", label: "Delay Mix", type: "slider", source: "synth", key: "delay_mix", minKey: "delay_mix", maxKey: "delay_mix", step: 0.01, sendKey: "delay_mix" },
  { id: "drive", label: "Drive", type: "slider", source: "synth", key: "drive", minKey: "drive", maxKey: "drive", step: 0.01, sendKey: "drive" },
  { id: "master", label: "Master", type: "slider", source: "synth", key: "master", minKey: "master", maxKey: "master", step: 0.01, sendKey: "master" },
  { id: "detune", label: "Detune", type: "slider", source: "synth", key: "detune", minKey: "detune", maxKey: "detune", step: 0.01, sendKey: "detune" },
  { id: "gain_trim", label: "Gain Trim", type: "slider", source: "synth", key: "gain_trim", minKey: "gain_trim", maxKey: "gain_trim", step: 0.01, sendKey: "gain_trim" },
  { id: "drumkit", label: "Drum Kit", type: "slider", source: "synth", key: "drumkit", min: 0, max: 2, step: 1, sendKey: "drumkit" },
];

function canvasSize() {
  var w = 960;
  var h = 560;
  try {
    if (mgraphics.size && mgraphics.size.length >= 2) {
      w = Number(mgraphics.size[0]) || w;
      h = Number(mgraphics.size[1]) || h;
    }
  } catch (e) {
    // Ignore and try box rect fallback.
  }
  try {
    if ((w <= 0 || h <= 0) && this.box && this.box.rect && this.box.rect.length >= 4) {
      w = Number(this.box.rect[2] - this.box.rect[0]) || w;
      h = Number(this.box.rect[3] - this.box.rect[1]) || h;
    }
  } catch (e2) {
    // Keep defaults.
  }
  if (w <= 0) w = 960;
  if (h <= 0) h = 560;
  return [w, h];
}

function clip(v, lo, hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function rounded(v, step) {
  if (!step || step <= 0) return v;
  return Math.round(v / step) * step;
}

function ptInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function rect(x, y, w, h) {
  return { x: x, y: y, w: w, h: h };
}

function addHotspot(r, kind, payload) {
  ui.hotspots.push({ rect: r, kind: kind, payload: payload });
}

function sourceObj(name) {
  return name === "synth" ? ui.synth : ui.state;
}

function getRange(c) {
  if (c.minKey && ui.params.ranges && ui.params.ranges[c.minKey]) return ui.params.ranges[c.minKey];
  return [typeof c.min !== "undefined" ? c.min : 0, typeof c.max !== "undefined" ? c.max : 1];
}

function optionArray(c) {
  if (c.optionsArray) return c.optionsArray;
  if (c.options && ui.params[c.options]) return ui.params[c.options];
  return [];
}

function valueText(c, val) {
  if (c.type === "toggle") return val ? "ON" : "OFF";
  if (c.type === "choice") {
    var arr = optionArray(c);
    var idx = Math.max(0, Math.min(arr.length - 1, Math.round(Number(val) || 0)));
    return arr.length ? String(arr[idx]) : String(val);
  }
  if (typeof val === "number") {
    if (Math.abs(val) >= 1000) return val.toFixed(0);
    if (Math.abs(val) >= 100) return val.toFixed(1);
    if (Math.abs(val) >= 10) return val.toFixed(1);
    return val.toFixed(2);
  }
  return String(val);
}

function send() {
  var args = arrayfromargs(arguments);
  outlet(0, args);
}

function sendParamThrottled(key, value) {
  var now = new Date().getTime();
  var last = ui.lastParamSentAt[key] || 0;
  if (now - last < 50) return;
  ui.lastParamSentAt[key] = now;
  send("set_param", key, String(value));
}

function setFieldFromState(field) {
  if (field === "ip") ui.ip = String(ui.ip || "");
  else if (field === "port") ui.port = String(ui.port || "80");
  else if (field === "serialPort") ui.serialPort = String(ui.serialPort || "");
  else if (field === "baud") ui.baud = String(ui.baud || "115200");
}

function activateMode(newMode) {
  ui.mode = newMode;
  send("set_mode", newMode);
  mgraphics.redraw();
}

function connectNow() {
  if (ui.mode === "serial") {
    send("connect_serial", ui.serialPort, parseInt(ui.baud, 10) || 115200);
    return;
  }
  if (ui.mode === "mock") {
    send("connect_mock");
    return;
  }
  send("connect_http", ui.ip, parseInt(ui.port, 10) || 80);
}

function statusColor() {
  if (ui.statusState === "connected") return COLORS.ok;
  if (ui.statusState === "error") return COLORS.err;
  if (ui.statusState === "warn") return COLORS.warn;
  return COLORS.subtext;
}

function pushPlant(value, raw, raw2) {
  ui.plantVal = Number(value) || 0;
  ui.plantRaw = Number(raw) || 0;
  ui.plantRaw2 = Number(raw2) || 0;
  ui.plantBuffer.push(ui.plantVal);
  while (ui.plantBuffer.length > ui.plantBufferMax) ui.plantBuffer.shift();
}

function parseJsonOrNull(text) {
  try {
    return JSON.parse(String(text));
  } catch (e) {
    return null;
  }
}

function mergeObject(dst, src) {
  var k;
  for (k in src) {
    if (src.hasOwnProperty(k)) dst[k] = src[k];
  }
}

function updateActiveFromCsv(csv) {
  ui.activeNotes = {};
  var s = String(csv || "");
  if (!s.length) return;
  var parts = s.split(",");
  var i;
  for (i = 0; i < parts.length; i++) {
    var n = parseInt(parts[i], 10);
    if (!isNaN(n)) ui.activeNotes[n] = 1;
  }
}

function updateMidiEvent(on, note, vel, ch) {
  var n = parseInt(note, 10) || 0;
  var v = parseInt(vel, 10) || 0;
  var c = parseInt(ch, 10) || 1;
  var isOn = parseInt(on, 10) !== 0;
  if (isOn) ui.activeNotes[n] = 1;
  else delete ui.activeNotes[n];
  ui.lastMidi = { on: isOn ? 1 : 0, note: n, vel: v, ch: c };
}

function rootName(rootVal) {
  var idx = Math.max(0, Math.min(11, parseInt(rootVal, 10) || 0));
  return NOTE_NAMES[idx];
}

function drawText(text, x, y, size, color, align) {
  mgraphics.set_source_rgba(color[0], color[1], color[2], color[3]);
  mgraphics.select_font_face("Arial");
  mgraphics.set_font_size(size);
  var tw = mgraphics.text_measure(text)[0];
  var tx = x;
  if (align === "center") tx = x - (tw * 0.5);
  else if (align === "right") tx = x - tw;
  mgraphics.move_to(tx, y);
  mgraphics.show_text(text);
}

function fillRect(r, color) {
  mgraphics.set_source_rgba(color[0], color[1], color[2], color[3]);
  mgraphics.rectangle(r.x, r.y, r.w, r.h);
  mgraphics.fill();
}

function strokeRect(r, color, width) {
  mgraphics.set_source_rgba(color[0], color[1], color[2], color[3]);
  mgraphics.set_line_width(width || 1);
  mgraphics.rectangle(r.x, r.y, r.w, r.h);
  mgraphics.stroke();
}

function drawButton(r, label, on, id, kind, payload) {
  fillRect(r, on ? [COLORS.accent[0], COLORS.accent[1], COLORS.accent[2], 0.35] : COLORS.panelAlt);
  strokeRect(r, on ? COLORS.accent : COLORS.border, 1);
  drawText(label, r.x + r.w * 0.5, r.y + r.h * 0.65, 11, COLORS.text, "center");
  addHotspot(r, kind || "button", payload || id);
}

function drawInput(r, label, value, field) {
  var active = ui.editingField === field;
  fillRect(r, active ? [COLORS.accent[0], COLORS.accent[1], COLORS.accent[2], 0.20] : COLORS.panelAlt);
  strokeRect(r, active ? COLORS.accent : COLORS.border, 1);
  drawText(label, r.x + 6, r.y + 10, 9, COLORS.subtext, "left");
  drawText(String(value), r.x + 6, r.y + r.h - 7, 11, COLORS.text, "left");
  addHotspot(r, "input", field);
}

function drawHeader(area) {
  drawText("BECA Control", area.x + 8, area.y + 16, 14, COLORS.text, "left");
  drawText("Ableton Live MIDI Effect", area.x + 140, area.y + 16, 10, COLORS.subtext, "left");
  drawText("Status: " + ui.statusState + "  " + ui.statusDetail, area.x + area.w - 8, area.y + 16, 10, statusColor(), "right");
}

function drawConnection(area) {
  fillRect(area, COLORS.panel);
  strokeRect(area, COLORS.border, 1);

  var y = area.y + 8;
  drawText("Connection", area.x + 8, y + 10, 10, COLORS.subtext, "left");

  var modeY = y + 16;
  drawButton(rect(area.x + 8, modeY, 62, 20), "HTTP", ui.mode === "http", "mode_http", "mode", "http");
  drawButton(rect(area.x + 74, modeY, 62, 20), "Serial", ui.mode === "serial", "mode_serial", "mode", "serial");
  drawButton(rect(area.x + 140, modeY, 62, 20), "Mock", ui.mode === "mock", "mode_mock", "mode", "mock");

  drawButton(rect(area.x + area.w - 230, modeY, 70, 20), "Connect", false, "connect", "action", "connect");
  drawButton(rect(area.x + area.w - 154, modeY, 70, 20), "Disconnect", false, "disconnect", "action", "disconnect");
  drawButton(rect(area.x + area.w - 78, modeY, 70, 20), "Refresh", false, "refresh", "action", "refresh");

  var row2 = modeY + 26;
  drawButton(rect(area.x + 8, row2, 92, 20), "Auto Reconnect", ui.autoReconnect !== 0, "auto", "toggleFlag", "auto");
  drawButton(rect(area.x + 104, row2, 92, 20), "Serial Telemetry", ui.serialTelemetry !== 0, "telemetry", "toggleFlag", "telemetry");
  drawButton(rect(area.x + 200, row2, 92, 20), "Reemit", ui.emitMode === "reemit", "emit_reemit", "emit", "reemit");
  drawButton(rect(area.x + 296, row2, 92, 20), "Monitor", ui.emitMode === "monitor", "emit_monitor", "emit", "monitor");

  var inY = row2 + 26;
  if (ui.mode === "serial") {
    drawInput(rect(area.x + 8, inY, 260, 32), "Serial Port", ui.serialPort, "serialPort");
    drawButton(rect(area.x + 272, inY + 6, 20, 20), "<", false, "port_prev", "action", "port_prev");
    drawButton(rect(area.x + 296, inY + 6, 20, 20), ">", false, "port_next", "action", "port_next");
    drawInput(rect(area.x + 322, inY, 110, 32), "Baud", ui.baud, "baud");
    var portInfo = ui.serialPorts.length ? (ui.serialPorts.length + " ports") : "No ports";
    drawText(portInfo, area.x + 438, inY + 22, 10, COLORS.subtext, "left");
  } else {
    drawInput(rect(area.x + 8, inY, 230, 32), "IP Address", ui.ip, "ip");
    drawInput(rect(area.x + 244, inY, 92, 32), "Port", ui.port, "port");
    drawText("HTTP polling + queue-limited updates", area.x + 342, inY + 22, 10, COLORS.subtext, "left");
  }
}

function drawPlant(area) {
  fillRect(area, COLORS.panel);
  strokeRect(area, COLORS.border, 1);
  drawText("Plant Energy", area.x + 8, area.y + 14, 10, COLORS.subtext, "left");
  drawText("norm " + ui.plantVal.toFixed(3) + "   raw " + ui.plantRaw + "   raw2 " + ui.plantRaw2, area.x + area.w - 8, area.y + 14, 10, COLORS.subtext, "right");

  var g = rect(area.x + 8, area.y + 22, area.w - 16, area.h - 30);
  fillRect(g, [0.09, 0.10, 0.11, 1]);
  strokeRect(g, [0.24, 0.25, 0.27, 1], 1);

  if (ui.plantBuffer.length > 1) {
    var i;
    mgraphics.set_source_rgba(COLORS.accent[0], COLORS.accent[1], COLORS.accent[2], 0.95);
    mgraphics.set_line_width(1.5);
    for (i = 0; i < ui.plantBuffer.length; i++) {
      var xx = g.x + (i / (ui.plantBufferMax - 1)) * g.w;
      var yy = g.y + (1 - clip(ui.plantBuffer[i], 0, 1)) * g.h;
      if (i === 0) mgraphics.move_to(xx, yy);
      else mgraphics.line_to(xx, yy);
    }
    mgraphics.stroke();
  }
}

function drawMidi(area) {
  fillRect(area, COLORS.panel);
  strokeRect(area, COLORS.border, 1);

  var ev = ui.lastMidi;
  var label = (ev.on ? "ON" : "OFF") + "  note " + ev.note + " (" + NOTE_NAMES[(ev.note % 12 + 12) % 12] + ")  vel " + ev.vel + "  ch " + ev.ch;
  drawText("MIDI Monitor", area.x + 8, area.y + 14, 10, COLORS.subtext, "left");
  drawText(label, area.x + area.w - 8, area.y + 14, 10, COLORS.subtext, "right");

  var grid = rect(area.x + 8, area.y + 22, area.w - 16, area.h - 30);
  fillRect(grid, [0.09, 0.10, 0.11, 1]);
  strokeRect(grid, [0.24, 0.25, 0.27, 1], 1);

  var cols = 12;
  var rows = 8;
  var cw = grid.w / cols;
  var rh = grid.h / rows;
  var c, r;
  for (r = 0; r < rows; r++) {
    for (c = 0; c < cols; c++) {
      var midi = 12 * (rows - r) + c;
      var rr = rect(grid.x + c * cw + 1, grid.y + r * rh + 1, cw - 2, rh - 2);
      var active = ui.activeNotes[midi] ? 1 : 0;
      fillRect(rr, active ? [COLORS.ok[0], COLORS.ok[1], COLORS.ok[2], 0.7] : [0.16, 0.17, 0.18, 1]);
      if (r === rows - 1) {
        drawText(NOTE_NAMES[c], rr.x + rr.w * 0.5, rr.y + rr.h * 0.72, 8, active ? COLORS.text : COLORS.subtext, "center");
      }
      addHotspot(rr, "midiPad", midi);
    }
  }
}

function drawControlTabs(area) {
  drawButton(rect(area.x + 8, area.y + 4, 98, 20), "Performance", ui.page === 0, "page_perf", "page", 0);
  drawButton(rect(area.x + 112, area.y + 4, 82, 20), "Engine", ui.page === 1, "page_eng", "page", 1);
  drawText("Root: " + rootName(ui.state.root) + "    TS: " + ui.state.ts + "    Last: " + ui.state.last + "    Vel: " + ui.state.vel, area.x + area.w - 8, area.y + 18, 10, COLORS.subtext, "right");
}

function controlValue(control) {
  var src = sourceObj(control.source);
  return src[control.key];
}

function assignControlValue(control, nextVal) {
  var src = sourceObj(control.source);
  src[control.key] = nextVal;
}

function formatControlSend(control, nextVal) {
  if (control.type === "toggle") return nextVal ? 1 : 0;
  if (control.step && control.step < 1) return Number(nextVal).toFixed(3);
  if (control.step && control.step >= 1) return Math.round(Number(nextVal));
  return nextVal;
}

function drawControlCell(control, r) {
  fillRect(r, COLORS.panelAlt);
  strokeRect(r, COLORS.border, 1);

  var val = controlValue(control);
  drawText(control.label, r.x + 6, r.y + 11, 9, COLORS.subtext, "left");

  if (control.type === "toggle") {
    var on = Number(val) !== 0;
    var tg = rect(r.x + r.w - 54, r.y + 5, 48, r.h - 10);
    fillRect(tg, on ? [COLORS.ok[0], COLORS.ok[1], COLORS.ok[2], 0.65] : [0.22, 0.22, 0.23, 1]);
    strokeRect(tg, on ? COLORS.ok : COLORS.border, 1);
    drawText(on ? "ON" : "OFF", tg.x + tg.w * 0.5, tg.y + tg.h * 0.68, 9, COLORS.text, "center");
    addHotspot(r, "controlToggle", control);
    return;
  }

  if (control.type === "choice") {
    var arr = optionArray(control);
    var idx = clip(Math.round(Number(val) || 0), 0, Math.max(0, arr.length - 1));
    var txt = arr.length ? arr[idx] : String(val);
    drawText(txt, r.x + 6, r.y + r.h - 7, 11, COLORS.text, "left");
    drawText("< >", r.x + r.w - 8, r.y + r.h - 7, 10, COLORS.subtext, "right");
    addHotspot(r, "controlChoice", control);
    return;
  }

  if (control.type === "drummask") {
    var mask = Math.max(0, Math.min(255, parseInt(val, 10) || 0));
    var padW = (r.w - 12) / 8;
    var i;
    for (i = 0; i < 8; i++) {
      var bitOn = (mask & (1 << i)) !== 0;
      var pr = rect(r.x + 6 + i * padW, r.y + 16, padW - 3, r.h - 22);
      fillRect(pr, bitOn ? [COLORS.accent[0], COLORS.accent[1], COLORS.accent[2], 0.7] : [0.22, 0.22, 0.23, 1]);
      strokeRect(pr, bitOn ? COLORS.accent : COLORS.border, 1);
      drawText(String(i + 1), pr.x + pr.w * 0.5, pr.y + pr.h * 0.7, 8, COLORS.text, "center");
      addHotspot(pr, "drumBit", { control: control, bit: i });
    }
    return;
  }

  var range = getRange(control);
  var minv = Number(range[0]);
  var maxv = Number(range[1]);
  if (maxv <= minv) maxv = minv + 1;

  var bar = rect(r.x + 6, r.y + r.h - 14, r.w - 12, 8);
  fillRect(bar, [0.20, 0.20, 0.22, 1]);
  var t = clip((Number(val) - minv) / (maxv - minv), 0, 1);
  fillRect(rect(bar.x, bar.y, bar.w * t, bar.h), [COLORS.accent[0], COLORS.accent[1], COLORS.accent[2], 0.9]);
  strokeRect(bar, COLORS.border, 1);
  drawText(valueText(control, Number(val)), r.x + r.w - 6, r.y + 11, 9, COLORS.text, "right");
  addHotspot(r, "controlSlider", control);
}

function drawControls(area) {
  fillRect(area, COLORS.panel);
  strokeRect(area, COLORS.border, 1);

  drawControlTabs(area);

  var content = rect(area.x + 8, area.y + 28, area.w - 16, area.h - 36);
  var controls = ui.page === 0 ? perfControls : engineControls;
  var colGap = 8;
  var rowGap = 6;
  var cols = 2;
  var cw = (content.w - colGap) / cols;
  var ch = 34;
  var i;
  for (i = 0; i < controls.length; i++) {
    var row = Math.floor(i / cols);
    var col = i % cols;
    var rr = rect(content.x + col * (cw + colGap), content.y + row * (ch + rowGap), cw, ch);
    if (rr.y + rr.h > content.y + content.h) break;
    drawControlCell(controls[i], rr);
  }
}

function drawAll() {
  ui.hotspots = [];

  var sz = canvasSize();
  var w = sz[0];
  var h = sz[1];
  fillRect(rect(0, 0, w, h), COLORS.bg);

  var pad = 8;
  var headerH = 22;
  var connH = 90;
  var plantH = 110;
  var midiH = 130;

  var y = pad;
  drawHeader(rect(pad, y, w - pad * 2, headerH));
  y += headerH + 6;
  drawConnection(rect(pad, y, w - pad * 2, connH));
  y += connH + 6;
  drawPlant(rect(pad, y, w - pad * 2, plantH));
  y += plantH + 6;
  drawMidi(rect(pad, y, w - pad * 2, midiH));
  y += midiH + 6;
  drawControls(rect(pad, y, w - pad * 2, Math.max(110, h - y - pad)));
}

function paint() {
  try {
    drawAll();
  } catch (e) {
    var sz = canvasSize();
    fillRect(rect(0, 0, sz[0], sz[1]), [0.16, 0.12, 0.12, 1]);
    drawText("BECA UI script error", 16, 24, 14, [1, 0.78, 0.78, 1], "left");
    drawText(String(e), 16, 44, 11, [1, 0.86, 0.86, 1], "left");
    try { post("BECA jsui paint error: " + e + "\n"); } catch (_ignored) {}
  }
}

function onresize(w, h) {
  mgraphics.redraw();
}

function bang() {
  mgraphics.redraw();
}

function onInputField(field) {
  ui.editingField = field;
  setFieldFromState(field);
  mgraphics.redraw();
}

function applyHotspotAction(h, x, y) {
  var p = h.payload;

  if (h.kind === "mode") {
    activateMode(String(p));
    return;
  }
  if (h.kind === "page") {
    ui.page = parseInt(p, 10) || 0;
    mgraphics.redraw();
    return;
  }
  if (h.kind === "input") {
    onInputField(String(p));
    return;
  }
  if (h.kind === "emit") {
    ui.emitMode = String(p);
    send("set_emit_mode", ui.emitMode);
    mgraphics.redraw();
    return;
  }
  if (h.kind === "toggleFlag") {
    if (p === "auto") {
      ui.autoReconnect = ui.autoReconnect ? 0 : 1;
      send("set_auto_reconnect", ui.autoReconnect);
    } else {
      ui.serialTelemetry = ui.serialTelemetry ? 0 : 1;
      send("enable_serial_telemetry", ui.serialTelemetry);
    }
    mgraphics.redraw();
    return;
  }
  if (h.kind === "action") {
    if (p === "connect") connectNow();
    else if (p === "disconnect") send("disconnect");
    else if (p === "refresh") {
      send("list_serial_ports");
      send("request_params");
      send("request_synth");
      send("request_state");
    }
    else if (p === "port_prev") {
      if (ui.serialPorts.length) {
        ui.serialPortIndex = (ui.serialPortIndex - 1 + ui.serialPorts.length) % ui.serialPorts.length;
        ui.serialPort = ui.serialPorts[ui.serialPortIndex];
      }
      mgraphics.redraw();
    }
    else if (p === "port_next") {
      if (ui.serialPorts.length) {
        ui.serialPortIndex = (ui.serialPortIndex + 1) % ui.serialPorts.length;
        ui.serialPort = ui.serialPorts[ui.serialPortIndex];
      }
      mgraphics.redraw();
    }
    return;
  }

  if (h.kind === "midiPad") {
    var midi = parseInt(p, 10) || 60;
    var active = ui.activeNotes[midi] ? 1 : 0;
    if (active) {
      send("manual_note", 0, midi, 0, 1);
      delete ui.activeNotes[midi];
    } else {
      send("manual_note", 1, midi, 100, 1);
      ui.activeNotes[midi] = 1;
      send("manual_note", 0, midi, 0, 1);
    }
    mgraphics.redraw();
    return;
  }

  if (h.kind === "controlToggle") {
    var c = p;
    var src = sourceObj(c.source);
    var next = Number(src[c.key]) ? 0 : 1;
    src[c.key] = next;
    sendParamThrottled(c.sendKey || c.key, next);
    mgraphics.redraw();
    return;
  }

  if (h.kind === "controlChoice") {
    var cc = p;
    var src2 = sourceObj(cc.source);
    var options = optionArray(cc);
    var cur = parseInt(src2[cc.key], 10) || 0;
    var nextIdx = cur + 1;
    if (options.length) nextIdx = nextIdx % options.length;
    src2[cc.key] = nextIdx;
    sendParamThrottled(cc.sendKey || cc.key, nextIdx);
    mgraphics.redraw();
    return;
  }

  if (h.kind === "drumBit") {
    var d = p;
    var src3 = sourceObj(d.control.source);
    var current = parseInt(src3[d.control.key], 10) || 0;
    var mask = current ^ (1 << d.bit);
    src3[d.control.key] = mask;
    sendParamThrottled(d.control.sendKey || d.control.key, mask);
    mgraphics.redraw();
    return;
  }

  if (h.kind === "controlSlider") {
    ui.dragInfo = { control: p, rect: h.rect };
    dragSlider(x, y);
    return;
  }
}

function dragSlider(x, y) {
  if (!ui.dragInfo) return;
  var c = ui.dragInfo.control;
  var r = ui.dragInfo.rect;
  var range = getRange(c);
  var minv = Number(range[0]);
  var maxv = Number(range[1]);
  if (maxv <= minv) maxv = minv + 1;

  var t = clip((x - (r.x + 6)) / Math.max(1, (r.w - 12)), 0, 1);
  var nextVal = minv + t * (maxv - minv);
  nextVal = rounded(nextVal, c.step || 0);
  if (c.step >= 1) nextVal = Math.round(nextVal);

  assignControlValue(c, nextVal);
  sendParamThrottled(c.sendKey || c.key, formatControlSend(c, nextVal));
  mgraphics.redraw();
}

function onclick(x, y, but, cmd, shift, capslock, option, ctrl) {
  ui.dragInfo = null;
  ui.editingField = "";

  var i;
  for (i = ui.hotspots.length - 1; i >= 0; i--) {
    if (ptInRect(x, y, ui.hotspots[i].rect)) {
      applyHotspotAction(ui.hotspots[i], x, y);
      return;
    }
  }
  mgraphics.redraw();
}

function ondrag(x, y, but, cmd, shift, capslock, option, ctrl) {
  if (!but) {
    ui.dragInfo = null;
    return;
  }
  if (ui.dragInfo) dragSlider(x, y);
}

function onidleout() {
  ui.dragInfo = null;
}

function key(k) {
  if (!ui.editingField) return;

  var field = ui.editingField;
  var val = String(ui[field] || "");

  if (k === 9) return; // tab
  if (k === 27) {
    ui.editingField = "";
    mgraphics.redraw();
    return;
  }
  if (k === 13 || k === 3) {
    ui.editingField = "";
    mgraphics.redraw();
    return;
  }
  if (k === 8 || k === 127) {
    if (val.length) ui[field] = val.substring(0, val.length - 1);
    mgraphics.redraw();
    return;
  }

  if (k >= 32 && k <= 126) {
    ui[field] = val + String.fromCharCode(k);
    mgraphics.redraw();
  }
}

function anything() {
  var args = arrayfromargs(arguments);
  var selector = messagename;

  if (selector === "status") {
    ui.statusState = args.length ? String(args[0]) : "";
    ui.statusDetail = args.length > 1 ? String(args[1]) : "";
    ui.connected = ui.statusState === "connected" ? 1 : 0;
    mgraphics.redraw();
    return;
  }

  if (selector === "plant") {
    pushPlant(args[0], args[1], args[2]);
    mgraphics.redraw();
    return;
  }

  if (selector === "midi_event") {
    updateMidiEvent(args[0], args[1], args[2], args[3]);
    mgraphics.redraw();
    return;
  }

  if (selector === "note_grid") {
    ui.noteGridCsv = args.length ? String(args[0]) : "";
    updateActiveFromCsv(ui.noteGridCsv);
    mgraphics.redraw();
    return;
  }

  if (selector === "state") {
    var stateObj = parseJsonOrNull(args[0]);
    if (stateObj) {
      mergeObject(ui.state, stateObj);
      if (typeof stateObj.io_muted !== "undefined") ui.state.io_muted = parseInt(stateObj.io_muted, 10) || 0;
      if (typeof stateObj.daw_sync !== "undefined") ui.state.daw_sync = parseInt(stateObj.daw_sync, 10) || 0;
      if (typeof stateObj.last !== "undefined") ui.lastMidi.note = parseInt(stateObj.last, 10) || ui.lastMidi.note;
      if (typeof stateObj.vel !== "undefined") ui.lastMidi.vel = parseInt(stateObj.vel, 10) || ui.lastMidi.vel;
    }
    mgraphics.redraw();
    return;
  }

  if (selector === "params") {
    var paramsObj = parseJsonOrNull(args[0]);
    if (paramsObj) {
      mergeObject(ui.params, paramsObj);
      if (paramsObj.ranges) mergeObject(ui.params.ranges, paramsObj.ranges);
    }
    mgraphics.redraw();
    return;
  }

  if (selector === "synth") {
    var synthObj = parseJsonOrNull(args[0]);
    if (synthObj) mergeObject(ui.synth, synthObj);
    mgraphics.redraw();
    return;
  }

  if (selector === "serial_ports") {
    var arr = parseJsonOrNull(args[0]);
    if (arr && arr.length) {
      ui.serialPorts = arr;
      if (!ui.serialPort || ui.serialPorts.indexOf(ui.serialPort) < 0) {
        ui.serialPort = ui.serialPorts[0];
        ui.serialPortIndex = 0;
      } else {
        ui.serialPortIndex = ui.serialPorts.indexOf(ui.serialPort);
      }
    } else {
      ui.serialPorts = [];
      ui.serialPortIndex = -1;
    }
    mgraphics.redraw();
    return;
  }

  if (selector === "serial_ports_list") {
    var list = [];
    var i;
    for (i = 0; i < args.length; i++) list.push(String(args[i]));
    ui.serialPorts = list;
    if (list.length && (!ui.serialPort || list.indexOf(ui.serialPort) < 0)) {
      ui.serialPort = list[0];
      ui.serialPortIndex = 0;
    }
    mgraphics.redraw();
    return;
  }

  if (selector === "midi_bytes") {
    // Optional visual hook for local note control.
    return;
  }

  if (selector === "serial_write") {
    ui.statusDetail = String(args[0] || "");
    mgraphics.redraw();
    return;
  }
}

function loadbang() {
  send("set_auto_reconnect", ui.autoReconnect);
  send("set_emit_mode", ui.emitMode);
  send("enable_serial_telemetry", ui.serialTelemetry);
  send("list_serial_ports");
  send("request_params");
  send("request_synth");
  send("request_state");
}
