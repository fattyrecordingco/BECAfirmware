// Timbre-only exploration: transport, pitch, routing and output gain stay owned by the performer.
export const SOUND_LIMITS = {
  wave_a: [0, 3, 1], wave_b: [0, 3, 1], osc_mix: [0, 1, 0.01], detune: [0, 8, 0.1],
  mono: [0, 1, 1], voices: [1, 8, 1], gain_trim: [0.45, 1, 0.01],
  attack: [0, 5, 0.01], decay: [0, 5, 0.01], sustain: [0, 1, 0.01], release: [0.01, 10, 0.01],
  filter: [0, 2, 1], cutoff: [20, 18000, 1], resonance: [0.1, 10, 0.1],
  reverb: [0, 1, 0.01], delay_ms: [0, 800, 1], delay_mix: [0, 1, 0.01],
  delay_feedback: [0, 0.95, 0.01], drive: [0, 1, 0.01],
};
export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export function soundValue(key, value) {
  if (!SOUND_LIMITS[key] || value == null || value === "" || !Number.isFinite(Number(value))) return null;
  const [min, max, step] = SOUND_LIMITS[key];
  return Number((clamp(Math.round(Number(value) / step) * step, min, max)).toFixed(3));
}
export function captureSound(values) {
  return Object.fromEntries(Object.keys(SOUND_LIMITS).flatMap((key) => {
    const value = soundValue(key, values[key]);
    return value == null ? [] : [[key, value]];
  }));
}
export const PAD_MODES = {
  tone: { label: "Tone / bite", x: "cutoff", y: "resonance", xLabel: "Dark → bright", yLabel: "Soft → sharp",
    toValues: (x, y) => ({ cutoff: Math.round(80 * Math.pow(150, x)), resonance: Number((0.3 + y * 5.7).toFixed(1)) }),
    fromValues: (v) => [clamp(Math.log(Math.max(80, Number(v.cutoff)) / 80) / Math.log(150)), clamp((Number(v.resonance) - 0.3) / 5.7)] },
  space: { label: "Space / echo", x: "delay_ms", y: "delay_mix", xLabel: "Short → long", yLabel: "Dry → echo",
    toValues: (x, y) => ({ delay_ms: Math.round(40 + x * 700), delay_mix: Number((y * 0.7).toFixed(2)) }),
    fromValues: (v) => [clamp((Number(v.delay_ms) - 40) / 700), clamp(Number(v.delay_mix) / 0.7)] },
  strange: { label: "Drift / grit", x: "detune", y: "drive", xLabel: "Still → drifting", yLabel: "Clean → gritty",
    toValues: (x, y) => ({ detune: Number((x * 8).toFixed(1)), drive: Number((y * 0.65).toFixed(2)) }),
    fromValues: (v) => [clamp(Number(v.detune) / 8), clamp(Number(v.drive) / 0.65)] }
};
export function mutateSound(values, amount = 0.45, random = Math.random) {
  const current = captureSound(values);
  const strength = clamp(amount);
  const destinations = {
    wave_b: Math.floor(random() * 4), osc_mix: 0.2 + random() * 0.65, detune: random() * 8,
    attack: random() ** 3 * 2.5, release: 0.08 + random() ** 2 * 4,
    cutoff: 180 * Math.pow(65, random()), resonance: 0.4 + random() * 4.6,
    delay_ms: 70 + random() * 620, delay_mix: random() * 0.55,
    delay_feedback: 0.1 + random() * 0.6, drive: random() * 0.55
  };
  return Object.fromEntries(Object.entries(destinations).filter(([key]) => key in current).map(([key, destination]) => {
    const value = key === "cutoff" ? current[key] * Math.pow(destination / current[key], strength)
      : key === "wave_b" ? (strength >= 0.5 ? destination : current[key])
      : current[key] + (destination - current[key]) * strength;
    return [key, soundValue(key, value)];
  }));
}
