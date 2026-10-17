import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("installing an update waits for the performer and activation only removes BECA caches", async () => {
  const handlers = {}, removed = []; let skips = 0, claimed = 0, cached = [];
  const context = { self: { addEventListener: (type, handler) => { handlers[type] = handler; }, skipWaiting: () => { skips++; }, clients: { claim: () => { claimed++; } } },
    caches: { open: async () => ({ addAll: async files => { cached = files; } }), keys: async () => ["other-app", "beca-phone-old", "beca-phone-v1.7.1-controller-1"], delete: async key => { removed.push(key); } } };
  vm.runInNewContext(await readFile(new URL("../service-worker.js", import.meta.url), "utf8"), context);
  let work;
  handlers.install({ waitUntil: promise => { work = promise; } }); await work;
  assert.equal(skips, 0); assert.ok(cached.includes("./beca-synth.wasm"));
  handlers.message({ data: { type: "SKIP_WAITING" } }); assert.equal(skips, 1);
  handlers.activate({ waitUntil: promise => { work = promise; } }); await work;
  assert.deepEqual(removed, ["beca-phone-old"]); assert.equal(claimed, 1);
});
