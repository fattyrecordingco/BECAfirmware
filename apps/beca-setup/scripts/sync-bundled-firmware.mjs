import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
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

if (
  targetStat &&
  targetStat.size === sourceStat.size &&
  targetStat.mtimeMs >= sourceStat.mtimeMs
) {
  console.log(`Bundled firmware already up to date: ${target}`);
  process.exit(0);
}

copyFileSync(source, target);
console.log(`Bundled firmware updated: ${source} -> ${target}`);
