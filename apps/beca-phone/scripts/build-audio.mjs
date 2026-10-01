import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { audioFingerprint } from "./audio-sources.mjs";
const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(app, "../..");
const sdk = process.env.EMSDK || resolve(repo, ".beca-cache/emsdk");
const compiler = resolve(sdk, "upstream/emscripten/em++.py");
if (!existsSync(compiler)) throw new Error("Install Emscripten 4.0.23 and set EMSDK; see README.md.");
const python = process.env.EMSDK_PYTHON || (process.platform === "win32" ? resolve(sdk, "python/3.13.3_64bit/python.exe") : "python3");
const result = spawnSync(python, [compiler, "-O2", "-std=c++17", "-DBECA_WEB_AUDIO=1", "-I", repo,
  resolve(app, "audio/engine.cpp"), resolve(repo, "synth_engine.cpp"), resolve(repo, "drum_engine.cpp"), resolve(repo, "dsp_blocks.cpp"),
  "--no-entry", "-sSTANDALONE_WASM=1", "-sFILESYSTEM=0", "-sALLOW_MEMORY_GROWTH=0", "-sINITIAL_MEMORY=2097152", "-sSTACK_SIZE=65536",
  "-o", resolve(app, "beca-synth.wasm")], { stdio: "inherit", env: { ...process.env, EM_CONFIG: resolve(sdk, ".emscripten") } });
if (result.status !== 0) process.exit(result.status ?? 1);
await writeFile(resolve(app, "audio-build.json"), JSON.stringify(await audioFingerprint(), null, 2) + "\n");
