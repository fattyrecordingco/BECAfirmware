import test from "node:test";
import assert from "node:assert/strict";
import { WavSamples, wavFile, midiFile, zipFiles } from "../recording-formats.js";

test("WAV retains 24-bit sample detail in stereo at 44.1 kHz", async () => {
  const samples = new WavSamples(44100).encode(Float32Array.of(-1, 1, 1 / 8388608, -1 / 8388608));
  const wav = new DataView(await wavFile([new Blob([samples])]).arrayBuffer());
  assert.equal(wav.getUint32(4, true), 48);
  assert.equal(wav.getUint16(20, true), 1);
  assert.equal(wav.getUint16(22, true), 2);
  assert.equal(wav.getUint32(24, true), 44100);
  assert.equal(wav.getUint16(34, true), 24);
  assert.equal(wav.getUint32(40, true), 12);
  assert.deepEqual([...new Uint8Array(wav.buffer, 44)], [0, 0, 128, 255, 255, 127, 1, 0, 0, 255, 255, 255]);
});

test("48 kHz input stays continuous across capture blocks", () => {
  const samples = Float32Array.from({ length: 960 }, (_, i) => Math.sin(i / 81));
  const split = new WavSamples(48000);
  const inBlocks = [...split.encode(samples.subarray(0, 256)), ...split.encode(samples.subarray(256))];
  assert.equal(inBlocks.length, 441 * 6);
  assert.deepEqual(inBlocks, [...new WavSamples(48000).encode(samples)]);
});

test("MIDI preserves note order, velocity, channels and note-off form, then releases held notes", async () => {
  const midi = new Uint8Array(await midiFile([
    [[10, 0x95, 60, 91], [10, 0x99, 38, 120]],
    [[145, 0x89, 38, 27], [146, 0x95, 60, 0], [150, 0x92, 71, 98]]
  ], 200).arrayBuffer());
  assert.equal(new TextDecoder().decode(midi.subarray(0, 4)), "MThd");
  assert.equal(new DataView(midi.buffer).getUint32(18), midi.length - 22);
  assert.deepEqual([...midi.subarray(29)], [
    10, 0x95, 60, 91, 0, 0x99, 38, 120, 0x81, 7, 0x89, 38, 27,
    1, 0x95, 60, 0, 4, 0x92, 71, 98, 50, 0x82, 71, 0, 0, 255, 47, 0
  ]);
});

test("the combined download includes both files and a valid ZIP directory", async () => {
  const zip = new DataView(await (await zipFiles([
    { name: "take.wav", blob: new Blob(["123456789"]) },
    { name: "take.mid", blob: new Blob(["midi"]) }
  ])).arrayBuffer());
  assert.equal(zip.getUint32(0, true), 0x04034b50);
  assert.equal(zip.getUint32(14, true), 0xcbf43926);
  const end = zip.byteLength - 22;
  assert.equal(zip.getUint32(end, true), 0x06054b50);
  assert.equal(zip.getUint16(end + 10, true), 2);
  const directory = zip.getUint32(end + 16, true);
  assert.equal(zip.getUint32(directory, true), 0x02014b50);
  assert.equal(zip.getUint32(directory + 54 + 42, true), 47);
});
