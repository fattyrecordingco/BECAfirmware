import test from "node:test";
import assert from "node:assert/strict";
import { BecaHealth } from "../ui/src/health.js";
const fresh = (raw = 1200, value = 0.3, extra = {}) => ({ plant: { raw, value, ...extra }, stale: false, age_ms: 10 });

test("recovery uses backoff, pauses, and clears on a fresh sample", () => {
  const h = new BecaHealth();
  assert.deepEqual(Array.from({ length: 5 }, () => h.observe({ stale: true }).retryMs), [2000, 5000, 15000, 30000, null]);
  assert.match(h.observe(fresh()).message, /recovered/);
  assert.equal(h.failures, 0);
});
test("invalid data cannot become a reassuring signal assessment", () => {
  for (const snapshot of [fresh(NaN), fresh(-1), fresh(4096), fresh(123.4), fresh(1000, Infinity), fresh(1000, -0.1), fresh(1000, 1.1)]) {
    assert.equal(new BecaHealth().observe(snapshot).ok, false);
  }
});
test("quiet, clipped, disconnected, and missing raw data have distinct explanations", () => {
  const quiet = new BecaHealth(), rail = new BecaHealth(), legacy = new BecaHealth();
  let q, r, l;
  for (let i = 0; i < 12; i++) {
    q = quiet.observe(fresh(1200, 0)); r = rail.observe(fresh(4095)); l = legacy.observe(fresh(null));
  }
  assert.match(q.message, /does not mean unhealthy/);
  assert.match(r.message, /ADC rail/);
  assert.match(l.message, /Raw readings unavailable/);
  assert.match(quiet.observe(fresh(1200, 0.2, { connected: 0 })).message, /disconnected/);
});
test("frozen timestamp is stale but unchanged raw counts alone are not", () => {
  const h = new BecaHealth();
  let result;
  for (let i = 0; i < 7; i++) result = h.observe(fresh(1200, 0.2, { ts: 100 }));
  assert.equal(result.ok, false);
  assert.match(result.message, /timestamp/);
  assert.equal(h.observe(fresh(1200, 0.2, { ts: 200 })).ok, true);
  for (let i = 0; i < 100; i++) h.observe(fresh(1200));
  assert.equal(h.samples.length, 60);
});
