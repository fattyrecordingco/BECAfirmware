import "./midi-routing.css";

const KEY = "beca-midi-splits-v1";
const AUTO_KEY = "beca-midi-auto-v1";
const preferredOutput = (outputs) => outputs.find((p) => /beca/i.test(p.name))?.name || outputs.find((p) => /loopbe|loopmidi|iac/i.test(p.name))?.name || "";
const newRoute = (port = "", index = 0) => ({ id: crypto.randomUUID(), name: `Split ${index + 1}`, port, enabled: true, input_channel: 0, output_channel: 0, note_min: 0, note_max: 127, transpose: 0, microfreak: false });
export function createMidiRouting({ invoke, getTarget }) {
  const screen = document.createElement("details");
  screen.className = "midi-routing";
  screen.open = true;
  screen.innerHTML = `<summary><span>MIDI routing</span><span data-midi-summary>Bridge stopped</span><span aria-hidden="true">＋</span></summary>
    <div class="midi-routing-body"><div class="midi-routing-heading"><p>Send the plant to different instruments. Split by notes or channels, or layer the full range.</p><button type="button" class="performance-button" data-midi-refresh>Refresh outputs</button></div>
      <div class="midi-routes" role="group" aria-label="MIDI splits"></div>
      <div class="midi-routing-actions"><button type="button" class="performance-button" data-midi-add>Add split</button><button type="button" class="performance-button" data-midi-apply disabled>Apply splits</button><button type="button" class="performance-button midi-bridge-start" data-midi-start>Start MIDI bridge</button><button type="button" class="performance-button" data-midi-panic disabled>Release MIDI notes</button></div>
      <p class="midi-routing-status" role="status" data-midi-status>Connect BECA over USB and choose a MIDI output.</p>
      <label class="midi-auto"><input type="checkbox" data-midi-auto checked> Automatically connect my saved splits when BECA is plugged in</label>
      <p class="midi-routing-help">Changes take effect with Apply splits. Held MIDI notes are released before routing changes. Channel 10 carries MIDI percussion.</p>
    </div>`;
  const $ = (s) => screen.querySelector(s);
  let routes = [];
  let outputs = [];
  let bridge = { running: false, connected: false, routes: [] };
  let active = false, dirty = false, busy = false, timer = null, loaded = false, refreshing = false;
  let stoppedByUser = false, lastAttempt = 0, lastOutputs = 0;
  try {
    const stored = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(stored) && stored.length <= 8) routes = stored.filter((r) => r && typeof r.id === "string" && typeof r.port === "string" && typeof r.name === "string");
  } catch { /* Invalid saved drafts never prevent connecting. */ }
  $("[data-midi-auto]").checked = localStorage.getItem(AUTO_KEY) !== "0";
  $("[data-midi-auto]").addEventListener("change", () => {
    localStorage.setItem(AUTO_KEY, $("[data-midi-auto]").checked ? "1" : "0");
    stoppedByUser = false;
  });
  function message(value, error = false) { $("[data-midi-status]").textContent = value; $("[data-midi-status]").classList.toggle("performance-error", error); }
  function updateButtons() {
    $("[data-midi-add]").disabled = busy || routes.length >= 8;
    $("[data-midi-apply]").disabled = busy || !dirty;
    $("[data-midi-start]").disabled = busy || getTarget().blocked || (!bridge.running && (!getTarget().serialPort || !routes.some((r) => r.enabled && r.port)));
    $("[data-midi-start]").textContent = bridge.running ? "Stop MIDI bridge" : "Start MIDI bridge";
    $("[data-midi-panic]").disabled = busy || !bridge.running;
    $("[data-midi-refresh]").disabled = busy;
    const summary = bridge.running ? `${bridge.connected ? "Live" : "Reconnecting"} · ${bridge.routes.filter((r) => r.enabled).length} splits · ${bridge.serial_port || "USB"}` : "Bridge stopped";
    if ($("[data-midi-summary]").textContent !== summary) $("[data-midi-summary]").textContent = summary;
    screen.dataset.running = String(bridge.running);
    screen.querySelectorAll(".midi-route input, .midi-route select, .midi-route button").forEach((node) => { node.disabled = busy; });
  }
  function edit() { dirty = true; updateButtons(); message("Unapplied changes. Apply splits when you are ready."); }
  function render() {
    $(".midi-routes").replaceChildren(...routes.map((route, i) => {
      const row = document.createElement("fieldset"); row.className = "midi-route";
      const legend = document.createElement("legend"); legend.textContent = `Split ${i + 1}`; row.appendChild(legend);
      function field(key, label, type = "text", options = null) {
        const wrap = document.createElement("label"); wrap.className = `midi-route-${key}`;
        const name = document.createElement("span"); name.textContent = label;
        const input = document.createElement(options ? "select" : "input");
        input.setAttribute("aria-label", `${label}, split ${i + 1}`);
        if (options) options.forEach(([value, text]) => { const option = document.createElement("option"); option.value = String(value); option.textContent = text; input.appendChild(option); });
        else { input.type = type; if (type === "text") input.maxLength = 64; }
        if (type === "number") { input.min = key === "transpose" ? -48 : 0; input.max = key === "transpose" ? 48 : 127; input.step = 1; }
        if (type === "checkbox") input.checked = Boolean(route[key]); else input.value = String(route[key]);
        input.addEventListener(options || type === "checkbox" ? "change" : "input", () => { route[key] = type === "checkbox" ? input.checked : type === "number" || key.endsWith("channel") ? (input.value === "" ? NaN : Number(input.value)) : input.value; edit(); });
        wrap.append(name, input); row.appendChild(wrap);
      }
      field("enabled", "On", "checkbox");
      field("name", "Name");
      const names = [...new Set([...outputs.map((p) => p.name), ...(route.port ? [route.port] : [])])];
      field("port", "Destination", "text", [["", "Choose output"], ...names.map((name) => [name, `${name}${outputs.some((p) => p.name === name) ? "" : " (unavailable)"}`])]);
      const channels = Array.from({ length: 16 }, (_, n) => [n + 1, String(n + 1)]);
      field("input_channel", "Input ch", "text", [[0, "All"], ...channels]);
      field("output_channel", "Output ch", "text", [[0, "Keep"], ...channels]);
      field("note_min", "Low note", "number"); field("note_max", "High note", "number"); field("transpose", "Transpose", "number");
      field("microfreak", "MicroFreak", "checkbox");
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "performance-button"; remove.textContent = "Remove"; remove.setAttribute("aria-label", `Remove split ${i + 1}`);
      remove.addEventListener("click", () => { routes.splice(i, 1); render(); edit(); }); row.appendChild(remove);
      return row;
    }));
    updateButtons();
  }
  function validate() {
    for (const [i, route] of routes.entries()) {
      if (route.enabled && !route.port) throw new Error(`Choose a destination for split ${i + 1}.`);
      for (const key of ["note_min", "note_max", "input_channel", "output_channel", "transpose"]) {
        if (!Number.isInteger(route[key])) throw new Error(`Enter a whole number for ${key.replaceAll("_", " ")} in split ${i + 1}.`);
      }
      if (route.note_min < 0 || route.note_max > 127 || route.note_min > route.note_max || Math.abs(route.transpose) > 48 || route.input_channel < 0 || route.input_channel > 16 || route.output_channel < 0 || route.output_channel > 16) throw new Error(`Check the channel, note range and transpose in split ${i + 1}.`);
    }
  }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(routes)); } catch { message("Splits applied for this session; local storage is unavailable."); } }
  async function run(work) {
    if (busy) return;
    busy = true; updateButtons();
    try { await work(); } catch (error) { message(String(error.message || error), true); }
    finally { busy = false; updateButtons(); }
  }
  async function refresh(withOutputs = false) {
    if (busy || refreshing) return;
    refreshing = true;
    try {
      bridge = await invoke("bridge_status");
      bridge.routes ||= [];
      if (withOutputs || !loaded || (!bridge.running && Date.now() - lastOutputs > 5000)) {
        const next = await invoke("list_midi_outputs");
        const changed = JSON.stringify(next) !== JSON.stringify(outputs);
        outputs = next; loaded = true; lastOutputs = Date.now();
        if (changed) render();
      }
      if (!dirty && bridge.running && JSON.stringify(routes) !== JSON.stringify(bridge.routes)) { routes = structuredClone(bridge.routes); render(); }
      if (!routes.length && !bridge.running && !dirty) { routes = [newRoute(preferredOutput(outputs))]; render(); }
      if (withOutputs) render();
      updateButtons();
      if (!bridge.running && !dirty && !stoppedByUser && !getTarget().blocked && getTarget().serialPort && $("[data-midi-auto]").checked && localStorage.getItem(KEY) && Date.now() - lastAttempt > 10000) {
        const enabled = routes.filter((r) => r.enabled);
        if (enabled.length && enabled.every((r) => outputs.some((p) => p.name === r.port))) {
          lastAttempt = Date.now();
          await run(start);
        } else message("Waiting for your saved MIDI destination. Open your virtual MIDI port, or choose an output and Apply splits.");
      }
    } catch (error) { message(`MIDI status unavailable: ${error.message || error}`, true); }
    finally { refreshing = false; }
  }
  $("[data-midi-refresh]").addEventListener("click", () => refresh(true));
  $("[data-midi-add]").addEventListener("click", () => { if (routes.length < 8) { routes.push(newRoute(preferredOutput(outputs), routes.length)); render(); edit(); } });
  $("[data-midi-apply]").addEventListener("click", () => run(async () => {
    validate();
    if (bridge.running) { await invoke("update_bridge_routes", { routes }); bridge.routes = structuredClone(routes); }
    dirty = false; message(bridge.running ? "Splits applied. Live controls and MIDI continue over the same USB connection." : "Splits saved. Start the MIDI bridge to use them."); persist();
  }));
  async function start() {
    if (getTarget().blocked) throw new Error("Wait for firmware or Wi-Fi setup to finish.");
    validate();
    await invoke("start_bridge", { serialPort: getTarget().serialPort, midiPort: routes.find((r) => r.enabled)?.port || "", microfreakMode: false, secondaryMidiPort: null, secondaryMicrofreakMode: false, routes });
    bridge = await invoke("bridge_status"); bridge.routes ||= [];
    dirty = false; stoppedByUser = false; persist();
    message(`Ready for your DAW. Select ${routes.filter((r) => r.enabled).map((r) => r.port).join(" / ")} as MIDI input. Keep this app open.`);
  }
  $("[data-midi-start]").addEventListener("click", () => run(async () => {
    if (bridge.running) {
      stoppedByUser = true;
      await invoke("stop_bridge"); bridge.running = false; bridge.connected = false; message("Bridge stopped. Routed MIDI notes released.");
    } else {
      await start();
    }
  }));
  $("[data-midi-panic]").addEventListener("click", () => run(async () => { await invoke("panic_bridge"); message("Routed MIDI notes released. Aux continues independently."); }));
  render();
  async function tick() { clearTimeout(timer); if (!active) return; await refresh(); if (active) timer = setTimeout(tick, 2000); }
  return { screen, activate(value) { active = value; clearTimeout(timer); if (active) tick(); } };
}
