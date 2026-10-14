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
    globalThis.__MOCK_STATE = state;
    globalThis.__MOCK_SYNTH = synth;
    globalThis.__MOCK_PLANT = {value:0.42,connected:1};
    const push = (line) => {
      replies.push(encoder.encode(`${line}\n`));
      if (wake) { wake(); wake = null; }
    };
    globalThis.__MOCK_PUSH = push;
    const respond = (command) => {
      const tag = command.replace(/^@C\s+/, "").split(/\s+/)[0];
      if (tag === "PING") push('@R PING {"ok":1}');
      else if (tag === "PARAMS") push('@R PARAMS {"modes":["Notes","Arpeggiator","Chords","Drum Machine"],"scales":["Major","Minor"],"time_signatures":["4-4"],"note_lengths":["1/8"],"output_modes":["BLE MIDI","Serial MIDI","Aux audio","Serial MIDI + Aux","Wi-Fi MIDI"],"live_preset":true,"synth_presets":["Warm Pad","Soft Keys"],"ranges":{"bpm":[20,240],"swing":[0,60],"sens":[0,0.5],"lo":[1,8],"hi":[1,8],"rest":[0,0.8],"attack":[0,5],"decay":[0,5],"sustain":[0,1],"release":[0.01,10],"cutoff":[20,18000],"resonance":[0.1,10],"delay_ms":[0,800],"delay_feedback":[0,0.95],"delay_mix":[0,1],"drive":[0,1],"detune":[0,8],"gain_trim":[0.45,1]}}');
      else if (tag === "WIFI_INFO") push('@R WIFI_INFO {"sta_mac":"AA:BB:CC:11:22:33","ap_mac":"AA:BB:CC:11:22:34","ssid":"StudioWiFi","ip":"192.168.1.20","name":"beca-test"}');
      else if (tag === "WIFI_SAVE") push(`@R WIFI_SAVE ${JSON.stringify(globalThis.__MOCK_WIFI_RESULT || {ok:1})}`);
      else if (tag === "REBOOT") push('@R REBOOT {"ok":1}');
      else if (tag === "STATE") push(`@R STATE ${JSON.stringify(state)}`);
      else if (tag === "SYNTH") {
        if (globalThis.__MOCK_SYNTH_DELAY) setTimeout(()=>push(`@R SYNTH ${JSON.stringify(synth)}`),globalThis.__MOCK_SYNTH_DELAY);
        else push(`@R SYNTH ${JSON.stringify(synth)}`);
      }
      else if (tag === "PLANT") push(`@R PLANT ${JSON.stringify(globalThis.__MOCK_PLANT)}`);
      else if (tag === "NOTES") push('@R NOTES {"held":1,"notes":[60],"last":60,"last_vel":88}');
      else if (tag === "SET") {
        if (globalThis.__MOCK_SET_ERROR) { push('@R SET {"ok":0,"err":"Setting unavailable"}'); return; }
        const [, , key, value] = command.split(/\s+/);
        if (key in state) state[key] = Number.isNaN(Number(value)) ? value : Number(value);
        if (key in synth) synth[key] = Number.isNaN(Number(value)) ? value : Number(value);
        push(globalThis.__MOCK_SET_STATE_REPLY ? `@R SET ${JSON.stringify(state)}` : '@R SET {"ok":1}');
      }
      else if (tag === "TELEMETRY") push('@R TELEMETRY {"ok":1,"enabled":1}');
      else if (tag === "SYNTH_TEST") push('@R SYNTH_TEST {"ok":1}');
      else if (tag === "RANDOMIZE") push('@R RANDOMIZE {"ok":1}');
    };
    const port = {
      readable: { getReader: () => ({ read: async () => { while (!replies.length) await new Promise((resolve) => { wake = resolve; }); return { value: replies.shift(), done: false }; }, cancel: async () => { if (wake) wake(); }, releaseLock: () => {} }) },
      writable: { getWriter: () => ({ write: async (bytes) => { const command = decoder.decode(bytes).trim(); globalThis.__MOCK_WRITES.push(command); if (command === globalThis.__MOCK_FAIL_COMMAND) throw new Error("BECA test connection lost"); if (command.startsWith("@C SET ") && globalThis.__MOCK_WRITE_DELAY) await new Promise(resolve => setTimeout(resolve, globalThis.__MOCK_WRITE_DELAY)); respond(command); }, close: async () => {}, releaseLock: () => {} }) },
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
  await page.getByRole("button", { name: "Settings", exact: true }).click();
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
  await expect(page.locator("#deviceStatus")).toHaveText("BECA connected");
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

test("instrument buttons gate drum controls and expose plant arp settings", async ({page}) => {
  await expect(page.locator('[data-play-mode="3"]')).toBeEnabled();
  await page.locator('[data-play-mode="3"]').click();
  await expect(page.locator('[data-play-mode="3"]')).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button", {name:"Synth",exact:true}).click();
  await expect(page.locator("#control-drumkit")).toBeEnabled();
  await page.locator("#control-drumkit").selectOption("2");
  await page.getByRole("button", {name:"Performance",exact:true}).click();
  await expect(page.locator('[data-drum-part="0"]')).toBeEnabled();
  await page.locator('[data-play-mode="1"]').click();
  await expect(page.locator('[data-drum-part="0"]')).toBeDisabled();
  await expect(page.locator("#control-arp_pattern")).toBeEnabled();
  await page.locator("#control-arp_pattern").selectOption("2");
  await page.getByRole("button", {name:"Synth",exact:true}).click();
  await expect(page.locator("#control-drumkit")).toBeHidden();
  expect(await page.evaluate(()=>globalThis.__MOCK_WRITES)).toEqual([]);
});

test("playground switches parameter pairs and knobs support keyboard adjustment", async ({page}) => {
  await page.getByRole("button", {name:"Connect USB",exact:true}).click();
  await page.getByRole("button", {name:"Synth",exact:true}).click();
  await page.locator("#playgroundMode").selectOption("space");
  await page.locator("#expressionPad").click({position:{x:100,y:80}});
  await expect.poll(()=>page.evaluate(()=>globalThis.__MOCK_WRITES.some((line)=>line.startsWith("@C SET delay_mix ")))).toBe(true);
  await expect.poll(()=>page.evaluate(()=>globalThis.__MOCK_WRITES.some((line)=>line.startsWith("@C SET reverb ")))).toBe(true);
  await expect(page.locator("#expressionValues")).toContainText("Delay");
  const knob = page.locator("#control-attack");
  const before = Number(await knob.inputValue());
  await knob.focus(); await knob.press("ArrowUp");
  expect(Number(await knob.inputValue())).toBeGreaterThan(before);
  await expect.poll(()=>page.evaluate(()=>globalThis.__MOCK_WRITES.some((line)=>line.startsWith("@C SET attack ")))).toBe(true);
  await knob.scrollIntoViewIfNeeded();
  const box = await knob.boundingBox();
  const initial = Number(await knob.inputValue());
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 20, {steps:5});
  await page.mouse.up();
  expect(Number(await knob.inputValue())).toBeGreaterThan(initial);
});

test("unsupported USB browsers offer direct Apple routes and the browser computer link", async ({page}) => {
  await page.addInitScript(() => {
    delete globalThis.__BECA_SERIAL__;
    Object.defineProperty(navigator,"serial",{value:undefined,configurable:true});
    Object.defineProperty(navigator,"usb",{value:undefined,configurable:true});
  });
  await page.reload();
  await expect(page.locator("#connectButton")).toBeDisabled();
  await expect(page.locator("#connectionMessage")).toContainText("direct Wi-Fi instrument");
  await expect(page.locator("#compatibilityNotice")).toContainText("through a computer");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator("#appleConnectionHelp summary").click();
  await expect(page.locator('#appleConnectionHelp a')).toHaveAttribute("href", "http://192.168.4.1/");
  await expect(page.locator("#appleConnectionHelp")).toContainText("BECA BLE-MIDI");
});

async function installMockAppleBridge(page) {
  await page.addInitScript(() => {
    let reader;
    let writer;
    Object.defineProperty(window, "webkit", { configurable: true, value: { messageHandlers: { beca: { async postMessage(message) {
      try {
        let result = null;
        if (message.action === "open") {
          const port = await globalThis.__BECA_SERIAL__.requestPort();
          reader = port.readable.getReader(); writer = port.writable.getWriter();
        } else if (message.action === "command") {
          await writer.write(new TextEncoder().encode(message.command));
          result = new TextDecoder().decode((await reader.read()).value).trim();
        }
        globalThis.__BECA_NATIVE_REPLY__({ id: message.id, result });
      } catch (error) { globalThis.__BECA_NATIVE_REPLY__({ id: message.id, error: error.message }); }
    } } } } });
  });
  await page.reload();
}

test("Apple app transport loads settings directly and selects BLE for local sound", async ({ page }) => {
  await installMockAppleBridge(page);
  await page.getByRole("button", { name: "Connect BECA", exact: true }).click();
  await expect(page.locator("#deviceStatus")).toHaveText("BECA connected");
  await expect(page.locator("#plantValue")).toHaveText("0.42");
  await expect(page.locator("#connectionMessage")).toContainText("Apple Wi-Fi + MIDI");
  await expect(page.locator(".tablet-link")).toBeHidden();
  await page.getByRole("radio", { name: "D root note" }).click();
  await expect.poll(() => page.evaluate(() => globalThis.__MOCK_WRITES)).toContain("@C SET root 2");
  await page.getByRole("button", { name: "Synth", exact: true }).click();
  await page.locator("#control-wave_a").selectOption("3");
  await expect.poll(() => page.evaluate(() => globalThis.__MOCK_WRITES)).toContain("@C SET wave_a 3");
  await page.locator("#expressionPad").click({ position: { x: 100, y: 80 } });
  await expect.poll(() => page.evaluate(() => globalThis.__MOCK_WRITES.some((line) => line.startsWith("@C SET cutoff ")))).toBe(true);
  await page.getByRole("button", { name: "Controller", exact: true }).click();
  await page.locator('[data-play-mode="3"]').click();
  await page.getByRole("button", { name: "Synth", exact: true }).click();
  await page.locator("#control-drumkit").selectOption("2");
  await expect.poll(() => page.evaluate(() => globalThis.__MOCK_WRITES)).toContain("@C SET drumkit 2");
  await page.evaluate(() => { globalThis.__MOCK_PLANT.value = 0.67; });
  await expect(page.locator("#plantValue")).toHaveText("0.67");
  await page.getByRole("button", { name: "Controller", exact: true }).click();
  await page.locator('[data-play-mode="0"]').click();
  await expect.poll(() => page.evaluate(() => globalThis.__MOCK_WRITES)).toContain("@C SET mode 0");
  if (await page.evaluate(() => Boolean(window.AudioContext && window.AudioWorkletNode))) {
    await page.locator("#listenButton").click();
    await expect.poll(() => page.evaluate(() => globalThis.__MOCK_WRITES)).toContain("@C SET outputmode 0");
    await page.evaluate(() => globalThis.__BECA_NATIVE_LINE__("@M 90 3C 64"));
    await expect(page.locator("#midiReadout")).toHaveText("C4");
  }
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.locator("#deviceStatus")).toHaveText("Not connected");
});

test("connection help separates missing power from browser support", async ({page}, testInfo) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator("#connectionHelp summary").first().click();
  await page.locator("#connectionIssue").selectOption("power");
  await expect(page.locator("#connectionAdvice")).toContainText("OnePlus/OxygenOS");
  await expect(page.locator("#connectionAdvice")).toContainText("OTG-to-USB-A");
  await expect(page.locator("#connectionAdvice")).toContainText("cannot turn USB power on");
  await expect(page.locator("#relayCapability")).toContainText("available");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({path:testInfo.outputPath("connection-help.png"),fullPage:true});
});

test("connection waits for initial settings before enabling instrument changes", async ({page}) => {
  await page.evaluate(()=> { globalThis.__MOCK_SYNTH_DELAY=700; });
  await page.getByRole("button",{name:"Connect USB",exact:true}).click();
  await expect(page.locator("#deviceStatus")).toHaveText("Checking device…");
  await expect(page.locator('[data-play-mode="1"]')).toBeDisabled();
  await expect(page.locator("#connectButton")).toBeDisabled();
  await expect(page.locator("#deviceStatus")).toHaveText("BECA connected");
  await expect(page.locator('[data-play-mode="1"]')).toBeEnabled();
});

for (const native of [false, true]) test(`failed ${native ? "Apple native" : "USB"} device verification releases pending replies and allows reconnect`, async ({ page }) => {
  if (native) await installMockAppleBridge(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.evaluate(() => { globalThis.__MOCK_FAIL_COMMAND = "@C PING"; });
  const connectName = native ? "Connect BECA" : "Connect USB";
  await page.getByRole("button", { name: connectName, exact: true }).click();
  await expect(page.locator("#deviceStatus")).toHaveText("Not connected");
  await expect(page.locator("#consoleLog")).toContainText("BECA test connection lost");
  await expect(page.locator("#connectButton")).toBeEnabled();
  await page.evaluate(() => { globalThis.__MOCK_FAIL_COMMAND = null; });
  await page.getByRole("button", { name: connectName, exact: true }).click();
  await expect(page.locator("#deviceStatus")).toHaveText("BECA connected");
  await expect(page.locator("#plantValue")).toHaveText("0.42");
  expect(errors).toEqual([]);
});

test("older browser helpers are optional and unavailable WebRTC has a clear fallback", async ({page}) => {
  await page.addInitScript(() => {
    globalThis.structuredClone = undefined;
    Array.prototype.at = undefined;
    globalThis.RTCPeerConnection = undefined;
  });
  await page.reload();
  await expect(page.locator("#presetGrid .preset-button")).toHaveCount(13);
  await expect(page.locator("#linkAnswer")).toBeDisabled();
  await expect(page.locator("#linkStatus")).toContainText("WebRTC");
  await page.getByRole("button",{name:"Connect USB",exact:true}).click();
  await expect(page.locator("#deviceStatus")).toHaveText("BECA connected");
  await expect(page.locator("#plantValue")).toHaveText("0.42");
});

test("uses the instrument palette and BECA brand assets", async ({ page }) => {
  await expect(page.locator(".brand img")).toHaveAttribute("src", "./icons/wordmark.svg");
  await expect.poll(() => page.evaluate(() => ({
    scheme: getComputedStyle(document.documentElement).colorScheme,
    background: getComputedStyle(document.documentElement).backgroundColor,
    accent: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()
  }))).toEqual({ scheme: "dark", background: "rgb(16, 23, 25)", accent: "#67e3bc" });
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
  test.skip(browserName === "webkit", "Playwright WebKit fails offline navigation internally on Windows and Linux; verify on physical Safari.");
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
  } else await expect(page.locator("#audioStatus")).toContainText("Audio unavailable");
  await page.getByRole("button", { name: "Synth", exact: true }).click();
  await expect(page.locator("#control-cutoff")).toBeEnabled();
  await expect(page.locator("#control-wave_a option")).toHaveText(["Saw", "Square", "Triangle", "Sine"]);
  await page.locator("#expressionPad").click({ position: { x: 100, y: 80 } });
  expect(await page.evaluate(() => globalThis.__MOCK_WRITES)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("synth-layout.png"), fullPage: true });
});

test("live arp monitor follows mapped chord tones and releases the correct note", async ({page}) => {
  test.skip(!await page.evaluate(()=>Boolean(window.AudioContext && window.AudioWorkletNode)), "AudioWorklet unavailable in this runtime.");
  await page.getByRole("button",{name:"Connect USB",exact:true}).click();
  await expect(page.locator("#presetName")).toHaveText("Warm Pad");
  await page.evaluate(()=> { globalThis.__MOCK_PLANT = {value:0,raw:440,connected:1}; });
  await page.locator('[data-play-mode="1"]').click();
  await expect.poll(()=>page.evaluate(()=>globalThis.__MOCK_WRITES)).toContain("@C SET mode 1");
  await page.locator("#listenButton").click();
  await expect(page.locator("#listenButton")).toHaveAttribute("aria-pressed","true");
  await page.evaluate(()=> {
    globalThis.__MOCK_PUSH('@R PLANT {"value":0,"raw":440,"connected":1}');
    globalThis.__MOCK_PUSH('@M 90 46 60');
  });
  await expect(page.locator("#midiReadout")).toHaveText("C2");
  await page.evaluate(()=>globalThis.__MOCK_PUSH('@M 90 47 60'));
  await expect(page.locator("#midiReadout")).toHaveText("E2");
  await page.evaluate(()=>globalThis.__MOCK_PUSH('@M 80 46 00'));
  await expect(page.locator("#midiReadout")).toHaveText("E2");
  await page.evaluate(()=>globalThis.__MOCK_PUSH('@M 80 47 00'));
  await expect(page.locator("#midiReadout")).toHaveText("No notes");
  await expect(page.locator("#noteStatus")).toContainText("E2");
});

test("tablet browser link forwards live input and settings without direct USB", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "tablet-portrait", "One real WebRTC pairing verifies shared transport across layouts.");
  const host = await context.newPage();
  await installMockSerial(host);
  await host.goto("/");
  await host.getByRole("button", { name: "Connect USB" }).click();
  await expect(host.locator("#deviceStatus")).toHaveText("BECA connected");
  await host.getByRole("button", { name: "Settings", exact: true }).click();
  await host.locator(".tablet-link summary").click();
  await host.locator("#linkOffer").click();
  await expect(host.locator("#linkOutput")).not.toHaveValue("");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
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

 test("shows station MAC, limits identity reads, saves hotspot and hides credentials", async ({ page }) => {
  await page.getByRole("button", { name: "Connect USB" }).click();
  await expect(page.locator("#deviceStatus")).toHaveText("BECA connected");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator("#networkSettings summary").click();
  await expect(page.locator("#wifiMac")).toHaveText("AA:BB:CC:11:22:33");
  await expect(page.locator("#wifiSetupLink")).toHaveAttribute("href", "http://192.168.1.20/setup");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator("#networkSettings summary").click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator("#networkSettings summary").click();
  expect(await page.evaluate(() => globalThis.__MOCK_WRITES.filter(x => x === "@C WIFI_INFO").length)).toBe(1);
  await page.locator("#hotspotSsid").fill("My phone");
  await page.locator("#hotspotPass").fill("hotspot-secret");
  await page.locator("#saveHotspot").click();
  await expect.poll(() => page.evaluate(() => globalThis.__MOCK_WRITES)).toContain("@C WIFI_SAVE beca-test\tMy phone\thotspot-secret");
  await expect.poll(() => page.evaluate(() => globalThis.__MOCK_WRITES)).toContain("@C REBOOT");
  await expect(page.locator("#wifiSettingsStatus")).toContainText("Wi-Fi saved");
  await expect(page.locator("#consoleLog")).not.toContainText("hotspot-secret");
  await expect(page.locator("#hotspotPass")).toHaveValue("");
  await expect(page.locator("#wifiMac")).toHaveText("Connect BECA to view");
});

test("keeps hotspot errors visible and does not reboot on rejection", async ({ page }) => {
  await page.getByRole("button", { name: "Connect USB" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator("#networkSettings summary").click();
  await expect(page.locator("#wifiMac")).toHaveText("AA:BB:CC:11:22:33");
  await page.evaluate(() => { globalThis.__MOCK_WIFI_RESULT = {ok:0,msg:"Wrong password",hint:"Check hotspot"}; });
  await page.locator("#hotspotSsid").fill("My phone");
  await page.locator("#hotspotPass").fill("wrong-password");
  await page.locator("#saveHotspot").click();
  await expect(page.locator("#wifiSettingsStatus")).toContainText("Wrong password");
  expect(await page.evaluate(() => globalThis.__MOCK_WRITES.includes("@C REBOOT"))).toBe(false);
  await expect(page.locator("#deviceStatus")).toHaveText("BECA connected");
});

test("mode modules follow gestures and incoming state without losing values", async ({ page }, testInfo) => {
  await page.getByRole("button", { name: "Connect USB", exact: true }).click();
  await page.getByRole("button", { name: "Performance", exact: true }).click();
  for (const mode of [0, 1, 2, 3]) {
    await page.locator(`[data-play-mode="${mode}"]`).click();
    await expect.poll(() => page.evaluate(() => globalThis.__MOCK_STATE.mode)).toBe(mode);
    const pitched = page.locator("#control-scale");
    const arp = page.locator("#control-arp_pattern");
    const drums = page.locator('[data-drum-part="0"]');
    if (mode === 3) { await expect(pitched).toBeHidden(); await expect(drums).toBeVisible(); }
    else { await expect(pitched).toBeVisible(); await expect(drums).toBeHidden(); }
    if (mode === 1) await expect(arp).toBeVisible(); else await expect(arp).toBeHidden();
    await expect(page.locator("#liveDeck")).toBeVisible();
  }
  await page.evaluate(() => { Object.assign(globalThis.__MOCK_STATE, { mode: 1, root: 2 }); globalThis.__MOCK_PUSH('@R STATE {"mode":1,"root":2}'); });
  await expect(page.locator("#control-arp_pattern")).toBeVisible();
  await expect(page.locator("#control-root")).toHaveValue("2");
  await expect(page.locator('[data-drum-part="0"]')).toBeHidden();
  await page.getByRole("button", { name: "Controller", exact: true }).click();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("instrument-play.png"), fullPage: true });
});

test("insecure device Wi-Fi player renders exact MIDI with the original engine and panics on gaps", async ({ page }, testInfo) => {
  const queue = [];
  let sequence = 0;
  let lost = false;
  let plantValue = 0.42;
  const apiState = { ...mockState, mode: 1 };
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    const OriginalContext = window.AudioContext || window.webkitAudioContext;
    if (!OriginalContext) return;
    const original = OriginalContext.prototype.createScriptProcessor;
    OriginalContext.prototype.createScriptProcessor = function (...args) {
      const processor = original.apply(this, args);
      const descriptor = Object.getOwnPropertyDescriptor(window.ScriptProcessorNode.prototype, "onaudioprocess");
      Object.defineProperty(processor, "onaudioprocess", {
        set(callback) {
          descriptor.set.call(processor, event => {
            callback(event);
            window.__wifiPeak = Math.max(...event.outputBuffer.getChannelData(0).map(Math.abs));
          });
        }
      });
      window.__wifiFallback = true;
      return processor;
    };
  });
  await page.route("http://beca-device.test/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/")) {
      let payload;
      switch (url.pathname) {
        case "/api/info": payload = { browser_midi: true, sta_mac: "AA:BB:CC:11:22:33", ip: "beca-device.test" }; break;
        case "/api/state": payload = apiState; break;
        case "/api/params": payload = {}; break;
        case "/api/synth": payload = mockSynth; break;
        case "/api/plant": payload = { value: plantValue, connected: 1 }; break;
        case "/api/notes": payload = { notes: [] }; break;
        case "/api/midi": payload = { boot: 1, now: Date.now() >>> 0, next: sequence, lost, events: queue.splice(0) }; lost = false; break;
        case "/api/set": payload = { ok: 1 }; break;
        default: payload = { ok: 1 };
      }
      await route.fulfill({ json: payload });
    } else {
      const asset = url.pathname.replace(/^\/play\//, "/");
      const response = await page.request.get(`http://127.0.0.1:4174${asset}`);
      await route.fulfill({ response });
    }
  });
  await page.goto("http://beca-device.test/play/");
  expect(await page.evaluate(() => isSecureContext)).toBe(false);
  await page.getByRole("button", { name: "Connect Wi-Fi", exact: true }).click();
  await expect(page.locator("#deviceStatus")).toHaveText("BECA connected");
  await expect(page.locator("#plantValue")).toHaveText("0.42");
  plantValue = 0.7;
  await expect(page.locator("#plantValue")).toHaveText("0.70");
  await expect(page.locator("#plantTrace")).not.toHaveAttribute("d", "");
  await page.getByRole("button", { name: "Performance", exact: true }).click();
  await expect(page.locator("#control-arp_pattern")).toBeHidden();
  if (!await page.evaluate(() => Boolean((window.AudioContext || window.webkitAudioContext)?.prototype?.createScriptProcessor))) {
    await expect(page.locator("#listenButton")).toBeDisabled();
    expect(errors).toEqual([]);
    return;
  }
  await page.locator("#listenButton").click();
  await expect(page.locator("#listenButton")).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => window.__wifiFallback)).toBe(true);
  queue.push([++sequence, 0x90, 70, 100, Date.now() >>> 0]);
  await expect(page.locator("#midiReadout")).toHaveText("A♯4");
  await expect.poll(() => page.evaluate(() => window.__wifiPeak || 0)).toBeGreaterThan(0.005);
  queue.push([++sequence, 0x80, 70, 0, Date.now() >>> 0]);
  await expect(page.locator("#midiReadout")).toHaveText("No notes");
  await expect.poll(() => page.evaluate(() => window.__wifiPeak || 0), { timeout: 10000 }).toBeLessThan(0.001);
  queue.push([++sequence, 0x90, 70, 100, Date.now() >>> 0]);
  await expect(page.locator("#midiReadout")).toHaveText("A♯4");
  lost = true;
  await expect(page.locator("#midiReadout")).toHaveText("No notes");
  await expect.poll(() => page.evaluate(() => window.__wifiPeak || 0)).toBe(0);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("wifi-instrument.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("appearance persists and light controls have readable contrast", async ({ page }, testInfo) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Appearance", { exact: true }).selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(255, 255, 255)");
  expect(await page.evaluate(() => globalThis.__MOCK_WRITES)).toEqual([]);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Connect USB", exact: true }).click();
  await expect(page.locator("#deviceStatus")).toHaveText("BECA connected");
  await page.addScriptTag({ content: AxeBuilder.source });
  for (const tab of ["Controller", "Synth", "Performance", "Settings", "Console"]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    const result = await page.evaluate(() => axe.run(document, { runOnly: ["color-contrast"] }));
    expect(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) }))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    if (tab === "Synth") await page.screenshot({ path: testInfo.outputPath("light-instrument.png"), fullPage: true });
  }
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("Wi-Fi state-shaped setting replies succeed and explicit rejections recover", async ({ page }) => {
  await page.getByRole("button", { name: "Connect USB", exact: true }).click();
  await expect(page.locator("#deviceStatus")).toHaveText("BECA connected");
  await page.evaluate(() => { globalThis.__MOCK_SET_STATE_REPLY = true; });
  await page.locator('[data-play-mode="2"]').click();
  await expect.poll(() => page.evaluate(() => globalThis.__MOCK_STATE.mode)).toBe(2);
  await page.waitForTimeout(250);
  await expect(page.locator("#toast")).not.toContainText("rejected");
  await page.getByRole("button", { name: "Performance", exact: true }).click();
  await page.evaluate(() => { globalThis.__MOCK_SET_ERROR = true; });
  await page.locator('[data-play-mode="1"]').click();
  await expect(page.locator("#toast")).toContainText("Setting unavailable");
  await expect(page.locator('[data-play-mode="2"]')).toHaveAttribute("aria-pressed", "true");
});

test("cancelled touch gestures resume state polling", async ({ page }) => {
  await page.getByRole("button", { name: "Connect USB", exact: true }).click();
  await expect(page.locator("#deviceStatus")).toHaveText("BECA connected");
  const sensitivity = page.locator("#sensitivity");
  await sensitivity.evaluate(input => input.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1 })));
  await page.evaluate(() => { globalThis.__MOCK_STATE.sens = .35; });
  await page.waitForTimeout(600);
  await expect(sensitivity).toHaveValue("0.2");
  await sensitivity.evaluate(input => input.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1 })));
  await expect(sensitivity).toHaveValue("0.35");
});

test("pad edits reject delayed synth snapshots and retain the latest position", async ({ page }) => {
  await page.getByRole("button", { name: "Connect USB", exact: true }).click();
  await expect(page.locator("#deviceStatus")).toHaveText("BECA connected");
  await page.getByRole("button", { name: "Synth", exact: true }).click();
  await page.evaluate(() => { globalThis.__MOCK_WRITE_DELAY = 250; });
  const pad = page.locator("#expressionPad");
  await pad.scrollIntoViewIfNeeded();
  const box = await pad.boundingBox();
  await page.mouse.move(box.x + box.width * .4, box.y + box.height * .4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .7, box.y + box.height * .6, { steps: 12 });
  const edited = await page.locator("#expressionValues").innerText();
  const cutoff = await page.locator("#control-cutoff").inputValue();
  await page.evaluate(synth => globalThis.__MOCK_PUSH(`@R SYNTH ${JSON.stringify(synth)}`), mockSynth);
  await page.waitForTimeout(150);
  await expect(page.locator("#expressionValues")).toHaveText(edited);
  await expect(page.locator("#control-cutoff")).toHaveValue(cutoff);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => globalThis.__MOCK_SYNTH.cutoff)).toBe(Number(cutoff));
  await expect.poll(() => page.evaluate(() => globalThis.__MOCK_WRITES.filter(line => /^@C SET (cutoff|resonance) /.test(line)).length)).toBeGreaterThanOrEqual(2);
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => globalThis.__MOCK_WRITES.filter(line => /^@C SET (cutoff|resonance) /.test(line)).length)).toBeLessThanOrEqual(4);
  await page.evaluate(() => {
    globalThis.__MOCK_SYNTH.cutoff = 9600;
    globalThis.__MOCK_PUSH(`@R SYNTH ${JSON.stringify(globalThis.__MOCK_SYNTH)}`);
  });
  await expect(page.locator("#control-cutoff")).toHaveValue("9600");
});
