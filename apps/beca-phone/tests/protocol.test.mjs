import test from "node:test";
import assert from "node:assert/strict";
import { LineFramer, WriteQueue, normalizeCommand, parseSerialLine } from "../protocol.js";

test("LineFramer preserves fragmented data and strips CR", () => {
  const framer = new LineFramer();
  assert.deepEqual(framer.push("@R STATE {\"bpm\":"), []);
  assert.deepEqual(framer.push("120}\r\n@I READY\npartial"), ["@R STATE {\"bpm\":120}", "@I READY"]);
  assert.deepEqual(framer.push(" line\n"), ["partial line"]);
});

test("serial parser understands replies, telemetry, MIDI and malformed input", () => {
  assert.deepEqual(parseSerialLine('@R PING {"ok":1}').payload, { ok: 1 });
  assert.equal(parseSerialLine('{"type":"plant","value":0.4}').telemetryType, "plant");
  assert.deepEqual(parseSerialLine("@M 90 3c 7f"), { type: "midi", status: 0x90, data1: 0x3c, data2: 0x7f, raw: "@M 90 3c 7f" });
  assert.equal(parseSerialLine("@R STATE {oops}").type, "malformed");
  assert.equal(parseSerialLine("@E I2S START FAIL").type, "error");
});

test("commands are normalized and embedded newlines cannot inject frames", () => {
  assert.equal(normalizeCommand("STATE"), "@C STATE");
  assert.equal(normalizeCommand("@C SET master 0.5"), "@C SET master 0.5");
  assert.equal(normalizeCommand("SET master 0.5\n@C REBOOT"), "@C SET master 0.5 @C REBOOT");
  assert.throws(() => normalizeCommand("  "), /Enter a command/);
});

test("WriteQueue serializes writes in order", async () => {
  const values = [];
  const queue = new WriteQueue(async (value) => values.push(value), 1);
  await Promise.all([queue.enqueue("one"), queue.enqueue("two"), queue.enqueue("three")]);
  assert.deepEqual(values, ["one", "two", "three"]);
  queue.clear();
});
