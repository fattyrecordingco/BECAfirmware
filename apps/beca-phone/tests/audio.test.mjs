import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { instantiateEngine, readParams } from "../audio-engine.js";
import { PlantArp, ARP_DEFAULTS } from "../plant-arp.js";
import { PhoneAudio } from "../phone-audio.js";
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
    engine.mode(3);
    engine.midi(0x99, note, 100);
    assert.ok(render(engine).some((sample) => Math.abs(sample) > 10), `drum ${note}`);
  }
});
test("drum MIDI is silent in Notes, Arp and Chords; Drum mode rejects melodic MIDI", () => {
  for (const mode of [0,1,2]) {
    const engine = instantiateEngine(module);
    engine.mode(mode);
    engine.midi(0x99, 38, 100);
    assert.ok(render(engine).every((sample) => sample === 0));
  }
  const engine = instantiateEngine(module);
  engine.mode(3);
  engine.midi(0x90,60,100);
  assert.ok(render(engine).every((sample) => sample === 0));
});
test("quiet delay retains detail below the old 8-bit quantization floor", () => {
  const engine = instantiateEngine(module);
  engine.set_param(1,3); engine.set_param(2,3);
  engine.set_param(14,100); engine.set_param(15,0); engine.set_param(16,1);
  engine.set_param(13,0); engine.set_param(17,0); engine.set_param(18,1);
  engine.set_param(6,0.001); engine.set_param(7,0.001); engine.set_param(8,0.1); engine.set_param(20,0.45);
  engine.midi(0x90,69,1);
  render(engine,100);
  const samples = render(engine,100);
  assert.ok(samples.some((x) => Math.abs(x) > 5), "low-level echo should survive");
  assert.ok(samples.every((x) => Math.abs(x) < 200));
});
test("all melodic presets decay to silence after release", () => {
  for (let preset = 0; preset < 12; preset++) {
    const engine = instantiateEngine(module);
    engine.preset(preset); engine.midi(0x90,60,90);
    render(engine,100); engine.midi(0x80,60,0); render(engine,5000);
    assert.ok(render(engine,20).every((x) => Math.abs(x) <= 1), `preset ${preset} left a noise floor`);
  }
});
test("plant arp uses chord tones, respects range, and responds to signal direction", () => {
  const arp = new PlantArp();
  const settings = { ...ARP_DEFAULTS, scale:0, root:0, lo:3, hi:4 };
  arp.plant(0);
  assert.deepEqual(Array.from({length:4},()=>arp.next(settings)), [48,52,55,59]);
  arp.plant(0.03,1); arp.next(settings);
  arp.plant(0.02,1);
  arp.next(settings);
  assert.equal(arp.direction,-1);
  assert.equal(arp.order,"Turning / skipping");
  for (let scale = 0; scale < 15; scale++) for (const energy of [0,0.5,1]) {
    arp.plant(energy,1);
    for (let i=0;i<10;i++) {
      const note = arp.next({...settings,scale,arp_span:3});
      assert.ok(arp.chord.includes(note)); assert.ok(note >=48 && note<=71);
    }
  }
});
test("arp releases the mapped pitch and switching mode clears active notes", () => {
  const audio = new PhoneAudio();
  const messages = [];
  audio.node = {port:{postMessage:(message)=>messages.push(message)}};
  audio.enabled = true;
  audio.setPerformance({mode:1,lo:3,hi:4});
  audio.plant(0,true);
  audio.midi([0x90,70,90]); audio.midi([0x80,70,0]);
  assert.deepEqual(messages.filter((m)=>m.type === "midi").map((m)=>m.bytes), [[0x90,48,90],[0x80,48,0]]);
  audio.midi([0x90,70,90]); audio.setPerformance({mode:3});
  assert.equal(audio.activeNotes.size,0);
  const before = messages.length;
  audio.midi([0x90,60,90]);
  assert.equal(messages.length,before);
  audio.setPerformance({drumsel:1}); audio.midi([0x99,38,90]);
  assert.equal(messages.length,before);
  audio.midi([0x99,36,90]);
  assert.deepEqual(messages.at(-1).bytes,[0x99,36,90]);
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
