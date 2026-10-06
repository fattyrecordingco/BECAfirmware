import test from "node:test";
import assert from "node:assert/strict";
import { AppleNativeProvider, appleNativeProvider } from "../apple-native.js";
import { BecaSerial } from "../protocol.js";

// Node 22 exposes the same EventTarget and stream primitives used by this adapter.
test("Apple native bridge works through the existing serialized control protocol", async () => {
  const env = {};
  const actions = [];
  const bridge = { postMessage(message) {
    actions.push(message);
    queueMicrotask(() => env.__BECA_NATIVE_REPLY__({ id: message.id, result: message.action === "command" ? '@R PING {"ok":1}' : null }));
  } };
  const provider = new AppleNativeProvider(bridge, env);
  assert.equal(provider.audioOutputMode, 0);
  const serial = new BecaSerial(provider);
  const lines = [];
  serial.addEventListener("line", (event) => lines.push(event.detail));
  await serial.connect();
  assert.equal(serial.connected, true);
  await serial.send("PING");
  env.__BECA_NATIVE_LINE__("@M 99 24 64");
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(lines[0].payload.ok, 1);
  assert.equal(lines[1].status, 0x99);
  assert.equal(lines[1].data1, 36);
  await serial.disconnect(false);
  assert.equal(serial.connected, false);
  assert.deepEqual(actions.map((action) => action.action), ["open", "command", "close"]);
});

test("native permission and network failures settle requests without accepting late replies", async () => {
  const env = {};
  const provider = new AppleNativeProvider({ postMessage(message) {
    queueMicrotask(() => env.__BECA_NATIVE_REPLY__({ id: message.id, error: "Local Network denied" }));
  } }, env);
  await assert.rejects(provider.rpc("open"), /Local Network denied/);
  assert.equal(provider.pending.size, 0);
  env.__BECA_NATIVE_REPLY__({ id: 1, result: "late" });
  assert.equal(appleNativeProvider({}), null);
});

test("native disconnect releases blocked reads and caps incoming MIDI backlog", async () => {
  const env = {};
  const provider = new AppleNativeProvider({ postMessage() {} }, env);
  const port = await provider.requestPort();
  provider.opened = true;
  const read = port.readable.getReader().read();
  env.__BECA_NATIVE_CLOSED__();
  assert.deepEqual(await read, { done: true });
  provider.opened = true;
  for (let i = 0; i < 257; i++) env.__BECA_NATIVE_LINE__("@M 90 3C 64");
  assert.equal(provider.opened, false);
  assert.equal(provider.chunks.length, 0);
});
