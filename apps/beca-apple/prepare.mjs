import { cp, mkdir, readFile } from "node:fs/promises";
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
console.log("Apple app resources prepared. Open BECAApple.xcodeproj on a Mac.");
