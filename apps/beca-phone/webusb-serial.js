const USB_SERIAL_FILTERS = [
  { vendorId: 0x1a86 }, // WCH CH340/CH341 family
  { vendorId: 0x10c4 }, // Silicon Labs CP210x family
  { vendorId: 0x2184, productId: 0x0057 }, // CH34x-compatible bridge
  { vendorId: 0x4348, productId: 0x5523 }, // CH34x-compatible bridge
  { vendorId: 0x9986, productId: 0x7523 } // CH34x-compatible bridge
];

const CH34X_VENDOR_IDS = new Set([0x1a86, 0x2184, 0x4348, 0x9986]);
const CP210X_VENDOR_ID = 0x10c4;

function assertTransfer(result, operation) {
  if (!result || result.status !== "ok") {
    throw new DOMException(`${operation} failed${result?.status ? `: ${result.status}` : ""}.`, "NetworkError");
  }
  return result;
}

function findBulkInterface(device) {
  const configuration = device.configuration ?? device.configurations?.[0];
  if (!configuration) throw new Error("The USB serial adapter has no usable configuration.");

  for (const iface of configuration.interfaces) {
    for (const alternate of iface.alternates) {
      const inEndpoint = alternate.endpoints.find((endpoint) => endpoint.type === "bulk" && endpoint.direction === "in");
      const outEndpoint = alternate.endpoints.find((endpoint) => endpoint.type === "bulk" && endpoint.direction === "out");
      if (inEndpoint && outEndpoint) {
        return { interfaceNumber: iface.interfaceNumber, alternateSetting: alternate.alternateSetting, inEndpoint, outEndpoint };
      }
    }
  }
  throw new Error("The selected USB device does not expose a serial data interface.");
}

async function controlOut(device, setup, data, operation) {
  const result = data === undefined
    ? await device.controlTransferOut(setup)
    : await device.controlTransferOut(setup, data);
  return assertTransfer(result, operation);
}

async function initializeCp210x(device, interfaceNumber, baudRate) {
  const vendorInterface = (request, value, data) => controlOut(device, {
    requestType: "vendor",
    recipient: "interface",
    request,
    value,
    index: interfaceNumber
  }, data, `CP210x request 0x${request.toString(16)}`);

  await vendorInterface(0x00, 0x0001); // Enable UART.
  const baud = new ArrayBuffer(4);
  new DataView(baud).setUint32(0, baudRate, true);
  await vendorInterface(0x1e, 0x0000, baud); // Set baud rate.
  await vendorInterface(0x03, 0x0800); // 8 data bits, no parity, 1 stop bit.
  await vendorInterface(0x07, 0x0303); // Assert DTR and RTS.
}

function ch34xDivisor(baudRate, version) {
  const clockRate = 48_000_000;
  let prescaler = -1;
  let factor = 1;
  for (let candidate = 3; candidate >= 0; candidate -= 1) {
    const clockDiv = 2 ** (12 - 3 * candidate - factor);
    const minimumRate = clockRate / (clockDiv * 512);
    if (baudRate > minimumRate) {
      prescaler = candidate;
      break;
    }
  }
  if (prescaler < 0) throw new RangeError(`Unsupported CH34x baud rate: ${baudRate}`);

  let clockDiv = 2 ** (12 - 3 * prescaler - factor);
  let divisor = Math.floor(clockRate / (clockDiv * baudRate));
  if (divisor < 9 || divisor > 255) {
    divisor = Math.floor(divisor / 2);
    clockDiv *= 2;
    factor = 0;
  }
  const currentError = Math.abs(clockRate / (clockDiv * divisor) - baudRate);
  const nextError = Math.abs(clockRate / (clockDiv * (divisor + 1)) - baudRate);
  if (nextError < currentError) divisor += 1;
  if (factor === 1 && divisor % 2 === 0) {
    divisor /= 2;
    factor = 0;
  }
  let encoded = ((0x100 - divisor) << 8) | (factor << 2) | prescaler;
  if (version > 0x27) encoded |= 0x80;
  return encoded;
}

async function initializeCh34x(device, baudRate) {
  const vendorDevice = (request, value, index) => controlOut(device, {
    requestType: "vendor",
    recipient: "device",
    request,
    value,
    index
  }, undefined, `CH34x request 0x${request.toString(16)}`);

  const versionResult = assertTransfer(await device.controlTransferIn({
    requestType: "vendor",
    recipient: "device",
    request: 0x5f,
    value: 0,
    index: 0
  }, 2), "CH34x version read");
  const version = versionResult.data?.getUint8(0) ?? 0x27;

  await vendorDevice(0xa1, 0, 0); // Serial initialization.
  await vendorDevice(0x9a, 0x1312, ch34xDivisor(baudRate, version));
  if (version >= 0x30) {
    await vendorDevice(0x9a, 0x2518, 0x00c3); // Enable RX/TX, 8N1.
  }
  await vendorDevice(0xa4, 0xff9f, 0); // Assert DTR and RTS.
  await vendorDevice(0x9a, 0x2727, 0); // Disable hardware flow control.
}

async function disableAdapter(device, driver, interfaceNumber) {
  if (!device.opened) return;
  try {
    if (driver === "cp210x") {
      await device.controlTransferOut({
        requestType: "vendor",
        recipient: "interface",
        request: 0x00,
        value: 0,
        index: interfaceNumber
      });
    } else if (driver === "ch34x") {
      await device.controlTransferOut({
        requestType: "vendor",
        recipient: "device",
        request: 0xa4,
        value: 0xffff,
        index: 0
      });
    }
  } catch {
    // The adapter may already be physically disconnected.
  }
}

export function usbSerialDriverFor(device) {
  if (CH34X_VENDOR_IDS.has(device.vendorId)) return "ch34x";
  if (device.vendorId === CP210X_VENDOR_ID) return "cp210x";
  return null;
}

export class WebUsbSerialPort {
  constructor(device) {
    this.device = device;
    this.driver = usbSerialDriverFor(device);
    this.interfaceNumber = null;
    this.inEndpoint = null;
    this.outEndpoint = null;
    this.readable = null;
    this.writable = null;
    this.opened = false;
  }

  getInfo() {
    return { usbVendorId: this.device.vendorId, usbProductId: this.device.productId };
  }

  async open(options) {
    if (!this.driver) throw new Error("This USB serial adapter is not supported by the phone connection yet.");
    const baudRate = Number(options?.baudRate);
    if (!Number.isInteger(baudRate) || baudRate <= 0) throw new RangeError("A valid baud rate is required.");

    try {
      await this.device.open();
      if (!this.device.configuration) await this.device.selectConfiguration(1);
      const dataInterface = findBulkInterface(this.device);
      this.interfaceNumber = dataInterface.interfaceNumber;
      this.inEndpoint = dataInterface.inEndpoint;
      this.outEndpoint = dataInterface.outEndpoint;
      await this.device.claimInterface(this.interfaceNumber);
      if (dataInterface.alternateSetting) {
        await this.device.selectAlternateInterface(this.interfaceNumber, dataInterface.alternateSetting);
      }

      if (this.driver === "ch34x") await initializeCh34x(this.device, baudRate);
      else await initializeCp210x(this.device, this.interfaceNumber, baudRate);

      this.opened = true;
      this.#createStreams(options?.bufferSize ?? 4096);
    } catch (error) {
      try { if (this.device.opened) await this.device.close(); } catch { /* already closed */ }
      throw new Error(`Could not open the ${this.driver === "ch34x" ? "CH340" : "CP210x"} USB serial adapter: ${error.message || error}`);
    }
  }

  #createStreams(bufferSize) {
    const device = this.device;
    const input = this.inEndpoint;
    const output = this.outEndpoint;
    this.readable = new ReadableStream({
      pull: async (controller) => {
        try {
          const result = assertTransfer(await device.transferIn(input.endpointNumber, Math.max(input.packetSize, Math.min(bufferSize, 4096))), "USB serial read");
          if (result.data?.byteLength) {
            controller.enqueue(new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength));
          }
        } catch (error) {
          controller.error(error);
        }
      }
    }, { highWaterMark: 1 });
    this.writable = new WritableStream({
      write: async (chunk) => {
        assertTransfer(await device.transferOut(output.endpointNumber, chunk), "USB serial write");
      }
    });
  }

  async close() {
    if (!this.device.opened) return;
    await disableAdapter(this.device, this.driver, this.interfaceNumber);
    if (this.interfaceNumber !== null) {
      try { await this.device.releaseInterface(this.interfaceNumber); } catch { /* disconnected */ }
    }
    try { await this.device.close(); } catch { /* disconnected */ }
    this.opened = false;
    this.readable = null;
    this.writable = null;
  }
}

export class WebUsbSerialProvider {
  constructor(usb = globalThis.navigator?.usb) {
    this.usb = usb;
    this.transportName = "WebUSB";
  }

  async requestPort() {
    if (!this.usb?.requestDevice) throw new Error("WebUSB is not available in this browser.");
    const device = await this.usb.requestDevice({ filters: USB_SERIAL_FILTERS });
    if (!usbSerialDriverFor(device)) throw new Error("Choose BECA's CH340 or CP210x USB serial adapter.");
    return new WebUsbSerialPort(device);
  }

  async getPorts() {
    if (!this.usb?.getDevices) return [];
    const devices = await this.usb.getDevices();
    return devices.filter(usbSerialDriverFor).map((device) => new WebUsbSerialPort(device));
  }
}

export function shouldUseWebUsb(userAgent = globalThis.navigator?.userAgent ?? "") {
  return /Android/i.test(userAgent);
}
