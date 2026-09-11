import "./performance.css";

import { BecaHealth } from "./health.js";


import { createInstrumentDeck } from "./performance-instrument.js";



export const PERFORMANCE_ENABLED = import.meta.env.VITE_BECA_PERFORMANCE_PAGE !== "false";

const WRITE_INTERVAL_MS = 50;

const SNAPSHOT_INTERVAL_MS = 500;

const SYNTH_INTERVAL_MS = 2000;

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const WAVEFORMS = ["Saw", "Square", "Triangle", "Sine"];

const LED_EFFECTS = ["Gradient Flow", "Palette Wave", "Soft Sweep", "Comet Trails", "Juggle", "Glitter Veil", "Quiet Fire", "Neon Bars", "Sparkle Mist", "Split Fade"];

const LED_PALETTES = ["Rainbow", "Rainbow Stripe", "Cloud", "Ocean", "Forest", "Lava", "Heat", "Party", "Sunset", "Ocean Deep", "Forest Glow", "Cosmic", "Aurora", "Ice Blue", "Heat Soft", "Vintage", "Pastel", "Retro", "Mojito", "Tea Rose"];

const range = (key, label, min, max, step = 0.01, unit = "") => ({ key, label, min, max, step, unit });

const select = (key, label, options, values = false) => ({ key, label, options, values });

const toggle = (key, label) => ({ key, label, toggle: true });



// Keys match /api/set, the common Wi-Fi and USB control protocol.

const GROUPS = [

  { title: "Plant & timing", controls: [

    select("outputmode", "Output", ["BLE MIDI", "Serial MIDI", "Aux audio", "Serial MIDI + Aux"]),

    select("preset", "Soundscape", "synth_presets"),

    range("master", "Master volume", 0, 1),

    toggle("mute", "Mute outputs"),

    select("clock", "Clock", ["Internal", "Plant pulses"]),

    toggle("daw_sync", "Follow DAW clock"),

    range("sens", "Plant sensitivity", 0, 0.5),

    select("mode", "Playing mode", "modes")

  ] },

  { title: "Harmony & rhythm", controls: [

    select("scale", "Scale", "scales"), select("root", "Root note", NOTES),

    range("bpm", "Tempo", 20, 240, 1, "bpm"),

    select("ts", "Time signature", "time_signatures", true),

    select("note_length", "Note length", "note_lengths"),

    range("swing", "Swing", 0, 60, 1, "%"), range("rest", "Rest chance", 0, 0.8),

    select("lo", "Lowest octave", [1, 2, 3, 4, 5, 6, 7, 8, 9], true),

    select("hi", "Highest octave", [1, 2, 3, 4, 5, 6, 7, 8, 9], true),

    toggle("norep", "Avoid repeated notes")

  ] },

  { title: "Aux · oscillators", synth: true, controls: [

    select("wave_a", "Oscillator A", WAVEFORMS), select("wave_b", "Oscillator B", WAVEFORMS),

    range("osc_mix", "Oscillator blend", 0, 1), range("detune", "Detune", 0, 8, 0.1, "cents"),

    toggle("mono", "Monophonic"), range("voices", "Voice limit", 1, 8, 1),

    range("gain_trim", "Gain trim", 0.45, 1)

  ] },

  { title: "Aux · envelope & filter", synth: true, controls: [

    range("attack", "Attack", 0, 5, 0.01, "s"), range("decay", "Decay", 0, 5, 0.01, "s"),

    range("sustain", "Sustain", 0, 1), range("release", "Release", 0.01, 10, 0.01, "s"),

    select("filter", "Filter type", ["Low pass", "High pass", "Band pass"]),

    range("cutoff", "Filter cutoff", 20, 18000, 1, "Hz"), range("resonance", "Resonance", 0.1, 10, 0.1)

  ] },

  { title: "Aux · space & character", synth: true, controls: [

    range("reverb", "Reverb", 0, 1), range("delay_ms", "Delay time", 0, 800, 1, "ms"),

    range("delay_mix", "Delay mix", 0, 1), range("delay_feedback", "Delay feedback", 0, 0.95),

    range("drive", "Drive", 0, 1)

  ] },

  { title: "Device lights", controls: [

    range("bright", "LED brightness", 10, 255, 1), range("vs", "LED motion", 0, 255, 1),

    range("vi", "LED intensity", 0, 255, 1),

    select("fx", "LED effect", LED_EFFECTS), select("pal", "LED palette", LED_PALETTES)

  ] }

];

const STATE_KEYS = { mute: "io_muted", norep: "nr", note_length: "note_length_idx" };

const SYNTH_KEYS = new Set(["preset", "master", ...GROUPS.filter((group) => group.synth).flatMap((group) => group.controls.map(({ key }) => key))]);



export function createPerformancePage({ invoke, getTarget }) {

  const screen = document.createElement("section");

  screen.className = "surface-screen performance-screen";

  screen.dataset.screenView = "performance";

  screen.innerHTML = `

    <div class="performance-frame">

      <header class="performance-header">

        <div class="performance-identity"><div class="performance-logo" aria-hidden="true"></div><div><span class="performance-brand">BECA / LIVE INSTRUMENT</span><h1>Performance</h1></div></div>

        <button type="button" class="performance-button" data-performance-reconnect>Reconnect</button>

      </header>

      <div class="performance-monitor" aria-label="Live signal">

        <span data-performance-device>No device selected</span>

        <span data-performance-signal>Signal —</span><span data-performance-raw>Sensor —</span>

        <span data-performance-notes>Waiting for notes</span>

      </div>

      <p class="performance-status" role="status" data-performance-status>Open Setup and connect BECA to begin.</p>

      <div class="performance-live-strip" aria-label="Essential live controls"><button class="performance-button" data-controls-focus aria-pressed="false">Focus controls ↓</button></div>

      <div class="performance-instrument"></div>

      <p class="performance-sine-hint" data-performance-sine hidden>Raw Sensor Sine: sensor 1's ADC number is the frequency in Hz, updated on the device. Use Aux audio or Serial MIDI + Aux to hear it. Master volume applies; envelope, filter and effects are bypassed.</p>

      <div class="performance-controls-heading"><h2>Shape the performance</h2><p>Type a value for precision.<br>Shift + arrows for fine moves · double-click a slider to reset.</p></div>

      <div class="performance-grid"></div>

      <details class="performance-diagnostics"><summary>Signal & connection notes</summary><p data-performance-health>Local assistant: waiting for fresh plant data.</p></details>

    </div>`;

  const logo = document.querySelector(".setup-logo svg");

  if (logo) screen.querySelector(".performance-logo").appendChild(logo.cloneNode(true));

  const fields = new Map();

  const pending = new Map();

  const held = new Set();

  const failedKeys = new Set();

  let active = false;

  const health = new BecaHealth();

  let retryMs = SNAPSHOT_INTERVAL_MS;

  let ready = false;

  let targetId = null;

  let generation = 0;

  let revision = 0;

  let polling = false;

  let writing = false;

  let writeTimer = null;

  let pollTimer = null;

  let lastWriteAt = -Infinity;

  let synthDue = 0;

  let runtime = {};

  let synth = {};

  let drumMask = 0;

  let requestTail = Promise.resolve();

  let instrument = null;

  let paintFrame = null;

  let resetValues = {};

  let resetPreset = null;

  let livePreset = false;

  const values = () => Object.fromEntries([...fields].map(([key, { control, input }]) => [key, control.toggle ? Number(input.checked) : input.value]));

  function refreshInstrument() {

    if (paintFrame !== null) return;

    paintFrame = requestAnimationFrame(() => {

      paintFrame = null;

      instrument?.setSettled(!writing && !pending.size && !held.size);

      instrument?.update();

    });

  }

  const status = screen.querySelector("[data-performance-status]");

  const text = (node, value) => { if (node.textContent !== value) node.textContent = value; };

  const setStatus = (message, error = false) => {

    text(status, message);

    status.classList.toggle("performance-error", error);

  };

  function showHealth(result) {

    text(screen.querySelector("[data-performance-health]"), `Local assistant: ${result.message}`);

    retryMs = result.ok ? SNAPSHOT_INTERVAL_MS : result.retryMs;

    fields.forEach(({ input, numeric }) => { input.disabled = !result.ok; if (numeric) numeric.disabled = !result.ok; });

    drumButtons.forEach((button) => { button.disabled = !result.ok; });

    instrument?.setReady(result.ok);

  }

  const format = (control, value) => control.options

    ? String(value)

    : `${Number(value).toFixed(control.step >= 1 ? 0 : control.step === 0.1 ? 1 : 2)}${control.unit ? ` ${control.unit}` : ""}`;



  function paint(control, value) {

    const field = fields.get(control.key);

    if (!field || value == null) return;

    let normalized = String(value);

    if (control.key === "ts") normalized = normalized.replace("/", "-");

    if (control.toggle) {

      const checked = Number(value) !== 0;

      if (field.input.checked !== checked) field.input.checked = checked;

    } else if (field.input.value !== normalized) {

      field.input.value = normalized;

    }

    if (field.output) text(field.output, format(control, value));

    if (field.numeric && document.activeElement !== field.numeric) field.numeric.value = Number(value).toFixed(control.step >= 1 ? 0 : control.step === 0.1 ? 1 : 2);

    if (!control.options && !control.toggle) field.input.style.setProperty("--fill", `${Math.max(0, Math.min(100, (Number(value) - Number(field.input.min)) / (Number(field.input.max) - Number(field.input.min)) * 100))}%`);

    refreshInstrument();

  }



  for (const group of GROUPS) {

    const card = document.createElement("fieldset");

    card.className = "performance-card";

    const legend = document.createElement("legend");

    legend.textContent = group.title;

    card.appendChild(legend);

    for (const control of group.controls) {

      const label = document.createElement("div");

      label.className = `performance-field${control.toggle ? " performance-toggle" : ""}`;

      const name = document.createElement("label");

      name.htmlFor = `performance-${control.key}`;

      name.textContent = control.label;

      label.appendChild(name);

      const input = document.createElement(control.options ? "select" : "input");

      input.id = `performance-${control.key}`;

      input.disabled = true;

      let output = null;

      let numeric = null;

      if (!control.options) {

        input.type = control.toggle ? "checkbox" : "range";

        if (!control.toggle) {

          Object.assign(input, { min: control.min, max: control.max, step: control.step });

          const valueBox = document.createElement("div");

          valueBox.className = "performance-value";

          numeric = document.createElement("input");

          Object.assign(numeric, { type: "number", min: control.min, max: control.max, step: control.step, disabled: true });

          numeric.setAttribute("aria-label", `${control.label} value`);

          const unit = document.createElement("span"); unit.textContent = control.unit;

          valueBox.append(numeric, unit);

          label.appendChild(valueBox);

        }

      }

      label.appendChild(input);

      card.appendChild(label);

      fields.set(control.key, { control, input, output, numeric });

      const edit = () => {

        const value = control.toggle ? (input.checked ? "1" : "0") : input.value;

        editValues({ [control.key]: value });

      };

      input.addEventListener(control.options || control.toggle ? "change" : "input", edit);

      if (!control.options && !control.toggle) input.addEventListener("change", edit);

      if (numeric) {

        const commit = () => {

          if (numeric.value === "" || !Number.isFinite(numeric.valueAsNumber)) { numeric.value = input.value; return; }

          input.value = numeric.value;

          numeric.value = input.value;

          edit();

        };

        numeric.addEventListener("change", commit);

        numeric.addEventListener("keydown", (event) => {

          if (event.key === "Enter") { event.preventDefault(); commit(); numeric.blur(); }

          if (event.key === "Escape") { event.preventDefault(); numeric.value = input.value; numeric.blur(); }

        });

        input.addEventListener("keydown", (event) => {

          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;

          event.preventDefault();

          const step = Number(input.step);

          const delta = event.shiftKey ? step : Math.max(step, Math.round((Number(input.max) - Number(input.min)) / 100 / step) * step);

          input.value = Number(input.value) + (["ArrowUp", "ArrowRight"].includes(event.key) ? delta : -delta);

          edit();

        });

        input.addEventListener("dblclick", () => {

          if (input.disabled || resetValues[control.key] == null) return;

          input.value = resetValues[control.key]; edit();

        });

      }

    }

    screen.querySelector(".performance-grid").appendChild(card);

  }



  const drumGroup = document.createElement("div");

  drumGroup.className = "performance-drums";

  drumGroup.setAttribute("role", "group");

  drumGroup.setAttribute("aria-label", "Enabled drum parts");

  const drumButtons = ["Kick", "Snare", "Closed hat", "Open hat", "Tom 1", "Tom 2", "Ride", "Crash"].map((name, bit) => {

    const button = document.createElement("button");

    button.type = "button";

    button.textContent = name;

    button.className = "performance-button";

    button.disabled = true;

    button.setAttribute("aria-pressed", "false");

    button.addEventListener("click", () => {

      drumMask ^= 1 << bit;

      paintDrums();

      queue("drumsel", String(drumMask));

    });

    drumGroup.appendChild(button);

    return button;

  });

  const drumSection = document.createElement("section");

  drumSection.className = "performance-midi-drums";

  drumSection.setAttribute("aria-label", "MIDI drums");

  drumSection.innerHTML = '<div><h2>MIDI drums <span>CH 10</span></h2><p>Enable percussion parts for your external drum instrument.</p></div>';

  drumSection.appendChild(drumGroup);

  screen.querySelector(".performance-grid").before(drumSection);


  instrument = createInstrumentDeck({ host: screen.querySelector(".performance-instrument"), getValues: values, change: editValues });

  const liveStrip = screen.querySelector(".performance-live-strip");

  for (const key of ["master", "bpm", "outputmode"]) liveStrip.insertBefore(fields.get(key).input.closest(".performance-field"), liveStrip.lastElementChild);

  const silenceButton = screen.querySelector("[data-silence]");

  liveStrip.insertBefore(silenceButton, liveStrip.lastElementChild);

  screen.querySelector("[data-controls-focus]").addEventListener("click", (event) => {

    const focused = screen.classList.toggle("performance-controls-focus");

    event.currentTarget.setAttribute("aria-pressed", String(focused));

    event.currentTarget.textContent = focused ? "Sound playground ↑" : "Focus controls ↓";

    screen.querySelector(".performance-instrument").hidden = focused;

    screen.scrollTo({ top: 0, behavior: "instant" });

  });



  function editValues(changes) {

    if (!ready || !active || fields.get("bpm").input.disabled) return;

    for (const [key, value] of Object.entries(changes)) {

      const field = fields.get(key);

      if (!field || field.input.disabled) continue;

      paint(field.control, value);

      queue(key, field.control.toggle ? (field.input.checked ? "1" : "0") : field.input.value);

    }

  }



  function paintDrums() {

    drumButtons.forEach((button, bit) => button.setAttribute("aria-pressed", String(Boolean(drumMask & (1 << bit)))));

  }



  function enableControls(enabled) {

    ready = enabled;

    fields.forEach(({ input, numeric }) => { input.disabled = !enabled; if (numeric) numeric.disabled = !enabled; });

    drumButtons.forEach((button) => { button.disabled = !enabled; });

    instrument?.setReady(enabled);

  }



  function apply(payload, source, acknowledge = false) {

    if (source === "synth") synth = { ...synth, ...payload };

    else runtime = { ...runtime, ...payload };

    fields.forEach(({ control }) => {

      const value = payload[STATE_KEYS[control.key] || control.key];

      if (value == null || pending.has(control.key)) return;

      if (acknowledge && (source === "synth" || !SYNTH_KEYS.has(control.key))) held.delete(control.key);

      if (!held.has(control.key)) paint(control, value);

    });

    if (payload.drumsel != null && !pending.has("drumsel")) {

      if (acknowledge) held.delete("drumsel");

      if (!held.has("drumsel")) { drumMask = Number(payload.drumsel); paintDrums(); }

    }

    drumSection.hidden = Number(fields.get("outputmode").input.value) === 2;

    const preset = fields.get("preset").input;

    screen.querySelector("[data-performance-sine]").hidden = !/raw sensor sine/i.test(preset.selectedOptions[0]?.textContent || "");

    if (source === "synth" && payload.preset != null && String(payload.preset) !== resetPreset) {

      resetValues = { ...resetValues, ...payload };

      resetPreset = String(payload.preset);

    }

  }



  function callNative(command, args) {

    const requestedTarget = targetId;

    const next = requestTail.then(() => {

      if (getTarget().id !== requestedTarget) throw new Error("The selected BECA changed");

      if (args?.method === "POST") lastWriteAt = performance.now();

      return invoke(command, args);

    });

    requestTail = next.catch(() => {});

    return next;

  }



  async function request(path, form) {

    const response = await callNative("control_request", {

      method: form ? "POST" : "GET", path, query: {}, form: form || {}

    });

    let payload;

    try { payload = JSON.parse(response.body); } catch { throw new Error(`Invalid response from ${path}`); }

    if (response.status >= 400 || payload?.ok === false || payload?.ok === 0) {

      throw new Error(payload.err || `${path} returned ${response.status}`);

    }

    return payload;

  }



  function queue(key, value, force = false) {

    if (!ready || !active || getTarget().id !== targetId) return;

    if (!force && (pending.get(key) === value || (held.has(key) && String((SYNTH_KEYS.has(key) ? synth : runtime)[STATE_KEYS[key] || key]) === value))) return;

    if (!force && !pending.has(key) && !held.has(key) && String((SYNTH_KEYS.has(key) ? synth : runtime)[STATE_KEYS[key] || key]) === value) return;

    revision++;

    if (key === "mute" && value === "1") {

      const rest = [...pending].filter(([pendingKey]) => pendingKey !== "mute");

      pending.clear(); pending.set(key, value); rest.forEach(([k, v]) => pending.set(k, v));

    } else pending.set(key, value);

    held.add(key);

    if (SYNTH_KEYS.has(key)) synth[key] = value;

    else runtime[STATE_KEYS[key] || key] = value;

    setStatus("Applying live changes…");

    scheduleWrite();

    refreshInstrument();

  }



  function scheduleWrite() {

    if (writing || writeTimer !== null || !pending.size) return;

    const delay = Math.max(0, WRITE_INTERVAL_MS - (performance.now() - lastWriteAt));

    writeTimer = setTimeout(flushWrite, delay);

  }



  async function flushWrite() {

    writeTimer = null;

    if (writing || !pending.size || getTarget().id !== targetId) return;

    const [key, value] = pending.entries().next().value;

    pending.delete(key);

    const epoch = generation;

    writing = true;

    try {

      const payload = await request("/api/set", { key: key === "preset" && livePreset ? "preset_live" : key, value });

      if (epoch !== generation) return;

      apply(payload, "state");

      failedKeys.delete(key);

      synthDue = 0;

      if (!pending.size && !failedKeys.size) setStatus("Live changes applied.");

    } catch (error) {

      if (epoch === generation) {

        held.delete(key);

        failedKeys.add(key);

        setStatus(`Could not update ${fields.get(key)?.control.label || key}: ${error.message || error}. Reconnect if needed.`, true);

      }

    } finally {

      writing = false;

      scheduleWrite();

      refreshInstrument();

    }

  }



  function metadata(params) {

    livePreset = params.live_preset === true;

    fields.forEach(({ control, input, numeric }) => {

      if (control.options) {

        const capability = ({ outputmode: "output_modes", fx: "led_effects", pal: "led_palettes" })[control.key];

        const options = params[capability] || (Array.isArray(control.options) ? control.options : params[control.options] || []);

        input.replaceChildren(...options.map((name, index) => {

          const option = document.createElement("option");

          option.value = String(control.values ? name : index);

          option.textContent = control.key === "ts" ? String(name).replace("-", "/") : String(name);

          return option;

        }));

      } else if (!control.toggle && params.ranges?.[control.key]) {

        const [min, max] = params.ranges[control.key];

        input.min = min;

        input.max = control.key === "voices" ? Math.min(8, max) : max;

        if (numeric) { numeric.min = input.min; numeric.max = input.max; }

      }

    });

    instrument.metadata(params.synth_presets, livePreset);

  }



  async function poll() {

    clearTimeout(pollTimer);

    if (!active || polling || document.hidden) return;

    if (getTarget().id !== targetId) { activate(true); return; }

    if (!ready) return;

    polling = true;

    const epoch = generation;

    const observedRevision = revision;

    try {

      if (!writing && !pending.size) {

        const snapshot = await callNative("control_snapshot");

        if (epoch !== generation) return;

        const assessment = health.observe(snapshot);

        showHealth(assessment);

        if (!assessment.ok) return;

        const acknowledge = observedRevision === revision && !writing && !pending.size && !snapshot.stale;

        apply(snapshot.state || {}, "state", acknowledge);

        const plant = snapshot.plant || {};

        instrument.signal(snapshot);

        text(screen.querySelector("[data-performance-signal]"), `Signal ${Number(plant.value || 0).toFixed(3)}`);

        text(screen.querySelector("[data-performance-raw]"), plant.raw == null ? "Sensor unavailable" : `Sensor ${plant.raw} / 4095${plant.sine_hz != null ? ` · ${plant.sine_hz} Hz` : ""}`);

        text(screen.querySelector("[data-performance-notes]"), snapshot.notes?.notes?.length ? `MIDI ${snapshot.notes.notes.join(" · ")}` : "Waiting for notes");

        if (snapshot.stale) setStatus(snapshot.issue || "Waiting for fresh device data. Reconnect if needed.", true);

        if (Date.now() >= synthDue && !writing && !pending.size) {

          const payload = await request("/api/synth");

          if (epoch !== generation) return;

          apply(payload, "synth", observedRevision === revision && !writing && !pending.size);

          synthDue = Date.now() + SYNTH_INTERVAL_MS;

        }

      }

    } catch (error) {

      if (epoch === generation) {

        setStatus(`Live connection interrupted: ${error.message || error}`, true);

        showHealth(health.failure("The selected device is not responding."));

      }

    } finally {

      polling = false;

      if (active && retryMs != null) pollTimer = setTimeout(poll, retryMs);

    }

  }



  async function activate(nextActive, retry = false) {

    if (!retry && active === nextActive && targetId === getTarget().id) return;

    active = nextActive;

    instrument.setActive(active);


    clearTimeout(pollTimer);

    enableControls(false);

    // Finish already authorized edits when the performer changes pages.

    if (!active) return;

    generation++;

    const epoch = generation;

    const target = getTarget();

    if (targetId !== target.id) {

      health.reset();

      clearTimeout(writeTimer);

      writeTimer = null;

      pending.clear();

      held.clear();

      instrument.reset();

      resetValues = {};

      resetPreset = null;

    }

    failedKeys.clear();

    targetId = target.id;

    text(screen.querySelector("[data-performance-device]"), target.name || "No device selected");

    if (!target.id || !target.ready) {

      setStatus("Open Setup, connect BECA, then choose Reconnect.");

      return;

    }

    setStatus("Loading live controls…");

    try {

      const params = await request("/api/params");

      if (epoch !== generation) return;

      metadata(params);

      const payload = await request("/api/synth");

      if (epoch !== generation) return;

      synth = {};

      runtime = {};

      apply(payload, "synth");

      const snapshot = await callNative("control_snapshot");

      if (epoch !== generation) return;

      if (snapshot.stale) throw new Error(snapshot.issue || "BECA has no fresh state yet");

      apply(snapshot.state || {}, "state");

      resetValues = values();

      instrument.signal(snapshot);

      enableControls(true);

      synthDue = Date.now() + SYNTH_INTERVAL_MS;

      setStatus("Connected. Controls apply as you move them.");

      poll();

    } catch (error) {

      if (epoch === generation) {

        setStatus(`Live control unavailable: ${error.message || error}. Open Setup or try Reconnect.`, true);

        showHealth(health.failure("The initial device connection failed."));

        if (active && retryMs != null) pollTimer = setTimeout(() => activate(true, true), retryMs);

      }

    }

  }



  screen.querySelector("[data-performance-reconnect]").addEventListener("click", async () => {

    health.reset();

    retryMs = SNAPSHOT_INTERVAL_MS;

    await activate(false);

    await activate(true);

  });

  document.addEventListener("visibilitychange", () => { if (active && !document.hidden) poll(); });

  return { screen, activate };

}
