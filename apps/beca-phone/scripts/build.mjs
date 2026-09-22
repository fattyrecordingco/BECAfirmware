import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "dist");
const files = ["index.html", "app.css", "app.js", "protocol.js", "webusb-serial.js", "manifest.webmanifest", "service-worker.js"];

await rm(output, { recursive: true, force: true });
await mkdir(resolve(output, "icons"), { recursive: true });
for (const file of files) await cp(resolve(root, file), resolve(output, file));
for (const icon of ["icon.svg", "wordmark.svg", "icon-192.png", "icon-512.png"]) {
  await cp(resolve(root, "icons", icon), resolve(output, "icons", icon));
}

const marker = "<!doctype html>";
const html = await readFile(resolve(output, "index.html"), "utf8");
if (!html.toLowerCase().startsWith(marker)) throw new Error("Built index is invalid");
await writeFile(resolve(output, ".nojekyll"), "");
console.log(`Built ${files.length + 5} static assets in ${output}`);
