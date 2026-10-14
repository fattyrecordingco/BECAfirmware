import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const firmwareHtml = await readFile(new URL("../../../index.html", import.meta.url), "utf8");
const controlHtml = await readFile(new URL("../ui/control.html", import.meta.url), "utf8");

async function openController(page, compact = false) {
  const state = { mode: 0, outputmode: 1, preset: 0, scale: 0, root: 0, bpm: 120, ts: "4/4", swing: 0, rest: 0.2, lo: 2, hi: 5, sens: 0.2, clock: 0, bright: 128, vs: 80, vi: 100, fx: 0, pal: 0, drumsel: 255, nr: 0, aux_ready: 1, master: 0.3, cutoff: 4000, resonance: 0.7 };
  await page.addInitScript(() => {
    window.__streams = [];
    window.EventSource = class extends EventTarget {
      constructor() { super(); window.__streams.push(this); this.timer = setInterval(() => this.emit("scope", .42), 500); }
      close() { clearInterval(this.timer); }
      emit(type, payload) { this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(payload) })); }
    };
  });
  await page.route("**/*", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/device-controller") return route.fulfill({ contentType: "text/html", body: compact ? controlHtml : firmwareHtml });
    if (path === "/api/set") {
      const form = new URLSearchParams(route.request().postData());
      state[form.get("key")] = Number(form.get("value"));
      return route.fulfill({ json: state });
    }
    const payloads = {
      "/api/params": { modes: ["Notes", "Arp", "Chords", "Drums"], scales: ["Major"], synth_presets: ["Warm Pad"], time_signatures: ["4-4"], output_modes: ["BLE MIDI", "Serial MIDI", "Aux audio", "Serial MIDI + Aux", "Wi-Fi MIDI"] },
      "/effects": { list: ["Flow"] }, "/palettes": { list: ["Forest"] }, "/api/info": { sta_mac: "AA:BB:CC:11:22:33" },
      "/api/state": state, "/api/synth": { ...state, preset_name: "Warm Pad", attack: .03, decay: .2, sustain: .7, release: .2, reverb: .1, delay_mix: .1, delay_feedback: .2, drive: .1 },
      "/api/notes": { notes: [60, 64, 67], vel: 80 }, "/api/drum": { hit: 0, sel: 255 }, "/api/plant": { value: .42 }
    };
    return payloads[path] ? route.fulfill({ json: payloads[path] }) : route.fulfill({ status: 404, body: "" });
  });
  await page.goto("/device-controller");
  await expect.poll(() => page.evaluate(() => window.__streams.length)).toBe(1);
  return state;
}

test("device controller keeps drum parts and note controls in their modes", async ({ page }, testInfo) => {
  await openController(page);
  for (const mode of ["0", "1", "2", "3", "0"]) {
    await page.locator("#control-mode").selectOption(mode);
    const drumCard = page.locator("#drum-grid").locator("..");
    if (mode === "3") { await expect(drumCard).toBeVisible(); await expect(page.locator("#control-scale")).toBeHidden(); }
    else { await expect(drumCard).toBeHidden(); await expect(page.locator("#control-scale")).toBeVisible(); }
    if (mode === "0") await expect(page.locator("#control-rest")).toBeVisible();
    else await expect(page.locator("#control-rest")).toBeHidden();
    await expect(page.locator("#note-strip")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    await page.screenshot({ path: testInfo.outputPath(`device-mode-${mode}.png`), fullPage: true });
  }
  await page.evaluate(() => window.__streams[0].emit("state", { mode: 3, outputmode: 1 }));
  await expect(page.locator("#control-scale")).toBeHidden();
  await expect(page.locator("#drum-grid")).toBeVisible();
});

test("compact Control hides pitch controls when the device enters Drums", async ({ page }, testInfo) => {
  const state = await openController(page, true);
  const scale = page.locator(".setting-button").filter({ has: page.locator(".setting-name", { hasText: /^scale$/ }) });
  await expect(scale).toBeVisible();
  await page.evaluate(state => window.__streams[0].emit("state", { ...state, mode: 3 }), state);
  await expect(scale).toBeHidden();
  await expect(page.locator("#plant-chart")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("compact-drums.png"), fullPage: true });
  await page.evaluate(state => window.__streams[0].emit("state", { ...state, mode: 1 }), state);
  await expect(scale).toBeVisible();
});
