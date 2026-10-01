import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { instantiateEngine, readParams } from "../audio-engine.js";
const module = await WebAssembly.compile(await readFile(new URL("../beca-synth.wasm", import.meta.url)));
function render(engine, blocks = 100) {
  const output = [];
  for (let block = 0; block < blocks; block++) {
    const pointer = engine.render(128);
    output.push(...new Int16Array(engine.memory.buffer, pointer, 256));
  }
  return output;
}
test("all original presets render bounded, non-silent audio at 44.1 and 48 kHz", () => {
  for (const rate of [44100, 48000]) for (let preset = 0; preset < 13; preset++) {
    const engine = instantiateEngine(module);
    engine.init(rate);
    engine.preset(preset);
    assert.equal(readParams(engine).preset, preset);
    if (preset === 12) engine.sensor(440, 1);
    else engine.midi(0x90, 60, 96);
    const samples = render(engine, 400);
    assert.ok(samples.some((value) => Math.abs(value) > 50), `preset ${preset}, ${rate}`);
    assert.ok(samples.every((value) => Number.isFinite(value) && Math.abs(value) <= 32768));
  }
});
test("note-off releases the voice and panic reset clears voices and effect tails", () => {
  const engine = instantiateEngine(module);
  engine.midi(0x90, 60, 100);
  assert.ok(render(engine).some((sample) => sample !== 0));
  engine.midi(0x80, 60, 0);
  render(engine, 2000);
  assert.ok(render(engine).every((sample) => Math.abs(sample) <= 1));
  engine.midi(0x90, 60, 100);
  render(engine);
  engine.init(44100);
  assert.ok(render(engine).every((sample) => sample === 0));
});
test("all eight firmware drum notes produce audio on channel 10", () => {
  for (const note of [36, 38, 42, 46, 45, 47, 51, 49]) {
    const engine = instantiateEngine(module);
    engine.midi(0x99, note, 100);
    assert.ok(render(engine).some((sample) => Math.abs(sample) > 10), `drum ${note}`);
  }
});
test("raw sensor mode ignores notes and stops when the plant is disconnected", () => {
  const engine = instantiateEngine(module);
  engine.preset(12);
  engine.midi(0x90, 60, 100);
  assert.ok(render(engine).every((sample) => sample === 0));
  engine.sensor(440, 1);
  const samples = render(engine, 350);
  // Count positive crossings in the left channel after the fade-in.
  let crossings = 0;
  for (let i = 4002; i < samples.length; i += 2) if (samples[i - 2] <= 0 && samples[i] > 0) crossings++;
  const frequency = crossings * 44100 / ((samples.length - 4002) / 2);
  assert.ok(Math.abs(frequency - 440) < 2);
  engine.sensor(440, 0);
  render(engine, 10);
  assert.ok(render(engine).every((sample) => sample === 0));
});
