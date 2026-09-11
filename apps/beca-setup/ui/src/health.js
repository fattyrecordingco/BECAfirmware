// Local diagnostics only: observed signal quality, never plant-health inference.
export class BecaHealth {
  constructor() { this.reset(); }
  reset() { this.samples = []; this.failures = 0; this.lastTimestamp = null; this.sameTimestamp = 0; }
  failure(message) {
    this.failures++;
    const retryMs = [2000, 5000, 15000, 30000][this.failures - 1] ?? null;
    return { ok: false, retryMs, message: retryMs == null
      ? `Automatic retries paused after repeated failures. ${message} Use Reconnect after checking USB or Wi-Fi.`
      : `${message} Retrying the selected device in ${retryMs / 1000}s; USB fallback is handled by the connection service.` };
  }
  observe(snapshot) {
    if (snapshot.stale || Number(snapshot.age_ms || 0) > 3000) return this.failure("Device data is stale.");
    const p = snapshot.plant || {};
    if (p.ts != null) {
      this.sameTimestamp = p.ts === this.lastTimestamp ? this.sameTimestamp + 1 : 0;
      this.lastTimestamp = p.ts;
      if (this.sameTimestamp >= 6) return this.failure("The sensor timestamp has stopped advancing.");
    }
    const energy = Number(p.value);
    const raw = p.raw == null ? null : Number(p.raw);
    if (!Number.isFinite(energy) || energy < 0 || energy > 1 ||
        (raw != null && (!Number.isInteger(raw) || raw < 0 || raw > 4095))) {
      return this.failure("Sensor data is outside the expected range; no calibration was changed.");
    }
    const recovered = this.failures > 0;
    this.failures = 0;
    this.samples.push({ raw, energy });
    if (this.samples.length > 60) this.samples.shift();
    const prefix = recovered ? "Connection recovered. " : "";
    if (Number(p.connected) === 0 || Number(snapshot.state?.plant_jack) === 0) {
      return { ok: true, message: `${prefix}Plant input reports disconnected. Check the electrode cable and jack.` };
    }
    const last = this.samples.slice(-10);
    if (last.length === 10 && last.every((s) => s.raw != null && (s.raw <= 4 || s.raw >= 4091))) {
      return { ok: true, message: `${prefix}Sensor is at an ADC rail. Check electrode contact and the input circuit; this is not a plant-health diagnosis.` };
    }
    if (this.samples.length < 10) return { ok: true, message: `${prefix}Learning the recent signal range (${this.samples.length}/10 samples).` };
    const values = this.samples.filter((s) => s.raw != null).map((s) => s.raw);
    const span = values.length ? Math.max(...values) - Math.min(...values) : null;
    const mean = last.reduce((sum, s) => sum + s.energy, 0) / last.length;
    const activity = mean < 0.03 ? "Quiet input; quiet does not mean unhealthy." : mean > 0.85
      ? "Strong sustained activity; check for touch or electrical noise if unexpected." : "Changing input within the expected range.";
    return { ok: true, message: `${prefix}${activity}${span != null ? ` Recent raw span ${span} counts.` : " Raw readings unavailable on this firmware."} Sensitivity stays under your control.` };
  }
}
