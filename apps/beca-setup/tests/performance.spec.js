import { expect, test } from "@playwright/test";
import axeCore from "axe-core";

async function openPerformance(page, { offline = false, transport = "serial", initialFailures = 0, livePreset = true, detectedPort = "COM_TEST", discoveryDelay = 0 } = {}) {
  await page.addInitScript(({ offline, transport, initialFailures, livePreset, detectedPort, discoveryDelay }) => {
    localStorage.setItem("beca-read-before-first-launch-v1", "1");
    const target = { id: "beca-test", name: "BECA test", control_ready: true, serial_port: "COM_TEST" };
    const runtime = {
      mode: 0, outputmode: 1, preset: 0, scale: 0, root: 0, bpm: 120, ts: "4/4",
      note_length_idx: 2, swing: 0, rest: 0.2, sens: 0.25, lo: 1, hi: 8, nr: 0,
      io_muted: 0, daw_sync: 1, clock: 0, bright: 128, vs: 80, vi: 100, fx: 0, pal: 0,
      drumsel: 255, aux_ready: 1, master: 0.25, cutoff: 1000, resonance: 0.7
    };
    const synth = {
      preset: 0, master: 0.25, wave_a: 0, wave_b: 3, osc_mix: 0.5, detune: 2, mono: 0,
      voices: 8, gain_trim: 0.8, attack: 0.2, decay: 0.5, sustain: 0.5, release: 1,
      filter: 0, cutoff: 1000, resonance: 0.7, reverb: 0.2, delay_ms: 300,
      delay_mix: 0.2, delay_feedback: 0.3, drive: 0.1, drumkit: 0, note_length_idx: 2
    };
    const params = {
      modes: ["Notes", "Arpeggiator", "Chords", "Drums"], scales: ["Major", "Minor"],
      time_signatures: ["3-4", "4-4"], note_lengths: ["1/32", "1/16t", "1/16", "1/8"],
      synth_presets: ["Fatty Neon Lead", "Prism Poly Lead", "Verdant Pad", "Forest Choir Pad", "Thick Mono Bass", "Rubber Bass", "Dewdrop Glass", "Moon Garden", "Moss Bells", "Firefly Pluck", "Bubble Reed", "Pollen Drift", "Raw Sensor Sine"],
      output_modes: ["BLE MIDI", "Serial MIDI", "Aux audio", "Serial MIDI + Aux"], led_effects: ["Flow", "Wave"], led_palettes: ["Real palette"],
      ranges: { bpm: [20, 240], voices: [1, 8] }, live_preset: livePreset
    };
    window.__performanceMock = { runtime, synth, writes: [], snapshots: 0, snapshotBusy: false, readDelay: 0, overlapped: false, inFlight: 0, maxInFlight: 0, delay: 0, failKey: "", stale: false };
    const mock = window.__performanceMock;
    mock.bridge = { running: false, connected: false, routes: [], serial_port: "COM_TEST" }; mock.routeWrites = []; mock.panics = 0;
    window.__TAURI_INTERNALS__ = {
      transformCallback: () => 1,
      invoke: async (command, args) => {
        if (command.startsWith("plugin:event|")) return 1;
        if (command === "bridge_status") return structuredClone(mock.bridge);
        if (command === "list_midi_outputs") return [{ name: "BECA Bass" }, { name: "BECA Pads" }];
        if (command === "start_bridge") { mock.bridge = { ...mock.bridge, running: true, connected: true, routes: structuredClone(args.routes), serial_port: args.serialPort }; mock.starts = (mock.starts || 0) + 1; runtime.outputmode = runtime.outputmode >= 2 ? 3 : 1; return; }
        if (command === "stop_bridge") { mock.bridge.running = false; return; }
        if (command === "panic_bridge") { mock.panics++; return; }
        if (command === "update_bridge_routes") {
          if (mock.routeError) throw new Error("Output is unavailable");
          mock.routeWrites.push(structuredClone(args.routes)); mock.bridge.routes = structuredClone(args.routes); return { ok: true };
        }
        if (command === "detect_beca_device") return { port_name: detectedPort, fixes: [] };
        if (command === "get_wifi_setup_info") { mock.setupPort = args.serialPort; return { mode: "AP", ssid: "", name: "BECA test" }; }
        if (command === "discover_beca_targets") { await new Promise(resolve => setTimeout(resolve, discoveryDelay)); return { targets: offline ? [] : [target], selected_id: offline ? null : target.id }; }
        if (command === "current_control_target") return { target: offline ? null : target, selected_id: offline ? null : target.id, transport };
        if (command === "list_firmware_versions") return [{ version: "bundled", label: "Included 1.1.0 · works offline", default: true }];
        if (command === "backup_restore_available") return false;
        if (command === "control_snapshot") {
          mock.snapshots++;
          mock.snapshotBusy = true;
          const state = { ...runtime };
          await new Promise((resolve) => setTimeout(resolve, mock.readDelay));
          mock.snapshotBusy = false;
          return { state, plant: { raw: 1536, value: 0.4, sine_hz: 1536 }, notes: { notes: [60, 64, 67] }, stale: mock.stale, transport };
        }
        if (command === "control_request") {
          let payload;
          if (args.path === "/api/params") {
            if (initialFailures-- > 0) throw new Error("Temporary connection loss");
            payload = params;
          }
          else if (args.path === "/api/synth") payload = synth;
          else if (args.path === "/api/set") {
            const { key: wireKey, value } = args.form;
            const key = wireKey === "preset_live" ? "preset" : wireKey;
            mock.writes.push({ key, wireKey, value, at: performance.now() });
            if (mock.snapshotBusy) mock.overlapped = true;
            mock.inFlight++;
            mock.maxInFlight = Math.max(mock.maxInFlight, mock.inFlight);
            try {
              await new Promise((resolve) => setTimeout(resolve, mock.delay));
              if (key === mock.failKey) return { status: 409, body: JSON.stringify({ err: "aux not ready" }) };
              const stateKey = ({ note_length: "note_length_idx", mute: "io_muted", norep: "nr" })[key] || key;
              const parsed = key === "ts" ? value.replace("-", "/") : Number(value);
              if (key === "preset") { if (wireKey !== "preset_live") synth.master = 0.4; synth.cutoff = 3000; synth.attack = 0.8; }
              if (key in synth) synth[key] = parsed;
              if (stateKey in runtime) runtime[stateKey] = parsed;
              payload = runtime;
            } finally { mock.inFlight--; }
          } else throw new Error(`Unsupported serial route ${args.path}`);
          return { status: 200, body: JSON.stringify(payload), content_type: "application/json", transport };
        }
        throw new Error(`Unexpected command ${command}`);
      }
    };
  }, { offline, transport, initialFailures, livePreset, detectedPort, discoveryDelay });
  await page.goto("/");
  await expect(page.locator("#connect-status")).toContainText(detectedPort ? `USB connected · ${detectedPort}` : "not detected");
  // Wait for discovery to finish before opening live controls.
  await expect(page.locator("#device-select option")).toHaveCount(1);
  await page.getByRole("navigation", { name: "App views" }).getByRole("button", { name: "Performance" }).click();
  await expect(page.getByRole("heading", { name: "Performance", exact: true })).toBeVisible();
  if (!offline) await expect(page.locator("#performance-bpm")).toBeEnabled();
}

async function dragValues(page, entries) {
  await page.evaluate((entries) => {
    entries.forEach(([key, value]) => {
      const field = document.querySelector(`#performance-${key}`);
      field.value = String(value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }, entries);
}

test("Performance exposes full musical controls with responsive accessible layout", async ({ page }, testInfo) => {
  await openPerformance(page);
  await expect(page.locator(".performance-card")).toHaveCount(6);
  for (const key of ["sens", "preset", "bpm", "cutoff", "delay_ms", "release", "fx", "voices"]) {
    await expect(page.locator(`#performance-${key}`)).toBeVisible();
  }
  await expect(page.locator("#performance-preset option")).toHaveCount(13);
  await expect(page.locator("#performance-voices")).toHaveAttribute("max", "8");
  await expect(page.locator("#performance-ts")).toHaveValue("4-4");
  await expect(page.locator("[data-performance-raw]")).toContainText("1536");
  const overflow = await page.locator(".performance-frame").evaluate((root) => root.scrollWidth > root.clientWidth + 1);
  expect(overflow).toBe(false);
  await page.addScriptTag({ content: axeCore.source });
  const violations = await page.evaluate(async () => (await window.axe.run(document.querySelector(".performance-screen"), {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] }
  })).violations.filter((item) => ["critical", "serious"].includes(item.impact)).map((item) => ({ id: item.id, targets: item.nodes.map((node) => node.target) })));
  expect(violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("performance.png"), fullPage: true });
});

test("stale data pauses editing and recovers without replaying commands", async ({ page }) => {
  await openPerformance(page);
  await page.evaluate(() => { window.__performanceMock.stale = true; });
  await expect(page.locator("#performance-bpm")).toBeDisabled();
  await expect(page.locator("[data-performance-health]")).toContainText("Retrying");
  const before = await page.evaluate(() => window.__performanceMock.snapshots);
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => window.__performanceMock.snapshots)).toBe(before);
  await page.evaluate(() => { window.__performanceMock.stale = false; });
  await expect(page.locator("#performance-bpm")).toBeEnabled();
  expect(await page.evaluate(() => window.__performanceMock.writes.length)).toBe(0);
});

test("initial connection failure retries the selected device without user intervention", async ({ page }) => {
  await openPerformance(page, { initialFailures: 1 });
  await expect(page.locator("#performance-bpm")).toBeEnabled();
  expect(await page.evaluate(() => window.__performanceMock.writes.length)).toBe(0);
});

test("multiple drags send during input, coalesce by key and never overlap serial writes", async ({ page }) => {
  await openPerformance(page);
  await page.evaluate(() => { window.__performanceMock.delay = 180; });
  await dragValues(page, [["bpm", 121]]);
  await expect.poll(() => page.evaluate(() => window.__performanceMock.writes.length)).toBe(1);
  await dragValues(page, Array.from({ length: 30 }, (_, i) => [["cutoff", 2000 + i * 100], ["master", 0.3 + i * 0.01], ["bpm", 130 + i]]).flat());
  await expect(page.locator("#performance-bpm")).toHaveValue("159");
  await expect(page.locator("#performance-cutoff")).toHaveValue("4900");
  await expect.poll(() => page.evaluate(() => window.__performanceMock.runtime.bpm)).toBe(159);
  await expect.poll(() => page.evaluate(() => window.__performanceMock.synth.cutoff)).toBe(4900);
  await expect.poll(() => page.evaluate(() => window.__performanceMock.synth.master)).toBeCloseTo(0.59);
  const mock = await page.evaluate(() => ({ writes: window.__performanceMock.writes, maxInFlight: window.__performanceMock.maxInFlight }));
  expect(mock.maxInFlight).toBe(1);
  expect(mock.writes.length).toBeLessThanOrEqual(4);
  for (let index = 1; index < mock.writes.length; index++) expect(mock.writes[index].at - mock.writes[index - 1].at).toBeGreaterThanOrEqual(45);
  await expect(page.locator("#performance-bpm")).toHaveValue("159");
});

test("latest edit survives stale state and finishes when leaving Performance", async ({ page }) => {
  await openPerformance(page);
  await page.evaluate(() => { window.__performanceMock.delay = 300; });
  await dragValues(page, [["bpm", 140]]);
  await expect.poll(() => page.evaluate(() => window.__performanceMock.writes.length)).toBe(1);
  await dragValues(page, [["bpm", 190], ["cutoff", 7000]]);
  await expect(page.locator("#performance-bpm")).toHaveValue("190");
  await page.getByRole("navigation", { name: "App views" }).getByRole("button", { name: "Setup", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__performanceMock.runtime.bpm)).toBe(190);
  await expect.poll(() => page.evaluate(() => window.__performanceMock.synth.cutoff)).toBe(7000);
  const snapshots = await page.evaluate(() => window.__performanceMock.snapshots);
  await page.waitForTimeout(650);
  expect(await page.evaluate(() => window.__performanceMock.snapshots)).toBe(snapshots);
});

test("raw sine hint, rejected writes and offline readiness are truthful", async ({ page }) => {
  await openPerformance(page);
  await page.locator("#performance-preset").selectOption("12");
  await expect(page.locator("[data-performance-sine]")).toBeVisible();
  await page.evaluate(() => { window.__performanceMock.failKey = "outputmode"; });
  await page.locator("#performance-outputmode").selectOption("2");
  await expect(page.locator("[data-performance-status]")).toContainText("aux not ready");
  await expect.poll(() => page.evaluate(() => window.__performanceMock.runtime.outputmode)).toBe(1);
  await expect(page.locator("#performance-outputmode")).toHaveValue("1");
});

test("Performance stays disabled without a connected control target", async ({ page }) => {
  await openPerformance(page, { offline: true });
  await expect(page.locator("#performance-bpm")).toBeDisabled();
  await expect(page.locator("[data-performance-status]")).toContainText("Open Setup");
  expect(await page.evaluate(() => window.__performanceMock.writes.length)).toBe(0);
});

test("preset changes preserve subsequent live edits and wait for the current snapshot", async ({ page }) => {
  await openPerformance(page, { transport: "network" });
  await page.evaluate(() => { window.__performanceMock.readDelay = 300; window.__performanceMock.delay = 120; });
  await expect.poll(() => page.evaluate(() => window.__performanceMock.snapshotBusy)).toBe(true);
  await page.locator("#performance-preset").selectOption("7");
  await dragValues(page, [["master", 0.7], ["cutoff", 7500], ["attack", 0.15]]);
  await expect(page.locator("#performance-cutoff")).toHaveValue("7500");
  await expect.poll(() => page.evaluate(() => window.__performanceMock.synth.attack)).toBe(0.15);
  await expect(page.locator("#performance-master")).toHaveValue("0.7");
  await expect(page.locator("#performance-cutoff")).toHaveValue("7500");
  expect(await page.evaluate(() => window.__performanceMock.overlapped)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__performanceMock.synth.preset)).toBe(7);
});

test("XY gestures write two real parameters with coalescing and a recoverable undo", async ({ page }) => {
  await openPerformance(page);
  await page.evaluate(() => { window.__performanceMock.delay = 100; });
  const pad = page.getByRole("group", { name: "XY expression pad", exact: true });
  await pad.scrollIntoViewIfNeeded();
  const box = await pad.boundingBox();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.25, { steps: 30 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__performanceMock.synth.resonance)).toBeCloseTo(4.6, 0);
  await expect.poll(() => page.evaluate(() => window.__performanceMock.synth.cutoff)).toBeGreaterThan(4000);
  expect(await page.evaluate(() => window.__performanceMock.maxInFlight)).toBe(1);
  expect(await page.evaluate(() => window.__performanceMock.writes.length)).toBeLessThan(30);
  await page.getByRole("button", { name: "Undo gesture" }).click();
  await expect.poll(() => page.evaluate(() => window.__performanceMock.synth.cutoff)).toBe(1000);
  await expect.poll(() => page.evaluate(() => window.__performanceMock.synth.resonance)).toBe(0.7);
});

test("mutation and variation recall preserve the groove and survive reload", async ({ page }) => {
  await openPerformance(page);
  await page.getByRole("button", { name: "Save variation A", exact: true }).click();
  await expect(page.locator("[data-instrument-feedback]")).toContainText("saved on this computer");
  await page.getByRole("button", { name: "Mutate sound" }).click();
  await expect.poll(() => page.evaluate(() => window.__performanceMock.synth.cutoff)).not.toBe(1000);
  await expect(page.locator("[data-performance-status]")).toContainText("Live changes applied");
  await expect(page.getByRole("button", { name: "Save variation B" })).toBeEnabled();
  const protectedKeys = ["master", "bpm", "sens", "root", "scale", "outputmode", "mute", "preset", "daw_sync"];
  expect(await page.evaluate((keys) => window.__performanceMock.writes.filter(({ key }) => keys.includes(key)), protectedKeys)).toEqual([]);
  await page.getByRole("button", { name: "Recall variation A" }).click();
  await expect.poll(() => page.evaluate(() => window.__performanceMock.synth.cutoff)).toBe(1000);
  await expect.poll(() => page.evaluate(() => window.__performanceMock.synth.attack)).toBe(0.2);
  await page.reload();
  await page.getByRole("navigation", { name: "App views" }).getByRole("button", { name: "Performance" }).click();
  await expect(page.getByRole("button", { name: "Recall variation A" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Recall variation A" })).toContainText("Fatty Neon Lead");
});

test("precise entry, fine keys and slider reset use the loaded sound", async ({ page }) => {
  await openPerformance(page);
  await page.getByRole("button", { name: "Focus controls" }).click();
  const precise = page.getByRole("spinbutton", { name: "Filter cutoff value", exact: true });
  await precise.fill("2345");
  await precise.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__performanceMock.synth.cutoff)).toBe(2345);
  const cutoff = page.locator("#performance-cutoff");
  await cutoff.focus();
  await cutoff.press("Shift+ArrowRight");
  await expect(cutoff).toHaveValue("2346");
  await cutoff.press("ArrowRight");
  await expect(cutoff).toHaveValue("2526");
  await precise.fill("99999");
  await precise.press("Enter");
  await expect(cutoff).toHaveValue("18000");
  // Wait through synth reconciliation; reset must still use the loaded patch.
  await page.waitForTimeout(2200);
  await cutoff.dblclick();
  await expect(cutoff).toHaveValue("1000");
  await expect.poll(() => page.evaluate(() => window.__performanceMock.synth.cutoff)).toBe(1000);
});

test("soundscape browsing retains master volume and disables bypassed raw-sine gestures", async ({ page }) => {
  await openPerformance(page);
  await page.getByRole("button", { name: "07 Dewdrop Glass", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__performanceMock.synth.preset)).toBe(6);
  await expect.poll(() => page.evaluate(() => window.__performanceMock.synth.master)).toBe(0.25);
  expect(await page.evaluate(() => window.__performanceMock.writes.map(({ wireKey }) => wireKey))).toEqual(["preset_live"]);
  await page.getByRole("button", { name: "13 Raw Sensor Sine", exact: true }).click();
  await expect(page.getByRole("button", { name: "Mutate sound" })).toBeDisabled();
  await expect(page.getByRole("group", { name: "XY expression pad", exact: true })).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("button", { name: "Save variation B" })).toBeDisabled();
  await page.getByRole("button", { name: "Previous soundscape" }).click();
  await expect(page.getByRole("button", { name: "Mutate sound" })).toBeEnabled();
});

test("mute jumps ahead of queued timbre edits and stale data disables the whole deck", async ({ page }) => {
  await openPerformance(page);
  await page.evaluate(() => { window.__performanceMock.delay = 220; });
  await page.getByRole("button", { name: "Mutate sound" }).click();
  await expect.poll(() => page.evaluate(() => window.__performanceMock.writes.length)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Silence outputs" }).click();
  await expect.poll(() => page.evaluate(() => window.__performanceMock.runtime.io_muted)).toBe(1);
  const keys = await page.evaluate(() => window.__performanceMock.writes.map(({ key }) => key));
  expect(keys.indexOf("mute")).toBeLessThan(3);
  await page.evaluate(() => { window.__performanceMock.stale = true; });
  await expect(page.getByRole("button", { name: "Mutate sound" })).toBeDisabled({ timeout: 10000 });
  await expect(page.getByRole("spinbutton", { name: "Master volume value" })).toBeDisabled();
  await expect(page.getByRole("group", { name: "XY expression pad", exact: true })).toHaveAttribute("aria-disabled", "true");
});

test("pad keyboard fine movement, focus layout and reduced motion stay accessible", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openPerformance(page);
  await page.getByRole("combobox", { name: "XY mapping" }).selectOption("strange");
  const pad = page.getByRole("group", { name: "XY expression pad", exact: true });
  await pad.focus();
  await pad.press("ArrowRight");
  await expect(page.locator("#performance-detune")).toHaveValue("2.3");
  await pad.press("Shift+ArrowUp");
  await expect(page.locator("#performance-drive")).toHaveValue("0.11");
  await page.getByRole("button", { name: "Focus controls" }).click();
  await expect(page.locator(".performance-instrument")).toBeHidden();
  await expect(page.locator("#performance-master")).toBeVisible();
  await expect(page.locator("#performance-outputmode")).toBeVisible();
  const overflow = await page.locator(".performance-frame").evaluate((root) => root.scrollWidth > root.clientWidth + 1);
  expect(overflow).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("performance-controls.png"), fullPage: true });
  await page.addScriptTag({ content: axeCore.source });
  const violations = await page.evaluate(async () => (await window.axe.run(document.querySelector(".performance-screen"), {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] }
  })).violations.filter((v) => ["critical", "serious"].includes(v.impact)).map((v) => v.id));
  expect(violations).toEqual([]);
});

test("older firmware uses its supported preset command and explains volume behavior", async ({ page }) => {
  await openPerformance(page, { livePreset: false });
  await page.getByRole("button", { name: "07 Dewdrop Glass", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__performanceMock.synth.preset)).toBe(6);
  expect(await page.evaluate(() => window.__performanceMock.writes.map(({ wireKey }) => wireKey))).toEqual(["preset"]);
  await expect(page.locator("[data-instrument-feedback]")).toContainText("preset’s own volume");
});


test("combined output keeps drums separate and uses the device's LED names", async ({ page }) => {
  await openPerformance(page);
  await expect(page.locator("#performance-outputmode option")).toHaveCount(4);
  await expect(page.locator("#performance-drumkit")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "MIDI drums", exact: true })).toBeVisible();
  await page.locator("#performance-outputmode").selectOption("2");
  await expect(page.getByRole("region", { name: "MIDI drums", exact: true })).toBeHidden();
  await page.locator("#performance-outputmode").selectOption("3");
  await expect(page.getByRole("region", { name: "MIDI drums", exact: true })).toBeVisible();
  await expect(page.locator("[data-route-hint]")).toContainText("shaping");
  await expect(page.locator("#performance-fx option")).toHaveText(["Flow", "Wave"]);
  await page.locator("#performance-fx").selectOption("1");
  await expect.poll(() => page.evaluate(() => window.__performanceMock.runtime.fx)).toBe(1);
  await page.getByRole("button", { name: "Kick", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__performanceMock.runtime.drumsel)).toBe(254);
});

test("live MIDI splits can be added, edited and removed while controls continue", async ({ page }, testInfo) => {
  await openPerformance(page);
  await page.getByRole("navigation", { name: "App views" }).getByRole("button", { name: "Setup", exact: true }).click();
  await expect(page.getByLabel("Destination, split 1", { exact: true })).toHaveValue("BECA Bass");
  await page.evaluate(() => { window.__performanceMock.runtime.outputmode = 2; });
  await page.getByRole("button", { name: "Add split", exact: true }).click();
  await page.getByLabel("Destination, split 2", { exact: true }).selectOption("BECA Pads");
  await page.getByLabel("Low note, split 2", { exact: true }).fill("60");
  await page.getByLabel("Output ch, split 2", { exact: true }).selectOption("4");
  await page.getByRole("button", { name: "Start MIDI bridge", exact: true }).click();
  await expect(page.locator("[data-midi-summary]")).toContainText("Live · 2 splits");
  await expect.poll(() => page.evaluate(() => window.__performanceMock.runtime.outputmode)).toBe(3);
  await page.getByLabel("Transpose, split 1", { exact: true }).fill("-12");
  await page.getByRole("button", { name: "Apply splits", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__performanceMock.bridge.routes[0].transpose)).toBe(-12);
  await page.getByRole("navigation", { name: "App views" }).getByRole("button", { name: "Performance", exact: true }).click();
  await dragValues(page, [["bpm", 155], ["cutoff", 5700]]);
  await expect.poll(() => page.evaluate(() => window.__performanceMock.synth.cutoff)).toBe(5700);
  await page.getByRole("navigation", { name: "App views" }).getByRole("button", { name: "Setup", exact: true }).click();
  await page.getByRole("button", { name: "Release MIDI notes", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__performanceMock.panics)).toBe(1);
  await page.evaluate(() => { window.__performanceMock.bridge.connected = false; });
  await expect(page.locator("[data-midi-summary]")).toContainText("Reconnecting");
  await expect(page.getByRole("button", { name: "Stop MIDI bridge", exact: true })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("midi-routing.png"), fullPage: true });
  await page.getByRole("button", { name: "Stop MIDI bridge", exact: true }).click();
  await expect(page.locator("[data-midi-summary]")).toContainText("stopped");
  await page.getByRole("button", { name: "Remove split 2", exact: true }).click();
  await page.getByRole("button", { name: "Apply splits", exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("beca-midi-splits-v1")).length)).toBe(1);
  expect(await page.locator(".midi-routing").evaluate((node) => node.scrollWidth > node.clientWidth + 1)).toBe(false);
});

test("invalid or unavailable splits preserve the live routing and editable draft", async ({ page }) => {
  await openPerformance(page);
  await page.getByRole("navigation", { name: "App views" }).getByRole("button", { name: "Setup", exact: true }).click();
  await page.getByRole("button", { name: "Start MIDI bridge", exact: true }).click();
  await page.getByLabel("Low note, split 1", { exact: true }).fill("100");
  await page.getByLabel("High note, split 1", { exact: true }).fill("40");
  await page.getByRole("button", { name: "Apply splits", exact: true }).click();
  await expect(page.locator("[data-midi-status]")).toContainText("range");
  expect(await page.evaluate(() => window.__performanceMock.routeWrites.length)).toBe(0);
  await page.getByLabel("High note, split 1", { exact: true }).fill("120");
  await page.evaluate(() => { window.__performanceMock.routeError = true; });
  await page.getByRole("button", { name: "Apply splits", exact: true }).click();
  await expect(page.locator("[data-midi-status]")).toContainText("unavailable");
  await page.waitForTimeout(2200);
  await expect(page.getByLabel("Low note, split 1", { exact: true })).toHaveValue("100");
  expect(await page.evaluate(() => window.__performanceMock.bridge.routes[0].note_min)).toBe(0);
});


test("routing exists only in Setup and uses its USB selection", async ({ page }) => {
  await openPerformance(page, { detectedPort: "COM_SETUP" });
  await expect(page.locator('[data-screen-view="performance"] .midi-routing')).toHaveCount(0);
  await page.getByRole("navigation", { name: "App views" }).getByRole("button", { name: "Setup", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start MIDI bridge", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Start MIDI bridge", exact: true }).click();
  await expect(page.locator("[data-midi-summary]")).toContainText("COM_SETUP");
});

test("saved routing reconnects after app restart and Stop stays stopped", async ({ page }) => {
  await openPerformance(page);
  const nav = page.getByRole("navigation", { name: "App views" });
  await nav.getByRole("button", { name: "Setup", exact: true }).click();
  await page.getByRole("button", { name: "Start MIDI bridge", exact: true }).click();
  await expect(page.locator("[data-midi-summary]")).toContainText("Live");
  await nav.getByRole("button", { name: "Performance", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Performance", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__performanceMock.starts)).toBe(1);
  await nav.getByRole("button", { name: "Setup", exact: true }).click();
  await page.getByRole("button", { name: "Stop MIDI bridge", exact: true }).click();
  await page.waitForTimeout(11000);
  expect(await page.evaluate(() => window.__performanceMock.starts)).toBe(1);
  await expect(page.getByRole("button", { name: "Start MIDI bridge", exact: true })).toBeEnabled();
});

test("automatic routing can be disabled for the next session", async ({ page }) => {
  await openPerformance(page);
  await page.getByRole("navigation", { name: "App views" }).getByRole("button", { name: "Setup", exact: true }).click();
  await page.getByLabel("Automatically connect my saved splits").uncheck();
  await page.getByRole("button", { name: "Start MIDI bridge", exact: true }).click();
  await page.reload();
  await page.waitForTimeout(2300);
  expect(await page.evaluate(() => window.__performanceMock.starts || 0)).toBe(0);
  await expect(page.getByLabel("Automatically connect my saved splits")).not.toBeChecked();
});

test("firmware and MIDI outputs load before slow device discovery completes", async ({ page }) => {
  const opened = openPerformance(page, { discoveryDelay: 4500 });
  await expect(page.locator("#firmware-select")).toHaveValue("bundled");
  await expect(page.getByLabel("Destination, split 1", { exact: true })).toHaveValue("BECA Bass");
  await expect(page.getByRole("button", { name: "install firmware", exact: true })).toBeEnabled();
  await opened;
});

test("the bundled manual opens and closes without leaving the instrument", async ({ page }) => {
  await openPerformance(page);
  await page.getByRole("navigation", { name: "App views" }).getByRole("button", { name: "Setup", exact: true }).click();
  await page.getByRole("link", { name: /Open the BECA manual/ }).click();
  await expect(page.getByRole("dialog", { name: "BECA manual" })).toBeVisible();
  await expect(page.frameLocator('.manual-dialog iframe').getByRole('heading', {name:'First BECA: installing a unit shipped without code'})).toBeVisible();
  await page.getByRole("button", { name: "Close manual", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
