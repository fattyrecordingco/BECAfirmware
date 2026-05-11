autowatch = 1;
inlets = 1;
outlets = 1;

mgraphics.init();
mgraphics.relative_coords = 0;
mgraphics.autofill = 0;

var NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
var SECTION_IDS = ["input", "output", "theory", "led", "engine"];

var COLORS = {
  bg: [0.098, 0.103, 0.112, 1],
  panel: [0.152, 0.158, 0.168, 1],
  panelSoft: [0.132, 0.138, 0.148, 1],
  panelDeep: [0.084, 0.090, 0.098, 1],
  border: [0.256, 0.264, 0.278, 1],
  text: [0.90, 0.91, 0.93, 1],
  dim: [0.61, 0.63, 0.66, 1],
  accent: [0.24, 0.54, 0.86, 1],
  amber: [0.93, 0.66, 0.28, 1],
  good: [0.26, 0.71, 0.44, 1],
  warn: [0.91, 0.66, 0.27, 1],
  bad: [0.86, 0.35, 0.33, 1],
};

var FONT_MAIN = "Arial";

var FALLBACK_PARAMS = {
  modes: ["Notes", "Arpeggiator", "Chords", "Drum Machine"],
  scales: ["Major", "Minor", "Dorian", "Lydian", "Mixolydian", "Pent Minor", "Pent Major", "Harm Minor", "Phrygian", "Whole Tone", "Maj7", "Min7", "Dom7", "Sus2", "Sus4"],
  time_signatures: ["1-1", "2-2", "2-4", "3-4", "4-4", "5-4", "7-4", "6-8", "9-8", "12-8", "4-8", "4-16", "8-32"],
  output_modes: ["BLE", "SERIAL", "AUX OUT"],
  clock_modes: ["Internal", "Plant"],
  synth_presets: ["Fatty Neon Lead", "Prism Poly Lead", "Verdant Pad", "Forest Choir Pad", "Thick Mono Bass", "Rubber Bass"],
  ranges: {
    bpm: [20, 240], swing: [0, 60], sens: [0, 0.5], lo: [1, 9], hi: [1, 9],
    rest: [0, 0.8], bright: [10, 255], cutoff: [20, 18000], resonance: [0.1, 10],
    attack: [0, 5], decay: [0, 5], sustain: [0, 1], release: [0.01, 10],
    delay_ms: [0, 800], delay_feedback: [0, 0.95], delay_mix: [0, 1],
    drive: [0, 1], master: [0, 1], detune: [0, 8], gain_trim: [0.45, 1]
  }
};

var ui = {
  section: "input",
  pageBySection: { input: 0, output: 0, theory: 0, led: 0, engine: 0 },
  statusState: "ready",
  statusDetail: "idle",
  host: "",
  deviceName: "beca-blk",
  port: 80,
  targetHost: "",
  targetPort: 80,
  targetDevice: "beca-blk",
  targetConnected: 0,
  targetLastConnected: "",
  targetMode: "http",
  emitMode: "monitor",
  autoReconnect: 1,
  lastUiAction: "init",
  lastOutbound: "",
  lastInbound: "",
  plantVal: 0,
  plantRaw: 0,
  plantRaw2: 0,
  plantHistory: [],
  midiNote: 60,
  midiVel: 0,
  midiCh: 1,
  midiBins: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  params: deepClone(FALLBACK_PARAMS),
  state: {
    mode: 0, scale: 0, root: 0, clock: 0,
    bpm: 120, swing: 8, sens: 0.2, lo: 3, hi: 6,
    outputmode: 0, io_muted: 0, daw_sync: 0,
    fx: 0, pal: 0, vs: 160, vi: 210, bright: 154, rest: 0.12, nr: 1, drumsel: 255,
    ts: "4/4"
  },
  synth: {
    preset: 0, wave_a: 0, wave_b: 1, osc_mix: 0.5, mono: 1, voices: 1,
    attack: 0.03, decay: 0.18, sustain: 0.72, release: 0.2,
    filter: 0, cutoff: 6400, resonance: 1, reverb: 0.15,
    delay_ms: 120, delay_feedback: 0.2, delay_mix: 0.1,
    drive: 0.2, master: 0.7, detune: 2, gain_trim: 0.95, drumkit: 0
  },
  hotspots: [],
  drag: null,
  lastPointerAt: 0,
  lastPointerX: -9999,
  lastPointerY: -9999,
  lastSentAt: {},
  pendingByPath: {},
  nodeReady: 0,
  initSent: 0,
  bootstrapTask: null,
  stateVerifyTask: null,
  reconnectTask: null,
  decayTask: null,
};

function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

function ctl(label, src, key, kind, extra) {
  var out = { label: label, src: src, key: key, kind: kind };
  if (extra) {
    var k;
    for (k in extra) if (extra.hasOwnProperty(k)) out[k] = extra[k];
  }
  return out;
}

var SECTIONS = {
  input: [
    ctl("Mode", "state", "mode", "choice", { optionsKey: "modes", sendKey: "mode" }),
    ctl("Sens", "state", "sens", "encoder", { rangeKey: "sens", step: 0.01, sendKey: "sens" }),
    ctl("Oct Low", "state", "lo", "encoder", { rangeKey: "lo", step: 1, sendKey: "lo" }),
    ctl("Oct High", "state", "hi", "encoder", { rangeKey: "hi", step: 1, sendKey: "hi" }),
  ],
  output: [
    ctl("Output", "state", "outputmode", "choice", { optionsKey: "output_modes", sendKey: "outputmode" }),
    ctl("Mute", "state", "io_muted", "toggle", { sendKey: "mute" }),
    ctl("DAW Sync", "state", "daw_sync", "toggle", { sendKey: "sync" }),
  ],
  theory: [
    ctl("Scale", "state", "scale", "choice", { optionsKey: "scales", sendKey: "scale" }),
    ctl("Root", "state", "root", "choice", { optionsArray: NOTE_NAMES, sendKey: "root" }),
    ctl("Clock", "state", "clock", "choice", { optionsKey: "clock_modes", sendKey: "clock" }),
    ctl("Time Sig", "state", "ts", "choice", { optionsKey: "time_signatures", sendKey: "ts", sendByValue: 1 }),
    ctl("BPM", "state", "bpm", "encoder", { rangeKey: "bpm", step: 1, sendKey: "bpm" }),
    ctl("Swing", "state", "swing", "encoder", { rangeKey: "swing", step: 1, sendKey: "swing" }),
  ],
  led: [
    ctl("FX", "state", "fx", "encoder", { min: 0, max: 9, step: 1, sendKey: "fx" }),
    ctl("Palette", "state", "pal", "encoder", { min: 0, max: 20, step: 1, sendKey: "pal" }),
    ctl("Speed", "state", "vs", "encoder", { min: 0, max: 255, step: 1, sendKey: "vs" }),
    ctl("Int", "state", "vi", "encoder", { min: 0, max: 255, step: 1, sendKey: "vi" }),
    ctl("Bright", "state", "bright", "encoder", { rangeKey: "bright", step: 1, sendKey: "bright" }),
    ctl("Rest", "state", "rest", "encoder", { rangeKey: "rest", step: 0.01, sendKey: "rest" }),
    ctl("No Repeat", "state", "nr", "toggle", { sendKey: "nr" }),
    ctl("Drum Sel", "state", "drumsel", "encoder", { min: 0, max: 255, step: 1, sendKey: "drumsel" }),
  ],
  engine: [
    ctl("Preset", "synth", "preset", "choice", { optionsKey: "synth_presets", sendKey: "preset" }),
    ctl("Reset", "synth", "preset_reset", "action", { sendKey: "preset_reset", actionValue: 1 }),
    ctl("Wave A", "synth", "wave_a", "encoder", { min: 0, max: 3, step: 1, sendKey: "wave_a" }),
    ctl("Wave B", "synth", "wave_b", "encoder", { min: 0, max: 3, step: 1, sendKey: "wave_b" }),
    ctl("Osc Mix", "synth", "osc_mix", "encoder", { min: 0, max: 1, step: 0.01, sendKey: "osc_mix" }),
    ctl("Mono", "synth", "mono", "toggle", { sendKey: "mono" }),
    ctl("Voices", "synth", "voices", "encoder", { min: 1, max: 12, step: 1, sendKey: "voices" }),
    ctl("Attack", "synth", "attack", "encoder", { rangeKey: "attack", step: 0.01, sendKey: "attack" }),
    ctl("Decay", "synth", "decay", "encoder", { rangeKey: "decay", step: 0.01, sendKey: "decay" }),
    ctl("Sustain", "synth", "sustain", "encoder", { rangeKey: "sustain", step: 0.01, sendKey: "sustain" }),
    ctl("Release", "synth", "release", "encoder", { rangeKey: "release", step: 0.01, sendKey: "release" }),
    ctl("Filter", "synth", "filter", "encoder", { min: 0, max: 2, step: 1, sendKey: "filter" }),
    ctl("Cutoff", "synth", "cutoff", "encoder", { rangeKey: "cutoff", step: 1, sendKey: "cutoff" }),
    ctl("Reso", "synth", "resonance", "encoder", { rangeKey: "resonance", step: 0.01, sendKey: "resonance" }),
    ctl("Reverb", "synth", "reverb", "encoder", { min: 0, max: 1, step: 0.01, sendKey: "reverb" }),
    ctl("Delay", "synth", "delay_ms", "encoder", { rangeKey: "delay_ms", step: 1, sendKey: "delay_ms" }),
    ctl("Feedback", "synth", "delay_feedback", "encoder", { rangeKey: "delay_feedback", step: 0.01, sendKey: "delay_feedback" }),
    ctl("D Mix", "synth", "delay_mix", "encoder", { rangeKey: "delay_mix", step: 0.01, sendKey: "delay_mix" }),
    ctl("Drive", "synth", "drive", "encoder", { rangeKey: "drive", step: 0.01, sendKey: "drive" }),
    ctl("Master", "synth", "master", "encoder", { rangeKey: "master", step: 0.01, sendKey: "master" }),
    ctl("Detune", "synth", "detune", "encoder", { rangeKey: "detune", step: 0.01, sendKey: "detune" }),
    ctl("Gain", "synth", "gain_trim", "encoder", { rangeKey: "gain_trim", step: 0.01, sendKey: "gain_trim" }),
    ctl("Kit", "synth", "drumkit", "encoder", { min: 0, max: 2, step: 1, sendKey: "drumkit" }),
  ]
};

var SEND_META = {};

function initSendMeta() {
  SEND_META = {};
  var sid;
  var i;
  for (sid in SECTIONS) {
    if (!SECTIONS.hasOwnProperty(sid)) continue;
    for (i = 0; i < SECTIONS[sid].length; i++) {
      var c = SECTIONS[sid][i];
      var sk = String(c.sendKey || c.key || "");
      if (!sk.length) continue;
      if (!SEND_META[sk]) SEND_META[sk] = { src: c.src, key: c.key, kind: c.kind };
    }
  }
  if (!SEND_META.mute) SEND_META.mute = { src: "state", key: "io_muted", kind: "toggle" };
  if (!SEND_META.sync) SEND_META.sync = { src: "state", key: "daw_sync", kind: "toggle" };
}

initSendMeta();

function clip(v, lo, hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function asInt(v, d) {
  var n = parseInt(v, 10);
  return isNaN(n) ? d : n;
}

function asNum(v, d) {
  var n = Number(v);
  return isFinite(n) ? n : d;
}

function token(v) {
  return String(v || "").trim().toLowerCase().replace("/", "-");
}

function sourceObj(control) {
  return control.src === "synth" ? ui.synth : ui.state;
}

function getValue(control) {
  return sourceObj(control)[control.key];
}

function setValue(control, v) {
  sourceObj(control)[control.key] = v;
}

function rangeFor(control) {
  if (control.rangeKey && ui.params && ui.params.ranges && ui.params.ranges[control.rangeKey]) {
    return ui.params.ranges[control.rangeKey];
  }
  var lo = typeof control.min !== "undefined" ? control.min : 0;
  var hi = typeof control.max !== "undefined" ? control.max : 1;
  return [lo, hi];
}

function optionsFor(control) {
  if (control.optionsArray) return control.optionsArray;
  if (control.optionsKey && ui.params && ui.params[control.optionsKey]) return ui.params[control.optionsKey];
  return [];
}

function sendCmd() {
  var args = arrayfromargs(arguments);
  var i;
  var parts = [];
  for (i = 0; i < args.length; i++) parts.push(String(args[i]));
  ui.lastOutbound = parts.join(" ");
  outlet(0, args);
}

function sendParam(key, value) {
  var now = new Date().getTime();
  var k = String(key || "");
  if ((now - (ui.lastSentAt[k] || 0)) < 35) return;
  ui.lastSentAt[k] = now;
  rememberPending(k, value);
  ui.lastUiAction = "ui." + k + "=" + String(value);
  sendCmd("set_param", k, String(value));
  scheduleStateVerify();
}

function pendingPath(meta) {
  if (!meta) return "";
  return String(meta.src || "") + "." + String(meta.key || "");
}

function metaForSendKey(sendKey) {
  var k = String(sendKey || "");
  if (!k.length) return null;
  if (SEND_META[k]) return SEND_META[k];
  return null;
}

function rememberPending(sendKey, value) {
  var meta = metaForSendKey(sendKey);
  if (!meta) return;
  if (meta.kind === "action") return;
  var path = pendingPath(meta);
  if (!path.length) return;
  var now = new Date().getTime();
  ui.pendingByPath[path] = {
    value: String(value),
    until: now + 1200,
    at: now
  };
}

function valuesEquivalent(key, incomingValue, expectedValue) {
  if (String(key || "") === "ts") return token(incomingValue) === token(expectedValue);
  var ni = Number(incomingValue);
  var ne = Number(expectedValue);
  if (isFinite(ni) && isFinite(ne)) return Math.abs(ni - ne) <= 0.015;
  return token(incomingValue) === token(expectedValue);
}

function shouldApplyInboundValue(srcName, key, incomingValue) {
  var path = String(srcName || "") + "." + String(key || "");
  var pending = ui.pendingByPath[path];
  if (!pending) return 1;
  var now = new Date().getTime();
  if (valuesEquivalent(key, incomingValue, pending.value)) {
    delete ui.pendingByPath[path];
    return 1;
  }
  if (now >= asInt(pending.until, 0)) {
    delete ui.pendingByPath[path];
    return 1;
  }
  return 0;
}

function mergeWithPending(dst, src, srcName) {
  if (!dst || !src) return;
  var k;
  for (k in src) {
    if (!src.hasOwnProperty(k)) continue;
    if (shouldApplyInboundValue(srcName, k, src[k])) dst[k] = src[k];
  }
}

function scheduleStateVerify() {
  if (ui.stateVerifyTask) {
    try { ui.stateVerifyTask.cancel(); } catch (_e1) {}
  }
  ui.stateVerifyTask = new Task(function () {
    ui.stateVerifyTask = null;
    sendCmd("request_state");
  }, this);
  ui.stateVerifyTask.schedule(140);
}

function canvasSize() {
  var w = 1224;
  var h = 180;
  try {
    if (mgraphics.size && mgraphics.size.length >= 2) {
      w = Number(mgraphics.size[0]) || w;
      h = Number(mgraphics.size[1]) || h;
    }
  } catch (_e) {}
  if (w < 420) w = 420;
  if (h < 118) h = 118;
  return [w, h];
}

function rect(x, y, w, h) {
  return { x: x, y: y, w: w, h: h };
}

function ptInRect(x, y, r) {
  return x >= r.x && x <= (r.x + r.w) && y >= r.y && y <= (r.y + r.h);
}

function fillRect(r, c) {
  mgraphics.set_source_rgba(c[0], c[1], c[2], c[3]);
  mgraphics.rectangle(r.x, r.y, r.w, r.h);
  mgraphics.fill();
}

function strokeRect(r, c, lw) {
  mgraphics.set_source_rgba(c[0], c[1], c[2], c[3]);
  mgraphics.set_line_width(lw || 1);
  mgraphics.rectangle(r.x, r.y, r.w, r.h);
  mgraphics.stroke();
}

function drawText(text, x, y, size, color, align) {
  mgraphics.set_source_rgba(color[0], color[1], color[2], color[3]);
  mgraphics.select_font_face(FONT_MAIN);
  mgraphics.set_font_size(size);
  var tw = mgraphics.text_measure(text)[0];
  var tx = x;
  if (align === "center") tx = x - tw * 0.5;
  else if (align === "right") tx = x - tw;
  mgraphics.move_to(tx, y);
  mgraphics.show_text(text);
}

function fitText(text, maxW, size) {
  var str = String(text || "");
  if (maxW <= 8 || !str.length) return "";
  mgraphics.select_font_face(FONT_MAIN);
  mgraphics.set_font_size(size);
  if (mgraphics.text_measure(str)[0] <= maxW) return str;
  var suffix = "...";
  var out = str;
  while (out.length > 1 && mgraphics.text_measure(out + suffix)[0] > maxW) {
    out = out.slice(0, out.length - 1);
  }
  return out + suffix;
}

function addHotspot(r, kind, data) {
  ui.hotspots.push({ rect: r, kind: kind, data: data });
}

function statusColor() {
  var s = String(ui.statusState || "").toLowerCase();
  if (s === "connected") return COLORS.good;
  if (s === "discovering" || s === "identified" || s === "connecting" || s === "warn") return COLORS.warn;
  if (s === "error") return COLORS.bad;
  return COLORS.dim;
}

function targetLabel() {
  var host = String(ui.targetLastConnected || ui.targetHost || ui.host || "");
  if (!host.length) host = String(ui.targetDevice || ui.deviceName || "beca") + ".local";
  return host + ":" + asInt(ui.targetPort || ui.port, 80);
}

function targetDeviceLabel() {
  var name = String(ui.targetDevice || ui.deviceName || "BECA");
  var host = String(ui.targetLastConnected || ui.targetHost || ui.host || "");
  if (!host.length) host = name + ".local";
  return name + " @ " + host;
}

function pushPlantValue(v) {
  var n = clip(asNum(v, 0), 0, 1);
  ui.plantHistory.push(n);
  if (ui.plantHistory.length > 120) ui.plantHistory.shift();
}

function midiBucket(note) {
  var n = asInt(note, 60);
  while (n < 0) n += 12;
  return n % 12;
}

function decayMidiBins() {
  var i;
  for (i = 0; i < ui.midiBins.length; i++) {
    ui.midiBins[i] *= 0.89;
    if (ui.midiBins[i] < 0.01) ui.midiBins[i] = 0;
  }
  mgraphics.redraw();
  if (ui.decayTask) ui.decayTask.schedule(90);
}

function ensureDecayTask() {
  if (ui.decayTask) {
    try { ui.decayTask.cancel(); } catch (_e1) {}
  }
  ui.decayTask = new Task(decayMidiBins, this);
  ui.decayTask.schedule(120);
}

function formatNumber(v) {
  var n = asNum(v, 0);
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  if (Math.abs(n) >= 100) return n.toFixed(1);
  if (Math.abs(n) >= 10) return n.toFixed(2);
  return n.toFixed(3);
}

function valueText(control, value) {
  if (control.kind === "toggle") return asInt(value, 0) ? "ON" : "OFF";
  if (control.kind === "action") return "TRIG";
  if (control.kind === "choice") {
    var opts = optionsFor(control);
    if (!opts.length) return String(value);
    if (control.sendByValue) {
      var t = token(value);
      var i;
      var idx = 0;
      for (i = 0; i < opts.length; i++) if (token(opts[i]) === t) idx = i;
      return String(opts[idx]).replace("-", "/");
    }
    var pos = clip(asInt(value, 0), 0, opts.length - 1);
    return String(opts[pos]).replace("-", "/");
  }
  return formatNumber(value);
}

function normalizedValue(control, value) {
  if (control.kind === "toggle" || control.kind === "action") return asInt(value, 0) ? 1 : 0;
  if (control.kind === "choice") {
    var opts = optionsFor(control);
    if (opts.length <= 1) return 0;
    var idx = 0;
    if (control.sendByValue) {
      var t = token(value);
      var i;
      for (i = 0; i < opts.length; i++) if (token(opts[i]) === t) idx = i;
    } else {
      idx = clip(asInt(value, 0), 0, opts.length - 1);
    }
    return idx / (opts.length - 1);
  }
  var rg = rangeFor(control);
  var lo = asNum(rg[0], 0);
  var hi = asNum(rg[1], 1);
  if (hi <= lo) hi = lo + 1;
  return clip((asNum(value, lo) - lo) / (hi - lo), 0, 1);
}

function applyControlValue(control, newValue, sendNow) {
  if (control.kind === "action") {
    if (sendNow) sendParam(control.sendKey || control.key, typeof control.actionValue !== "undefined" ? control.actionValue : 1);
    return;
  }

  if (control.kind === "toggle") {
    var vT = asInt(newValue, 0) ? 1 : 0;
    setValue(control, vT);
    if (sendNow) sendParam(control.sendKey || control.key, vT);
    return;
  }

  if (control.kind === "choice") {
    var opts = optionsFor(control);
    if (!opts.length) return;
    var idx = clip(asInt(newValue, 0), 0, opts.length - 1);
    if (control.sendByValue) {
      var tokenOut = String(opts[idx]);
      setValue(control, tokenOut.replace("-", "/"));
      if (sendNow) sendParam(control.sendKey || control.key, tokenOut);
    } else {
      setValue(control, idx);
      if (sendNow) sendParam(control.sendKey || control.key, idx);
    }
    return;
  }

  var rg = rangeFor(control);
  var lo = asNum(rg[0], 0);
  var hi = asNum(rg[1], 1);
  var v = asNum(newValue, lo);
  v = clip(v, lo, hi);
  if (control.step) v = Math.round(v / control.step) * control.step;
  setValue(control, v);
  if (sendNow) sendParam(control.sendKey || control.key, v);
}

function incrementChoice(control, delta) {
  var opts = optionsFor(control);
  if (!opts.length) return;
  var idx = 0;
  var value = getValue(control);
  if (control.sendByValue) {
    var t = token(value);
    var i;
    for (i = 0; i < opts.length; i++) if (token(opts[i]) === t) idx = i;
  } else {
    idx = asInt(value, 0);
  }
  idx = clip(idx + delta, 0, opts.length - 1);
  applyControlValue(control, idx, 1);
}

function activeControls() {
  var list = SECTIONS[ui.section] || [];
  var page = asInt(ui.pageBySection[ui.section], 0);
  var sz = canvasSize();
  var target = sz[1] >= 250 ? 150 : sz[1] >= 200 ? 136 : 122;
  var slots = Math.floor((sz[0] - 84) / target);
  slots = clip(slots, 3, 8);
  var totalPages = Math.max(1, Math.ceil(list.length / slots));
  page = clip(page, 0, totalPages - 1);
  ui.pageBySection[ui.section] = page;
  return {
    controls: list.slice(page * slots, page * slots + slots),
    page: page,
    pages: totalPages,
    slots: slots,
    total: list.length
  };
}

function compactControlGeometry(areaW) {
  var leftShare = areaW >= 1460 ? 0.40 : areaW >= 1180 ? 0.44 : areaW >= 980 ? 0.48 : 0.54;
  var leftW = Math.floor(areaW * leftShare);
  if ((areaW - leftW) < 320) leftW = areaW - 320;
  leftW = clip(leftW, 320, areaW - 220);
  var cols = leftW >= 640 ? 3 : 2;
  var rows = 2;
  return {
    leftW: leftW,
    cols: cols,
    rows: rows,
    perPage: cols * rows
  };
}

function sectionPaging(sectionId, perPage) {
  var list = SECTIONS[sectionId] || [];
  var pp = Math.max(1, perPage || 1);
  var pages = Math.max(1, Math.ceil(list.length / pp));
  var page = clip(asInt(ui.pageBySection[sectionId], 0), 0, pages - 1);
  ui.pageBySection[sectionId] = page;
  return {
    page: page,
    pages: pages,
    list: list.slice(page * pp, page * pp + pp)
  };
}

function drawHeader(w, h) {
  var compact = h < 175 || w < 980;
  var topH = compact ? 25 : 29;
  var top = rect(4, 4, w - 8, topH);
  fillRect(top, COLORS.panelSoft);
  strokeRect(top, COLORS.border, 1);
  var om = clip(asInt(ui.state.outputmode, 0), 0, 2);
  var labels = ["BLE", "SERIAL", "AUX"];
  var modeW = w < 760 ? 146 : w < 980 ? 160 : 178;
  var modeGap = 2;
  var modeBtnW = Math.floor((modeW - modeGap * 2) / 3);
  var modeX = top.x + top.w - modeW - 4;
  var modeY = top.y + Math.floor((top.h - 16) * 0.5);

  var textX = top.x + 6;
  var textW = modeX - textX - 8;
  var deviceText = fitText(targetDeviceLabel(), Math.max(30, textW - 88), 7.0);
  drawText("BECA Control", textX, top.y + 10, 8.9, COLORS.text, "left");
  if (deviceText.length) drawText(deviceText, textX + 86, top.y + 10, 7.0, COLORS.dim, "left");

  var status = String(ui.statusState || "").toUpperCase();
  var statusLine = (ui.targetConnected ? "CONNECTED " : "CONNECTING ") + targetLabel();
  var detailLine = compact ? ("RX " + ui.lastInbound) : ("Status " + status + " | TX " + ui.lastOutbound + " | RX " + ui.lastInbound);
  var lineColor = ui.targetConnected ? COLORS.good : COLORS.amber;
  drawText(fitText(statusLine, textW, 7.1), textX, top.y + (compact ? 19 : 21), 7.1, lineColor, "left");
  if (!compact && textW > 240) {
    drawText(fitText(detailLine, textW, 6.4), textX, top.y + 14, 6.4, statusColor(), "left");
  }

  var i;
  for (i = 0; i < 3; i++) {
    var bx = modeX + i * (modeBtnW + modeGap);
    var r = rect(bx, modeY, modeBtnW, 16);
    fillRect(r, i === om ? [COLORS.accent[0], COLORS.accent[1], COLORS.accent[2], 0.34] : COLORS.panelDeep);
    strokeRect(r, i === om ? COLORS.accent : COLORS.border, 1);
    drawText(labels[i], r.x + r.w * 0.5, r.y + 11, 7.0, COLORS.text, "center");
    addHotspot(r, "outmode", i);
  }
}

function drawTabs(w, h) {
  var compact = h < 175 || w < 980;
  var barY = compact ? 31 : 35;
  var barH = compact ? 20 : 21;
  var bar = rect(4, barY, w - 8, barH);
  fillRect(bar, COLORS.panelSoft);
  strokeRect(bar, COLORS.border, 1);

  var labels = {
    input: "Input",
    output: "Output",
    theory: "Theory",
    led: "LED FX",
    engine: "Engine"
  };

  var info = activeControls();
  if (compact && h <= 175) {
    var contentW = w - 10;
    var geom = compactControlGeometry(contentW);
    info = sectionPaging(ui.section, geom.perPage);
  }
  var pageText = "Page " + (info.page + 1) + "/" + info.pages;
  var pageW = 84;
  var tabGap = 3;
  var innerW = bar.w - 8 - pageW;
  var tabW = Math.floor((innerW - tabGap * (SECTION_IDS.length - 1)) / SECTION_IDS.length);
  tabW = clip(tabW, 48, 96);
  var x = bar.x + 4;
  var i;
  for (i = 0; i < SECTION_IDS.length; i++) {
    var id = SECTION_IDS[i];
    var r = rect(x, bar.y + 1, tabW, bar.h - 3);
    fillRect(r, ui.section === id ? [COLORS.accent[0], COLORS.accent[1], COLORS.accent[2], 0.28] : COLORS.panelDeep);
    strokeRect(r, ui.section === id ? COLORS.accent : COLORS.border, 1);
    drawText(labels[id], r.x + r.w * 0.5, r.y + (compact ? 11 : 12), compact ? 7.0 : 7.2, COLORS.text, "center");
    addHotspot(r, "section", id);
    x += r.w + tabGap;
  }

  drawText(pageText, bar.x + bar.w - 6, bar.y + (compact ? 12 : 13), compact ? 6.8 : 7.0, COLORS.dim, "right");
}

function drawMeters(w, h, y0, monitorH) {
  if (monitorH <= 0) return y0;
  var row = rect(4, y0, w - 8, monitorH);
  fillRect(row, COLORS.panelSoft);
  strokeRect(row, COLORS.border, 1);

  var gap = 6;
  var inner = rect(row.x + 4, row.y + 4, row.w - 8, row.h - 8);
  var split = inner.w >= 1300 ? 0.60 : inner.w >= 980 ? 0.57 : inner.w >= 760 ? 0.54 : 0.50;
  var graphW = Math.floor((inner.w - gap) * split);
  if ((inner.w - graphW - gap) < 170) graphW = Math.floor((inner.w - gap) * 0.5);
  var graphPanel = rect(inner.x, inner.y, graphW, inner.h);
  var midiPanel = rect(graphPanel.x + graphPanel.w + gap, inner.y, inner.x + inner.w - (graphPanel.x + graphPanel.w + gap), inner.h);

  fillRect(graphPanel, COLORS.panel);
  strokeRect(graphPanel, COLORS.border, 1);
  drawText("Plant Input", graphPanel.x + 4, graphPanel.y + 10, 6.9, COLORS.text, "left");
  drawText("n " + formatNumber(ui.plantVal) + " | raw " + ui.plantRaw, graphPanel.x + graphPanel.w - 4, graphPanel.y + 10, 6.5, COLORS.dim, "right");

  var graph = rect(graphPanel.x + 3, graphPanel.y + 13, graphPanel.w - 6, graphPanel.h - 16);
  fillRect(graph, COLORS.panelDeep);
  strokeRect(graph, COLORS.border, 1);

  var gx;
  var gy;
  var i;
  mgraphics.set_line_width(0.8);
  mgraphics.set_source_rgba(COLORS.border[0], COLORS.border[1], COLORS.border[2], 0.35);
  for (i = 1; i < 4; i++) {
    gy = graph.y + (graph.h * i / 4);
    mgraphics.move_to(graph.x + 1, gy);
    mgraphics.line_to(graph.x + graph.w - 1, gy);
  }
  for (i = 1; i < 10; i++) {
    gx = graph.x + (graph.w * i / 10);
    mgraphics.move_to(gx, graph.y + 1);
    mgraphics.line_to(gx, graph.y + graph.h - 1);
  }
  mgraphics.stroke();

  if (ui.plantHistory.length > 1) {
    var n = ui.plantHistory.length;
    var step = (graph.w - 2) / Math.max(1, n - 1);
    mgraphics.set_source_rgba(COLORS.good[0], COLORS.good[1], COLORS.good[2], 0.95);
    mgraphics.set_line_width(1.5);
    for (i = 0; i < n; i++) {
      gx = graph.x + 1 + i * step;
      gy = graph.y + graph.h - 1 - clip(ui.plantHistory[i], 0, 1) * (graph.h - 2);
      if (i === 0) mgraphics.move_to(gx, gy);
      else mgraphics.line_to(gx, gy);
    }
    mgraphics.stroke();
  }

  fillRect(midiPanel, COLORS.panel);
  strokeRect(midiPanel, COLORS.border, 1);
  drawText("MIDI Monitor", midiPanel.x + 4, midiPanel.y + 10, 6.9, COLORS.text, "left");
  drawText("n" + ui.midiNote + "  v" + ui.midiVel + "  ch" + ui.midiCh, midiPanel.x + midiPanel.w - 4, midiPanel.y + 10, 6.5, COLORS.dim, "right");

  var midi = rect(midiPanel.x + 3, midiPanel.y + 13, midiPanel.w - 6, midiPanel.h - 16);
  fillRect(midi, COLORS.panelDeep);
  strokeRect(midi, COLORS.border, 1);
  var bw = (midi.w - 4) / 12;
  var b;
  for (b = 0; b < 12; b++) {
    var amp = clip(ui.midiBins[b], 0, 1);
    var base = rect(midi.x + 2 + b * bw + 1, midi.y + midi.h - 5, Math.max(2, bw - 3), 3);
    fillRect(base, [0.13, 0.14, 0.16, 1]);
    if (amp > 0.01) {
      fillRect(rect(base.x, base.y - amp * (midi.h - 8), base.w, amp * (midi.h - 8)), [COLORS.accent[0], COLORS.accent[1], COLORS.accent[2], 0.9]);
    }
  }

  if (monitorH >= 52) {
    for (b = 0; b < 12; b++) {
      drawText(NOTE_NAMES[b], midi.x + 2 + b * bw + Math.max(2, bw - 3) * 0.5, midi.y + midi.h - 7, 5.3, COLORS.dim, "center");
    }
  }

  return row.y + row.h + 4;
}

function drawEncoder(control, r) {
  fillRect(r, COLORS.panel);
  strokeRect(r, COLORS.border, 1);

  var value = getValue(control);
  var compactCard = r.h < 64;
  var tinyCard = r.h < 48;
  var labelSize = tinyCard ? 6.8 : compactCard ? 7.2 : 7.6;
  var valueSize = tinyCard ? 6.8 : 7.3;
  var labelText = fitText(control.label, r.w - 6, labelSize);

  if (control.kind === "choice") {
    drawText(labelText, r.x + 3, r.y + 11, labelSize, COLORS.dim, "left");
    var dropH = tinyCard ? 15 : 18;
    var drop = rect(r.x + 3, r.y + r.h - (dropH + 3), r.w - 6, dropH);
    var arrW = dropH;
    fillRect(drop, COLORS.panelDeep);
    strokeRect(drop, COLORS.border, 1);
    var leftBtn = rect(drop.x + 1, drop.y + 1, arrW - 2, drop.h - 2);
    var rightBtn = rect(drop.x + drop.w - arrW + 1, drop.y + 1, arrW - 2, drop.h - 2);
    fillRect(leftBtn, COLORS.panel);
    fillRect(rightBtn, COLORS.panel);
    strokeRect(leftBtn, COLORS.border, 1);
    strokeRect(rightBtn, COLORS.border, 1);
    drawText("<", leftBtn.x + leftBtn.w * 0.5, leftBtn.y + (tinyCard ? 10 : 12), valueSize, COLORS.text, "center");
    drawText(">", rightBtn.x + rightBtn.w * 0.5, rightBtn.y + (tinyCard ? 10 : 12), valueSize, COLORS.text, "center");

    var valueX = drop.x + arrW + 3;
    var valueW = drop.w - (arrW * 2 + 6);
    drawText(fitText(valueText(control, value), valueW, valueSize), valueX, drop.y + (tinyCard ? 10 : 12), valueSize, COLORS.text, "left");
    addHotspot(r, "control", control);
    return;
  }

  if (control.kind === "toggle") {
    drawText(labelText, r.x + r.w * 0.5, r.y + 11, labelSize, COLORS.dim, "center");
    var on = asInt(value, 0) ? 1 : 0;
    var tH = tinyCard ? 15 : 18;
    var t = rect(r.x + 5, r.y + r.h - (tH + 3), r.w - 10, tH);
    fillRect(t, on ? [COLORS.good[0], COLORS.good[1], COLORS.good[2], 0.34] : COLORS.panelDeep);
    strokeRect(t, on ? COLORS.good : COLORS.border, 1);
    drawText(on ? "ON" : "OFF", t.x + t.w * 0.5, t.y + (tinyCard ? 10 : 12), valueSize, COLORS.text, "center");
    addHotspot(r, "control", control);
    return;
  }

  if (control.kind === "action") {
    drawText(labelText, r.x + r.w * 0.5, r.y + 11, labelSize, COLORS.dim, "center");
    var aH = tinyCard ? 15 : 18;
    var a = rect(r.x + 5, r.y + r.h - (aH + 3), r.w - 10, aH);
    fillRect(a, [COLORS.amber[0], COLORS.amber[1], COLORS.amber[2], 0.22]);
    strokeRect(a, COLORS.amber, 1);
    drawText("TRIG", a.x + a.w * 0.5, a.y + (tinyCard ? 10 : 12), valueSize, COLORS.text, "center");
    addHotspot(r, "control", control);
    return;
  }

  var t = normalizedValue(control, value);
  var cx = r.x + r.w * 0.5;
  var cy = r.y + (compactCard ? r.h * 0.50 : r.h * 0.44);
  var rad = Math.min(r.w * (compactCard ? 0.29 : 0.31), r.h * (compactCard ? 0.30 : 0.34));
  if (rad < 8) rad = 8;

  var start = Math.PI * 0.72;
  var span = Math.PI * 1.56;
  var end = start + span * clip(t, 0, 1);

  mgraphics.set_line_width(compactCard ? 1.6 : 2);
  mgraphics.set_source_rgba(0.20, 0.21, 0.24, 1);
  mgraphics.arc(cx, cy, rad, start, start + span);
  mgraphics.stroke();

  mgraphics.set_line_width(compactCard ? 2.1 : 2.6);
  mgraphics.set_source_rgba(COLORS.accent[0], COLORS.accent[1], COLORS.accent[2], 0.95);
  mgraphics.arc(cx, cy, rad, start, end);
  mgraphics.stroke();

  mgraphics.set_source_rgba(COLORS.panelDeep[0], COLORS.panelDeep[1], COLORS.panelDeep[2], 1);
  mgraphics.arc(cx, cy, Math.max(2.5, rad * 0.55), 0, Math.PI * 2);
  mgraphics.fill();

  var ang = start + span * clip(t, 0, 1);
  var px = cx + Math.cos(ang) * (rad - 2);
  var py = cy + Math.sin(ang) * (rad - 2);
  mgraphics.set_source_rgba(COLORS.text[0], COLORS.text[1], COLORS.text[2], 0.9);
  mgraphics.set_line_width(compactCard ? 1.2 : 1.5);
  mgraphics.move_to(cx, cy);
  mgraphics.line_to(px, py);
  mgraphics.stroke();

  drawText(labelText, cx, r.y + 11, labelSize, COLORS.dim, "center");
  drawText(fitText(valueText(control, value), r.w - 6, valueSize), cx, r.y + r.h - 6, valueSize, COLORS.text, "center");

  addHotspot(r, "control", control);
}

function sectionPageControls(sectionId, slots) {
  var list = SECTIONS[sectionId] || [];
  var perPage = Math.max(1, slots);
  var pages = Math.max(1, Math.ceil(list.length / perPage));
  var page = clip(asInt(ui.pageBySection[sectionId], 0), 0, pages - 1);
  ui.pageBySection[sectionId] = page;
  return {
    list: list.slice(page * perPage, page * perPage + perPage),
    page: page,
    pages: pages
  };
}

function drawSectionPanel(sectionId, title, panelRect) {
  fillRect(panelRect, COLORS.panelSoft);
  strokeRect(panelRect, COLORS.border, 1);
  var header = rect(panelRect.x + 1, panelRect.y + 1, panelRect.w - 2, 14);
  fillRect(header, COLORS.panelDeep);
  strokeRect(header, COLORS.border, 1);
  drawText(title, panelRect.x + 4, panelRect.y + 10, 7.0, COLORS.text, "left");

  var minSlotW = panelRect.h > 110 ? 92 : panelRect.h > 86 ? 82 : 72;
  var maxSlots = panelRect.h > 108 ? 4 : panelRect.h > 84 ? 3 : 2;
  var slots = Math.floor((panelRect.w - 18) / minSlotW);
  slots = clip(slots, 1, maxSlots);
  var info = sectionPageControls(sectionId, slots);
  drawText((info.page + 1) + "/" + info.pages, panelRect.x + panelRect.w - 40, panelRect.y + 10, 6.6, COLORS.dim, "right");

  if (info.pages > 1) {
    var prev = rect(panelRect.x + panelRect.w - 32, panelRect.y + 2, 13, 11);
    var next = rect(panelRect.x + panelRect.w - 17, panelRect.y + 2, 13, 11);
    fillRect(prev, COLORS.panelDeep);
    fillRect(next, COLORS.panelDeep);
    strokeRect(prev, COLORS.border, 1);
    strokeRect(next, COLORS.border, 1);
    drawText("<", prev.x + prev.w * 0.5, prev.y + 9, 7.0, COLORS.text, "center");
    drawText(">", next.x + next.w * 0.5, next.y + 9, 7.0, COLORS.text, "center");
    addHotspot(prev, "section_page_prev", sectionId);
    addHotspot(next, "section_page_next", sectionId);
  }

  var inner = rect(panelRect.x + 3, panelRect.y + 17, panelRect.w - 6, panelRect.h - 20);
  if (!info.list.length || inner.w <= 10 || inner.h <= 10) return;

  var gap = inner.h > 60 ? 5 : 4;
  var cw = (inner.w - gap * (info.list.length - 1)) / info.list.length;
  var i;
  for (i = 0; i < info.list.length; i++) {
    drawEncoder(info.list[i], rect(inner.x + i * (cw + gap), inner.y, cw, inner.h));
  }
}

function drawAllDashboard(w, h, yStart) {
  var area = rect(4, yStart, w - 8, h - (yStart + 4));
  if (area.h <= 88) {
    drawControls(w, h, yStart);
    return;
  }
  if (area.h < 126) {
    drawAllCompact(w, h, yStart);
    return;
  }

  fillRect(area, COLORS.panelSoft);
  strokeRect(area, COLORS.border, 1);

  var gx = 4;
  var gy = 4;
  var pw = Math.floor((area.w - gx * 2 - 2) / 3);
  var row1H = Math.floor((area.h - gy - 2) * 0.49);
  var row2H = area.h - row1H - gy - 2;
  if (row1H < 54 || row2H < 54) {
    drawAllCompact(w, h, yStart);
    return;
  }

  drawSectionPanel("input", "Input", rect(area.x + 1, area.y + 1, pw, row1H));
  drawSectionPanel("output", "Output", rect(area.x + 1 + (pw + gx), area.y + 1, pw, row1H));
  drawSectionPanel("theory", "Theory", rect(area.x + 1 + 2 * (pw + gx), area.y + 1, pw, row1H));

  var row2Y = area.y + 1 + row1H + gy;
  drawSectionPanel("led", "LED FX", rect(area.x + 1, row2Y, pw, row2H));
  drawSectionPanel("engine", "Engine", rect(area.x + 1 + (pw + gx), row2Y, area.w - 2 - pw - gx, row2H));
}

function drawAllCompact(w, h, yStart) {
  var area = rect(4, yStart, w - 8, h - (yStart + 4));
  if (area.h <= 64) {
    drawControls(w, h, yStart);
    return;
  }

  fillRect(area, COLORS.panelSoft);
  strokeRect(area, COLORS.border, 1);

  if (area.h >= 128) {
    var rowGap = 4;
    var rowH = Math.floor((area.h - rowGap - 2) / 2);
    var top = ["input", "output", "theory"];
    var bottom = ["led", "engine"];
    var topGap = 4;
    var botGap = 4;
    var topW = Math.floor((area.w - 2 - topGap * (top.length - 1)) / top.length);
    var botW = Math.floor((area.w - 2 - botGap * (bottom.length - 1)) / bottom.length);
    var iTop;
    for (iTop = 0; iTop < top.length; iTop++) {
      drawSectionPanel(top[iTop], sectionLabel(top[iTop]), rect(area.x + 1 + iTop * (topW + topGap), area.y + 1, topW, rowH));
    }
    var iBot;
    var y2 = area.y + 1 + rowH + rowGap;
    for (iBot = 0; iBot < bottom.length; iBot++) {
      drawSectionPanel(bottom[iBot], sectionLabel(bottom[iBot]), rect(area.x + 1 + iBot * (botW + botGap), y2, botW, rowH));
    }
    return;
  }

  var gap = 4;
  var minPanelW = area.h > 88 ? 220 : 240;
  var cols = clip(Math.floor((area.w + gap) / (minPanelW + gap)), 2, 5);
  var ordered = [ui.section];
  var i;
  for (i = 0; i < SECTION_IDS.length; i++) {
    if (SECTION_IDS[i] !== ui.section) ordered.push(SECTION_IDS[i]);
  }

  var shown = ordered.slice(0, cols);
  var pw = Math.floor((area.w - gap * (shown.length - 1) - 2) / shown.length);
  var ph = area.h - 2;
  for (i = 0; i < shown.length; i++) {
    var px = area.x + 1 + i * (pw + gap);
    var pr = rect(px, area.y + 1, pw, ph);
    var sid = shown[i];
    drawSectionPanel(sid, sectionLabel(sid), pr);
  }

  if (shown.length < SECTION_IDS.length) {
    drawText("Use tabs to access remaining sections", area.x + area.w - 6, area.y + 11, 6.5, COLORS.dim, "right");
  }
}

function drawControls(w, h, topY) {
  if (typeof topY === "undefined") topY = h < 170 ? 54 : 60;
  var area = rect(4, topY, w - 8, h - (topY + 4));
  if (area.h <= 34) return;
  fillRect(area, COLORS.panelSoft);
  strokeRect(area, COLORS.border, 1);

  var info = activeControls();
  var controls = info.controls;
  var page = info.page;
  var totalPages = info.pages;

  var sideW = area.h < 68 ? 14 : area.h < 90 ? 16 : 18;
  var prev = rect(area.x + 4, area.y + 4, sideW, area.h - 8);
  var next = rect(area.x + area.w - (sideW + 4), area.y + 4, sideW, area.h - 8);
  fillRect(prev, COLORS.panelDeep);
  fillRect(next, COLORS.panelDeep);
  strokeRect(prev, COLORS.border, 1);
  strokeRect(next, COLORS.border, 1);
  drawText("<", prev.x + prev.w * 0.5, prev.y + prev.h * 0.55, area.h < 84 ? 8 : 10, COLORS.text, "center");
  drawText(">", next.x + next.w * 0.5, next.y + next.h * 0.55, area.h < 84 ? 8 : 10, COLORS.text, "center");
  addHotspot(prev, "page_prev", 0);
  addHotspot(next, "page_next", 0);

  if (!controls.length) return;

  var x0 = area.x + sideW + 8;
  var y0 = area.y + 4;
  var gap = area.h < 78 ? 4 : 6;
  var cw = (area.w - (sideW * 2 + 16) - gap * (controls.length - 1)) / controls.length;
  var i;
  for (i = 0; i < controls.length; i++) {
    drawEncoder(controls[i], rect(x0 + i * (cw + gap), y0, cw, area.h - 8));
  }

  if (totalPages > 1) {
    drawText(sectionLabel(ui.section) + " " + (page + 1) + "/" + totalPages, area.x + area.w * 0.5, area.y + 12, 6.6, COLORS.dim, "center");
  }
}

function drawPlantPanel169(panel) {
  fillRect(panel, COLORS.panel);
  strokeRect(panel, COLORS.border, 1);
  drawText("Plant Input", panel.x + 5, panel.y + 10, 6.9, COLORS.text, "left");
  drawText("n " + formatNumber(ui.plantVal) + " | raw " + ui.plantRaw, panel.x + panel.w - 5, panel.y + 10, 6.6, COLORS.dim, "right");

  var graph = rect(panel.x + 2, panel.y + 13, panel.w - 4, panel.h - 15);
  fillRect(graph, COLORS.panelDeep);
  strokeRect(graph, COLORS.border, 1);

  var i;
  var gx;
  var gy;
  mgraphics.set_line_width(0.7);
  mgraphics.set_source_rgba(COLORS.border[0], COLORS.border[1], COLORS.border[2], 0.32);
  for (i = 1; i < 4; i++) {
    gy = graph.y + (graph.h * i / 4);
    mgraphics.move_to(graph.x + 1, gy);
    mgraphics.line_to(graph.x + graph.w - 1, gy);
  }
  for (i = 1; i < 12; i++) {
    gx = graph.x + (graph.w * i / 12);
    mgraphics.move_to(gx, graph.y + 1);
    mgraphics.line_to(gx, graph.y + graph.h - 1);
  }
  mgraphics.stroke();

  if (ui.plantHistory.length > 1) {
    var n = ui.plantHistory.length;
    var step = (graph.w - 2) / Math.max(1, n - 1);
    mgraphics.set_source_rgba(COLORS.good[0], COLORS.good[1], COLORS.good[2], 0.95);
    mgraphics.set_line_width(1.2);
    for (i = 0; i < n; i++) {
      gx = graph.x + 1 + i * step;
      gy = graph.y + graph.h - 1 - clip(ui.plantHistory[i], 0, 1) * (graph.h - 2);
      if (i === 0) mgraphics.move_to(gx, gy);
      else mgraphics.line_to(gx, gy);
    }
    mgraphics.stroke();
  }
}

function drawMidiPanel169(panel) {
  fillRect(panel, COLORS.panel);
  strokeRect(panel, COLORS.border, 1);
  drawText("MIDI Monitor", panel.x + 5, panel.y + 10, 6.9, COLORS.text, "left");
  drawText("n" + ui.midiNote + "  v" + ui.midiVel + "  ch" + ui.midiCh, panel.x + panel.w - 5, panel.y + 10, 6.6, COLORS.dim, "right");

  var midi = rect(panel.x + 2, panel.y + 13, panel.w - 4, panel.h - 15);
  fillRect(midi, COLORS.panelDeep);
  strokeRect(midi, COLORS.border, 1);

  var bw = (midi.w - 4) / 12;
  var i;
  for (i = 0; i < 12; i++) {
    var amp = clip(ui.midiBins[i], 0, 1);
    var base = rect(midi.x + 2 + i * bw + 1, midi.y + midi.h - 5, Math.max(2, bw - 3), 3);
    fillRect(base, [0.13, 0.14, 0.16, 1]);
    if (amp > 0.01) {
      fillRect(rect(base.x, base.y - amp * (midi.h - 8), base.w, amp * (midi.h - 8)), [COLORS.accent[0], COLORS.accent[1], COLORS.accent[2], 0.92]);
    }
    drawText(NOTE_NAMES[i], base.x + base.w * 0.5, midi.y + midi.h - 7, 5.4, COLORS.dim, "center");
  }
}

function drawCompact169(w, h) {
  var content = rect(4, 54, w - 8, h - 58);
  if (content.h <= 42) {
    drawControls(w, h, 54);
    return;
  }

  fillRect(content, COLORS.panelSoft);
  strokeRect(content, COLORS.border, 1);

  var gap = 6;
  var inner = rect(content.x + 1, content.y + 1, content.w - 2, content.h - 2);
  var geo = compactControlGeometry(inner.w);
  var leftPanel = rect(inner.x, inner.y, geo.leftW, inner.h);
  var rightPanel = rect(leftPanel.x + leftPanel.w + gap, inner.y, inner.w - leftPanel.w - gap, inner.h);

  if (rightPanel.w < 240) {
    drawControls(w, h, 54);
    return;
  }

  fillRect(leftPanel, COLORS.panel);
  strokeRect(leftPanel, COLORS.border, 1);
  var head = rect(leftPanel.x + 1, leftPanel.y + 1, leftPanel.w - 2, 14);
  fillRect(head, COLORS.panelDeep);
  strokeRect(head, COLORS.border, 1);
  drawText(sectionLabel(ui.section), head.x + 4, head.y + 10, 7.1, COLORS.text, "left");

  var pageInfo = sectionPaging(ui.section, geo.perPage);
  drawText((pageInfo.page + 1) + "/" + pageInfo.pages, head.x + head.w - 6, head.y + 10, 6.5, COLORS.dim, "right");
  if (pageInfo.pages > 1) {
    var prev = rect(head.x + head.w - 32, head.y + 2, 14, 10);
    var next = rect(head.x + head.w - 16, head.y + 2, 14, 10);
    fillRect(prev, COLORS.panelDeep);
    fillRect(next, COLORS.panelDeep);
    strokeRect(prev, COLORS.border, 1);
    strokeRect(next, COLORS.border, 1);
    drawText("<", prev.x + prev.w * 0.5, prev.y + 8, 7.0, COLORS.text, "center");
    drawText(">", next.x + next.w * 0.5, next.y + 8, 7.0, COLORS.text, "center");
    addHotspot(prev, "section_page_prev", ui.section);
    addHotspot(next, "section_page_next", ui.section);
  }

  var grid = rect(leftPanel.x + 4, leftPanel.y + 17, leftPanel.w - 8, leftPanel.h - 21);
  var cols = geo.cols;
  var rows = geo.rows;
  var cellGap = 5;
  var cw = (grid.w - cellGap * (cols - 1)) / cols;
  var ch = (grid.h - cellGap * (rows - 1)) / rows;
  var i;
  for (i = 0; i < pageInfo.list.length; i++) {
    var col = i % cols;
    var row = Math.floor(i / cols);
    drawEncoder(pageInfo.list[i], rect(grid.x + col * (cw + cellGap), grid.y + row * (ch + cellGap), cw, ch));
  }

  var topH = Math.floor((rightPanel.h - gap) * 0.50);
  var plantPanel = rect(rightPanel.x, rightPanel.y, rightPanel.w, topH);
  var midiPanel = rect(rightPanel.x, rightPanel.y + topH + gap, rightPanel.w, rightPanel.h - topH - gap);
  drawPlantPanel169(plantPanel);
  drawMidiPanel169(midiPanel);
}

function drawAll() {
  ui.hotspots = [];
  var sz = canvasSize();
  var w = sz[0];
  var h = sz[1];
  var compactTop = h < 175 || w < 980;

  fillRect(rect(0, 0, w, h), COLORS.bg);
  drawHeader(w, h);
  drawTabs(w, h);
  if (h <= 175) {
    drawCompact169(w, h);
    return;
  }
  var contentY = compactTop ? 54 : 61;
  var available = h - contentY - 4;
  var controlsMin = h >= 260 ? 106 : h >= 210 ? 86 : 72;
  var meterTarget = h >= 300 ? 88 : h >= 240 ? 74 : h >= 190 ? 52 : 42;
  var meterMax = Math.max(0, available - controlsMin - 4);
  var meterH = Math.max(0, Math.min(meterTarget, meterMax));
  if (meterH > 0 && meterH < 34) meterH = Math.min(34, meterMax);
  if (meterMax < 18) meterH = 0;

  var y = contentY;
  if (meterH > 0) y = drawMeters(w, h, contentY, meterH);

  var controlArea = h - y - 4;
  if (controlArea >= 118 && w >= 980) {
    drawAllDashboard(w, h, y);
    return;
  }

  if (controlArea >= 72) {
    drawAllCompact(w, h, y);
    return;
  }

  drawControls(w, h, y);
}

function paint() {
  try {
    drawAll();
  } catch (e) {
    var sz = canvasSize();
    fillRect(rect(0, 0, sz[0], sz[1]), [0.20, 0.11, 0.11, 1]);
    drawText("BECA UI error", 8, 18, 11, [1, 0.8, 0.8, 1], "left");
    drawText(String(e), 8, 34, 9, [1, 0.9, 0.9, 1], "left");
    try { post("BECA jsui error: " + e + "\n"); } catch (_ignored) {}
  }
}

function onresize(_w, _h) {
  mgraphics.redraw();
}

function pointerToCanvas(x, y) {
  var xx = Number(x);
  var yy = Number(y);
  if (!isFinite(xx) || !isFinite(yy)) return [0, 0];

  var sz = canvasSize();
  var w = sz[0];
  var h = sz[1];

  if (xx >= 0 && yy >= 0 && xx <= w && yy <= h) return [xx, yy];

  if (Math.abs(xx) <= 1.5 && Math.abs(yy) <= 1.5) {
    if (xx >= 0 && yy >= 0 && xx <= 1 && yy <= 1) return [xx * w, yy * h];
    return [((xx + 1) * 0.5) * w, (1 - ((yy + 1) * 0.5)) * h];
  }

  return [xx, yy];
}

function sectionLabel(id) {
  return id === "input" ? "Input" : id === "output" ? "Output" : id === "theory" ? "Theory" : id === "led" ? "LED FX" : "Engine";
}

function handleClick(hotspot, x, y) {
  if (hotspot.kind === "section") {
    ui.section = String(hotspot.data || "input");
    if (!ui.pageBySection.hasOwnProperty(ui.section)) ui.pageBySection[ui.section] = 0;
    mgraphics.redraw();
    return;
  }

  if (hotspot.kind === "outmode") {
    var mode = clip(asInt(hotspot.data, 0), 0, 2);
    ui.state.outputmode = mode;
    ui.lastUiAction = "ui.outputmode=" + mode;
    sendParam("outputmode", mode);
    mgraphics.redraw();
    return;
  }

  if (hotspot.kind === "page_prev") {
    ui.pageBySection[ui.section] = Math.max(0, asInt(ui.pageBySection[ui.section], 0) - 1);
    mgraphics.redraw();
    return;
  }

  if (hotspot.kind === "page_next") {
    var info = activeControls();
    ui.pageBySection[ui.section] = Math.min(info.pages - 1, asInt(ui.pageBySection[ui.section], 0) + 1);
    mgraphics.redraw();
    return;
  }

  if (hotspot.kind === "section_page_prev") {
    var sidPrev = String(hotspot.data || "");
    ui.pageBySection[sidPrev] = Math.max(0, asInt(ui.pageBySection[sidPrev], 0) - 1);
    mgraphics.redraw();
    return;
  }

  if (hotspot.kind === "section_page_next") {
    var sidNext = String(hotspot.data || "");
    ui.pageBySection[sidNext] = asInt(ui.pageBySection[sidNext], 0) + 1;
    mgraphics.redraw();
    return;
  }

  if (hotspot.kind === "control") {
    var control = hotspot.data;
    if (!control) return;

    if (control.kind === "action") {
      applyControlValue(control, control.actionValue || 1, 1);
      return;
    }

    if (control.kind === "toggle") {
      applyControlValue(control, asInt(getValue(control), 0) ? 0 : 1, 1);
      mgraphics.redraw();
      return;
    }

    if (control.kind === "choice") {
      var mid = hotspot.rect.x + hotspot.rect.w * 0.5;
      incrementChoice(control, x < mid ? -1 : 1);
      mgraphics.redraw();
      return;
    }

    ui.drag = {
      control: control,
      rect: hotspot.rect,
      y0: y,
      value0: getValue(control)
    };
    return;
  }
}

function applyDrag(x, y) {
  if (!ui.drag || !ui.drag.control) return;
  var c = ui.drag.control;

  if (c.kind === "choice") {
    var opts = optionsFor(c);
    if (!opts.length) return;
    var startIdx = 0;
    if (c.sendByValue) {
      var t = token(ui.drag.value0);
      var i;
      for (i = 0; i < opts.length; i++) if (token(opts[i]) === t) startIdx = i;
    } else {
      startIdx = asInt(ui.drag.value0, 0);
    }
    var dIdx = Math.round((ui.drag.y0 - y) / 16);
    applyControlValue(c, startIdx + dIdx, 1);
    mgraphics.redraw();
    return;
  }

  var rg = rangeFor(c);
  var lo = asNum(rg[0], 0);
  var hi = asNum(rg[1], 1);
  var range = hi - lo;
  if (range <= 0) range = 1;

  var sensitivity = range / 120;
  var delta = (ui.drag.y0 - y) * sensitivity;
  applyControlValue(c, asNum(ui.drag.value0, lo) + delta, 1);
  mgraphics.redraw();
}

function pointerDown(x, y) {
  var p = pointerToCanvas(x, y);
  var px = p[0];
  var py = p[1];
  ui.drag = null;

  var i;
  for (i = ui.hotspots.length - 1; i >= 0; i--) {
    if (ptInRect(px, py, ui.hotspots[i].rect)) {
      handleClick(ui.hotspots[i], px, py);
      return;
    }
  }
}

function pointerDownDedup(x, y) {
  var now = new Date().getTime();
  var dx = Math.abs(asNum(x, 0) - asNum(ui.lastPointerX, 0));
  var dy = Math.abs(asNum(y, 0) - asNum(ui.lastPointerY, 0));
  if ((now - asInt(ui.lastPointerAt, 0)) < 70 && dx <= 2 && dy <= 2) return;
  ui.lastPointerAt = now;
  ui.lastPointerX = x;
  ui.lastPointerY = y;
  pointerDown(x, y);
}

function onclick(x, y, but, cmd, shift, capslock, option, ctrl) {
  pointerDownDedup(x, y);
}

function onmousedown(x, y, but, cmd, shift, capslock, option, ctrl) {
  pointerDownDedup(x, y);
}

function ondblclick(x, y, but, cmd, shift, capslock, option, ctrl) {
  pointerDownDedup(x, y);
}

function ondrag(x, y, but, cmd, shift, capslock, option, ctrl) {
  if (!but) {
    ui.drag = null;
    return;
  }
  var p = pointerToCanvas(x, y);
  applyDrag(p[0], p[1]);
}

function onmouseup(x, y, but, cmd, shift, capslock, option, ctrl) {
  ui.drag = null;
}

function onidleout() {
  ui.drag = null;
}

function parseJson(s) {
  try {
    return JSON.parse(String(s || ""));
  } catch (_e) {
    return null;
  }
}

function merge(dst, src) {
  if (!dst || !src) return;
  var k;
  for (k in src) {
    if (src.hasOwnProperty(k)) dst[k] = src[k];
  }
}

function anything() {
  var args = arrayfromargs(arguments);
  var sel = String(messagename || "");

  if (sel === "status") {
    ui.statusState = args.length ? String(args[0]) : "";
    ui.statusDetail = args.length > 1 ? String(args[1]) : "";
    ui.lastInbound = "status." + ui.statusState;
    if (String(ui.statusState).toLowerCase() === "connected") ui.targetConnected = 1;
    if (String(ui.statusState).toLowerCase() === "disconnected" || String(ui.statusState).toLowerCase() === "error") ui.targetConnected = 0;
    if (args.length > 1 && String(args[1]).indexOf(":") >= 0) ui.targetLastConnected = String(args[1]).split(" ")[0];
    ui.nodeReady = 1;
    sendInitToNode();
    mgraphics.redraw();
    return;
  }

  if (sel === "target") {
    ui.targetHost = args.length ? String(args[0]) : ui.targetHost;
    ui.targetPort = args.length > 1 ? asInt(args[1], ui.targetPort) : ui.targetPort;
    ui.targetDevice = args.length > 2 ? String(args[2]) : ui.targetDevice;
    ui.targetConnected = args.length > 3 ? (asInt(args[3], 0) ? 1 : 0) : ui.targetConnected;
    ui.targetLastConnected = args.length > 4 ? String(args[4]) : ui.targetLastConnected;
    ui.targetMode = args.length > 5 ? String(args[5]) : ui.targetMode;
    ui.lastInbound = "target." + (ui.targetConnected ? "connected" : "idle");
    ui.nodeReady = 1;
    sendInitToNode();
    mgraphics.redraw();
    return;
  }

  if (sel === "state") {
    var st = parseJson(args[0]);
    if (st) {
      mergeWithPending(ui.state, st, "state");
      if (typeof ui.state.ts !== "undefined") ui.state.ts = String(ui.state.ts).replace("-", "/");
      ui.lastInbound = "state.v" + String(st.ver || "?");
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
      ui.lastInbound = "params";
    }
    mgraphics.redraw();
    return;
  }

  if (sel === "synth") {
    var sy = parseJson(args[0]);
    if (sy) {
      mergeWithPending(ui.synth, sy, "synth");
      ui.lastInbound = "synth";
    }
    mgraphics.redraw();
    return;
  }

  if (sel === "plant") {
    ui.plantVal = asNum(args[0], 0);
    ui.plantRaw = asInt(args[1], 0);
    ui.plantRaw2 = asInt(args[2], 0);
    pushPlantValue(ui.plantVal);
    ui.lastInbound = "plant." + formatNumber(ui.plantVal);
    mgraphics.redraw();
    return;
  }

  if (sel === "midi_event") {
    var on = asInt(args[0], 0);
    ui.midiNote = asInt(args[1], 60);
    ui.midiVel = asInt(args[2], 0);
    ui.midiCh = asInt(args[3], 1);
    var bucket = midiBucket(ui.midiNote);
    if (on) ui.midiBins[bucket] = clip(ui.midiVel / 127, 0.2, 1);
    else ui.midiBins[bucket] = Math.max(ui.midiBins[bucket], 0.2);
    ui.lastInbound = "midi." + (on ? "on" : "off") + ".n" + ui.midiNote;
    mgraphics.redraw();
    return;
  }
}

function reconnectTick() {
  if (!ui.nodeReady) {
    sendCmd("request_target");
    if (ui.reconnectTask) ui.reconnectTask.schedule(1000);
    return;
  }
  sendCmd("request_target");
  if (ui.reconnectTask) ui.reconnectTask.schedule(5000);
}

function ensureReconnectTask() {
  if (ui.reconnectTask) {
    try { ui.reconnectTask.cancel(); } catch (_e1) {}
  }
  ui.reconnectTask = new Task(reconnectTick, this);
  ui.reconnectTask.schedule(3000);
}

function sendInitToNode() {
  if (ui.initSent) return;
  ui.initSent = 1;
  sendCmd("set_mode", "http");
  sendCmd("set_auto_reconnect", 1);
  sendCmd("set_emit_mode", ui.emitMode);
  sendCmd("set_device_name", ui.deviceName);
  if (String(ui.host || "").length) sendCmd("set_http_host", ui.host);
  sendCmd("set_http_port", ui.port);
  sendCmd("auto_connect");
  sendCmd("request_params");
  sendCmd("request_state");
  sendCmd("request_synth");
  sendCmd("request_fast");
  sendCmd("request_target");
}

function bootstrapTick() {
  if (ui.nodeReady) {
    sendInitToNode();
    return;
  }
  sendCmd("request_target");
  if (ui.bootstrapTask) ui.bootstrapTask.schedule(900);
}

function ensureBootstrapTask() {
  if (ui.bootstrapTask) {
    try { ui.bootstrapTask.cancel(); } catch (_e1) {}
  }
  ui.bootstrapTask = new Task(bootstrapTick, this);
  ui.bootstrapTask.schedule(120);
}

function loadbang() {
  ui.section = "input";
  ui.nodeReady = 0;
  ui.initSent = 0;
  ensureBootstrapTask();
  ensureReconnectTask();
  ensureDecayTask();
}

function bang() {
  mgraphics.redraw();
}
