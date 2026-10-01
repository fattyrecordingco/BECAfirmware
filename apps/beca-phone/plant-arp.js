const SCALES = [
  [0,2,4,5,7,9,11], [0,2,3,5,7,8,10], [0,2,3,5,7,9,10],
  [0,2,4,6,7,9,11], [0,2,4,5,7,9,10], [0,3,5,7,10],
  [0,2,4,7,9], [0,2,3,5,7,8,11], [0,1,3,5,7,8,10],
  [0,2,4,6,8,10], [0,4,7,11], [0,3,7,10], [0,4,7,10], [0,2,7], [0,5,7]
];
const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
export const ARP_DEFAULTS = { arp_pattern: 0, arp_chord: 1, arp_span: 1, arp_response: 0.35 };

// BECA supplies the clock and gate; plant telemetry supplies harmony and contour.
export class PlantArp {
  constructor() { this.reset(); }
  reset() {
    this.energy = 0; this.previous = null; this.slope = 0;
    this.direction = 1; this.turn = false; this.position = -1;
    this.degree = 0; this.signature = ""; this.chord = []; this.order = "Rising";
  }
  plant(value, response = 0.35) {
    if (!Number.isFinite(Number(value))) return;
    const target = clamp(Number(value), 0, 1);
    const alpha = clamp(Number(response) || 0.35, 0.05, 1);
    this.energy = this.previous === null ? target : this.energy + alpha * (target - this.energy);
    const slope = this.previous === null ? 0 : this.energy - this.previous;
    this.slope = slope;
    if (Math.abs(slope) > 0.002) {
      const direction = Math.sign(slope);
      this.turn ||= direction !== this.direction;
      this.direction = direction;
    }
    this.previous = this.energy;
  }
  next(settings) {
    const scaleIndex = Number(settings.scale) || 0;
    const scale = SCALES[scaleIndex] ?? SCALES[0];
    const targetDegree = Math.round(this.energy * (scale.length - 1));
    // Hysteresis prevents small sensor fluctuations from changing the chord.
    if (Math.abs(this.energy - this.degree / (scale.length - 1)) > 0.08) this.degree = targetDegree;
    this.degree = clamp(this.degree, 0, scale.length - 1);
    const low = clamp(Number(settings.lo) || 2, 1, 8);
    const high = clamp(Number(settings.hi) || 5, low, 8);
    const octave = low + Math.min(high - low, Math.floor(this.energy * (high - low + 1)));
    const root = ((Number(settings.root) || 0) % 12 + 12) % 12;
    const base = 12 * (octave + 1) + root;
    const count = Number(settings.arp_chord) === 0 ? 3 : 4;
    const offsets = scaleIndex >= 10 ? scale.map((_, i) => i).slice(0, count) : Array.from({length: count}, (_, i) => i * 2);
    const span = clamp(Number(settings.arp_span) || 1, 1, 3);
    const chord = [];
    for (let oct = 0; oct < span; oct++) for (const offset of offsets) {
      const degree = this.degree + offset;
      let note = base + scale[degree % scale.length] + 12 * (Math.floor(degree / scale.length) + oct);
      const ceiling = Math.min(119, 12 * (high + 2) - 1);
      while (note > ceiling) note -= 12;
      chord.push(note);
    }
    this.chord = [...new Set(chord)].sort((a,b) => a-b);
    const signature = this.chord.join(",");
    if (signature !== this.signature) { this.position = -1; this.signature = signature; }
    const pattern = Number(settings.arp_pattern) || 0;
    let direction = pattern === 1 ? 1 : pattern === 2 ? -1 : this.direction;
    let stride = 1;
    if (pattern === 0 && (this.turn || Math.abs(this.slope) > 0.04) && this.chord.length > 3) stride = 2;
    this.order = pattern === 0 && stride === 2 ? "Turning / skipping" : direction > 0 ? "Rising" : "Falling";
    if (this.position < 0) this.position = direction > 0 ? 0 : this.chord.length - 1;
    else this.position = (this.position + direction * stride + this.chord.length) % this.chord.length;
    this.turn = false;
    return this.chord[this.position];
  }
}
