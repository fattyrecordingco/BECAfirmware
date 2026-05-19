import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const appDir = process.cwd();
const repoRoot = path.resolve(appDir, "..", "..");
const packageJson = JSON.parse(readFileSync(path.join(appDir, "package.json"), "utf8"));
const version = packageJson.version;
const windowsDistDir = path.join(repoRoot, "installers", "windows");
const releaseDir = path.join(repoRoot, "target", "release");
const bundleNsisDir = path.join(releaseDir, "bundle", "nsis");
const bundleMsiDir = path.join(releaseDir, "bundle", "msi");

const copies = [
  {
    source: path.join(releaseDir, "beca-setup.exe"),
    target: path.join(windowsDistDir, "BECA.exe")
  },
  {
    source: path.join(appDir, "src-tauri", "WebView2Loader.dll"),
    target: path.join(windowsDistDir, "WebView2Loader.dll")
  },
  {
    source: path.join(bundleNsisDir, `BECA_${version}_x64-setup.exe`),
    target: path.join(windowsDistDir, `BECA_${version}_x64-setup.exe`)
  },
  {
    source: path.join(bundleMsiDir, `BECA_${version}_x64_en-US.msi`),
    target: path.join(windowsDistDir, `BECA_${version}_x64_en-US.msi`)
  }
];

mkdirSync(windowsDistDir, { recursive: true });

for (const { source, target } of copies) {
  if (!existsSync(source)) {
    console.error(`Missing build artifact: ${source}`);
    process.exit(1);
  }
  copyFileSync(source, target);
  console.log(`Updated ${target}`);
}
