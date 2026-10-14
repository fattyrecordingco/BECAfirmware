import { normalizeCommand, parseSerialLine, WriteQueue } from "./protocol.js";

// The device page is same-origin HTTP; published HTTPS cannot fetch a local HTTP board.
export class WifiBecaSerial extends EventTarget {
  constructor({ fetch: fetcher = globalThis.fetch?.bind(globalThis), origin = globalThis.location?.origin } = {}) {
    super();
    this.fetcher = fetcher;
    this.origin = origin;
    this.connected = false;
    this.exactMidi = true;
    this.transportName = "Wi-Fi";
    this.supported = true;
    this.queue = new WriteQueue((command) => this.command(command));
    this.signatures = new Map();
    this.pendingMidi = new Set();
    globalThis.document?.addEventListener("visibilitychange", () => {
      if (document.hidden && this.connected) this.disconnect();
    });
  }
  get port() { return this.connected ? { getInfo: () => ({ usbVendorId: 0, usbProductId: 0 }) } : null; }
  emit(raw) { this.dispatchEvent(new CustomEvent("line", { detail: parseSerialLine(raw) })); }
  reply(tag, payload) {
    const text = JSON.stringify(payload);
    // Requested replies always resolve UI requests; the UI compares state before rendering.
    this.signatures.set(tag, text);
    this.emit(`@R ${tag} ${text}`);
  }
  async json(path, body, timeoutMs = 1200) {
    const controller = new AbortController();
    const onDisconnect = () => controller.abort();
    this.abort?.signal.addEventListener("abort", onDisconnect, { once: true });
    let timeout;
    try {
      return await Promise.race([(async () => {
        const response = await this.fetcher(new URL(path, this.origin), {
          cache: "no-store", signal: controller.signal,
          ...(body ? { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) } : {})
        });
        const payload = await response.json();
        if (!response.ok || payload.ok === 0) throw new Error(payload.err || payload.msg || `BECA returned ${response.status}.`);
        return payload;
      })(), new Promise((_, reject) => {
        timeout = setTimeout(() => { controller.abort(); reject(new Error("BECA Wi-Fi timed out.")); }, timeoutMs);
      })]);
    } finally {
      clearTimeout(timeout);
      this.abort?.signal.removeEventListener("abort", onDisconnect);
    }
  }

  async connect() {
    await this.disconnect();
    this.abort = new AbortController();
    const info = await this.json("/api/info", undefined, 4000);
    if (!info.browser_midi) throw new Error("Update BECA firmware for browser sound over Wi-Fi.");
    this.connected = true;
    this.sequence = undefined;
    this.boot = undefined;
    this.signatures.clear();
    this.dispatchEvent(new Event("connect"));
    this.poll();
  }
  async disconnect() {
    const wasConnected = this.connected;
    this.connected = false;
    clearTimeout(this.timer);
    this.abort?.abort();
    this.queue.clear();
    this.clearScheduledMidi();
    if (wasConnected) {
      this.resetStream("disconnect");
      this.dispatchEvent(new Event("disconnect"));
    }
  }
  async poll() {
    if (!this.connected) return;
    const start = Date.now();
    try {
      const payload = await this.json(`/api/midi${this.sequence === undefined ? "" : `?after=${this.sequence}`}`);
      this.acceptBatch(payload);
    } catch (error) {
      if (!this.connected) return;
      this.dispatchEvent(new CustomEvent("transporterror", { detail: error }));
      await this.disconnect();
      return;
    }
    if (this.connected) this.timer = setTimeout(() => this.poll(), Math.max(0, 40 - (Date.now() - start)));
  }
  clearScheduledMidi() {
    for (const timer of this.pendingMidi) clearTimeout(timer);
    this.pendingMidi.clear();
    this.deviceAnchor = undefined;
    this.localAnchor = undefined;
  }
  resetStream(reason) {
    this.clearScheduledMidi();
    this.emit(`@R WIFI_STREAM_RESET ${JSON.stringify({ reason })}`);
  }
  acceptBatch(batch) {
    if (!Number.isInteger(batch.next) || !Array.isArray(batch.events) || batch.events.length > 64) throw new Error("Invalid BECA note stream.");
    const reset = batch.lost || (this.boot !== undefined && this.boot !== batch.boot);
    if (reset) this.resetStream("stream gap");
    let sequence = reset ? undefined : this.sequence;
    const received = performance.now();
    const messages = [];
    let discontinuity = false;
    for (const event of batch.events) {
      if (!Array.isArray(event) || ![4, 5].includes(event.length) || !event.every(Number.isInteger)) throw new Error("Invalid BECA MIDI event.");
      const [next, status, data1, data2, timestamp] = event;
      if (status < 128 || status > 239 || data1 < 0 || data1 > 127 || data2 < 0 || data2 > 127) throw new Error("Invalid BECA MIDI bytes.");
      if (sequence !== undefined && next !== ((sequence + 1) >>> 0)) { this.resetStream("sequence gap"); discontinuity = true; }
      sequence = next;
      if (timestamp !== undefined) {
        if (!Number.isInteger(batch.now) || batch.now < 0 || batch.now > 0xffffffff || timestamp < 0 || timestamp > 0xffffffff) throw new Error("Invalid BECA MIDI timestamp.");
        if (this.deviceAnchor === undefined) { this.deviceAnchor = batch.now; this.localAnchor = received; }
      }
      const due = timestamp === undefined ? received : this.localAnchor + ((timestamp - this.deviceAnchor) | 0) + 60;
      messages.push({ raw: `@M ${[status, data1, data2].map((byte) => byte.toString(16).padStart(2, "0")).join(" ")}`, due, timestamp, panic: (status & 0xf0) === 0xb0 && [120,123].includes(data1) });
    }
    this.sequence = batch.next;
    this.boot = batch.boot;
    if (discontinuity && messages.some((message) => message.timestamp !== undefined)) return;
    // Drop stale batches together so an old gate cannot collapse into a click.
    if (messages.some((message) => message.due < received - 5 || message.due > received + 120) || this.pendingMidi.size + messages.length > 256) {
      this.resetStream("late note stream");
      return;
    }
    for (const message of messages) {
      if (message.panic) { this.resetStream("all notes off"); continue; }
      if (message.timestamp === undefined) { this.emit(message.raw); continue; }
      const timer = setTimeout(() => {
        this.pendingMidi.delete(timer);
        if (performance.now() - message.due > 40) { this.resetStream("audio interrupted"); return; }
        this.emit(message.raw);
      }, Math.max(0, message.due - received));
      this.pendingMidi.add(timer);
    }
  }

  async send(command) {
    if (!this.connected) throw new Error("Connect to BECA first.");
    const normalized = normalizeCommand(command);
    if (await this.queue.enqueue(normalized) === false) return;
    this.dispatchEvent(new CustomEvent("sent", { detail: normalized }));
  }
  async command(normalized) {
    const command = normalized.slice(3);
    const reads = { PARAMS: "params", STATE: "state", SYNTH: "synth", PLANT: "plant", NOTES: "notes", WIFI_INFO: "info" };
    if (reads[command]) { this.reply(command, await this.json(`/api/${reads[command]}`)); return; }
    if (command === "PING" || /^TELEMETRY [01]$/.test(command)) { this.reply(command.split(" ")[0], { ok: 1 }); return; }
    const set = command.match(/^SET ([a-z_]+) ([-\w./]+)$/);
    if (set) { this.reply("SET", await this.json("/api/set", { key: set[1], value: set[2] })); return; }
    if (command === "SYNTH_TEST") { await this.json("/api/synth/test"); return; }
    if (command === "RANDOMIZE") {
      const response = await this.fetcher(new URL("/rand", this.origin), { signal: this.abort.signal });
      if (!response.ok) throw new Error("Could not randomize BECA.");
      this.reply("STATE", await this.json("/api/state")); return;
    }
    if (command === "REBOOT") {
      await this.fetcher(new URL("/reboot", this.origin), { signal: this.abort.signal }); await this.disconnect(); return;
    }
    if (command.startsWith("WIFI_SAVE ")) {
      const credentials = JSON.parse(command.slice(10));
      this.reply("WIFI_SAVE", await this.json("/wifi/save", credentials)); return;
    }
    throw new Error("This command is unavailable over Wi-Fi.");
  }
}
