import test from "node:test";
import assert from "node:assert/strict";
import { WebUsbSerialPort, WebUsbSerialProvider, shouldUseWebUsb, usbSerialDriverFor } from "../webusb-serial.js";

function createDevice(vendorId, productId, version = 0x30) {
  const calls = [];
  const inEndpoint = { endpointNumber: 2, direction: "in", type: "bulk", packetSize: 64 };
  const outEndpoint = { endpointNumber: 1, direction: "out", type: "bulk", packetSize: 64 };
  const device = {
    vendorId,
    productId,
    opened: false,
    configuration: { interfaces: [{ interfaceNumber: 0, alternates: [{ alternateSetting: 0, endpoints: [inEndpoint, outEndpoint] }] }] },
    async open() { this.opened = true; calls.push(["open"]); },
    async close() { this.opened = false; calls.push(["close"]); },
    async claimInterface(number) { calls.push(["claim", number]); },
    async releaseInterface(number) { calls.push(["release", number]); },
    async controlTransferIn(setup, length) {
      calls.push(["controlIn", setup, length]);
      const buffer = new ArrayBuffer(length);
      new DataView(buffer).setUint8(0, version);
      return { status: "ok", data: new DataView(buffer) };
    },
    async controlTransferOut(setup, data) {
      calls.push(["controlOut", setup, data]);
      return { status: "ok", bytesWritten: data?.byteLength ?? 0 };
    },
    async transferIn() { return new Promise(() => {}); },
    async transferOut(endpoint, data) { calls.push(["write", endpoint, [...data]]); return { status: "ok", bytesWritten: data.byteLength }; }
  };
  return { device, calls };
}

test("Android selects the WebUSB transport", () => {
  assert.equal(shouldUseWebUsb("Mozilla/5.0 (Linux; Android 15) Chrome/140"), true);
  assert.equal(shouldUseWebUsb("Mozilla/5.0 (Windows NT 10.0) Chrome/140"), false);
});

test("recognizes BECA's common USB serial bridges", () => {
  assert.equal(usbSerialDriverFor({ vendorId: 0x1a86 }), "ch34x");
  assert.equal(usbSerialDriverFor({ vendorId: 0x10c4 }), "cp210x");
  assert.equal(usbSerialDriverFor({ vendorId: 0x1234 }), null);
});

test("requests explicit WebUSB permission for USB serial families", async () => {
  const { device } = createDevice(0x1a86, 0x7523);
  let options;
  const provider = new WebUsbSerialProvider({ requestDevice: async (next) => { options = next; return device; } });
  const port = await provider.requestPort();
  assert.ok(port instanceof WebUsbSerialPort);
  assert.ok(options.filters.some((filter) => filter.vendorId === 0x1a86));
  assert.ok(options.filters.some((filter) => filter.vendorId === 0x10c4));
});

test("configures CH340 for 115200 8N1 and asserts modem lines", async () => {
  const { device, calls } = createDevice(0x1a86, 0x7523, 0x30);
  const port = new WebUsbSerialPort(device);
  await port.open({ baudRate: 115200, bufferSize: 4096 });
  const controls = calls.filter(([name]) => name === "controlOut").map(([, setup]) => setup);
  assert.ok(controls.some((setup) => setup.request === 0xa1));
  assert.ok(controls.some((setup) => setup.request === 0x9a && setup.value === 0x1312 && setup.index === 0xcc83));
  assert.ok(controls.some((setup) => setup.request === 0x9a && setup.value === 0x2518 && setup.index === 0x00c3));
  assert.ok(controls.some((setup) => setup.request === 0xa4 && setup.value === 0xff9f));
  const writer = port.writable.getWriter();
  await writer.write(new Uint8Array([0x40, 0x43, 0x20, 0x50, 0x49, 0x4e, 0x47, 0x0a]));
  writer.releaseLock();
  assert.ok(calls.some(([name, endpoint]) => name === "write" && endpoint === 1));
  await port.close();
});

test("configures CP210x for 115200 8N1 and asserts DTR/RTS", async () => {
  const { device, calls } = createDevice(0x10c4, 0xea60);
  const port = new WebUsbSerialPort(device);
  await port.open({ baudRate: 115200 });
  const controls = calls.filter(([name]) => name === "controlOut");
  assert.ok(controls.some(([, setup]) => setup.request === 0x00 && setup.value === 1));
  const baudCall = controls.find(([, setup]) => setup.request === 0x1e);
  assert.equal(new DataView(baudCall[2]).getUint32(0, true), 115200);
  assert.ok(controls.some(([, setup]) => setup.request === 0x03 && setup.value === 0x0800));
  assert.ok(controls.some(([, setup]) => setup.request === 0x07 && setup.value === 0x0303));
  await port.close();
});
