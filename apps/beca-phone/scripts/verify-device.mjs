import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const url = process.argv[2];
const output = resolve(process.argv[3]);
if (!url || !/^http:\/\/(?:\d{1,3}\.){3}\d{1,3}\/play\/$/.test(url)) throw new Error('Supply a local device /play/ URL.');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 820, height: 1180 } });
const errors = [];
const networkErrors = [];
page.on('requestfailed', request => networkErrors.push({ url: request.url(), error: request.failure()?.errorText }));
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  window.__audioPeaks = [];
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return;
  const original = Context.prototype.createScriptProcessor;
  Context.prototype.createScriptProcessor = function (...args) {
    const processor = original.apply(this, args);
    const descriptor = Object.getOwnPropertyDescriptor(ScriptProcessorNode.prototype, 'onaudioprocess');
    Object.defineProperty(processor, 'onaudioprocess', {
      set(callback) {
        descriptor.set.call(processor, event => {
          callback(event);
          const peak = event.outputBuffer.getChannelData(0).reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
          window.__audioPeaks.push(peak);
          if (window.__audioPeaks.length > 600) window.__audioPeaks.shift();
          window.__audioPeak = peak;
        });
      }
    });
    window.__httpAudioFallback = true;
    return processor;
  };
  // Observe real rendered audio without sounding the laptop during automated tests.
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (destination, ...args) {
    if (destination instanceof AudioDestinationNode) {
      const muted = this.context.createGain(); muted.gain.value = 0;
      connect.call(this, muted);
      return connect.call(muted, destination, ...args);
    }
    return connect.call(this, destination, ...args);
  };
});
const report = { url, modes: [] };
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
  await page.getByRole('button', { name: 'Connect Wi-Fi', exact: true }).click();
  await expect(page.locator('#deviceStatus')).toHaveText('BECA connected', { timeout: 10000 });
  await page.locator('#listenButton').click();
  await expect(page.locator('#listenButton')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__httpAudioFallback)).toBe(true);
  for (const [mode, name] of ['Notes', 'Arpeggiator', 'Chords', 'Drums'].entries()) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect.poll(async () => (await (await page.request.get(new URL('/api/state', url).href)).json()).mode).toBe(mode);
    await page.evaluate(() => { window.__audioPeaks = []; });
    await expect.poll(() => page.evaluate(() => Math.max(0, ...window.__audioPeaks)), { timeout: 10000 }).toBeGreaterThan(.002);
    const peak = await page.evaluate(() => Math.max(...window.__audioPeaks));
    expect(Number.isFinite(peak) && peak <= 1).toBe(true);
    await page.getByRole('button', { name: 'Performance', exact: true }).click();
    if (mode === 3) await expect(page.locator('#control-drumkit')).toBeVisible();
    else await expect(page.locator('#control-drumkit')).toBeHidden();
    report.modes.push({ mode, name, renderedPeak: peak });
  }
  await expect(page.locator('#plantTrace')).not.toHaveAttribute('d', '');
  await page.locator('#muteButton').click();
  await expect.poll(async () => (await (await page.request.get(new URL('/api/state', url).href)).json()).io_muted).toBe(1);
  await page.locator('#panicButton').click();
  await expect.poll(() => page.evaluate(() => window.__audioPeak || 0)).toBe(0);
  report.panic = 'silence';
  await page.locator('#listenButton').click();
  await expect(page.locator('#listenButton')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#connectButton').click();
  await expect(page.locator('#deviceStatus')).toHaveText('Not connected');
  await page.screenshot({ path: resolve(output, 'real-device-instrument.png'), fullPage: true });
  expect(errors).toEqual([]);
  report.result = 'pass';
} finally {
  report.errors = errors;
  report.networkErrors = networkErrors;
  report.feedback = await page.locator('body').innerText().catch(() => '');
  await page.screenshot({ path: resolve(output, 'real-device-last.png'), fullPage: true }).catch(() => {});
  await writeFile(resolve(output, 'browser-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify(report));
