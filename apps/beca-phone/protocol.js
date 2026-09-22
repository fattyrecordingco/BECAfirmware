export const BAUD_RATE = 115200;
export const WRITE_INTERVAL_MS = 60;

export class LineFramer {
  constructor(maxBuffer = 8192) {
    this.buffer = "";
    this.maxBuffer = maxBuffer;
  }

  push(chunk) {
    this.buffer += String(chunk).replaceAll("\r", "");
    if (this.buffer.length > this.maxBuffer) {
      this.buffer = this.buffer.slice(-this.maxBuffer);
    }
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    return lines.map((line) => line.trim()).filter(Boolean);
  }

  reset() {
    this.buffer = "";
  }
}

export function parseSerialLine(line) {
  const raw = String(line ?? "").trim();
  if (!raw) return { type: "empty", raw };

  const reply = raw.match(/^@R\s+([A-Z_]+)\s*(.*)$/);
  if (reply) {
    const [, tag, payloadText] = reply;
    if (!payloadText) return { type: "reply", tag, payload: null, raw };
    try {
      return { type: "reply", tag, payload: JSON.parse(payloadText), raw };
    } catch {
      return { type: "malformed", tag, payloadText, raw };
    }
  }

  const midi = raw.match(/^@M\s+([0-9a-f]{2})\s+([0-9a-f]{2})\s+([0-9a-f]{2})$/i);
  if (midi) {
    return {
      type: "midi",
      status: Number.parseInt(midi[1], 16),
      data1: Number.parseInt(midi[2], 16),
      data2: Number.parseInt(midi[3], 16),
      raw
    };
  }

  if (raw.startsWith("{")) {
    try {
      const payload = JSON.parse(raw);
      return { type: "telemetry", telemetryType: payload.type ?? "unknown", payload, raw };
    } catch {
      return { type: "malformed", payloadText: raw, raw };
    }
  }

  if (raw.startsWith("@I ")) return { type: "info", message: raw.slice(3), raw };
  if (raw.startsWith("@W ")) return { type: "warning", message: raw.slice(3), raw };
  if (raw.startsWith("@E ")) return { type: "error", message: raw.slice(3), raw };
  return { type: "text", message: raw, raw };
}

export function normalizeCommand(input) {
  const value = String(input ?? "").replace(/[\r\n]+/g, " ").trim();
  if (!value) throw new Error("Enter a command first.");
  return value.startsWith("@C ") ? value : `@C ${value}`;
}

export class WriteQueue {
  constructor(write, intervalMs = WRITE_INTERVAL_MS) {
    this.write = write;
    this.intervalMs = intervalMs;
    this.items = [];
    this.timer = null;
    this.running = false;
  }

  enqueue(value) {
    return new Promise((resolve, reject) => {
      this.items.push({ value, resolve, reject });
      this.#start();
    });
  }

  #start() {
    if (this.running) return;
    this.running = true;
    this.#drain();
  }

  async #drain() {
    const item = this.items.shift();
    if (!item) {
      this.running = false;
      return;
    }
    try {
      await this.write(item.value);
      item.resolve();
    } catch (error) {
      item.reject(error);
    }
    this.timer = setTimeout(() => this.#drain(), this.intervalMs);
  }

  clear(reason = new Error("Serial connection closed.")) {
    clearTimeout(this.timer);
    this.timer = null;
    this.running = false;
    for (const item of this.items.splice(0)) item.reject(reason);
  }
}

export class BecaSerial extends EventTarget {
  constructor(serialProvider = globalThis.navigator?.serial) {
    super();
    this.serialProvider = serialProvider;
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.reading = false;
    this.intentionalClose = false;
    this.framer = new LineFramer();
    this.queue = new WriteQueue((value) => this.#writeNow(value));
  }

  get supported() {
    return Boolean(this.serialProvider?.requestPort);
  }

  get connected() {
    return Boolean(this.port && this.reader && this.writer && this.reading);
  }

  async connect() {
    if (!this.supported) throw new Error("Web Serial is not available in this browser.");
    if (this.connected) return;
    this.intentionalClose = false;
    this.port = await this.serialProvider.requestPort();
    await this.port.open({ baudRate: BAUD_RATE, bufferSize: 4096 });
    this.writer = this.port.writable.getWriter();
    this.reader = this.port.readable.getReader();
    this.reading = true;
    this.#readLoop();
    this.dispatchEvent(new CustomEvent("connect"));
  }

  async send(command) {
    if (!this.connected) throw new Error("Connect to BECA first.");
    const line = `${normalizeCommand(command)}\n`;
    await this.queue.enqueue(line);
    this.dispatchEvent(new CustomEvent("sent", { detail: line.trim() }));
  }

  async #writeNow(value) {
    if (!this.writer) throw new Error("Serial writer is unavailable.");
    await this.writer.write(new TextEncoder().encode(value));
  }

  async #readLoop() {
    try {
      while (this.reading && this.reader) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (!value) continue;
        const text = new TextDecoder().decode(value, { stream: true });
        for (const line of this.framer.push(text)) {
          this.dispatchEvent(new CustomEvent("line", { detail: parseSerialLine(line) }));
        }
      }
    } catch (error) {
      if (!this.intentionalClose) {
        this.dispatchEvent(new CustomEvent("transporterror", { detail: error }));
      }
    } finally {
      if (!this.intentionalClose) await this.disconnect(false);
    }
  }

  async disconnect(sendTelemetryOff = true) {
    if (this.intentionalClose && !this.port) return;
    this.intentionalClose = true;
    if (sendTelemetryOff && this.connected) {
      try {
        await this.#writeNow("@C TELEMETRY 0\n");
      } catch {
        // The cable may already be gone.
      }
    }
    this.reading = false;
    this.queue.clear();
    if (this.reader) {
      try { await this.reader.cancel(); } catch { /* already closed */ }
      try { this.reader.releaseLock(); } catch { /* already released */ }
    }
    if (this.writer) {
      try { await this.writer.close(); } catch { /* already closed */ }
      try { this.writer.releaseLock(); } catch { /* already released */ }
    }
    const oldPort = this.port;
    this.reader = null;
    this.writer = null;
    this.port = null;
    this.framer.reset();
    if (oldPort) {
      try { await oldPort.close(); } catch { /* already closed */ }
    }
    this.dispatchEvent(new CustomEvent("disconnect"));
  }
}

export function formatValue(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return Number.isInteger(number) ? String(number) : number.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
}
