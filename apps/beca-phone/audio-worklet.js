import { instantiateEngine, PARAM_KEYS } from "./audio-engine.js";

class BecaProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.engine = instantiateEngine(new WebAssembly.Module(options.processorOptions.bytes));
    this.engine.init(sampleRate);
    this.samples = new Int16Array(this.engine.memory.buffer);
    this.port.onmessage = ({ data }) => {
      if (data.type === "params") {
        for (let i = 0; i < PARAM_KEYS.length; i++) {
          const value = Number(data.params[PARAM_KEYS[i]]);
          if (Number.isFinite(value)) this.engine.set_param(i, value);
        }
      } else if (data.type === "midi") this.engine.midi(...data.bytes);
      else if (data.type === "sensor") this.engine.sensor(data.raw, data.connected);
      else if (data.type === "panic") {
        // Recreate DSP state to clear voices, drums and effect tails immediately.
        this.engine.init(sampleRate);
      }
    };
  }
  process(inputs, outputs) {
    const channels = outputs[0];
    if (!channels?.length) return true;
    for (let offset = 0; offset < channels[0].length; offset += 128) {
      const count = Math.min(128, channels[0].length - offset);
      const pointer = this.engine.render(count) / 2;
      for (let channel = 0; channel < channels.length; channel++) {
        for (let i = 0; i < count; i++) channels[channel][offset + i] = this.samples[pointer + i * 2 + (channel % 2)] / 32768;
      }
    }
    return true;
  }
}
registerProcessor("beca-synth", BecaProcessor);
