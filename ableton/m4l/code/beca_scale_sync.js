autowatch = 1;
inlets = 1;
outlets = 1;

var ROOT_MAP = {
  "c": 0,
  "c#": 1,
  "db": 1,
  "d": 2,
  "d#": 3,
  "eb": 3,
  "e": 4,
  "f": 5,
  "f#": 6,
  "gb": 6,
  "g": 7,
  "g#": 8,
  "ab": 8,
  "a": 9,
  "a#": 10,
  "bb": 10,
  "b": 11
};

var SCALE_MAP = {
  "major": 0,
  "ionian": 0,
  "minor": 1,
  "aeolian": 1,
  "dorian": 2,
  "lydian": 3,
  "mixolydian": 4,
  "pent minor": 5,
  "minor pent": 5,
  "pent major": 6,
  "major pent": 6,
  "harm minor": 7,
  "harmonic minor": 7,
  "phrygian": 8,
  "whole tone": 9,
  "maj7": 10,
  "major7": 10,
  "min7": 11,
  "minor7": 11,
  "dom7": 12,
  "sus2": 13,
  "sus4": 14
};

function clampInt(v, lo, hi, fallback) {
  var n = parseInt(v, 10);
  if (isNaN(n)) n = fallback;
  if (n < lo) n = lo;
  if (n > hi) n = hi;
  return n;
}

function safeString(v) {
  if (typeof v === "undefined" || v === null) return "";
  if (v instanceof Array) {
    if (!v.length) return "";
    return String(v[v.length - 1]);
  }
  return String(v);
}

function safeNumber(v, fallback) {
  var n = Number(v);
  return isFinite(n) ? n : fallback;
}

function normalizeSource(input) {
  var token = String(input || "").toLowerCase();
  if (token === "1" || token === "clip" || token === "selected_clip") return "selected_clip";
  if (token === "2" || token === "manual") return "manual";
  return "scale_device";
}

function normalizeTargetId(input) {
  var id = String(input || "A").toUpperCase();
  if (id !== "A" && id !== "B" && id !== "C") return "A";
  return id;
}

function extractLiveId(value) {
  if (!(value instanceof Array) || value.length < 2) return 0;
  if (String(value[0]).toLowerCase() !== "id") return 0;
  return clampInt(value[1], 0, 2147483647, 0);
}

function apiById(id) {
  try {
    return new LiveAPI("id " + String(id));
  } catch (_err) {
    return null;
  }
}

function parseRoot(value, display) {
  var d = String(display || "").toLowerCase().replace(/[^a-g#b]/g, "");
  if (ROOT_MAP.hasOwnProperty(d)) return ROOT_MAP[d];
  var n = Number(value);
  if (isFinite(n)) {
    var r = Math.round(n) % 12;
    if (r < 0) r += 12;
    return r;
  }
  return -1;
}

function parseScale(value, display) {
  var label = String(display || "").toLowerCase().replace(/[_-]+/g, " ").trim();
  var k;
  for (k in SCALE_MAP) {
    if (!SCALE_MAP.hasOwnProperty(k)) continue;
    if (label.indexOf(k) >= 0) return SCALE_MAP[k];
  }
  var n = Number(value);
  if (isFinite(n)) {
    var idx = Math.round(n);
    if (idx >= 0 && idx <= 14) return idx;
  }
  return -1;
}

function tryGet(api, prop) {
  if (!api) return null;
  try {
    return api.get(prop);
  } catch (_err) {
    return null;
  }
}

function tryGetCount(api, child) {
  if (!api) return 0;
  try {
    return clampInt(api.getcount(child), 0, 4096, 0);
  } catch (_err) {
    return 0;
  }
}

function resolveTrackContext() {
  var device = null;
  try {
    device = new LiveAPI("this_device");
  } catch (_err) {
    device = null;
  }
  if (!device) return null;

  var deviceId = clampInt(device.id, 0, 2147483647, 0);
  var parentId = extractLiveId(tryGet(device, "canonical_parent"));
  if (!parentId) return null;

  var parentApi = apiById(parentId);
  if (!parentApi) return null;
  var className = safeString(tryGet(parentApi, "class_name")).toLowerCase();
  if (className === "track") {
    return { track: parentApi, deviceId: deviceId };
  }

  if (className.indexOf("chain") >= 0) {
    var trackId = extractLiveId(tryGet(parentApi, "canonical_parent"));
    var trackApi = apiById(trackId);
    if (!trackApi) return null;
    return { track: trackApi, deviceId: deviceId };
  }

  return null;
}

function readScaleFromDeviceApi(deviceApi, manualScale, manualRoot) {
  var pCount = tryGetCount(deviceApi, "parameters");
  if (pCount < 1) return null;

  var root = -1;
  var scale = -1;
  var i;
  for (i = 0; i < pCount; i++) {
    var paramApi = null;
    try {
      paramApi = new LiveAPI(deviceApi.unquotedpath + " parameters " + i);
    } catch (_err1) {
      paramApi = null;
    }
    if (!paramApi) continue;

    var pName = safeString(tryGet(paramApi, "name")).toLowerCase();
    var pValue = safeNumber(tryGet(paramApi, "value"), 0);
    var pDisplay = safeString(tryGet(paramApi, "display_value"));

    if (root < 0 && (pName.indexOf("root") >= 0 || pName.indexOf("base") >= 0 || pName.indexOf("key") >= 0)) {
      root = parseRoot(pValue, pDisplay);
    }
    if (scale < 0 && (pName.indexOf("scale") >= 0 || pName.indexOf("mode") >= 0 || pName.indexOf("preset") >= 0)) {
      scale = parseScale(pValue, pDisplay);
    }
  }

  if (root < 0 && manualRoot >= 0) root = manualRoot;
  if (scale < 0 && manualScale >= 0) scale = manualScale;
  if (root < 0 || scale < 0) return null;

  return {
    scale: clampInt(scale, 0, 14, 0),
    root: clampInt(root, 0, 11, 0),
    source: "scale_device",
    detail: "Scale device synced"
  };
}

function readFromScaleDevice(manualScale, manualRoot) {
  var ctx = resolveTrackContext();
  if (!ctx || !ctx.track) return null;

  var count = tryGetCount(ctx.track, "devices");
  if (count < 1) return null;

  var i;
  for (i = 0; i < count; i++) {
    var dev = null;
    try {
      dev = new LiveAPI(ctx.track.unquotedpath + " devices " + i);
    } catch (_err1) {
      dev = null;
    }
    if (!dev) continue;

    var devId = clampInt(dev.id, 0, 2147483647, 0);
    if (ctx.deviceId && devId === ctx.deviceId) break;

    var name = safeString(tryGet(dev, "name")).toLowerCase();
    var className = safeString(tryGet(dev, "class_display_name")).toLowerCase();
    var classId = safeString(tryGet(dev, "class_name")).toLowerCase();
    var isScale = name.indexOf("scale") >= 0 || className.indexOf("scale") >= 0 || classId.indexOf("scale") >= 0;
    if (!isScale) continue;

    var parsed = readScaleFromDeviceApi(dev, manualScale, manualRoot);
    if (parsed) return parsed;
  }

  return null;
}

function readFromSelectedClip(manualScale, manualRoot) {
  var view = null;
  try {
    view = new LiveAPI("live_set view");
  } catch (_err) {
    view = null;
  }
  if (!view) return null;

  var clipId = extractLiveId(tryGet(view, "detail_clip"));
  if (!clipId) return null;
  var clip = apiById(clipId);
  if (!clip) return null;

  var root = -1;
  var scale = -1;
  var rootProps = ["scale_root", "root_note", "key_center", "root"];
  var scaleProps = ["scale_mode", "scale_name", "mode", "scale"];
  var i;

  for (i = 0; i < rootProps.length && root < 0; i++) {
    var rv = tryGet(clip, rootProps[i]);
    if (rv === null) continue;
    root = parseRoot(rv, safeString(rv));
  }
  for (i = 0; i < scaleProps.length && scale < 0; i++) {
    var sv = tryGet(clip, scaleProps[i]);
    if (sv === null) continue;
    scale = parseScale(sv, safeString(sv));
  }

  if (root < 0 || scale < 0) return null;
  return {
    scale: clampInt(scale, 0, 14, 0),
    root: clampInt(root, 0, 11, 0),
    source: "selected_clip",
    detail: "Selected clip synced"
  };
}

function emitStatus(state, detail, source, scale, root) {
  if (typeof scale === "undefined") outlet(0, "scale_sync_status", state, detail, source);
  else outlet(0, "scale_sync_status", state, detail, source, scale, root);
}

function emitApply(scale, root, source, targetId) {
  outlet(0, "apply_scale_from_ableton", scale, root, source, targetId);
}

function handleRequest(args) {
  var source = normalizeSource(args.length ? args[0] : "scale_device");
  var manualScale = clampInt(args.length > 1 ? args[1] : 0, 0, 14, 0);
  var manualRoot = clampInt(args.length > 2 ? args[2] : 0, 0, 11, 0);
  var targetId = normalizeTargetId(args.length > 3 ? args[3] : "A");

  var result = null;
  if (source === "manual") {
    result = {
      scale: manualScale,
      root: manualRoot,
      source: "manual",
      detail: "Manual scale applied"
    };
  } else if (source === "scale_device") {
    result = readFromScaleDevice(manualScale, manualRoot);
    if (!result) result = readFromSelectedClip(manualScale, manualRoot);
  } else {
    result = readFromSelectedClip(manualScale, manualRoot);
    if (!result) result = readFromScaleDevice(manualScale, manualRoot);
  }

  if (!result) {
    emitStatus("unavailable", "Scale sync unavailable", source, manualScale, manualRoot);
    return;
  }

  emitApply(result.scale, result.root, result.source, targetId);
  emitStatus("ok", result.detail, result.source, result.scale, result.root);
}

function list() {
  handleRequest(arrayfromargs(arguments));
}

function anything() {
  var args = [messagename].concat(arrayfromargs(arguments));
  handleRequest(args);
}
