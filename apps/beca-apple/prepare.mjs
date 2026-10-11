import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const phone = fileURLToPath(new URL("../beca-phone/", import.meta.url));
// Invoke the build directly: no shell quoting or additional native dependencies.
const result = spawnSync(process.execPath, ["scripts/build.mjs"], { cwd: phone, stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
const output = new URL("./BECAApple/Web/", import.meta.url);
await mkdir(output, { recursive: true });
await cp(new URL("../beca-phone/dist/", import.meta.url), output, { recursive: true });
const html = await readFile(new URL("index.html", output), "utf8");
if (!html.includes("app.js")) throw new Error("Invalid bundled web app");
// xtool supplies these values itself; Xcode build variables are not expanded there.
const plist = await readFile(new URL("./BECAApple/Info.plist", import.meta.url), "utf8");
const xtoolPlist = plist.replace(
  /\s*<key>(CFBundleExecutable|CFBundleIdentifier|CFBundleName|LSMinimumSystemVersion)<\/key>\s*<string>[^<]*<\/string>/g,
  ""
);
if (xtoolPlist.includes("$(")) throw new Error("Unresolved Xcode variable in xtool Info.plist");
await mkdir(new URL("./build/", import.meta.url), { recursive: true });
await writeFile(new URL("./build/xtool-Info.plist", import.meta.url), xtoolPlist);
console.log("Apple app resources prepared for Xcode or xtool. Native compilation is a separate step.");
