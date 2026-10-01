export const PARAM_KEYS = ["preset", "wave_a", "wave_b", "osc_mix", "mono", "voices", "attack", "decay", "sustain", "release", "filter", "cutoff", "resonance", "reverb", "delay_ms", "delay_feedback", "delay_mix", "drive", "master", "detune", "gain_trim", "drumkit"];

export function instantiateEngine(module) {
  const instance = new WebAssembly.Instance(module, {});
  const engine = instance.exports;
  engine._initialize();
  engine.init(44100);
  return engine;
}

export function readParams(engine) {
  return Object.fromEntries(PARAM_KEYS.map((key, index) => [key, engine.get_param(index)]));
}
