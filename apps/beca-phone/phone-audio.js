import { instantiateEngine, readParams } from "./audio-engine.js";
import { PlantArp, ARP_DEFAULTS } from "./plant-arp.js";

export class PhoneAudio extends EventTarget {
  constructor() {
    super();
    this.enabled = false;
    this.params = {};
    this.timers = new Set();
    this.performance = { mode: 0, scale: 0, root: 0, lo: 2, hi: 5, drumsel: 255, ...ARP_DEFAULTS };
    this.arp = new PlantArp();
    this.noteMap = new Map();
    this.activeNotes = new Set();
    this.startGeneration = 0;
  }
  async load() {
    if (!globalThis.WebAssembly) throw new Error("This browser cannot load the BECA synth. Update the browser for WebAssembly support.");
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
    const generation = ++this.startGeneration;
    if (this.context?.state === "closed") { this.context = null; this.node = null; this.lastParams = null; }
    // Create/resume before awaiting downloads to retain the user's audio gesture.
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: "interactive", sampleRate: 44100 });
      this.context.onstatechange = () => {
        if (this.enabled && this.context.state !== "running") this.stop();
        else this.dispatchEvent(new Event("statechange"));
      };
    }
    const resume = this.context.resume();
    await Promise.all([this.load(), resume]);
    if (generation !== this.startGeneration) return;
    if (this.context.state !== "running") throw new Error("Audio was interrupted. Keep the app visible, then tap Listen again.");
    if (!this.node) {
      await this.context.audioWorklet.addModule(new URL("./audio-worklet.js", import.meta.url));
      if (generation !== this.startGeneration) return;
      this.node = new AudioWorkletNode(this.context, "beca-synth", {
        numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { bytes: this.bytes }
      });
      this.node.onprocessorerror = () => {
        this.stop();
        this.node.disconnect();
        this.node = null;
        this.gain?.disconnect();
        this.lastParams = null;
        this.dispatchEvent(new Event("engineerror"));
      };
      this.gain = this.context.createGain();
      this.gain.gain.value = 0;
      this.node.connect(this.gain).connect(this.context.destination);
    }
    this.enabled = true;
    this.node.port.postMessage({ type: "mode", mode: Number(this.performance.mode) });
    this.setParams(params);
    this.gain.gain.setTargetAtTime(1, this.context.currentTime, 0.015);
    this.dispatchEvent(new Event("statechange"));
  }
  stop() {
    ++this.startGeneration;
    this.enabled = false;
    if (this.gain) {
      this.gain.gain.cancelScheduledValues(this.context.currentTime);
      this.gain.gain.setValueAtTime(0, this.context.currentTime);
    }
    this.panic();
    this.dispatchEvent(new Event("statechange"));
  }
  panic() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.noteMap.clear();
    this.activeNotes.clear();
    this.arp.reset();
    this.node?.port.postMessage({ type: "panic" });
    this.node?.port.postMessage({ type: "mode", mode: Number(this.performance.mode) });
    this.lastParams = null;
    this.setParams(this.params);
    this.dispatchEvent(new Event("noteschange"));
  }
  setPerformance(settings) {
    const next = { ...this.performance, ...settings };
    const keys = ["mode", "scale", "root", "lo", "hi", "arp_pattern", "arp_chord", "arp_span"];
    const changed = keys.some((key) => Number(next[key]) !== Number(this.performance[key]));
    this.performance = next;
    if (changed) this.panic();
  }
  plant(value, connected) {
    if (connected) this.arp.plant(value, this.performance.arp_response);
    else if (this.activeNotes.size) this.panic();
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
    if (!this.enabled) return;
    let [status, note, velocity = 0] = bytes;
    const command = status & 0xf0;
    const on = command === 0x90 && velocity > 0;
    const off = command === 0x80 || (command === 0x90 && !velocity);
    const drum = (status & 15) === 9;
    if (command === 0xb0 && [120,123].includes(note)) { this.panic(); return; }
    if (on || off) {
      if (drum !== (Number(this.performance.mode) === 3)) return;
      if (drum && on) {
        const part = [36,38,42,46,45,47,51,49].indexOf(note);
        if (part < 0 || !(Number(this.performance.drumsel) & (1 << part))) return;
      }
      if (!drum && Number(this.performance.mode) === 1) {
        const key = `${status & 15}:${note}`;
        if (on) {
          // One arp voice at a time; release the previous pitch before advancing.
          for (const active of this.activeNotes) this.node?.port.postMessage({ type: "midi", bytes: [0x80, active, 0] });
          this.activeNotes.clear();
          this.noteMap.clear();
          note = this.arp.next(this.performance);
          this.noteMap.set(key, note);
        } else {
          if (!this.noteMap.has(key)) return;
          note = this.noteMap.get(key);
          this.noteMap.delete(key);
        }
      }
      if (on) { this.activeNotes.add(note); this.lastNote = note; this.lastVelocity = velocity; }
      else this.activeNotes.delete(note);
    }
    this.node?.port.postMessage({ type: "midi", bytes: [status, note, velocity] });
    this.dispatchEvent(new Event("noteschange"));
  }
  sensor(raw, connected) {
    if (this.enabled) this.node?.port.postMessage({ type: "sensor", raw: Math.max(0, Math.min(4095, Number(raw) || 0)), connected: Boolean(connected) });
  }
  test() {
    this.panic();
    if (Number(this.performance.mode) === 3 || Number(this.performance.mode) === 1) {
      const drum = Number(this.performance.mode) === 3;
      for (let i = 0; i < 8; i++) {
        const note = drum ? [36,38,42,46,45,47,51,49][i] : 60;
        const timer = setTimeout(() => {
          this.midi([drum ? 0x99 : 0x90, note, 88]);
          this.timers.delete(timer);
        }, i * 220);
        const off = setTimeout(() => {
          this.midi([drum ? 0x89 : 0x80, note, 0]);
          this.timers.delete(off);
        }, i * 220 + 160);
        this.timers.add(timer); this.timers.add(off);
      }
      return;
    }
    if (Number(this.params.preset) === 12) this.sensor(440, true);
    else (Number(this.performance.mode) === 2 ? [60,64,67] : [60]).forEach((note) => this.midi([0x90, note, 88]));
    const timer = setTimeout(() => {
      [60, 64, 67].forEach((note) => this.midi([0x80, note, 0]));
      this.sensor(0, false);
      this.timers.delete(timer);
    }, 1200);
    this.timers.add(timer);
  }
}
