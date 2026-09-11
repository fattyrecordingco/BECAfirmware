import { captureSound, clamp, mutateSound, PAD_MODES, SOUND_LIMITS } from "./sound-play.js";
import "./performance-instrument.css";

const STORAGE_KEY = "beca-sound-variations-v1";
const SOUND_PARAMETER_COUNT = Object.keys(SOUND_LIMITS).length;
const leaf = "M100 48.864C100 77.106 77.106 100 48.864 100H0V51.136C0 22.894 22.894 0 51.136 0H100v48.864ZM51.136 11.364c-21.965 0-39.772 17.807-39.772 39.772V81.17l42.005-42.005c2.219-2.219 5.817-2.219 8.036 0 2.219 2.219 2.219 5.817 0 8.036L19.967 88.636h28.897c21.965 0 39.772-17.807 39.772-39.772V11.364H51.136Z";
const noteNames = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };
const setAttribute = (node, name, value) => { if (node.getAttribute(name) !== value) node.setAttribute(name, value); };

export function createInstrumentDeck({ host, getValues, change }) {
  host.innerHTML = `
    <div class="instrument-topline"><span class="instrument-eyebrow">Plant signal / sound / play</span>
      <button class="performance-button instrument-mute" data-silence aria-pressed="false" disabled>Silence outputs <kbd>M</kbd></button></div>
    <div class="instrument-deck">
      <section class="instrument-signal" aria-label="Plant activity monitor">
        <div class="instrument-section-heading"><span>01 / living signal</span><span class="instrument-connection" data-signal-state>Waiting</span></div>
        <div class="instrument-orbit"><svg viewBox="0 0 240 240" aria-hidden="true">
          <circle cx="120" cy="120" r="94" fill="none" stroke="currentColor" stroke-dasharray="1 7"/>
          ${Array.from({ length: 8 }, (_, i) => {
            const angle = i * Math.PI / 4 - Math.PI / 2;
            return `<g transform="translate(${120 + Math.cos(angle) * 78 - 16} ${120 + Math.sin(angle) * 78 - 16}) scale(.32)"><path data-signal-leaf fill-rule="evenodd" d="${leaf}"/></g>`;
          }).join("")}</svg>
          <div class="instrument-energy"><strong data-energy>—</strong><span>plant energy</span></div>
        </div>
        <div class="instrument-notes" data-note-chips aria-label="Observed MIDI notes"><span>Waiting for notes</span></div>
        <svg class="instrument-scope" viewBox="0 0 320 52" preserveAspectRatio="none" role="img" aria-label="Recent measured plant energy"><path d="M0 13H320 M0 26H320 M0 39H320" class="scope-grid"/><path data-scope class="scope-trace" d=""/></svg>
        <p class="instrument-caption">Measured input · recent 24 seconds</p>
      </section>
      <section class="instrument-expression" aria-label="Sound expression">
        <div class="instrument-section-heading"><label for="expression-mode">02 / touch the sound</label>
          <select id="expression-mode" aria-label="XY mapping">${Object.entries(PAD_MODES).map(([key, mode]) => `<option value="${key}">${mode.label}</option>`).join("")}</select></div>
        <div class="expression-pad" tabindex="0" role="group" aria-label="XY expression pad" aria-describedby="expression-help" aria-disabled="true">
          <svg viewBox="0 0 400 220" preserveAspectRatio="none" aria-hidden="true"><path d="M100 0V220 M200 0V220 M300 0V220 M0 55H400 M0 110H400 M0 165H400"/></svg>
          <span class="expression-corner expression-corner-top" data-y-label>Soft → sharp</span>
          <span class="expression-corner expression-corner-bottom" data-x-label>Dark → bright</span>
          <span class="expression-crosshair" aria-hidden="true"></span>
          <span class="expression-point" aria-hidden="true"><span></span></span>
        </div>
        <div class="expression-values"><output data-pad-values>Connect to play</output><button class="instrument-text-button" data-undo disabled>↶ Undo gesture</button></div>
        <p class="instrument-caption" id="expression-help">Drag to shape two controls. Arrow keys move; Shift moves finely.</p>
      </section>
      <section class="instrument-explore" aria-label="Sound exploration">
        <div class="instrument-section-heading"><span>03 / happy accidents</span><span class="instrument-mark" aria-hidden="true">✳</span></div>
        <h2>Go a little<br>further.</h2><p>Explore a new texture.</p>
        <label class="mutation-amount" for="mutation-amount"><span>Mutation depth</span><output data-depth>45%</output></label>
        <input id="mutation-amount" type="range" min="0.1" max="1" step="0.05" value="0.45">
        <div class="mutation-endpoints"><span>little nudge</span><span>far out</span></div>
        <button class="performance-button instrument-mutate" data-mutate disabled>✳ Mutate sound</button>
        <p class="instrument-caption" data-explore-hint>Timbre changes. Tempo, key and volume stay yours.</p>
      </section>
    </div>
    <section class="instrument-library" aria-label="Soundscape browser">
      <div class="instrument-library-title"><span class="instrument-eyebrow">Soundscapes</span><strong data-preset-name>Connect your BECA</strong><span data-route-hint>Sounds play on BECA’s Aux output.</span></div>
      <div class="instrument-preset-actions"><button class="performance-button" data-preset-prev aria-label="Previous soundscape" disabled>←</button><button class="performance-button" data-preset-next aria-label="Next soundscape" disabled>→</button></div>
      <div class="instrument-preset-bank" role="group" aria-label="Choose a soundscape"></div>
    </section>
    <section class="instrument-variations" aria-label="Sound variations">
      <div><span class="instrument-eyebrow">Pocket variations</span><p>Save a texture. Bring it back.</p></div>
      ${["A", "B", "C", "D"].map((letter, index) => `<div class="instrument-slot"><button class="variation-recall" data-recall="${index}" disabled aria-label="Recall variation ${letter}"><b>${letter}</b><span>Empty</span><kbd>${index + 1}</kbd></button><button class="variation-save" data-save="${index}" disabled aria-label="Save variation ${letter}">Save ${letter}</button></div>`).join("")}
    </section>
    <div class="instrument-feedback" role="status" data-instrument-feedback>Explore a soundscape, shape it on the pad, then save a variation.</div>`;

  const $ = (selector) => host.querySelector(selector);
  const pad = $(".expression-pad");
  const modeSelect = $("#expression-mode");
  const mute = $("[data-silence]");
  const mutation = $("[data-mutate]");
  const undoButton = $("[data-undo]");
  let enabled = false;
  let settled = false;
  let active = false;
  let rawSine = false;
  let presets = [];
  let preservesLevel = false;
  let lastPreset = "";
  let beforeGesture = null;
  let pointerId = null;
  let gestureOrigin = null;
  let keyGesture = false;
  let trace = [];
  let variations = [null, null, null, null];
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored?.version === 1 && Array.isArray(stored.slots)) variations = variations.map((_, i) => {
      const slot = stored.slots[i];
      const values = captureSound(slot?.values || {});
      return Object.keys(values).length === SOUND_PARAMETER_COUNT ? { name: String(slot.name || "Saved sound").slice(0, 45), values } : null;
    });
  } catch { /* Missing or damaged browser storage does not interrupt playing. */ }

  function message(value) { setText($("[data-instrument-feedback]"), value); }
  function remember() { beforeGesture = captureSound(getValues()); refreshEnabled(); }
  function perform(values, description) {
    if (!enabled || rawSine) return;
    remember();
    change(values);
    message(description);
  }
  function refreshEnabled() {
    mute.disabled = !enabled;
    mutation.disabled = !enabled || rawSine;
    undoButton.disabled = !enabled || rawSine || !beforeGesture;
    pad.setAttribute("aria-disabled", String(!enabled || rawSine));
    host.querySelectorAll("[data-save]").forEach((button) => { button.disabled = !enabled || rawSine || !settled; });
    host.querySelectorAll("[data-recall]").forEach((button, i) => { button.disabled = !enabled || rawSine || !variations[i]; });
    host.querySelectorAll("[data-preset-prev], [data-preset-next], [data-preset]").forEach((button) => { button.disabled = !enabled; });
  }
  function paintSlots() {
    host.querySelectorAll("[data-recall]").forEach((button, i) => {
      setText(button.querySelector("span"), variations[i]?.name || "Empty");
      button.classList.toggle("has-sound", !!variations[i]);
      setText($(`[data-save="${i}"]`), `${variations[i] ? "Replace" : "Save"} ${"ABCD"[i]}`);
    });
    refreshEnabled();
  }
  host.querySelectorAll("[data-save]").forEach((button, i) => button.addEventListener("click", () => {
    if (!enabled || rawSine || !settled) return;
    const values = captureSound(getValues());
    if (Object.keys(values).length !== SOUND_PARAMETER_COUNT) { message("Wait for the complete sound settings before saving."); return; }
    const name = presets[Number(getValues().preset)] || "Custom sound";
    variations[i] = { name, values };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, slots: variations })); message(`Variation ${"ABCD"[i]} saved on this computer.`); }
    catch { message(`Variation ${"ABCD"[i]} saved for this session; local storage is unavailable.`); }
    paintSlots();
  }));
  function recall(i) {
    if (!variations[i] || !enabled || rawSine) return;
    perform(variations[i].values, `Recalling variation ${"ABCD"[i]}. Tempo, key, output and master volume are unchanged.`);
  }
  host.querySelectorAll("[data-recall]").forEach((button, i) => button.addEventListener("click", () => recall(i)));
  undoButton.addEventListener("click", () => {
    if (!beforeGesture || !enabled || rawSine) return;
    const previous = beforeGesture;
    beforeGesture = null;
    change(previous);
    message("Restoring the sound from before your last gesture.");
    refreshEnabled();
  });
  mutation.addEventListener("click", () => perform(mutateSound(getValues(), Number($("#mutation-amount").value)), "New texture queued. Undo gesture brings the previous sound back."));
  $("#mutation-amount").addEventListener("input", (event) => setText($("[data-depth]"), `${Math.round(Number(event.target.value) * 100)}%`));
  mute.addEventListener("click", () => { if (enabled) change({ mute: Number(getValues().mute) ? 0 : 1 }); });

  function selectPreset(index) {
    if (!enabled || !presets.length) return;
    beforeGesture = null;
    change({ preset: (index + presets.length) % presets.length });
    message(preservesLevel ? "Loading soundscape at your current master volume." : "This firmware loads the preset’s own volume. Update firmware for level-preserving preset changes.");
  }
  $("[data-preset-prev]").addEventListener("click", () => selectPreset(Number(getValues().preset) - 1));
  $("[data-preset-next]").addEventListener("click", () => selectPreset(Number(getValues().preset) + 1));
  function metadata(names, livePreset) {
    preservesLevel = livePreset;
    const next = Array.isArray(names) ? names : [];
    if (JSON.stringify(next) === JSON.stringify(presets)) return;
    presets = next;
    $(".instrument-preset-bank").replaceChildren(...presets.map((name, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "instrument-preset";
      button.dataset.preset = String(i);
      button.setAttribute("aria-pressed", "false");
      const number = document.createElement("span"); number.textContent = String(i + 1).padStart(2, "0");
      const label = document.createElement("span"); label.textContent = name;
      button.append(number, label);
      button.addEventListener("click", () => selectPreset(i));
      return button;
    }));
    refreshEnabled();
  }

  function paintPad() {
    const mode = PAD_MODES[modeSelect.value];
    const values = getValues();
    const [x, y] = mode.fromValues(values).map((v) => Number.isFinite(v) ? v : 0.5);
    for (const [property, value] of [["--pad-x", `${x * 100}%`], ["--pad-y", `${(1 - y) * 100}%`]]) {
      if (pad.style.getPropertyValue(property) !== value) pad.style.setProperty(property, value);
    }
    setText($("[data-pad-values]"), !enabled ? "Connect to play" : rawSine ? "Raw sine follows the sensor directly" : `${mode.x === "cutoff" ? "Cutoff" : mode.x === "delay_ms" ? "Delay" : "Detune"} ${values[mode.x]}${mode.x === "cutoff" ? " Hz" : mode.x === "delay_ms" ? " ms" : " ct"} / ${mode.y === "resonance" ? "Res" : mode.y === "drive" ? "Drive" : "Mix"} ${values[mode.y]}`);
    setText($("[data-x-label]"), mode.xLabel);
    setText($("[data-y-label]"), mode.yLabel);
  }
  function move(x, y) {
    if (!enabled || rawSine) return;
    change(PAD_MODES[modeSelect.value].toValues(clamp(x), clamp(y)));
  }
  function movePointer(event) {
    if (event.pointerId !== pointerId) return;
    const rect = pad.getBoundingClientRect();
    if (event.shiftKey && gestureOrigin) move(gestureOrigin.x + (event.clientX - gestureOrigin.clientX) / rect.width * 0.15, gestureOrigin.y - (event.clientY - gestureOrigin.clientY) / rect.height * 0.15);
    else move((event.clientX - rect.left) / rect.width, 1 - (event.clientY - rect.top) / rect.height);
  }
  pad.addEventListener("pointerdown", (event) => {
    if (!enabled || rawSine || event.button !== 0 || pointerId !== null) return;
    event.preventDefault();
    pad.focus();
    remember();
    const [x, y] = PAD_MODES[modeSelect.value].fromValues(getValues());
    gestureOrigin = { x, y, clientX: event.clientX, clientY: event.clientY };
    pointerId = event.pointerId;
    pad.setPointerCapture(pointerId);
    pad.classList.add("is-dragging");
    movePointer(event);
  });
  pad.addEventListener("pointermove", movePointer);
  function stopPointer() { pointerId = null; gestureOrigin = null; pad.classList.remove("is-dragging"); }
  pad.addEventListener("pointerup", stopPointer);
  pad.addEventListener("pointercancel", stopPointer);
  pad.addEventListener("lostpointercapture", stopPointer);
  pad.addEventListener("keydown", (event) => {
    if (!enabled || rawSine || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    if (!keyGesture) { remember(); keyGesture = true; }
    const [x, y] = PAD_MODES[modeSelect.value].fromValues(getValues());
    const stepX = event.shiftKey ? (modeSelect.value === "strange" ? 0.0125 : 0.005) : 0.04;
    const stepY = event.shiftKey ? ({ tone: 0.018, space: 0.015, strange: 0.016 })[modeSelect.value] : 0.04;
    move(x + (event.key === "ArrowRight" ? stepX : event.key === "ArrowLeft" ? -stepX : 0), y + (event.key === "ArrowUp" ? stepY : event.key === "ArrowDown" ? -stepY : 0));
  });
  pad.addEventListener("keyup", () => { keyGesture = false; });
  pad.addEventListener("blur", () => { keyGesture = false; });
  modeSelect.addEventListener("change", paintPad);
  document.addEventListener("keydown", (event) => {
    if (!active || !enabled || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.target.closest("input, select, textarea, button, [contenteditable=true]")) return;
    if (event.key.toLowerCase() === "m") { event.preventDefault(); mute.click(); }
    if (/^[1-4]$/.test(event.key)) { event.preventDefault(); recall(Number(event.key) - 1); }
  });
  function update() {
    const values = getValues();
    const name = presets[Number(values.preset)] || "Connect your BECA";
    if (lastPreset !== name) { beforeGesture = null; lastPreset = name; }
    rawSine = /raw sensor sine/i.test(name);
    setText($("[data-preset-name]"), name);
    const muted = Number(values.mute) === 1;
    setAttribute(mute, "aria-pressed", String(muted));
    // Keep the keyboard hint separate from the accessible action name.
    setText(mute.firstChild, muted ? "Resume outputs " : "Silence outputs ");
    setText($("[data-route-hint]"), [2, 3].includes(Number(values.outputmode)) ? "Aux audio · shaping BECA’s sound engine" : "MIDI output · select Aux audio to hear these soundscapes");
    setText($("[data-explore-hint]"), rawSine ? "Pure sine bypasses timbre controls. Choose another soundscape to explore." : "Timbre changes. Tempo, key and volume stay yours.");
    host.querySelectorAll("[data-preset]").forEach((button) => setAttribute(button, "aria-pressed", String(Number(button.dataset.preset) === Number(values.preset))));
    refreshEnabled();
    paintPad();
  }
  function signal(snapshot) {
    const value = Number(snapshot.plant?.value);
    if (!Number.isFinite(value) || snapshot.stale) return;
    const now = performance.now();
    trace.push({ value: clamp(value), at: now });
    trace = trace.filter((sample) => now - sample.at <= 24000).slice(-60);
    setText($("[data-energy]"), `${Math.round(value * 100)}%`);
    host.querySelectorAll("[data-signal-leaf]").forEach((node, i) => node.classList.toggle("is-lit", i < Math.round(value * 8)));
    $("[data-scope]").setAttribute("d", trace.map((sample, i) => `${i ? "L" : "M"}${(320 - (now - sample.at) / 24000 * 320).toFixed(1)},${(48 - sample.value * 44).toFixed(1)}`).join(" "));
    const notes = (snapshot.notes?.notes || []).filter((n) => Number.isInteger(n) && n >= 0 && n <= 127).slice(0, 8);
    const signature = notes.join(",");
    if ($("[data-note-chips]").dataset.notes !== signature) {
      $("[data-note-chips]").dataset.notes = signature;
      $("[data-note-chips]").replaceChildren(...(notes.length ? notes : [null]).map((n) => {
        const chip = document.createElement("span");
        chip.textContent = n == null ? "Waiting for notes" : `${noteNames[n % 12]}${Math.floor(n / 12) - 1}`;
        chip.className = n == null ? "" : "note-chip";
        return chip;
      }));
    }
  }
  paintSlots();
  return {
    metadata, update, signal,
    setSettled(value) { settled = value; refreshEnabled(); },
    setReady(value) { enabled = value; if (!value) stopPointer(); setText($("[data-signal-state]"), value ? "Connected" : "Waiting"); host.classList.toggle("instrument-offline", !value); update(); },
    setActive(value) { active = value; if (!value) stopPointer(); },
    reset() { trace = []; beforeGesture = null; stopPointer(); $("[data-scope]").setAttribute("d", ""); setText($("[data-energy]"), "—"); host.querySelectorAll("[data-signal-leaf]").forEach((node) => node.classList.remove("is-lit")); $("[data-note-chips]").replaceChildren(); $("[data-note-chips]").dataset.notes = ""; }
  };
}
