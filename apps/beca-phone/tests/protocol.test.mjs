import test from "node:test";
import assert from "node:assert/strict";
import { BecaSerial, LineFramer, WriteQueue, normalizeCommand, parseSerialLine } from "../protocol.js";
import { capabilities, connectionHelp } from "../compatibility.js";

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

test("serial decoding preserves Unicode split across USB packets", async () => {
  const bytes = new TextEncoder().encode('@R STATE {"name":"BECA 🌱"}\n');
  const split = bytes.indexOf(0xf0) + 2;
  const port = {
    open:async()=>{}, close:async()=>{},
    readable:new ReadableStream({start(controller){controller.enqueue(bytes.slice(0,split));controller.enqueue(bytes.slice(split));controller.close();}}),
    writable:new WritableStream({write(){}})
  };
  const serial = new BecaSerial({requestPort:async()=>port});
  const received=[];
  serial.addEventListener("line",(event)=>received.push(event.detail));
  const closed = new Promise((resolve)=>serial.addEventListener("disconnect",resolve,{once:true}));
  await serial.connect(); await closed;
  assert.equal(received[0].payload.name,"BECA 🌱");
});

test("compatibility is based on exposed APIs, including iPad desktop user agents", () => {
  const env={isSecureContext:true,navigator:{userAgent:"Android 11; ONEPLUS A6003",usb:{requestDevice(){}}},WebAssembly:{},AudioContext:function(){},AudioWorkletNode:function(){},RTCPeerConnection:function(){}};
  assert.equal(capabilities(env).usb,true);
  assert.equal(capabilities(env).audio,true);
  const ipad=capabilities({...env,navigator:{userAgent:"Macintosh",platform:"MacIntel",maxTouchPoints:5}});
  assert.equal(ipad.ios,true); assert.equal(ipad.usb,false); assert.equal(ipad.relay,true);
  assert.match(connectionHelp("missing",ipad),/CH340/);
  assert.match(connectionHelp("power",ipad),/cannot turn USB power on/);
  const insecure=capabilities({...env,isSecureContext:false});
  assert.equal(insecure.usb,false); assert.equal(insecure.audio,false); assert.equal(insecure.relay,false);
  assert.match(connectionHelp("missing",insecure),/HTTPS/);
  assert.equal(capabilities({...env,RTCPeerConnection:undefined}).relay,false);
});

test("slow slider writes keep the final value without a stale backlog", async () => {
  const writes = [];
  let release;
  const queue = new WriteQueue(async value => {
    writes.push(value);
    if (writes.length === 1) await new Promise(resolve => { release = resolve; });
  }, 1);
  const promises = [queue.enqueue("@C SET cutoff 100")];
  for (let value = 101; value <= 200; value++) promises.push(queue.enqueue(`@C SET cutoff ${value}`));
  assert.equal(queue.items.length, 1);
  assert.equal(queue.items[0].value, "@C SET cutoff 200");
  release();
  const results = await Promise.all(promises);
  assert.equal(results.filter(result => result === true).length, 2);
  assert.deepEqual(writes, ["@C SET cutoff 100", "@C SET cutoff 200"]);
  queue.clear();
});

test("slider coalescing preserves command barriers and real write failures", async () => {
  let release;
  const writes = [];
  const queue = new WriteQueue(async value => {
    writes.push(value);
    if (value === "block") await new Promise(resolve => { release = resolve; });
    if (value === "@C SET cutoff 200") throw new Error("Link lost");
  }, 1);
  const first = queue.enqueue("block");
  const older = queue.enqueue("@C SET cutoff 100");
  const preset = queue.enqueue("@C SET preset_live 2");
  const latest = queue.enqueue("@C SET cutoff 200");
  const rejection = assert.rejects(latest, /Link lost/);
  release();
  await Promise.all([first, older, preset, rejection]);
  assert.deepEqual(writes, ["block", "@C SET cutoff 100", "@C SET preset_live 2", "@C SET cutoff 200"]);
  queue.clear();
});

test("clearing an active queue rejects old work and preserves FIFO on reuse", async () => {
  const writes = [];
  let finishOld, finishFirstNew;
  const queue = new WriteQueue(async value => {
    writes.push(value);
    if (value === "old") await new Promise(resolve => { finishOld = resolve; });
    if (value === "new1") await new Promise(resolve => { finishFirstNew = resolve; });
  }, 1);
  const old = queue.enqueue("old");
  const waiting = queue.enqueue("waiting");
  const oldRejected = assert.rejects(old, /closed/);
  const waitingRejected = assert.rejects(waiting, /closed/);
  queue.clear();
  const first = queue.enqueue("new1"), second = queue.enqueue("new2");
  await Promise.all([oldRejected, waitingRejected]);
  assert.deepEqual(writes, ["old"]);
  finishOld();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(writes, ["old", "new1"]);
  finishFirstNew();
  await Promise.all([first, second]);
  assert.deepEqual(writes, ["old", "new1", "new2"]);
  queue.clear();
});
