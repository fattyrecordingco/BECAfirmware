// MIDI Learn consumes controller gestures only; musical output keeps its own path.
export const MAPPING_STORAGE_KEY = "beca-midi-mappings-v1";
export const MAPPING_MODES = {
  pickup: "Pickup", direct: "Direct", twos: "Relative: two’s complement",
  offset: "Relative: offset", sign: "Relative: sign magnitude"
};
const LIMIT = 64;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function decodeControl(bytes) {
  if (!bytes || bytes.length !== 3 || !Array.from(bytes).every(Number.isInteger)) return null;
  const [status, number, value] = bytes;
  if (status < 128 || status > 239 || number < 0 || number > 127 || value < 0 || value > 127) return null;
  const channel = (status & 15) + 1;
  switch (status & 240) {
    case 176: return number < 120 ? { kind: "cc", number, channel, value, max: 127, pressed: value >= 64 } : null;
    case 128: return { kind: "note", number, channel, value: 0, max: 127, pressed: false };
    case 144: return { kind: "note", number, channel, value, max: 127, pressed: value > 0 };
    case 224: return { kind: "bend", number: 0, channel, value: number | (value << 7), max: 16383, pressed: true };
    default: return null;
  }
}

export function validateMappings(value, keys) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.slice(0, LIMIT).filter((item) => {
    if (!item || typeof item.device !== "string" || !item.device || item.device.length > 512 ||
      !keys.has(item.target) || !["cc", "note", "bend"].includes(item.kind) ||
      !Number.isInteger(item.channel) || item.channel < 1 || item.channel > 16 ||
      !Number.isInteger(item.number) || item.number < 0 || item.number > (item.kind === "cc" ? 119 : item.kind === "bend" ? 0 : 127) ||
      !Object.hasOwn(MAPPING_MODES, item.mode) || (item.kind !== "cc" && !["pickup", "direct"].includes(item.mode))) return false;
    const identity = JSON.stringify([item.device, item.kind, item.channel, item.number]);
    if (seen.has(identity)) return false;
    seen.add(identity); return true;
  }).map(({ device, target, kind, channel, number, mode, inverted }) => ({ device, target, kind, channel, number, mode, inverted: inverted === true }));
}

export function sourceLabel(mapping) {
  return `${mapping.kind === "cc" ? `CC ${mapping.number}` : mapping.kind === "note" ? `Note ${mapping.number}` : "Pitch bend"} · Ch ${mapping.channel}`;
}

export class MidiMapper {
  constructor({ controls, change, stored = [] }) {
    this.controls = controls;
    this.change = change;
    this.mappings = validateMappings(stored, new Set(controls.keys()));
    this.runtime = new Map();
    this.learning = null;
  }
  reset() { this.runtime.clear(); this.learning = null; }
  learn(target, device) {
    this.runtime.clear();
    this.learning = this.controls.has(target) && device ? { target, device } : null;
  }
  remove(index) { this.mappings.splice(index, 1); this.reset(); }
  receive(device, bytes) {
    const event = decodeControl(bytes);
    if (!event) return null;
    if (this.learning?.device === device) {
      if (event.kind === "note" && !event.pressed) return null;
      const target = this.learning.target;
      const binding = { device, target, kind: event.kind, channel: event.channel, number: event.number,
        mode: event.kind === "note" || this.controls.get(target)().toggle || this.controls.get(target)().options ? "direct" : "pickup", inverted: false };
      const index = this.mappings.findIndex(m => m.device === device && m.kind === event.kind && m.channel === event.channel && m.number === event.number);
      if (index < 0 && this.mappings.length >= LIMIT) { this.learning = null; return { full: true }; }
      if (index < 0) this.mappings.push(binding); else this.mappings[index] = binding;
      this.reset();
      // Learning a control never changes its sound. Wait for note release before a second press.
      this.runtime.set(binding, { pressed: event.kind === "note" && event.pressed, waitRelease: event.kind === "cc" && this.controls.get(target)().toggle && event.pressed });
      return { learned: binding };
    }
    for (const mapping of this.mappings) {
      if (mapping.device !== device || mapping.kind !== event.kind || mapping.channel !== event.channel || mapping.number !== event.number) continue;
      const control = this.controls.get(mapping.target)?.();
      if (!control?.enabled) { this.runtime.delete(mapping); continue; }
      const state = this.runtime.get(mapping) || {};
      this.runtime.set(mapping, state);
      if (state.waitRelease) { if (!event.pressed) state.waitRelease = false; continue; }
      const wasPressed = state.pressed;
      state.pressed = event.pressed;
      if (event.kind === "note" && (!event.pressed || wasPressed)) continue;
      const current = Number(control.value);
      if (!control.options && !Number.isFinite(current)) continue;
      const relative = ["twos", "offset", "sign"].includes(mapping.mode);
      let fraction = event.value / event.max;
      if (mapping.inverted) fraction = 1 - fraction;
      let next;
      if (control.toggle) {
        next = event.kind === "note" ? Number(!current) : Number(mapping.inverted ? !event.pressed : event.pressed);
      } else if (relative) {
        let delta = mapping.mode === "twos" ? (event.value < 64 ? event.value : event.value - 128)
          : mapping.mode === "offset" ? event.value - 64 : (event.value < 64 ? event.value : -(event.value - 64));
        if (!delta) continue;
        if (mapping.inverted) delta = -delta;
        if (control.options) {
          const index = Math.max(0, control.options.indexOf(String(control.value)));
          next = control.options[clamp(index + delta, 0, control.options.length - 1)];
        } else next = current + delta * control.step;
      } else if (control.options) {
        next = control.options[Math.min(control.options.length - 1, Math.floor(fraction * control.options.length))];
      } else {
        const span = control.max - control.min;
        if (!(span > 0)) continue;
        const position = (current - control.min) / span;
        if (state.lastOutput != null && Math.abs(current - state.lastOutput) > control.step * 0.51) { state.picked = false; state.lastOutput = null; }
        if (mapping.mode === "pickup" && !state.picked) {
          state.picked = Math.abs(fraction - position) <= Math.max(1 / event.max, control.step / span) ||
            (state.previous != null && (state.previous - position) * (fraction - position) <= 0);
          state.previous = fraction;
          if (!state.picked) return { pickup: mapping.target };
        }
        state.previous = fraction;
        next = control.min + fraction * span;
      }
      if (next == null) continue;
      if (!control.options && !control.toggle) {
        next = Number(clamp(control.min + Math.round((Number(next) - control.min) / control.step) * control.step, control.min, control.max).toFixed(6));
      }
      state.lastOutput = Number(next);
      if (String(next) !== String(control.value)) this.change({ [mapping.target]: next });
      return { changed: mapping.target };
    }
    return null;
  }
}
