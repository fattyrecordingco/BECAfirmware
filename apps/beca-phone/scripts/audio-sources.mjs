import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
export const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(app, "../..");
const sources = ["synth_engine.cpp", "synth_engine.h", "drum_engine.cpp", "drum_engine.h", "dsp_blocks.cpp", "dsp_blocks.h", "synth_platform.h", "apps/beca-phone/audio/engine.cpp", "apps/beca-phone/scripts/build-audio.mjs"];
export async function audioFingerprint() {
  const hash = createHash("sha256");
  for (const path of sources) hash.update(path + "\n" + (await readFile(resolve(repo, path), "utf8")).replaceAll("\r\n", "\n"));
  return { compiler: "Emscripten 4.0.23", sourceSha256: hash.digest("hex"), wasmSha256: createHash("sha256").update(await readFile(resolve(app, "beca-synth.wasm"))).digest("hex") };
}
export async function verifyAudioBuild() {
  const expected = JSON.parse(await readFile(resolve(app, "audio-build.json"), "utf8"));
  const actual = await audioFingerprint();
  if (expected.sourceSha256 !== actual.sourceSha256 || expected.wasmSha256 !== actual.wasmSha256) throw new Error("BECA audio artifact is stale. Run npm run build:audio with Emscripten 4.0.23.");
}
