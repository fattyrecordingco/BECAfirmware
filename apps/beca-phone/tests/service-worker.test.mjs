import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("installing an update waits for the performer and activation only removes BECA caches", async () => {
  const handlers = {}, removed = []; let skips = 0, claimed = 0, cached = [], currentCache;
  const scope = "https://example.com/beca/";
  const context = { URL, Request,
    self: { registration: { scope }, location: new URL(scope), addEventListener: (type, handler) => { handlers[type] = handler; },
      skipWaiting: () => { skips++; }, clients: { claim: () => { claimed++; } } },
    fetch: async () => { throw new Error("A cached asset must stay on the installed release."); },
    caches: { open: async name => { currentCache = name; return {
      addAll: async files => { cached = files; },
      match: async (request, { ignoreSearch }) => {
        assert.equal(ignoreSearch, true);
        return cached.find((file) => new URL(file.url).pathname === new URL(request.url).pathname);
      }
    }; },
      keys: async () => ["other-app", "beca-phone-old", currentCache], delete: async key => { removed.push(key); } } };
  vm.runInNewContext(await readFile(new URL("../service-worker.js", import.meta.url), "utf8"), context);
  let work;
  handlers.install({ waitUntil: promise => { work = promise; } }); await work;
  assert.equal(skips, 0);
  assert.ok(cached.every((request) => request.cache === "reload"));
  assert.ok(cached.some((request) => request.url === scope + "recordings.js"));
  for (const path of ["?launch=home", "app.js", "beca-synth.wasm"]) {
    handlers.fetch({ request: new Request(scope + path), respondWith: promise => { work = promise; } });
    assert.equal((await work).url, scope + path.split("?")[0]);
  }
  handlers.fetch({ request: new Request(scope + "api/state"), respondWith: () => assert.fail("Do not intercept device requests.") });
  handlers.message({ data: { type: "SKIP_WAITING" } }); assert.equal(skips, 1);
  handlers.activate({ waitUntil: promise => { work = promise; } }); await work;
  assert.deepEqual(removed, ["beca-phone-old"]); assert.equal(claimed, 1);
});
