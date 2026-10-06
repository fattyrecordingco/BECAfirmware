import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../../../index.html", import.meta.url), "utf8");
const state = { mode: 0, outputmode: 0, preset: 0, scale: 0, root: 0, bpm: 120, ts: "4/4", lo: 2, hi: 5, sens: 0.2, clock: 0, bright: 128, drumsel: 255, aux_ready: 1, master: 0.3, cutoff: 4000, resonance: 0.7 };
const synth = { ...state, preset_name: "Warm Pad", attack: 0.03, decay: 0.2, sustain: 0.7, release: 0.2, reverb: 0.1, delay_mix: 0.1, delay_feedback: 0.2, drive: 0.1 };

test("firmware controller detects stalled SSE and recovers after Safari backgrounding", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let liveRequests = 0;
  await page.addInitScript(() => {
    window.__streams = [];
    window.__hidden = false;
    Object.defineProperty(document, "hidden", { get: () => window.__hidden });
    window.EventSource = class extends EventTarget {
      constructor() { super(); this.closed = false; window.__streams.push(this); }
      close() { this.closed = true; }
      emit(type, data) { this.dispatchEvent(new MessageEvent(type, { data })); }
    };
  });
  await page.route("**/*", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/firmware") return route.fulfill({ contentType: "text/html", body: html });
    const payloads = {
      "/api/params": { modes: ["Notes", "Arp", "Chords", "Drums"], scales: ["Major"], synth_presets: ["Warm Pad"], time_signatures: ["4-4"], output_modes: ["BLE MIDI", "Serial MIDI", "Aux audio", "Serial MIDI + Aux", "Wi-Fi MIDI"] },
      "/effects": { list: ["Flow"] }, "/palettes": { list: ["Forest"] },
      "/api/state": state, "/api/synth": synth, "/api/notes": { notes: [], vel: 0 },
      "/api/drum": { hit: 0, sel: 255 }, "/api/plant": { value: 0.42 },
      "/api/live": { state, notes: { notes: [], vel: 0 }, plant: { value: 0.42 }, drum: { hit: 0, sel: 255 } }
    };
    if (path === "/api/live") liveRequests++;
    if (payloads[path]) return route.fulfill({ json: payloads[path] });
    return route.fulfill({ status: 404, body: "" });
  });
  await page.goto("/firmware");
  await expect.poll(() => page.evaluate(() => window.__streams.length)).toBe(1);
  await page.evaluate(() => window.__streams[0].emit("scope", "0.42"));
  await expect.poll(() => liveRequests, { timeout: 9000 }).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__streams[0].closed)).toBe(true);
  await page.evaluate(() => { window.__hidden = true; document.dispatchEvent(new Event("visibilitychange")); });
  // Let an already issued fetch finish; no new poll may start while hidden.
  await page.waitForTimeout(100);
  const paused = liveRequests;
  await page.waitForTimeout(1000);
  expect(liveRequests).toBe(paused);
  await page.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event("visibilitychange")); });
  await expect.poll(() => page.evaluate(() => window.__streams.length)).toBe(2);
  await page.evaluate(() => window.__streams[1].emit("scope", "0.51"));
  expect(errors).toEqual([]);
});
