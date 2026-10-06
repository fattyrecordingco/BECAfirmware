// Used only by the BECA Apple app. Safari keeps its existing browser transports.
export class AppleNativeProvider {
  constructor(bridge, env = globalThis) {
    this.bridge = bridge;
    this.env = env;
    this.transportName = "Apple Wi-Fi + MIDI";
    this.audioOutputMode = 0;
    this.nextId = 0;
    this.pending = new Map();
    this.chunks = [];
    this.opened = false;
    env.__BECA_NATIVE_REPLY__ = ({ id, error, result }) => {
      const waiter = this.pending.get(id);
      if (!waiter) return;
      clearTimeout(waiter.timer);
      this.pending.delete(id);
      if (error) waiter.reject(new Error(error)); else waiter.resolve(result);
    };
    env.__BECA_NATIVE_LINE__ = (line) => {
      if (!this.opened || typeof line !== "string" || line.length > 8192) return;
      if (this.chunks.length >= 256) { this.end(); return; }
      this.chunks.push(new TextEncoder().encode(`${line}\n`));
      this.wake?.();
    };
    env.__BECA_NATIVE_CLOSED__ = () => this.end();
  }
  rpc(action, command) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("BECA did not reply. Check its Wi-Fi address and Local Network permission."));
      }, 3000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.bridge.postMessage({ id, action, command }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  end() {
    this.opened = false;
    this.chunks.length = 0;
    this.wake?.();
    for (const waiter of this.pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error("Apple connection closed.")); }
    this.pending.clear();
  }
  async requestPort() {
    return {
      open: async () => { await this.rpc("open"); this.opened = true; },
      close: async () => { this.end(); await this.rpc("close"); },
      readable: { getReader: () => ({
        read: async () => {
          while (this.opened && !this.chunks.length) await new Promise((resolve) => { this.wake = resolve; });
          this.wake = null;
          return this.chunks.length ? { value: this.chunks.shift(), done: false } : { done: true };
        },
        cancel: async () => this.end(), releaseLock() {}
      }) },
      writable: { getWriter: () => ({
        write: async (bytes) => {
          const line = await this.rpc("command", new TextDecoder().decode(bytes).trim());
          if (line) this.env.__BECA_NATIVE_LINE__(line);
        },
        async close() {}, releaseLock() {}
      }) }
    };
  }
}

export function appleNativeProvider(env = globalThis) {
  const bridge = env.webkit?.messageHandlers?.beca;
  return bridge ? new AppleNativeProvider(bridge, env) : null;
}
