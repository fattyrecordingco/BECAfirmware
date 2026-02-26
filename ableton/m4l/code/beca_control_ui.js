autowatch = 1;
inlets = 1;
outlets = 1;

mgraphics.init();
mgraphics.relative_coords = 0;
mgraphics.autofill = 0;

var NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
var PAGE_IDS = ["all", "input", "output", "theory", "led", "engine"];

var COLORS = {
  bg: [0.12, 0.13, 0.15, 1],
  panel: [0.16, 0.17, 0.19, 1],
  panel2: [0.11, 0.12, 0.14, 1],
  border: [0.28, 0.29, 0.32, 1],
  text: [0.88, 0.90, 0.92, 1],
  dim: [0.64, 0.67, 0.71, 1],
  blue: [0.16, 0.54, 0.88, 1],
  green: [0.20, 0.74, 0.44, 1],
  amber: [0.92, 0.58, 0.20, 1],
  red: [0.90, 0.34, 0.32, 1]
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
  page: "all",
  showSection: { input: 1, output: 1, theory: 1, led: 1, engine: 1 },
  statusState: "ready",
  statusDetail: "idle",

  state: {
    mode: 0,
    scale: 0,
    root: 0,
    clock: 0,
    lo: 3,
    hi: 6,
    bpm: 120,
    swing: 8,
    sens: 0.2,
    outputmode: 0,
    io_muted: 0,
    daw_sync: 0,
    fx: 0,
    vs: 160,
    vi: 200,
    bright: 154,
    rest: 0.12,
    nr: 1,
    drumsel: 255,
    ts: "4/4",
    last: "60",
    vel: 90
  },
  synth: {
    preset: 0,
    wave_a: 0,
    wave_b: 1,
    osc_mix: 0.5,
    mono: 1,
    voices: 1,
    attack: 0.03,
    decay: 0.20,
    sustain: 0.70,
    release: 0.20,
    filter: 0,
    cutoff: 6400,
    resonance: 1.0,
    reverb: 0.1,
    delay_ms: 100,
    delay_feedback: 0.2,
    delay_mix: 0.1,
    drive: 0.2,
    master: 0.7,
    detune: 2.0,
    gain_trim: 0.95,
    drumkit: 0
  },
  params: {
    modes: ["Notes", "Arpeggiator", "Chords", "Drum Machine"],
    scales: ["Major", "Minor", "Dorian", "Lydian", "Mixolydian", "Pent Minor", "Pent Major", "Harm Minor", "Phrygian", "Whole Tone", "Maj7", "Min7", "Dom7", "Sus2", "Sus4"],
    time_signatures: ["4-4", "3-4", "5-4", "6-8"],
    output_modes: ["BLE", "SERIAL", "AUX OUT"],
    clock_modes: ["Internal", "Plant"],
    synth_presets: ["Fatty Neon Lead", "Prism Poly Lead", "Verdant Pad"],
    ranges: {
      bpm: [20, 240], swing: [0, 60], sens: [0, 0.5], lo: [1, 9], hi: [1, 9],
      rest: [0, 0.8], bright: [10, 255], cutoff: [20, 18000], resonance: [0.1, 10],
      attack: [0, 5], decay: [0, 5], sustain: [0, 1], release: [0.01, 10],
      delay_ms: [0, 800], delay_feedback: [0, 0.95], delay_mix: [0, 1],
      drive: [0, 1], master: [0, 1], detune: [0, 8], gain_trim: [0.45, 1]
    }
  },

  serialPorts: [],
  serialPortIndex: -1,
  plantVal: 0,
  plantRaw: 0,
  plantRaw2: 0,
  plantBuffer: [],
  plantBufferMax: 200,
  lastMidi: { on: 0, note: 60, vel: 0, ch: 1 },
  activeNotes: {},

  hotspots: [],
  editingField: "",
  drag: null,
  lastSentAt: {}
};

var SECTION = {
  input: [
    { label: "Play Mode", src: "state", key: "mode", type: "choice", optionsKey: "modes", sendKey: "mode" },
    { label: "Sensitivity", src: "state", key: "sens", type: "slider", rangeKey: "sens", step: 0.01, sendKey: "sens" },
    { label: "Oct Low", src: "state", key: "lo", type: "slider", rangeKey: "lo", step: 1, sendKey: "lo" },
    { label: "Oct High", src: "state", key: "hi", type: "slider", rangeKey: "hi", step: 1, sendKey: "hi" }
  ],
  output: [
    { label: "Output", src: "state", key: "outputmode", type: "choice", optionsKey: "output_modes", sendKey: "outputmode" },
    { label: "Mute I/O", src: "state", key: "io_muted", type: "toggle", sendKey: "mute" },
    { label: "DAW Sync", src: "state", key: "daw_sync", type: "toggle", sendKey: "sync" }
  ],
  theory: [
    { label: "Scale", src: "state", key: "scale", type: "choice", optionsKey: "scales", sendKey: "scale" },
    { label: "Root", src: "state", key: "root", type: "choice", optionsArray: NOTE_NAMES, sendKey: "root" },
    { label: "Clock", src: "state", key: "clock", type: "choice", optionsKey: "clock_modes", sendKey: "clock" },
    { label: "Time Sig", src: "state", key: "ts", type: "choice", optionsKey: "time_signatures", sendKey: "ts", sendByValue: 1 },
    { label: "BPM", src: "state", key: "bpm", type: "slider", rangeKey: "bpm", step: 1, sendKey: "bpm" },
    { label: "Swing", src: "state", key: "swing", type: "slider", rangeKey: "swing", step: 1, sendKey: "swing" }
  ],
  led: [
    { label: "FX", src: "state", key: "fx", type: "slider", min: 0, max: 9, step: 1, sendKey: "fx" },
    { label: "Vis Speed", src: "state", key: "vs", type: "slider", min: 0, max: 255, step: 1, sendKey: "vs" },
    { label: "Vis Int", src: "state", key: "vi", type: "slider", min: 0, max: 255, step: 1, sendKey: "vi" },
    { label: "Brightness", src: "state", key: "bright", type: "slider", rangeKey: "bright", step: 1, sendKey: "bright" },
    { label: "Rest Prob", src: "state", key: "rest", type: "slider", rangeKey: "rest", step: 0.01, sendKey: "rest" },
    { label: "Avoid Repeats", src: "state", key: "nr", type: "toggle", sendKey: "nr" },
    { label: "Drum Select", src: "state", key: "drumsel", type: "drummask", sendKey: "drumsel" }
  ],
  engine: [
    { label: "Preset", src: "synth", key: "preset", type: "choice", optionsKey: "synth_presets", sendKey: "preset" },
    { label: "Wave A", src: "synth", key: "wave_a", type: "slider", min: 0, max: 3, step: 1, sendKey: "wave_a" },
    { label: "Wave B", src: "synth", key: "wave_b", type: "slider", min: 0, max: 3, step: 1, sendKey: "wave_b" },
    { label: "Osc Mix", src: "synth", key: "osc_mix", type: "slider", min: 0, max: 1, step: 0.01, sendKey: "osc_mix" },
    { label: "Mono", src: "synth", key: "mono", type: "toggle", sendKey: "mono" },
    { label: "Voices", src: "synth", key: "voices", type: "slider", min: 1, max: 12, step: 1, sendKey: "voices" },
    { label: "Attack", src: "synth", key: "attack", type: "slider", rangeKey: "attack", step: 0.01, sendKey: "attack" },
    { label: "Decay", src: "synth", key: "decay", type: "slider", rangeKey: "decay", step: 0.01, sendKey: "decay" },
    { label: "Sustain", src: "synth", key: "sustain", type: "slider", rangeKey: "sustain", step: 0.01, sendKey: "sustain" },
    { label: "Release", src: "synth", key: "release", type: "slider", rangeKey: "release", step: 0.01, sendKey: "release" },
    { label: "Filter", src: "synth", key: "filter", type: "slider", min: 0, max: 2, step: 1, sendKey: "filter" },
    { label: "Cutoff", src: "synth", key: "cutoff", type: "slider", rangeKey: "cutoff", step: 1, sendKey: "cutoff" },
    { label: "Resonance", src: "synth", key: "resonance", type: "slider", rangeKey: "resonance", step: 0.01, sendKey: "resonance" },
    { label: "Reverb", src: "synth", key: "reverb", type: "slider", min: 0, max: 1, step: 0.01, sendKey: "reverb" },
    { label: "Delay", src: "synth", key: "delay_ms", type: "slider", rangeKey: "delay_ms", step: 1, sendKey: "delay_ms" },
    { label: "Feedback", src: "synth", key: "delay_feedback", type: "slider", rangeKey: "delay_feedback", step: 0.01, sendKey: "delay_feedback" },
    { label: "Delay Mix", src: "synth", key: "delay_mix", type: "slider", rangeKey: "delay_mix", step: 0.01, sendKey: "delay_mix" },
    { label: "Drive", src: "synth", key: "drive", type: "slider", rangeKey: "drive", step: 0.01, sendKey: "drive" },
    { label: "Master", src: "synth", key: "master", type: "slider", rangeKey: "master", step: 0.01, sendKey: "master" },
    { label: "Detune", src: "synth", key: "detune", type: "slider", rangeKey: "detune", step: 0.01, sendKey: "detune" },
    { label: "Gain Trim", src: "synth", key: "gain_trim", type: "slider", rangeKey: "gain_trim", step: 0.01, sendKey: "gain_trim" },
    { label: "Drum Kit", src: "synth", key: "drumkit", type: "slider", min: 0, max: 2, step: 1, sendKey: "drumkit" }
  ]
};
function clip(v, lo, hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function canvasSize() {
  var w = 950;
  var h = 240;
  try {
    if (mgraphics.size && mgraphics.size.length >= 2) {
      w = Number(mgraphics.size[0]) || w;
      h = Number(mgraphics.size[1]) || h;
    }
  } catch (e) {}
  if (w < 380) w = 380;
  if (h < 130) h = 130;
  return [w, h];
}

function rect(x, y, w, h) { return { x: x, y: y, w: w, h: h }; }

function ptInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function fillRect(r, c) {
  mgraphics.set_source_rgba(c[0], c[1], c[2], c[3]);
  mgraphics.rectangle(r.x, r.y, r.w, r.h);
  mgraphics.fill();
}

function strokeRect(r, c, w) {
  mgraphics.set_source_rgba(c[0], c[1], c[2], c[3]);
  mgraphics.set_line_width(w || 1);
  mgraphics.rectangle(r.x, r.y, r.w, r.h);
  mgraphics.stroke();
}

function drawText(t, x, y, size, c, align) {
  mgraphics.set_source_rgba(c[0], c[1], c[2], c[3]);
  mgraphics.select_font_face("Arial");
  mgraphics.set_font_size(size);
  var tw = mgraphics.text_measure(t)[0];
  var tx = x;
  if (align === "center") tx = x - tw * 0.5;
  else if (align === "right") tx = x - tw;
  mgraphics.move_to(tx, y);
  mgraphics.show_text(t);
}

function addHotspot(r, kind, payload) {
  ui.hotspots.push({ rect: r, kind: kind, payload: payload });
}

function send() {
  var args = arrayfromargs(arguments);
  outlet(0, args);
}

function sendParam(key, val) {
  var now = new Date().getTime();
  if ((now - (ui.lastSentAt[key] || 0)) < 50) return;
  ui.lastSentAt[key] = now;
  send("set_param", key, String(val));
}

function sourceFor(control) { return control.src === "synth" ? ui.synth : ui.state; }
function getVal(control) { var src = sourceFor(control); return src[control.key]; }
function setVal(control, value) { var src = sourceFor(control); src[control.key] = value; }

function rangeFor(control) {
  if (control.rangeKey && ui.params.ranges && ui.params.ranges[control.rangeKey]) return ui.params.ranges[control.rangeKey];
  return [typeof control.min !== "undefined" ? control.min : 0, typeof control.max !== "undefined" ? control.max : 1];
}

function optsFor(control) {
  if (control.optionsArray) return control.optionsArray;
  if (control.optionsKey && ui.params[control.optionsKey]) return ui.params[control.optionsKey];
  return [];
}

function toSigToken(v) { return String(v || "").replace("/", "-"); }

function badgeColor() {
  if (ui.statusState === "connected") return COLORS.green;
  if (ui.statusState === "warn") return COLORS.amber;
  if (ui.statusState === "error") return COLORS.red;
  return COLORS.dim;
}

function drawButton(r, label, on, kind, payload) {
  fillRect(r, on ? [COLORS.blue[0], COLORS.blue[1], COLORS.blue[2], 0.35] : COLORS.panel2);
  strokeRect(r, on ? COLORS.blue : COLORS.border, 1);
  drawText(label, r.x + r.w * 0.5, r.y + r.h * 0.68, 9, COLORS.text, "center");
  addHotspot(r, kind, payload);
}

function drawField(r, label, value, fieldId) {
  var on = (ui.editingField === fieldId);
  fillRect(r, on ? [COLORS.blue[0], COLORS.blue[1], COLORS.blue[2], 0.22] : COLORS.panel2);
  strokeRect(r, on ? COLORS.blue : COLORS.border, 1);
  drawText(label, r.x + 4, r.y + 8, 7, COLORS.dim, "left");
  drawText(String(value), r.x + 4, r.y + r.h - 4, 9, COLORS.text, "left");
  addHotspot(r, "field", fieldId);
}

function drawTopBars(w) {
  var pad = 4;
  var y = pad;
  var head = rect(pad, y, w - pad * 2, 18);
  fillRect(head, COLORS.panel);
  strokeRect(head, COLORS.border, 1);
  drawText("BECA Control", head.x + 6, head.y + 13, 10, COLORS.text, "left");
  drawText("Ableton Live MIDI Effect", head.x + 106, head.y + 13, 8, COLORS.dim, "left");
  drawText("Status: " + ui.statusState + "  " + ui.statusDetail, head.x + head.w - 6, head.y + 13, 8, badgeColor(), "right");

  y += 21;
  var nav = rect(pad, y, w - pad * 2, 19);
  fillRect(nav, COLORS.panel2);
  strokeRect(nav, COLORS.border, 1);
  var x = nav.x + 4;
  var i;
  for (i = 0; i < PAGE_IDS.length; i++) {
    var id = PAGE_IDS[i];
    var label = id === "all" ? "All" : id === "input" ? "Input" : id === "output" ? "Output" : id === "theory" ? "Theory" : id === "led" ? "LED FX" : "Engine";
    var bw = id === "theory" ? 50 : id === "engine" ? 50 : 46;
    drawButton(rect(x, nav.y + 2, bw, nav.h - 4), label, ui.page === id, "page", id);
    x += bw + 3;
  }
  return y + 22;
}

function drawConnection(w, y) {
  var pad = 4;
  var box = rect(pad, y, w - pad * 2, 64);
  fillRect(box, COLORS.panel);
  strokeRect(box, COLORS.border, 1);
  drawText("Connection", box.x + 5, box.y + 9, 8, COLORS.dim, "left");

  drawButton(rect(box.x + 5, box.y + 11, 48, 15), "HTTP", ui.mode === "http", "mode", "http");
  drawButton(rect(box.x + 55, box.y + 11, 48, 15), "Serial", ui.mode === "serial", "mode", "serial");
  drawButton(rect(box.x + 105, box.y + 11, 44, 15), "Mock", ui.mode === "mock", "mode", "mock");

  drawButton(rect(box.x + box.w - 151, box.y + 11, 47, 15), "Connect", 0, "action", "connect");
  drawButton(rect(box.x + box.w - 101, box.y + 11, 47, 15), "Discon", 0, "action", "disconnect");
  drawButton(rect(box.x + box.w - 51, box.y + 11, 47, 15), "Refresh", 0, "action", "refresh");

  drawButton(rect(box.x + 5, box.y + 28, 78, 14), "Auto Reconn", ui.autoReconnect !== 0, "flag", "auto");
  drawButton(rect(box.x + 86, box.y + 28, 74, 14), "Serial Tele", ui.serialTelemetry !== 0, "flag", "telemetry");
  drawButton(rect(box.x + 163, box.y + 28, 54, 14), "Reemit", ui.emitMode === "reemit", "emit", "reemit");
  drawButton(rect(box.x + 220, box.y + 28, 54, 14), "Monitor", ui.emitMode === "monitor", "emit", "monitor");

  if (ui.mode === "serial") {
    drawField(rect(box.x + 5, box.y + 44, 150, 18), "Serial Port", ui.serialPort, "serialPort");
    drawButton(rect(box.x + 157, box.y + 45, 14, 14), "<", 0, "action", "port_prev");
    drawButton(rect(box.x + 173, box.y + 45, 14, 14), ">", 0, "action", "port_next");
    drawField(rect(box.x + 189, box.y + 44, 62, 18), "Baud", ui.baud, "baud");
  } else {
    drawField(rect(box.x + 5, box.y + 44, 140, 18), "IP", ui.ip, "ip");
    drawField(rect(box.x + 148, box.y + 44, 62, 18), "Port", ui.port, "port");
  }
  return y + box.h + 3;
}
function drawPlant(area) {
  fillRect(area, COLORS.panel2);
  strokeRect(area, COLORS.border, 1);
  drawText("Plant", area.x + 4, area.y + 9, 8, COLORS.dim, "left");
  drawText("n " + ui.plantVal.toFixed(3) + "  r1 " + ui.plantRaw + "  r2 " + ui.plantRaw2, area.x + area.w - 4, area.y + 9, 8, COLORS.dim, "right");
  var g = rect(area.x + 3, area.y + 11, area.w - 6, area.h - 14);
  fillRect(g, [0.09, 0.10, 0.11, 1]);
  strokeRect(g, [0.23, 0.24, 0.26, 1], 1);
  if (ui.plantBuffer.length > 1) {
    mgraphics.set_source_rgba(COLORS.blue[0], COLORS.blue[1], COLORS.blue[2], 0.9);
    mgraphics.set_line_width(1);
    var i;
    for (i = 0; i < ui.plantBuffer.length; i++) {
      var xx = g.x + (i / Math.max(1, ui.plantBufferMax - 1)) * g.w;
      var yy = g.y + (1 - clip(ui.plantBuffer[i], 0, 1)) * g.h;
      if (i === 0) mgraphics.move_to(xx, yy); else mgraphics.line_to(xx, yy);
    }
    mgraphics.stroke();
  }
}

function drawMidi(area) {
  fillRect(area, COLORS.panel2);
  strokeRect(area, COLORS.border, 1);
  var ev = ui.lastMidi;
  drawText("MIDI", area.x + 4, area.y + 9, 8, COLORS.dim, "left");
  drawText((ev.on ? "ON" : "OFF") + " n" + ev.note + " v" + ev.vel + " ch" + ev.ch, area.x + area.w - 4, area.y + 9, 8, COLORS.dim, "right");

  var g = rect(area.x + 3, area.y + 11, area.w - 6, area.h - 14);
  fillRect(g, [0.09, 0.10, 0.11, 1]);
  strokeRect(g, [0.23, 0.24, 0.26, 1], 1);
  var rows = 4;
  var cols = 12;
  var cw = g.w / cols;
  var rh = g.h / rows;
  var r, c;
  for (r = 0; r < rows; r++) {
    for (c = 0; c < cols; c++) {
      var midi = 36 + ((rows - 1 - r) * 12) + c;
      var rr = rect(g.x + c * cw + 1, g.y + r * rh + 1, cw - 2, rh - 2);
      var on = ui.activeNotes[midi] ? 1 : 0;
      fillRect(rr, on ? [COLORS.green[0], COLORS.green[1], COLORS.green[2], 0.75] : [0.18, 0.19, 0.21, 1]);
      if (r === rows - 1) drawText(NOTE_NAMES[c], rr.x + rr.w * 0.5, rr.y + rr.h * 0.68, 6, on ? COLORS.text : COLORS.dim, "center");
      addHotspot(rr, "midi", midi);
    }
  }
}

function valueText(control, v) {
  if (control.type === "toggle") return Number(v) ? "ON" : "OFF";
  if (control.type === "choice") {
    var opts = optsFor(control);
    var idx = 0;
    if (control.sendByValue) {
      var token = toSigToken(v);
      var i;
      for (i = 0; i < opts.length; i++) if (toSigToken(opts[i]) === token) idx = i;
      var t = String(opts[idx] || v);
      return t.replace("-", "/");
    }
    idx = clip(Math.round(Number(v) || 0), 0, Math.max(0, opts.length - 1));
    return String(opts[idx] || v);
  }
  var n = Number(v);
  if (!isFinite(n)) return String(v);
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  if (Math.abs(n) >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

function drawControl(control, r) {
  fillRect(r, COLORS.panel2);
  strokeRect(r, COLORS.border, 1);
  var v = getVal(control);
  drawText(control.label, r.x + 3, r.y + 8, 7, COLORS.dim, "left");

  if (control.type === "toggle") {
    var on = Number(v) ? 1 : 0;
    var tg = rect(r.x + r.w - 32, r.y + 2, 29, r.h - 4);
    fillRect(tg, on ? [COLORS.green[0], COLORS.green[1], COLORS.green[2], 0.65] : [0.20, 0.21, 0.23, 1]);
    strokeRect(tg, on ? COLORS.green : COLORS.border, 1);
    drawText(on ? "ON" : "OFF", tg.x + tg.w * 0.5, tg.y + tg.h * 0.68, 7, COLORS.text, "center");
    addHotspot(r, "ctl_toggle", control);
    return;
  }

  if (control.type === "choice") {
    drawText(valueText(control, v), r.x + 3, r.y + r.h - 3, 8, COLORS.text, "left");
    drawText("< >", r.x + r.w - 4, r.y + r.h - 3, 7, COLORS.dim, "right");
    addHotspot(r, "ctl_choice", control);
    return;
  }

  if (control.type === "drummask") {
    var mask = parseInt(v, 10) || 0;
    var i;
    var pw = (r.w - 8) / 8;
    for (i = 0; i < 8; i++) {
      var bitOn = (mask & (1 << i)) !== 0;
      var pr = rect(r.x + 3 + i * pw, r.y + 9, pw - 1, r.h - 11);
      fillRect(pr, bitOn ? [COLORS.blue[0], COLORS.blue[1], COLORS.blue[2], 0.75] : [0.20, 0.21, 0.23, 1]);
      strokeRect(pr, bitOn ? COLORS.blue : COLORS.border, 1);
      drawText(String(i + 1), pr.x + pr.w * 0.5, pr.y + pr.h * 0.7, 6, COLORS.text, "center");
      addHotspot(pr, "drum_bit", { control: control, bit: i });
    }
    return;
  }

  var rg = rangeFor(control);
  var minv = Number(rg[0]);
  var maxv = Number(rg[1]);
  if (maxv <= minv) maxv = minv + 1;
  var t = clip((Number(v) - minv) / (maxv - minv), 0, 1);
  var bar = rect(r.x + 3, r.y + r.h - 8, r.w - 6, 5);
  fillRect(bar, [0.20, 0.21, 0.23, 1]);
  fillRect(rect(bar.x, bar.y, bar.w * t, bar.h), [COLORS.blue[0], COLORS.blue[1], COLORS.blue[2], 0.95]);
  strokeRect(bar, COLORS.border, 1);
  drawText(valueText(control, v), r.x + r.w - 3, r.y + 8, 7, COLORS.text, "right");
  addHotspot(r, "ctl_slider", control);
}

function drawSection(sectionId, bounds, dense) {
  fillRect(bounds, COLORS.panel);
  strokeRect(bounds, COLORS.border, 1);
  var title = sectionId === "input" ? "Input" : sectionId === "output" ? "Output" : sectionId === "theory" ? "Music Theory" : sectionId === "led" ? "LED / FX" : "Engine";
  drawText(title, bounds.x + 4, bounds.y + 10, 8, COLORS.text, "left");
  drawButton(rect(bounds.x + bounds.w - 40, bounds.y + 1, 36, 12), "Open", ui.page === sectionId, "page", sectionId);

  var content = rect(bounds.x + 3, bounds.y + 14, bounds.w - 6, bounds.h - 17);
  var list = SECTION[sectionId] || [];
  var cols = dense ? 1 : (content.w > 370 ? 2 : 1);
  var gap = 3;
  var cw = (content.w - gap * (cols - 1)) / cols;
  var ch = dense ? 20 : 22;
  var i;
  for (i = 0; i < list.length; i++) {
    var row = Math.floor(i / cols);
    var col = i % cols;
    var rr = rect(content.x + col * (cw + gap), content.y + row * (ch + gap), cw, ch);
    if (rr.y + rr.h > content.y + content.h) break;
    drawControl(list[i], rr);
  }
}
function drawMain(w, y, h) {
  var pad = 4;
  var main = rect(pad, y, w - pad * 2, h - y - pad);

  if (ui.page !== "all") {
    drawSection(ui.page, main, 0);
    return;
  }

  fillRect(main, COLORS.panel);
  strokeRect(main, COLORS.border, 1);
  drawText("Sections", main.x + 4, main.y + 10, 8, COLORS.dim, "left");
  var labels = { input: "Input", output: "Output", theory: "Theory", led: "LED", engine: "Engine" };
  var keys = ["input", "output", "theory", "led", "engine"];
  var i;
  var x = main.x + 45;
  for (i = 0; i < keys.length; i++) {
    var id = keys[i];
    drawButton(rect(x, main.y + 1, 45, 12), labels[id], ui.showSection[id] !== 0, "section_toggle", id);
    x += 47;
  }

  var content = rect(main.x + 3, main.y + 15, main.w - 6, main.h - 18);
  var active = [];
  for (i = 0; i < keys.length; i++) if (ui.showSection[keys[i]]) active.push(keys[i]);
  if (!active.length) {
    drawText("Enable section buttons above", content.x + 4, content.y + 12, 9, COLORS.dim, "left");
    return;
  }

  var cols = content.w > 900 ? 3 : (content.w > 620 ? 2 : 1);
  var gap = 4;
  var cardW = (content.w - gap * (cols - 1)) / cols;
  var cardH = 120;
  var maxRows = Math.max(1, Math.floor((content.h + gap) / (cardH + gap)));
  for (i = 0; i < active.length; i++) {
    var row = Math.floor(i / cols);
    if (row >= maxRows) break;
    var col = i % cols;
    var cr = rect(content.x + col * (cardW + gap), content.y + row * (cardH + gap), cardW, cardH);
    drawSection(active[i], cr, 1);
  }
}

function drawAll() {
  ui.hotspots = [];
  var sz = canvasSize();
  var w = sz[0];
  var h = sz[1];
  fillRect(rect(0, 0, w, h), COLORS.bg);

  var y = drawTopBars(w);
  y = drawConnection(w, y);

  var pad = 4;
  var monH = 42;
  drawPlant(rect(pad, y, (w - pad * 2 - 3) * 0.5, monH));
  drawMidi(rect(pad + (w - pad * 2 - 3) * 0.5 + 3, y, (w - pad * 2 - 3) * 0.5, monH));
  y += monH + 3;

  drawMain(w, y, h);
}

function paint() {
  try {
    drawAll();
  } catch (e) {
    var sz = canvasSize();
    fillRect(rect(0, 0, sz[0], sz[1]), [0.19, 0.11, 0.11, 1]);
    drawText("BECA UI script error", 8, 18, 12, [1, 0.8, 0.8, 1], "left");
    drawText(String(e), 8, 34, 9, [1, 0.9, 0.9, 1], "left");
    try { post("BECA jsui error: " + e + "\n"); } catch (_ignored) {}
  }
}

function onresize(w, h) { mgraphics.redraw(); }
function bang() { mgraphics.redraw(); }

function applySlider(control, x) {
  if (!ui.drag) return;
  var r = ui.drag.rect;
  var rg = rangeFor(control);
  var minv = Number(rg[0]);
  var maxv = Number(rg[1]);
  if (maxv <= minv) maxv = minv + 1;
  var t = clip((x - (r.x + 3)) / Math.max(1, r.w - 6), 0, 1);
  var v = minv + t * (maxv - minv);
  if (control.step) v = Math.round(v / control.step) * control.step;
  if ((control.step || 0) >= 1) v = Math.round(v);
  setVal(control, v);
  sendParam(control.sendKey || control.key, v);
  mgraphics.redraw();
}

function cycleChoice(control, dir) {
  var opts = optsFor(control);
  if (!opts.length) return;
  var current = getVal(control);
  var idx = 0;
  if (control.sendByValue) {
    var token = toSigToken(current);
    var i;
    for (i = 0; i < opts.length; i++) if (toSigToken(opts[i]) === token) idx = i;
  } else {
    idx = parseInt(current, 10) || 0;
  }
  idx = (idx + dir + opts.length) % opts.length;
  if (control.sendByValue) {
    var outv = String(opts[idx]);
    setVal(control, outv.replace("-", "/"));
    sendParam(control.sendKey || control.key, outv);
  } else {
    setVal(control, idx);
    sendParam(control.sendKey || control.key, idx);
  }
}

function handleHotspot(h, x, y) {
  if (h.kind === "page") {
    ui.page = String(h.payload);
    mgraphics.redraw();
    return;
  }
  if (h.kind === "section_toggle") {
    var sid = String(h.payload);
    ui.showSection[sid] = ui.showSection[sid] ? 0 : 1;
    mgraphics.redraw();
    return;
  }
  if (h.kind === "mode") {
    ui.mode = String(h.payload);
    send("set_mode", ui.mode);
    mgraphics.redraw();
    return;
  }
  if (h.kind === "action") {
    var a = String(h.payload);
    if (a === "connect") {
      if (ui.mode === "serial") send("connect_serial", ui.serialPort, parseInt(ui.baud, 10) || 115200);
      else if (ui.mode === "mock") send("connect_mock");
      else send("connect_http", ui.ip, parseInt(ui.port, 10) || 80);
    } else if (a === "disconnect") send("disconnect");
    else if (a === "refresh") {
      send("list_serial_ports");
      send("request_state");
      send("request_fast");
      send("request_params");
      send("request_synth");
    } else if (a === "port_prev") {
      if (ui.serialPorts.length) {
        ui.serialPortIndex = (ui.serialPortIndex - 1 + ui.serialPorts.length) % ui.serialPorts.length;
        ui.serialPort = ui.serialPorts[ui.serialPortIndex];
      }
    } else if (a === "port_next") {
      if (ui.serialPorts.length) {
        ui.serialPortIndex = (ui.serialPortIndex + 1) % ui.serialPorts.length;
        ui.serialPort = ui.serialPorts[ui.serialPortIndex];
      }
    }
    mgraphics.redraw();
    return;
  }
  if (h.kind === "flag") {
    if (h.payload === "auto") {
      ui.autoReconnect = ui.autoReconnect ? 0 : 1;
      send("set_auto_reconnect", ui.autoReconnect);
    } else {
      ui.serialTelemetry = ui.serialTelemetry ? 0 : 1;
      send("enable_serial_telemetry", ui.serialTelemetry);
    }
    mgraphics.redraw();
    return;
  }
  if (h.kind === "emit") {
    ui.emitMode = String(h.payload);
    send("set_emit_mode", ui.emitMode);
    mgraphics.redraw();
    return;
  }
  if (h.kind === "field") {
    ui.editingField = String(h.payload);
    mgraphics.redraw();
    return;
  }
  if (h.kind === "midi") {
    var midi = parseInt(h.payload, 10) || 60;
    send("manual_note", 1, midi, 100, 1);
    send("manual_note", 0, midi, 0, 1);
    ui.lastMidi = { on: 1, note: midi, vel: 100, ch: 1 };
    mgraphics.redraw();
    return;
  }
  if (h.kind === "ctl_toggle") {
    var c1 = h.payload;
    var next = Number(getVal(c1)) ? 0 : 1;
    setVal(c1, next);
    sendParam(c1.sendKey || c1.key, next);
    mgraphics.redraw();
    return;
  }
  if (h.kind === "ctl_choice") {
    cycleChoice(h.payload, x < (h.rect.x + h.rect.w * 0.5) ? -1 : 1);
    mgraphics.redraw();
    return;
  }
  if (h.kind === "ctl_slider") {
    ui.drag = { control: h.payload, rect: h.rect };
    applySlider(ui.drag.control, x);
    return;
  }
  if (h.kind === "drum_bit") {
    var d = h.payload;
    var control = d.control;
    var mask = parseInt(getVal(control), 10) || 0;
    mask = mask ^ (1 << d.bit);
    setVal(control, mask);
    sendParam(control.sendKey || control.key, mask);
    mgraphics.redraw();
  }
}

function onclick(x, y, but, cmd, shift, capslock, option, ctrl) {
  ui.drag = null;
  ui.editingField = "";
  var i;
  for (i = ui.hotspots.length - 1; i >= 0; i--) {
    if (ptInRect(x, y, ui.hotspots[i].rect)) {
      handleHotspot(ui.hotspots[i], x, y);
      return;
    }
  }
  mgraphics.redraw();
}

function ondrag(x, y, but, cmd, shift, capslock, option, ctrl) {
  if (!but) {
    ui.drag = null;
    return;
  }
  if (ui.drag && ui.drag.control) applySlider(ui.drag.control, x);
}
function key(k) {
  if (!ui.editingField) return;
  var id = ui.editingField;
  var current = String(ui[id] || "");
  if (k === 27) {
    ui.editingField = "";
    mgraphics.redraw();
    return;
  }
  if (k === 8 || k === 127) {
    if (current.length) ui[id] = current.substring(0, current.length - 1);
    mgraphics.redraw();
    return;
  }
  if (k === 13 || k === 3) {
    ui.editingField = "";
    mgraphics.redraw();
    return;
  }
  if (k >= 32 && k <= 126) {
    ui[id] = current + String.fromCharCode(k);
    mgraphics.redraw();
  }
}

function merge(dst, src) {
  var k;
  for (k in src) if (src.hasOwnProperty(k)) dst[k] = src[k];
}

function parseJson(s) {
  try { return JSON.parse(String(s || "")); }
  catch (e) { return null; }
}

function updateActiveFromCsv(csv) {
  ui.activeNotes = {};
  var s = String(csv || "");
  if (!s.length) return;
  var arr = s.split(",");
  var i;
  for (i = 0; i < arr.length; i++) {
    var n = parseInt(arr[i], 10);
    if (!isNaN(n)) ui.activeNotes[n] = 1;
  }
}

function anything() {
  var args = arrayfromargs(arguments);
  var sel = messagename;

  if (sel === "status") {
    ui.statusState = args.length ? String(args[0]) : "";
    ui.statusDetail = args.length > 1 ? String(args[1]) : "";
    mgraphics.redraw();
    return;
  }
  if (sel === "plant") {
    ui.plantVal = Number(args[0]) || 0;
    ui.plantRaw = Number(args[1]) || 0;
    ui.plantRaw2 = Number(args[2]) || 0;
    ui.plantBuffer.push(ui.plantVal);
    while (ui.plantBuffer.length > ui.plantBufferMax) ui.plantBuffer.shift();
    mgraphics.redraw();
    return;
  }
  if (sel === "midi_event") {
    var on = Number(args[0]) !== 0;
    var note = parseInt(args[1], 10) || 0;
    var vel = parseInt(args[2], 10) || 0;
    var ch = parseInt(args[3], 10) || 1;
    ui.lastMidi = { on: on ? 1 : 0, note: note, vel: vel, ch: ch };
    if (on) ui.activeNotes[note] = 1; else delete ui.activeNotes[note];
    mgraphics.redraw();
    return;
  }
  if (sel === "note_grid") {
    updateActiveFromCsv(args[0]);
    mgraphics.redraw();
    return;
  }
  if (sel === "state") {
    var st = parseJson(args[0]);
    if (st) {
      merge(ui.state, st);
      ui.state.ts = String(ui.state.ts || "4/4").replace("-", "/");
    }
    mgraphics.redraw();
    return;
  }
  if (sel === "params") {
    var p = parseJson(args[0]);
    if (p) {
      merge(ui.params, p);
      if (p.ranges) {
        if (!ui.params.ranges) ui.params.ranges = {};
        merge(ui.params.ranges, p.ranges);
      }
    }
    mgraphics.redraw();
    return;
  }
  if (sel === "synth") {
    var sy = parseJson(args[0]);
    if (sy) merge(ui.synth, sy);
    mgraphics.redraw();
    return;
  }
  if (sel === "serial_ports") {
    var ports = parseJson(args[0]);
    if (ports && ports.length) {
      ui.serialPorts = ports;
      if (!ui.serialPort || ui.serialPorts.indexOf(ui.serialPort) < 0) {
        ui.serialPort = ui.serialPorts[0];
        ui.serialPortIndex = 0;
      } else ui.serialPortIndex = ui.serialPorts.indexOf(ui.serialPort);
    } else {
      ui.serialPorts = [];
      ui.serialPortIndex = -1;
    }
    mgraphics.redraw();
    return;
  }
  if (sel === "serial_ports_list") {
    var list = [];
    var i;
    for (i = 0; i < args.length; i++) list.push(String(args[i]));
    ui.serialPorts = list;
    if (list.length) {
      ui.serialPort = list[0];
      ui.serialPortIndex = 0;
    }
    mgraphics.redraw();
  }
}

function loadbang() {
  send("set_auto_reconnect", ui.autoReconnect);
  send("set_emit_mode", ui.emitMode);
  send("enable_serial_telemetry", ui.serialTelemetry);
  send("list_serial_ports");
  send("request_state");
  send("request_fast");
  send("request_params");
  send("request_synth");
}
