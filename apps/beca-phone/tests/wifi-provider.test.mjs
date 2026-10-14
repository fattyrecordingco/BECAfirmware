import test from "node:test";
import assert from "node:assert/strict";
import { WifiBecaSerial } from "../wifi-provider.js";

test("Wi-Fi preserves short note gates and chord note ordering", () => {
  const serial = new WifiBecaSerial();
  const lines = [];
  serial.addEventListener("line", ({ detail }) => lines.push(detail));
  serial.sequence = 10;
  serial.boot = 7;
  serial.acceptBatch({ boot: 7, next: 14, events: [[11, 144, 60, 100], [12, 144, 64, 90], [13, 128, 60, 0], [14, 128, 64, 0]] });
  assert.deepEqual(lines.map((line) => [line.status, line.data1, line.data2]), [[144, 60, 100], [144, 64, 90], [128, 60, 0], [128, 64, 0]]);
});

test("overflow and firmware reboot clear held voices before later notes", () => {
  const serial = new WifiBecaSerial();
  const lines = [];
  serial.addEventListener("line", ({ detail }) => lines.push(detail));
  serial.boot = 4;
  serial.sequence = 500;
  serial.acceptBatch({ boot: 5, lost: true, next: 0, events: [] });
  assert.equal(lines[0].tag, "WIFI_STREAM_RESET");
  assert.equal(serial.sequence, 0);
  serial.acceptBatch({ boot: 5, next: 2, events: [[2, 144, 60, 100]] });
  assert.equal(lines[1].tag, "WIFI_STREAM_RESET");
  assert.equal(lines[2].type, "midi");
});

test("invalid and unbounded batches cannot reach the synth", () => {
  const serial = new WifiBecaSerial();
  assert.throws(() => serial.acceptBatch({ next: 1, events: [[1, 144, 200, 100]] }), /Invalid/);
  assert.throws(() => serial.acceptBatch({ next: 65, events: Array(65).fill([1, 144, 60, 100]) }), /Invalid/);
});

test("requested snapshots always produce replies even without a state change", () => {
  const serial = new WifiBecaSerial();
  let replies = 0;
  serial.addEventListener("line", () => replies++);
  serial.reply("STATE", { mode: 1 });
  serial.reply("STATE", { mode: 1 });
  assert.equal(replies, 2);
});

test("a stalled response body times out and aborts the request", async () => {
  let signal;
  const serial = new WifiBecaSerial({ origin: "http://beca.test", fetch: async (_, options) => {
    signal = options.signal;
    return { ok: true, json: () => new Promise(() => {}) };
  } });
  await assert.rejects(serial.json("/api/midi"), /timed out/);
  assert.equal(signal.aborted, true);
});

test("batched notes preserve device gate duration through the jitter buffer", async () => {
  const serial = new WifiBecaSerial();
  const notes = [];
  serial.addEventListener("line", ({ detail }) => {
    if (detail.type === "midi") notes.push({ status: detail.status, time: performance.now() });
  });
  serial.acceptBatch({ boot: 7, now: 100, next: 2, events: [[1, 144, 60, 100, 50], [2, 128, 60, 0, 90]] });
  assert.equal(notes.length, 0);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(notes.map((note) => note.status), [144, 128]);
  const duration = notes[1].time - notes[0].time;
  assert.ok(duration >= 20 && duration <= 70, `Expected original 40ms gate, observed ${duration}ms`);
});

test("device millis rollover keeps a valid note gate", async () => {
  const serial = new WifiBecaSerial();
  const notes = [];
  serial.addEventListener("line", ({ detail }) => { if (detail.type === "midi") notes.push(detail.status); });
  serial.acceptBatch({ boot: 7, now: 10, next: 2, events: [[1, 144, 60, 100, 0xffffffe2], [2, 128, 60, 0, 5]] });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(notes, [144, 128]);
});

test("expired backlog is discarded and pending notes clear on stream reset", async () => {
  const serial = new WifiBecaSerial();
  const lines = [];
  serial.addEventListener("line", ({ detail }) => lines.push(detail));
  serial.acceptBatch({ boot: 7, now: 1000, next: 2, events: [[1, 144, 60, 100, 500], [2, 128, 60, 0, 550]] });
  assert.equal(lines[0].tag, "WIFI_STREAM_RESET");
  assert.equal(serial.pendingMidi.size, 0);
  serial.acceptBatch({ boot: 7, now: 1010, next: 3, events: [[3, 144, 64, 100, 1010]] });
  assert.equal(serial.pendingMidi.size, 1);
  serial.resetStream("background");
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(serial.pendingMidi.size, 0);
  assert.ok(lines.every((line) => line.type !== "midi"));
});
