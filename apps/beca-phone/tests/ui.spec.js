import { test, expect } from "@playwright/test";
import AxeBuilder from "axe-core";

const mockState = { outputmode: 1, outputname: "SERIAL", io_muted: 0, aux_ready: 1, aux_wait_ms: 0, plant_jack: 1, aux_jack: 1, preset: 0, preset_name: "Warm Pad", mode: 0, scale: 0, root: 0, bpm: 120, swing: 8, sens: 0.2, lo: 2, hi: 5, rest: 0.1, nr: 1, clock: 0, ts: "4/4", note_length_idx: 2, last: 60, vel: 88 };
const mockSynth = { preset: 0, preset_name: "Warm Pad", wave_a: 1, wave_b: 2, osc_mix: 0.45, mono: 0, voices: 8, attack: 0.03, decay: 0.18, sustain: 0.72, release: 0.2, filter: 0, cutoff: 6400, resonance: 1, reverb: 0.15, delay_ms: 180, delay_feedback: 0.2, delay_mix: 0.1, drive: 0.1, master: 0.7, detune: 2, gain_trim: 0.8, drumkit: 0 };

async function installMockSerial(page) {
  await page.addInitScript(({ state, synth }) => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const replies = [];
    let wake;
    globalThis.__MOCK_WRITES = [];
    const push = (line) => {
      replies.push(encoder.encode(`${line}\n`));
      if (wake) { wake(); wake = null; }
    };
    const respond = (command) => {
      const tag = command.replace(/^@C\s+/, "").split(/\s+/)[0];
      if (tag === "PING") push('@R PING {"ok":1}');
      else if (tag === "PARAMS") push('@R PARAMS {"modes":["Notes","Arpeggiator","Chords","Drum Machine"],"scales":["Major","Minor"],"time_signatures":["4-4"],"note_lengths":["1/8"],"output_modes":["BLE MIDI","Serial MIDI","Aux audio","Serial MIDI + Aux","Wi-Fi MIDI"],"live_preset":true,"synth_presets":["Warm Pad","Soft Keys"],"ranges":{"bpm":[20,240],"swing":[0,60],"sens":[0,0.5],"lo":[1,8],"hi":[1,8],"rest":[0,0.8],"attack":[0,5],"decay":[0,5],"sustain":[0,1],"release":[0.01,10],"cutoff":[20,18000],"resonance":[0.1,10],"delay_ms":[0,800],"delay_feedback":[0,0.95],"delay_mix":[0,1],"drive":[0,1],"detune":[0,8],"gain_trim":[0.45,1]}}');
      else if (tag === "STATE") push(`@R STATE ${JSON.stringify(state)}`);
      else if (tag === "SYNTH") push(`@R SYNTH ${JSON.stringify(synth)}`);
      else if (tag === "PLANT") push('@R PLANT {"value":0.42,"connected":1}');
      else if (tag === "NOTES") push('@R NOTES {"held":1,"notes":[60],"last":60,"last_vel":88}');
      else if (tag === "SET") push('@R SET {"ok":1}');
      else if (tag === "TELEMETRY") push('@R TELEMETRY {"ok":1,"enabled":1}');
      else if (tag === "SYNTH_TEST") push('@R SYNTH_TEST {"ok":1}');
      else if (tag === "RANDOMIZE") push('@R RANDOMIZE {"ok":1}');
    };
    const port = {
      readable: { getReader: () => ({ read: async () => { while (!replies.length) await new Promise((resolve) => { wake = resolve; }); return { value: replies.shift(), done: false }; }, cancel: async () => { if (wake) wake(); }, releaseLock: () => {} }) },
      writable: { getWriter: () => ({ write: async (bytes) => { const command = decoder.decode(bytes).trim(); globalThis.__MOCK_WRITES.push(command); respond(command); }, close: async () => {}, releaseLock: () => {} }) },
      open: async () => {}, close: async () => {}
    };
    globalThis.__BECA_SERIAL__ = { requestPort: async () => port };
  }, { state: mockState, synth: mockSynth });
}

test.beforeEach(async ({ page }) => {
  await installMockSerial(page);
  await page.goto("/");
});

test("connects, renders device state, and sends AUX control", async ({ page }) => {
  await page.getByRole("button", { name: "Connect USB" }).click();
  await expect(page.getByText("BECA connected", { exact: true })).toBeVisible();
  await expect(page.locator("#plantValue")).toHaveText("0.42");
  await expect(page.locator("#outputStatus")).toHaveText("SERIAL");
  await page.getByRole("radio", { name: /Aux audio/ }).click();
  await expect.poll(() => page.evaluate(() => globalThis.__MOCK_WRITES)).toContain("@C SET outputmode 2");
});

test("all sections work at phone width without horizontal overflow", async ({ page }) => {
  await page.getByRole("button", { name: "Connect USB" }).click();
  for (const tab of ["Controller", "Synth", "Performance", "Console"]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await expect(page.locator(`#${tab.toLowerCase()}`)).toBeVisible();
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
});

test("has no serious automated accessibility violations", async ({ page }) => {
  const source = await page.evaluate(() => document.documentElement.outerHTML);
  expect(source).toContain("BECA AUX Controller");
  const results = await page.evaluate(async (axeSource) => {
    const script = document.createElement("script");
    script.textContent = axeSource;
    document.head.append(script);
    return globalThis.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } });
  }, AxeBuilder.source);
  expect(results.violations.filter((item) => ["serious", "critical"].includes(item.impact))).toEqual([]);
});

test("registers an offline shell that survives a reload", async ({ page, context }) => {
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 10_000 }).toBe(true);
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /Let the plant play/ })).toBeVisible();
  await context.setOffline(false);
});
