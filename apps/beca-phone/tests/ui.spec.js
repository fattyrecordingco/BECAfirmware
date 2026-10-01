import { test, expect } from "@playwright/test";
import AxeBuilder from "axe-core";

const mockState = { outputmode: 1, outputname: "SERIAL", io_muted: 0, aux_ready: 1, aux_wait_ms: 0, plant_jack: 1, aux_jack: 1, preset: 0, preset_name: "Warm Pad", mode: 0, scale: 0, root: 0, bpm: 120, swing: 8, sens: 0.2, lo: 2, hi: 5, rest: 0.1, nr: 1, clock: 0, ts: "4/4", note_length_idx: 2, last: 60, vel: 88 };
const mockSynth = { preset: 0, preset_name: "Warm Pad", wave_a: 1, wave_b: 2, osc_mix: 0.45, mono: 0, voices: 8, attack: 0.03, decay: 0.18, sustain: 0.72, release: 0.2, filter: 0, cutoff: 6400, resonance: 1, reverb: 0.15, delay_ms: 180, delay_feedback: 0.2, delay_mix: 0.1, drive: 0.1, master: 0.7, detune: 2, gain_trim: 0.8, drumkit: 0 };

export async function installMockSerial(page) {
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
    globalThis.__MOCK_PUSH = push;
    const respond = (command) => {
      const tag = command.replace(/^@C\s+/, "").split(/\s+/)[0];
      if (tag === "PING") push('@R PING {"ok":1}');
      else if (tag === "PARAMS") push('@R PARAMS {"modes":["Notes","Arpeggiator","Chords","Drum Machine"],"scales":["Major","Minor"],"time_signatures":["4-4"],"note_lengths":["1/8"],"output_modes":["BLE MIDI","Serial MIDI","Aux audio","Serial MIDI + Aux","Wi-Fi MIDI"],"live_preset":true,"synth_presets":["Warm Pad","Soft Keys"],"ranges":{"bpm":[20,240],"swing":[0,60],"sens":[0,0.5],"lo":[1,8],"hi":[1,8],"rest":[0,0.8],"attack":[0,5],"decay":[0,5],"sustain":[0,1],"release":[0.01,10],"cutoff":[20,18000],"resonance":[0.1,10],"delay_ms":[0,800],"delay_feedback":[0,0.95],"delay_mix":[0,1],"drive":[0,1],"detune":[0,8],"gain_trim":[0.45,1]}}');
      else if (tag === "STATE") push(`@R STATE ${JSON.stringify(state)}`);
      else if (tag === "SYNTH") push(`@R SYNTH ${JSON.stringify(synth)}`);
      else if (tag === "PLANT") push('@R PLANT {"value":0.42,"connected":1}');
      else if (tag === "NOTES") push('@R NOTES {"held":1,"notes":[60],"last":60,"last_vel":88}');
      else if (tag === "SET") {
        const [, , key, value] = command.split(/\s+/);
        if (key in state) state[key] = Number.isNaN(Number(value)) ? value : Number(value);
        if (key in synth) synth[key] = Number.isNaN(Number(value)) ? value : Number(value);
        push('@R SET {"ok":1}');
      }
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

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await testInfo.attach("app-console", { body: await page.locator("#consoleLog").innerText().catch(() => "Page unavailable"), contentType: "text/plain" });
  }
});

test("connects, renders device state, and sends AUX control", async ({ page }) => {
  await page.getByRole("button", { name: "Connect USB" }).click();
  await expect(page.getByText("BECA connected", { exact: true })).toBeVisible();
  await expect(page.locator("#plantValue")).toHaveText("0.42");
  await expect(page.locator("#outputStatus")).toHaveText("SERIAL");
  await page.getByRole("radio", { name: /Aux audio/ }).click();
  await expect.poll(() => page.evaluate(() => globalThis.__MOCK_WRITES)).toContain("@C SET outputmode 2");
});

test("shows live plant data and the leaf MIDI root selector", async ({ page }) => {
  await page.getByRole("button", { name: "Connect USB" }).click();
  await expect(page.locator("#plantTrace")).not.toHaveAttribute("d", "");
  await expect(page.locator("#signalNow")).toHaveText("42%");
  await expect(page.getByRole("radio", { name: "C root note" })).toHaveClass(/playing/);
  await page.getByRole("radio", { name: "D root note" }).click();
  await expect(page.getByRole("radio", { name: "D root note" })).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => page.evaluate(() => globalThis.__MOCK_WRITES)).toContain("@C SET root 2");
});

test("keeps the live deck stable across notes, modes, and sensitivity changes", async ({ page }) => {
  await page.getByRole("button", { name: "Connect USB" }).click();
  const deck = page.locator("#liveDeck");
  const tabs = page.locator(".tabs");
  const before = await Promise.all([deck.boundingBox(), tabs.boundingBox()]);
  const clipping = await page.locator("#liveDeck, .live-signal, .live-midi").evaluateAll((elements) => elements.map((element) => ({
    id: element.id || element.className,
    horizontal: element.scrollWidth - element.clientWidth,
    vertical: element.scrollHeight - element.clientHeight
  })));
  expect(clipping).toEqual(clipping.map((item) => ({ ...item, horizontal: 0, vertical: 0 })));
  await page.evaluate(() => {
    globalThis.__MOCK_PUSH('{"type":"midi","on":1,"note":64,"vel":91}');
    globalThis.__MOCK_PUSH('{"type":"midi","on":1,"note":67,"vel":93}');
    globalThis.__MOCK_PUSH('{"type":"midi","on":1,"note":71,"vel":95}');
  });
  await expect(page.locator("#midiReadout")).toContainText("B4");
  const afterNotes = await Promise.all([deck.boundingBox(), tabs.boundingBox()]);
  expect(afterNotes).toEqual(before);

  await page.locator("#sensitivity").evaluate((input) => {
    input.value = "0.31";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("#sensitivityOutput")).toHaveText("0.31");
  await expect.poll(() => page.evaluate(() => globalThis.__MOCK_WRITES)).toContain("@C SET sens 0.31");

  const documentDeckBox = () => deck.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { x: box.x + scrollX, y: box.y + scrollY, width: box.width, height: box.height };
  });
  const fixedDeckBox = await documentDeckBox();
  for (const tab of ["Synth", "Performance", "Console", "Controller"]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await expect(deck).toBeVisible();
    expect(await documentDeckBox()).toEqual(fixedDeckBox);
  }
});

test("2D synth pad changes cutoff and resonance", async ({ page }) => {
  await page.getByRole("button", { name: "Connect USB" }).click();
  await page.getByRole("button", { name: "Synth", exact: true }).click();
  const pad = page.locator("#expressionPad");
  await pad.click({ position: { x: 220, y: 45 } });
  await expect.poll(() => page.evaluate(() => globalThis.__MOCK_WRITES.some((line) => line.startsWith("@C SET cutoff ")))).toBe(true);
  await expect.poll(() => page.evaluate(() => globalThis.__MOCK_WRITES.some((line) => line.startsWith("@C SET resonance ")))).toBe(true);
  await expect(pad).toHaveAttribute("aria-disabled", "false");
  await expect.poll(async () => {
    const cutoff = await page.locator("#control-cutoff").inputValue();
    return (await page.locator("#expressionValues").textContent()).startsWith(`${cutoff} Hz`);
  }).toBe(true);
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

test("uses the desktop BECA light design and brand assets", async ({ page }) => {
  await expect(page.locator(".brand img")).toHaveAttribute("src", "./icons/wordmark.svg");
  const theme = await page.evaluate(() => ({
    scheme: getComputedStyle(document.documentElement).colorScheme,
    background: getComputedStyle(document.body).backgroundColor,
    accent: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()
  }));
  expect(theme).toEqual({ scheme: "light", background: "rgb(246, 244, 239)", accent: "#008351" });
});

test("has no serious automated accessibility violations", async ({ page }) => {
  const source = await page.evaluate(() => document.documentElement.outerHTML);
  expect(source).toContain("BECA · Plant instrument");
  const results = await page.evaluate(async (axeSource) => {
    const script = document.createElement("script");
    script.textContent = axeSource;
    document.head.append(script);
    return globalThis.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } });
  }, AxeBuilder.source);
  expect(results.violations.filter((item) => ["serious", "critical"].includes(item.impact))).toEqual([]);
});

test("registers an offline shell that survives a reload", async ({ page, context, browserName }) => {
  test.skip(browserName === "webkit" && process.platform === "win32", "Windows Playwright WebKit fails offline navigation internally; verify on physical Safari.");
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 10_000 }).toBe(true);
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /Plant activity/ })).toBeVisible();
  await context.setOffline(false);
});

test("original synth plays live USB notes, releases them, and stops on disconnect", async ({ page }) => {
  test.skip(!await page.evaluate(() => Boolean(window.AudioContext && window.AudioWorkletNode)), "This WebKit build has no Web Audio implementation; physical iPad audio must be checked separately.");
  await page.addInitScript(() => {
    const OriginalNode = window.AudioWorkletNode;
    window.__audioErrors = [];
    window.AudioWorkletNode = class extends OriginalNode {
      constructor(context, name, options) {
        super(context, name, options);
        window.__audioAnalyser = context.createAnalyser();
        this.connect(window.__audioAnalyser);
        this.addEventListener("processorerror", () => window.__audioErrors.push("processorerror"));
      }
    };
  });
  await page.reload();
  await expect(page.locator("#presetGrid .preset-button")).toHaveCount(13);
  await page.locator("#listenButton").click();
  await expect(page.locator("#listenButton")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Connect USB" }).click();
  await expect.poll(() => page.evaluate(() => globalThis.__MOCK_WRITES)).toContain("@C SET outputmode 1");
  await page.evaluate(() => globalThis.__MOCK_PUSH("@M 90 3C 64"));
  const peak = () => page.evaluate(() => {
    const samples = new Float32Array(window.__audioAnalyser.fftSize);
    window.__audioAnalyser.getFloatTimeDomainData(samples);
    return Math.max(...samples.map(Math.abs));
  });
  await expect.poll(peak).toBeGreaterThan(0.005);
  await page.evaluate(() => globalThis.__MOCK_PUSH("@M 80 3C 00"));
  await expect.poll(peak, { timeout: 10000 }).toBeLessThan(0.001);
  await page.locator("#panicButton").click();
  await expect.poll(peak).toBe(0);
  await expect(page.locator("#audioStatus")).toContainText("Live synth");
  expect(await page.evaluate(() => window.__audioErrors)).toEqual([]);
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.locator("#listenButton")).toHaveAttribute("aria-pressed", "false");
});

test("standalone previews retain all original presets and editable synth settings", async ({ page }, testInfo) => {
  await expect(page.locator("#presetGrid .preset-button")).toHaveCount(13);
  await page.getByRole("button", { name: "Dewdrop Glass", exact: true }).click();
  await expect(page.locator("#presetName")).toHaveText("Dewdrop Glass");
  if (await page.evaluate(() => Boolean(window.AudioContext && window.AudioWorkletNode))) {
    await page.getByRole("button", { name: "Test sound", exact: true }).click();
    await expect(page.locator("#listenButton")).toHaveAttribute("aria-pressed", "true");
  } else await expect(page.locator("#audioStatus")).toContainText("not supported");
  await page.getByRole("button", { name: "Synth", exact: true }).click();
  await expect(page.locator("#control-cutoff")).toBeEnabled();
  await expect(page.locator("#control-wave_a option")).toHaveText(["Saw", "Square", "Triangle", "Sine"]);
  await page.locator("#expressionPad").click({ position: { x: 100, y: 80 } });
  expect(await page.evaluate(() => globalThis.__MOCK_WRITES)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("synth-layout.png"), fullPage: true });
});

test("tablet browser link forwards live input and settings without direct USB", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "tablet-portrait", "One real WebRTC pairing verifies shared transport across layouts.");
  const host = await context.newPage();
  await installMockSerial(host);
  await host.goto("/");
  await host.getByRole("button", { name: "Connect USB" }).click();
  await expect(host.locator("#deviceStatus")).toHaveText("BECA connected");
  await host.locator(".tablet-link summary").click();
  await host.locator("#linkOffer").click();
  await expect(host.locator("#linkOutput")).not.toHaveValue("");
  await page.locator(".tablet-link summary").click();
  await page.locator("#linkInput").fill(await host.locator("#linkOutput").inputValue());
  await page.locator("#linkAnswer").click();
  await expect(page.locator("#linkOutput")).not.toHaveValue("");
  await host.locator("#linkInput").fill(await page.locator("#linkOutput").inputValue());
  await host.locator("#linkFinish").click();
  await expect(page.locator("#deviceStatus")).toHaveText("BECA connected");
  await expect(page.locator("#plantValue")).toHaveText("0.42");
  expect(await page.evaluate(() => globalThis.__MOCK_WRITES)).toEqual([]);
  await page.getByRole("button", { name: "Synth", exact: true }).click();
  await page.locator("#control-wave_a").selectOption("3");
  await expect.poll(() => host.evaluate(() => globalThis.__MOCK_WRITES)).toContain("@C SET wave_a 3");
  await host.locator("#linkClose").click();
  await expect(page.locator("#deviceStatus")).toHaveText("Not connected");
  await host.close();
});
