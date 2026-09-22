import { test, expect } from "@playwright/test";

test("Android requests WebUSB permission and connects to BECA", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "android", "Android WebUSB transport test");

  await page.addInitScript(() => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const replies = [];
    const readers = [];
    const push = (line) => {
      const data = encoder.encode(`${line}\n`);
      const resolve = readers.shift();
      if (resolve) resolve({ status: "ok", data: new DataView(data.buffer) });
      else replies.push(data);
    };

    const device = {
      vendorId: 0x1a86,
      productId: 0x7523,
      productName: "USB Serial",
      opened: false,
      configuration: {
        interfaces: [{
          interfaceNumber: 0,
          alternates: [{
            alternateSetting: 0,
            endpoints: [
              { endpointNumber: 2, direction: "in", type: "bulk", packetSize: 64 },
              { endpointNumber: 1, direction: "out", type: "bulk", packetSize: 64 }
            ]
          }]
        }]
      },
      async open() { this.opened = true; },
      async close() { this.opened = false; },
      async claimInterface() {},
      async releaseInterface() {},
      async controlTransferIn(_setup, length) {
        const buffer = new ArrayBuffer(length);
        new DataView(buffer).setUint8(0, 0x30);
        return { status: "ok", data: new DataView(buffer) };
      },
      async controlTransferOut() { return { status: "ok", bytesWritten: 0 }; },
      async transferIn() {
        const data = replies.shift();
        if (data) return { status: "ok", data: new DataView(data.buffer) };
        return new Promise((resolve) => readers.push(resolve));
      },
      async transferOut(_endpoint, bytes) {
        const command = decoder.decode(bytes).trim();
        if (command === "@C PING") push('@R PING {"ok":1}');
        return { status: "ok", bytesWritten: bytes.byteLength };
      }
    };

    globalThis.__USB_PERMISSION_REQUESTS = [];
    Object.defineProperty(navigator, "usb", {
      configurable: true,
      value: {
        async requestDevice(options) {
          globalThis.__USB_PERMISSION_REQUESTS.push(options);
          return device;
        },
        async getDevices() { return []; }
      }
    });
  });

  await page.goto("/");
  await expect(page.getByText(/Android permission step/)).toBeVisible();
  await expect.poll(() => page.evaluate(() => globalThis.__USB_PERMISSION_REQUESTS.length)).toBe(0);

  await page.getByRole("button", { name: "Connect USB" }).click();

  await expect(page.getByText("BECA connected", { exact: true })).toBeVisible();
  const filters = await page.evaluate(() => globalThis.__USB_PERMISSION_REQUESTS[0].filters);
  expect(filters).toContainEqual({ vendorId: 0x1a86 });
  expect(filters).toContainEqual({ vendorId: 0x10c4 });
});
