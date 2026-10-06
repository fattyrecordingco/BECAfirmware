import test from "node:test";
import assert from "node:assert/strict";
import { PhoneAudio } from "../phone-audio.js";

class Context {
  constructor() {
    this.state = "running"; this.currentTime = 0; this.destination = {};
    this.audioWorklet = { addModule: async () => {} };
  }
  resume() { this.state = "running"; return Promise.resolve(); }
  createGain() {
    return { connect() {}, disconnect() {}, gain: { cancelScheduledValues() {}, setValueAtTime() {}, setTargetAtTime() {} } };
  }
}
class Worklet {
  constructor() { this.messages = []; this.port = { postMessage: (message) => this.messages.push(message) }; }
  connect(node) { return node; }
  disconnect() {}
}
globalThis.AudioContext = Context;
globalThis.AudioWorkletNode = Worklet;
globalThis.isSecureContext = true;

test("stopping during synth loading cannot restart audio or change the output route", async () => {
  const audio = new PhoneAudio();
  let finish;
  audio.load = () => new Promise((resolve) => { finish = resolve; });
  const starting = audio.start({ master: 0.4 });
  audio.stop();
  finish();
  await starting;
  assert.equal(audio.enabled, false);
  assert.equal(audio.node, undefined);
});

test("Apple interruption clears notes and effects and needs a new user start", async () => {
  const audio = new PhoneAudio();
  audio.load = async () => {};
  await audio.start({ master: 0.4 });
  audio.midi([0x90, 60, 100]);
  audio.context.state = "interrupted";
  audio.context.onstatechange();
  assert.equal(audio.enabled, false);
  assert.equal(audio.activeNotes.size, 0);
  assert.ok(audio.node.messages.some((message) => message.type === "panic"));
  await audio.start({ master: 0.4 });
  assert.equal(audio.enabled, true);
});

test("worklet error can recover with a fresh processor", async () => {
  const audio = new PhoneAudio();
  audio.load = async () => {};
  await audio.start({ master: 0.4 });
  const old = audio.node;
  old.onprocessorerror();
  assert.equal(audio.enabled, false);
  assert.equal(audio.node, null);
  await audio.start({ master: 0.4 });
  assert.notEqual(audio.node, old);
  assert.equal(audio.enabled, true);
});
