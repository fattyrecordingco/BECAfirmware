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
