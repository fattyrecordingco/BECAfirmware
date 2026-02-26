autowatch = 1;
inlets = 1;
outlets = 2; // 0 -> node.script, 1 -> thispatcher

var NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

var ui = {
  transportMode: 0, // 0=http,1=serial,2=mock
  ip: "192.168.4.1",
  deviceName: "beca",
  useLocalName: 0,
  port: 80,
  serialPorts: [],
  serialPortIndex: 0,
  baud: 115200,
  autoReconnect: 1,
  emitMode: "reemit",
  page: 0,
  activeNotes: {},
  didAutoSerialConnect: 0
};

var tsOptions = ["1-1", "2-2", "2-4", "3-4", "4-4", "5-4", "7-4", "6-8", "9-8", "12-8", "4-8", "4-16", "8-32"];
var fallbackMenus = {
  mode: ["Notes", "Arpeggiator", "Chords", "Drum Machine"],
  scale: ["Major", "Minor", "Dorian", "Lydian", "Mixolydian", "Pent Minor", "Pent Major", "Harm Minor", "Phrygian", "Whole Tone", "Maj7", "Min7", "Dom7", "Sus2", "Sus4"],
  root: NOTE_NAMES,
  clock: ["Internal", "Plant"],
  outputmode: ["BLE", "SERIAL", "AUX OUT"],
  ts: tsOptions,
  preset: ["Fatty Neon Lead", "Prism Poly Lead", "Verdant Pad", "Forest Choir Pad", "Thick Mono Bass", "Rubber Bass"]
};

function clip(v, lo, hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function asInt(v, dflt) {
  var n = parseInt(v, 10);
  return isNaN(n) ? dflt : n;
}

function asFloat(v, dflt) {
  var n = parseFloat(v);
  return isNaN(n) ? dflt : n;
}

function atomText(args) {
  if (!args || !args.length) return "";
  if (args.length === 1) return String(args[0]);
  var out = [];
  var i;
  for (i = 0; i < args.length; i++) out.push(String(args[i]));
  return out.join("");
}

function sendCmd() {
  outlet(0, arrayfromargs(arguments));
}

function showPage(index) {
  var i = clip(asInt(index, 0), 0, 4);
  ui.page = i;
  var names = ["pg_input", "pg_output", "pg_theory", "pg_led", "pg_engine"];
  var k;
  for (k = 0; k < names.length; k++) {
    outlet(1, ["script", "sendbox", names[k], "hidden", k === i ? 0 : 1]);
  }
}

function setStatus(state, detail) {
  messnamed("beca_status_text", "Status: " + String(state || "") + " " + String(detail || ""));
}

function setMenu(name, items) {
  if (!items || !items.length) return;
  messnamed("beca_menu_" + name, "clear");
  var i;
  for (i = 0; i < items.length; i++) messnamed("beca_menu_" + name, "append", String(items[i]));
}

function setCtl(key, v) {
  messnamed("beca_set_" + key, v);
}

function clearActive() {
  var k;
  for (k in ui.activeNotes) if (ui.activeNotes.hasOwnProperty(k)) delete ui.activeNotes[k];
}

function setActiveFromCsv(csv) {
  clearActive();
  var parts = String(csv || "").split(",");
  var i;
  for (i = 0; i < parts.length; i++) {
    var n = asInt(parts[i], -1);
    if (n >= 0) ui.activeNotes[n] = 1;
  }
}

function renderMatrix() {
  messnamed("beca_midi_matrix", "clear");
  var k;
  for (k in ui.activeNotes) {
    if (!ui.activeNotes.hasOwnProperty(k)) continue;
    var n = asInt(k, -1);
    if (n < 36 || n > 131) continue;
    var rel = n - 36;
    var col = rel % 12;
    var row = 7 - Math.floor(rel / 12);
    if (row < 0 || row > 7) continue;
    messnamed("beca_midi_matrix", "setcell", col, row, 1);
  }
}

// -------------------- UI -> node --------------------

function ui_mode(v) {
  ui.transportMode = clip(asInt(v, 0), 0, 2);
  if (ui.transportMode === 0) sendCmd("set_mode", "http");
  else if (ui.transportMode === 1) sendCmd("set_mode", "serial");
  else sendCmd("set_mode", "mock");
}

function ui_set_ip() {
  var txt = atomText(arrayfromargs(arguments));
  if (txt && txt.length) ui.ip = txt.trim();
}

function ui_set_device_name() {
  var txt = atomText(arrayfromargs(arguments));
  if (!txt) return;
  txt = txt.trim();
  if (!txt.length) return;
  if (txt.indexOf(".local") >= 0) txt = txt.substring(0, txt.indexOf(".local"));
  ui.deviceName = txt;
}

function ui_use_local_name(v) {
  ui.useLocalName = asInt(v, 0) ? 1 : 0;
}

function ui_set_port(v) {
  ui.port = clip(asInt(v, ui.port), 1, 65535);
}

function ui_serial_port_index(v) {
  var idx = clip(asInt(v, 0), 0, Math.max(0, ui.serialPorts.length - 1));
  ui.serialPortIndex = idx;
}

function ui_set_baud(v) {
  ui.baud = clip(asInt(v, ui.baud), 1200, 2000000);
}

function ui_auto(v) {
  ui.autoReconnect = asInt(v, 0) ? 1 : 0;
  sendCmd("set_auto_reconnect", ui.autoReconnect);
}

function ui_telemetry(v) {
  sendCmd("enable_serial_telemetry", asInt(v, 0) ? 1 : 0);
}

function ui_emit(v) {
  ui.emitMode = asInt(v, 0) === 1 ? "monitor" : "reemit";
  sendCmd("set_emit_mode", ui.emitMode);
}

function ui_connect() {
  var host = ui.ip;
  if (ui.useLocalName && ui.deviceName && ui.deviceName.length) host = ui.deviceName + ".local";
  if ((!host || !String(host).length) && ui.deviceName && ui.deviceName.length) host = ui.deviceName + ".local";

  if (ui.transportMode === 0) {
    setStatus("connecting", host + ":" + ui.port);
    sendCmd("connect_http", host, ui.port);
    return;
  }
  if (ui.transportMode === 1) {
    var port = "";
    if (ui.serialPorts.length && ui.serialPortIndex >= 0 && ui.serialPortIndex < ui.serialPorts.length) {
      port = ui.serialPorts[ui.serialPortIndex];
    }
    if (!port.length) {
      setStatus("warn", "no serial port selected");
      sendCmd("list_serial_ports");
      return;
    }
    setStatus("connecting", port + " @" + ui.baud);
    sendCmd("connect_serial", port, ui.baud);
    return;
  }
  setStatus("connecting", "mock");
  sendCmd("connect_mock");
}

function ui_connect_local() {
  if (!ui.deviceName || !ui.deviceName.length) return;
  ui.transportMode = 0;
  setStatus("connecting", ui.deviceName + ".local:" + ui.port);
  sendCmd("set_mode", "http");
  sendCmd("connect_http", ui.deviceName + ".local", ui.port);
}

function ui_disconnect() {
  sendCmd("disconnect");
}

function ui_refresh() {
  sendCmd("list_serial_ports");
  sendCmd("request_state");
  sendCmd("request_fast");
  sendCmd("request_params");
  sendCmd("request_synth");
}

function ui_page(v) {
  showPage(v);
}

function ui_param(key, value) {
  if (typeof key === "undefined") return;
  sendCmd("set_param", String(key), String(value));
}

// -------------------- node -> UI --------------------

function status() {
  var a = arrayfromargs(arguments);
  setStatus(a[0], a[1]);
}

function plant(v, raw, raw2) {
  var n = asFloat(v, 0);
  var r1 = asInt(raw, 0);
  var r2 = asInt(raw2, 0);
  messnamed("beca_plant_push", n);
  messnamed("beca_plant_text", "Plant n " + n.toFixed(3) + " r1 " + r1 + " r2 " + r2);
}

function midi_event(on, note, vel, ch) {
  var isOn = asInt(on, 0) !== 0;
  var n = asInt(note, 0);
  var v = asInt(vel, 0);
  var c = asInt(ch, 1);
  if (isOn) ui.activeNotes[n] = 1; else delete ui.activeNotes[n];
  renderMatrix();
  messnamed("beca_midi_text", (isOn ? "ON" : "OFF") + " n" + n + " v" + v + " ch" + c);
}

function note_grid(csv) {
  setActiveFromCsv(csv);
  renderMatrix();
}

function serial_ports(arg) {
  var list = [];
  if (typeof arg === "string" && arg.length && arg.charAt(0) === "[") {
    try {
      var parsed = JSON.parse(arg);
      if (parsed && parsed.length) list = parsed;
    } catch (e) {}
  } else {
    var a = arrayfromargs(arguments);
    var i;
    for (i = 0; i < a.length; i++) list.push(String(a[i]));
  }

  ui.serialPorts = list;
  messnamed("beca_serial_ports_menu", "clear");
  var j;
  for (j = 0; j < list.length; j++) messnamed("beca_serial_ports_menu", "append", list[j]);
  if (list.length) {
    ui.serialPortIndex = clip(ui.serialPortIndex, 0, list.length - 1);
    messnamed("beca_set_serial_port_index", ui.serialPortIndex + 1);
    if (!ui.didAutoSerialConnect && ui.transportMode === 1) {
      ui.didAutoSerialConnect = 1;
      sendCmd("connect_serial", list[ui.serialPortIndex], ui.baud);
    }
  }
}

function serial_ports_list() {
  serial_ports.apply(this, arguments);
}

function params(jsonText) {
  var p = null;
  try { p = JSON.parse(String(jsonText || "{}")); } catch (e) { p = null; }
  if (!p) return;

  setMenu("mode", p.modes && p.modes.length ? p.modes : fallbackMenus.mode);
  setMenu("scale", p.scales && p.scales.length ? p.scales : fallbackMenus.scale);
  setMenu("clock", p.clock_modes && p.clock_modes.length ? p.clock_modes : fallbackMenus.clock);
  setMenu("outputmode", p.output_modes && p.output_modes.length ? p.output_modes : fallbackMenus.outputmode);
  setMenu("ts", p.time_signatures && p.time_signatures.length ? p.time_signatures : fallbackMenus.ts);
  setMenu("preset", p.synth_presets && p.synth_presets.length ? p.synth_presets : fallbackMenus.preset);
  setMenu("root", fallbackMenus.root);
}

function state(jsonText) {
  var s = null;
  try { s = JSON.parse(String(jsonText || "{}")); } catch (e) { s = null; }
  if (!s) return;

  if (typeof s.mode !== "undefined") setCtl("mode", asInt(s.mode, 0) + 1);
  if (typeof s.scale !== "undefined") setCtl("scale", asInt(s.scale, 0) + 1);
  if (typeof s.root !== "undefined") setCtl("root", asInt(s.root, 0) + 1);
  if (typeof s.clock !== "undefined") setCtl("clock", asInt(s.clock, 0) + 1);
  if (typeof s.outputmode !== "undefined") setCtl("outputmode", asInt(s.outputmode, 0) + 1);

  if (typeof s.ts !== "undefined") {
    var token = String(s.ts).replace("/", "-");
    var idx = 0;
    var i;
    for (i = 0; i < tsOptions.length; i++) if (tsOptions[i] === token) idx = i;
    setCtl("ts", idx + 1);
  }

  var direct = ["bpm", "swing", "sens", "lo", "hi", "fx", "vs", "vi", "bright", "rest", "nr", "drumsel"];
  var k;
  for (k = 0; k < direct.length; k++) {
    var kk = direct[k];
    if (typeof s[kk] !== "undefined") setCtl(kk, s[kk]);
  }

  if (typeof s.io_muted !== "undefined") setCtl("mute", asInt(s.io_muted, 0));
  if (typeof s.daw_sync !== "undefined") setCtl("sync", asInt(s.daw_sync, 0));
}

function synth(jsonText) {
  var s = null;
  try { s = JSON.parse(String(jsonText || "{}")); } catch (e) { s = null; }
  if (!s) return;

  if (typeof s.preset !== "undefined") setCtl("preset", asInt(s.preset, 0) + 1);

  var keys = [
    "wave_a", "wave_b", "osc_mix", "mono", "voices", "attack", "decay", "sustain", "release",
    "filter", "cutoff", "resonance", "reverb", "delay_ms", "delay_feedback", "delay_mix",
    "drive", "master", "detune", "gain_trim", "drumkit"
  ];
  var i;
  for (i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (typeof s[k] !== "undefined") setCtl(k, s[k]);
  }
}

function loadbang() {
  setMenu("mode", fallbackMenus.mode);
  setMenu("scale", fallbackMenus.scale);
  setMenu("root", fallbackMenus.root);
  setMenu("clock", fallbackMenus.clock);
  setMenu("outputmode", fallbackMenus.outputmode);
  setMenu("ts", fallbackMenus.ts);
  setMenu("preset", fallbackMenus.preset);

  showPage(0);

  sendCmd("set_auto_reconnect", ui.autoReconnect);
  sendCmd("set_emit_mode", ui.emitMode);
  sendCmd("list_serial_ports");
  sendCmd("request_params");
  sendCmd("request_state");
  sendCmd("request_synth");
  sendCmd("request_fast");
}

function list() {
  var a = arrayfromargs(arguments);
  if (!a || !a.length) return;
  var head = String(a[0]);
  var rest = a.slice(1);
  if (head && typeof this[head] === "function") {
    this[head].apply(this, rest);
  }
}

function anything() {
  var a = arrayfromargs(arguments);
  var sel = String(messagename || "");
  if (sel === "list") {
    list.apply(this, a);
    return;
  }
  if (sel && typeof this[sel] === "function" && sel !== "anything") {
    this[sel].apply(this, a);
    return;
  }
  if (a && a.length) {
    var head = String(a[0]);
    var rest = a.slice(1);
    if (head && typeof this[head] === "function") this[head].apply(this, rest);
  }
}
