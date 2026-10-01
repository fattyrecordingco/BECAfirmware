import { instantiateEngine, readParams } from "./audio-engine.js";

export class PhoneAudio extends EventTarget {
  constructor() {
    super();
    this.enabled = false;
    this.params = {};
    this.timers = new Set();
  }
  async load() {
    if (!this.loading) this.loading = (async () => {
      const response = await fetch(new URL("./beca-synth.wasm", import.meta.url));
      if (!response.ok) throw new Error("The BECA sound engine could not be loaded. Reload the app.");
      this.bytes = await response.arrayBuffer();
      this.module = await WebAssembly.compile(this.bytes);
      this.catalog = instantiateEngine(this.module);
      const decoder = new TextDecoder();
      const bytes = new Uint8Array(this.catalog.memory.buffer);
      this.presets = Array.from({ length: 13 }, (_, index) => {
        this.catalog.preset(index);
        const pointer = this.catalog.preset_name(index);
        const end = bytes.indexOf(0, pointer);
        return { ...readParams(this.catalog), preset_name: decoder.decode(bytes.subarray(pointer, end)) };
      });
      return this.presets;
    })().catch((error) => { this.loading = null; throw error; });
    return this.loading;
  }
  async start(params) {
    if (!globalThis.AudioContext || !globalThis.AudioWorkletNode || !globalThis.isSecureContext) {
      throw new Error("Live audio needs a current browser with AudioWorklet on HTTPS or localhost.");
    }
    // Create/resume before awaiting downloads to retain the user's audio gesture.
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: "interactive", sampleRate: 44100 });
      this.context.onstatechange = () => this.dispatchEvent(new Event("statechange"));
    }
    const resume = this.context.resume();
    await this.load();
    await resume;
    if (!this.node) {
      await this.context.audioWorklet.addModule(new URL("./audio-worklet.js", import.meta.url));
      this.node = new AudioWorkletNode(this.context, "beca-synth", {
        numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { bytes: this.bytes }
      });
      this.node.onprocessorerror = () => { this.stop(); this.dispatchEvent(new Event("engineerror")); };
      this.gain = this.context.createGain();
      this.gain.gain.value = 0;
      this.node.connect(this.gain).connect(this.context.destination);
    }
    this.enabled = true;
    this.setParams(params);
    this.gain.gain.setTargetAtTime(1, this.context.currentTime, 0.015);
    this.dispatchEvent(new Event("statechange"));
  }
  stop() {
    this.enabled = false;
    if (this.gain) this.gain.gain.setValueAtTime(0, this.context.currentTime);
    this.panic();
    this.dispatchEvent(new Event("statechange"));
  }
  panic() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.node?.port.postMessage({ type: "panic" });
    this.lastParams = null;
    this.setParams(this.params);
  }
  setParams(params) {
    this.params = { ...params };
    const signature = JSON.stringify(this.params);
    if (this.node && signature !== this.lastParams) {
      this.node.port.postMessage({ type: "params", params: this.params });
      this.lastParams = signature;
    }
  }
  midi(bytes) {
    if (this.enabled) this.node?.port.postMessage({ type: "midi", bytes: Array.from(bytes) });
  }
  sensor(raw, connected) {
    if (this.enabled) this.node?.port.postMessage({ type: "sensor", raw: Math.max(0, Math.min(4095, Number(raw) || 0)), connected: Boolean(connected) });
  }
  test() {
    this.panic();
    if (Number(this.params.preset) === 12) this.sensor(440, true);
    else [60, 64, 67].forEach((note) => this.midi([0x90, note, 88]));
    const timer = setTimeout(() => {
      [60, 64, 67].forEach((note) => this.midi([0x80, note, 0]));
      this.sensor(0, false);
      this.timers.delete(timer);
    }, 1200);
    this.timers.add(timer);
  }
}
