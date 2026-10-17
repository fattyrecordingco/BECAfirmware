import { MidiMapper, MAPPING_STORAGE_KEY, MAPPING_MODES, sourceLabel } from "./midi-mapping.js";
import { icon } from "./icons.js";
import "./midi-controller.css";

export function createMidiController({ host, invoke, controls, change }) {
  const load = () => { try { return JSON.parse(localStorage.getItem(MAPPING_STORAGE_KEY) || "[]"); } catch { return []; } };
  const mapper = new MidiMapper({ controls, change, stored: load() });
  let selected = "";
  try { selected = localStorage.getItem(`${MAPPING_STORAGE_KEY}-input`) || ""; } catch { /* Session-only preferences. */ }
  let active = false, connected = "", epoch = 0, timer = null, due = 0, nativeTail = Promise.resolve();
  host.innerHTML = `<details class="midi-controller"><summary>${icon("knobs")}<span>MIDI controller</span><span data-midi-count></span></summary>
    <div class="midi-controller-body">
      <div class="midi-controller-input"><label for="controller-input">MIDI input</label><select id="controller-input"><option value="">No controller</option></select>
        <button type="button" class="performance-button icon-button" data-midi-refresh aria-label="Refresh MIDI inputs" title="Refresh MIDI inputs">${icon("refresh")}</button></div>
      <div class="midi-controller-learn"><label for="controller-target">Control</label><select id="controller-target"></select>
        <button type="button" class="performance-button" data-midi-learn aria-pressed="false">${icon("learn")}<span>Learn</span></button></div>
      <p class="midi-controller-status" role="status" data-controller-status>Select a MIDI input, choose a control, then Learn.</p>
      <div class="midi-mappings" data-midi-mappings></div>
      <p class="midi-controller-help">Move a knob or press a pad to assign it. Pickup prevents value jumps. Mappings are saved on this computer and work in Performance.</p>
    </div></details>`;
  const $ = selector => host.querySelector(selector);
  const input = $("#controller-input"), target = $("#controller-target"), learn = $("[data-midi-learn]");
  const setStatus = value => { if ($("[data-controller-status]").textContent !== value) $("[data-controller-status]").textContent = value; };
  const nativeConnect = name => {
    const next = nativeTail.then(() => invoke("controller_connect", { name: name || null }));
    nativeTail = next.catch(() => {}); return next;
  };
  function persist() {
    try { localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(mapper.mappings)); localStorage.setItem(`${MAPPING_STORAGE_KEY}-input`, selected); }
    catch { setStatus("Mappings work this session. Allow local storage to keep them."); }
  }
  function options(select, entries, value) {
    select.replaceChildren(...entries.map(([key, label]) => { const option = document.createElement("option"); option.value = key; option.textContent = label; return option; }));
    select.value = value;
  }
  function refreshTargets() {
    const entries = [...controls].filter(([, read]) => read().enabled).map(([key, read]) => [key, read().label]);
    const signature = JSON.stringify(entries);
    if (target.dataset.options !== signature) {
      const previous = target.value;
      options(target, entries, entries.some(([key]) => key === previous) ? previous : entries[0]?.[0]);
      target.dataset.options = signature;
    }
    learn.disabled = !connected || !entries.length;
    if (mapper.learning && !entries.some(([key]) => key === mapper.learning.target)) { mapper.learning = null; paintLearn(); }
  }
  function paintLearn() {
    learn.setAttribute("aria-pressed", String(Boolean(mapper.learning)));
    learn.querySelector("span").textContent = mapper.learning ? "Cancel learn" : "Learn";
    host.closest(".performance-frame")?.querySelectorAll("[data-midi-learning]").forEach(node => delete node.dataset.midiLearning);
    if (mapper.learning) document.getElementById(`performance-${mapper.learning.target}`)?.closest(".performance-field")?.setAttribute("data-midi-learning", "true");
  }
  function render() {
    const count = mapper.mappings.length;
    $("[data-midi-count]").textContent = count ? String(count) : "";
    $("[data-midi-mappings]").replaceChildren(...mapper.mappings.map((mapping, index) => {
      const row = document.createElement("div"); row.className = "midi-mapping";
      const description = document.createElement("div");
      const title = document.createElement("strong"); title.textContent = controls.get(mapping.target)().label;
      const source = document.createElement("span"); source.textContent = `${mapping.device} · ${sourceLabel(mapping)}`;
      description.append(title, source);
      const mode = document.createElement("select"); mode.setAttribute("aria-label", `${title.textContent} MIDI response`);
      const isToggle = controls.get(mapping.target)().toggle;
      options(mode, Object.entries(MAPPING_MODES).filter(([key]) => mapping.kind === "cc" && !isToggle || ["pickup", "direct"].includes(key)), mapping.mode);
      mode.addEventListener("change", () => { mapping.mode = mode.value; mapper.reset(); paintLearn(); persist(); });
      const reverse = document.createElement("label"); reverse.className = "midi-reverse";
      const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = mapping.inverted; checkbox.setAttribute("aria-label", `Reverse ${title.textContent} MIDI`);
      checkbox.addEventListener("change", () => { mapping.inverted = checkbox.checked; mapper.reset(); paintLearn(); persist(); });
      reverse.append(checkbox, "Reverse");
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "performance-button icon-button"; remove.innerHTML = icon("trash");
      remove.setAttribute("aria-label", `Remove ${title.textContent} mapping`); remove.title = `Remove ${title.textContent} mapping`;
      remove.addEventListener("click", () => { mapper.remove(index); paintLearn(); persist(); render(); });
      row.append(description, mode, reverse, remove); return row;
    }));
  }
  async function refreshInputs() {
    const requestEpoch = epoch;
    const names = await invoke("controller_inputs");
    if (requestEpoch !== epoch || !active) return [];
    const entries = [["", "No controller"], ...names.map(name => [name, name])];
    if (selected && !names.includes(selected)) entries.push([selected, `${selected} (disconnected)`]);
    const signature = JSON.stringify(entries);
    if (signature !== input.dataset.options) { options(input, entries, selected); input.dataset.options = signature; }
    return names;
  }
  async function poll() {
    const requestEpoch = epoch;
    if (!active || document.hidden) return;
    try {
      if (Date.now() >= due) {
        due = Date.now() + 3000;
        const names = await refreshInputs();
        if (requestEpoch !== epoch) return;
        if (connected && !names.includes(connected)) {
          connected = ""; mapper.reset(); paintLearn(); await nativeConnect("");
          setStatus("MIDI input disconnected. Reconnect the controller.");
        }
        if (selected && !names.includes(selected)) setStatus("MIDI input disconnected. Reconnect the controller.");
        if (selected && !connected && names.includes(selected)) {
          await nativeConnect(selected);
          if (requestEpoch !== epoch) return;
          connected = selected; mapper.reset(); paintLearn(); setStatus(`${connected} connected.`);
        }
      }
      if (requestEpoch !== epoch) return;
      refreshTargets();
      if (connected) {
        const batch = await invoke("controller_drain");
        if (requestEpoch !== epoch) return;
        if (batch.overflow) { mapper.reset(); paintLearn(); setStatus("MIDI input overloaded. Move one control at a time."); }
        else for (const bytes of batch.messages) {
          const result = mapper.receive(connected, bytes);
          if (result?.learned) { render(); paintLearn(); setStatus(`${controls.get(result.learned.target)().label} assigned to ${sourceLabel(result.learned)}.`); persist(); }
          else if (result?.full) setStatus("64 mappings saved. Remove a mapping before learning another.");
          else if (result?.pickup) setStatus(`Move the knob to match ${controls.get(result.pickup)().label}.`);
          else if (result?.changed) setStatus(`${connected} connected.`);
        }
      }
    } catch { if (requestEpoch === epoch) { connected = ""; mapper.reset(); paintLearn(); setStatus("MIDI input unavailable. Close other MIDI apps or reconnect the controller."); } }
    finally { if (active && requestEpoch === epoch) timer = setTimeout(poll, connected ? 40 : 1000); }
  }
  function restart() {
    epoch++; clearTimeout(timer); connected = ""; mapper.reset(); paintLearn(); due = 0;
    setStatus(selected ? "Connecting MIDI input…" : "Select a MIDI input, choose a control, then Learn.");
    nativeConnect("").catch(() => {});
    if (active && !document.hidden) poll();
  }
  input.addEventListener("change", () => { selected = input.value; persist(); restart(); });
  target.addEventListener("change", () => { mapper.learning = null; paintLearn(); });
  learn.addEventListener("click", () => {
    if (mapper.learning) { mapper.learning = null; setStatus("MIDI Learn cancelled."); }
    else { mapper.learn(target.value, connected); setStatus(`Move a knob or press a pad for ${controls.get(target.value)().label}.`); }
    paintLearn();
  });
  host.addEventListener("keydown", event => { if (event.key === "Escape" && mapper.learning) { mapper.learning = null; paintLearn(); setStatus("MIDI Learn cancelled."); event.preventDefault(); } });
  $("[data-midi-refresh]").addEventListener("click", () => { due = 0; });
  document.addEventListener("visibilitychange", restart);
  render(); refreshTargets();
  return { setActive(value, force = false) { if (active !== value || force) { active = value; restart(); } }, refreshTargets };
}
