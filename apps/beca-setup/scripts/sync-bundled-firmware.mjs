import { copyFileSync, createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";

const appDir = process.cwd();
const repoRoot = path.resolve(appDir, "..", "..");
const source = path.join(repoRoot, ".pio", "build", "esp32dev", "firmware.bin");
const targetDir = path.join(appDir, "src-tauri", "binaries");
const target = path.join(targetDir, "beca-current.bin");

if (!existsSync(source)) {
  console.error(
    `Missing firmware build at ${source}. Run "platformio run" from the repo root first.`
  );
  process.exit(1);
}

mkdirSync(targetDir, { recursive: true });

const sourceStat = statSync(source);
const targetStat = existsSync(target) ? statSync(target) : null;

async function sha256(filePath) {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);

  for await (const chunk of stream) {
    hash.update(chunk);
  }

  return hash.digest("hex");
}

if (targetStat && targetStat.size === sourceStat.size) {
  const [sourceHash, targetHash] = await Promise.all([sha256(source), sha256(target)]);
  if (sourceHash === targetHash) {
    console.log(`Bundled firmware already up to date: ${target}`);
    process.exit(0);
  }
}

copyFileSync(source, target);
console.log(`Bundled firmware updated: ${source} -> ${target}`);
