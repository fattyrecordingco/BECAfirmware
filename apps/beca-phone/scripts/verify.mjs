import { readFile, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const required = ["index.html", "app.css", "app.js", "protocol.js", "webusb-serial.js", "manifest.webmanifest", "service-worker.js", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png"];
for (const file of required) {
  const info = await stat(resolve(root, file));
  if (!info.isFile() || info.size === 0) throw new Error(`${file} is missing or empty`);
}

const manifest = JSON.parse(await readFile(resolve(root, "manifest.webmanifest"), "utf8"));
if (manifest.display !== "standalone" || !manifest.start_url || !manifest.icons?.length) throw new Error("PWA manifest is incomplete");

const serviceWorker = await readFile(resolve(root, "service-worker.js"), "utf8");
for (const file of required.filter((item) => !item.includes("manifest") && !item.includes("service-worker"))) {
  if (!serviceWorker.includes(`"./${file}"`) && file !== "index.html") throw new Error(`${file} is not cached for offline use`);
}

const html = await readFile(resolve(root, "index.html"), "utf8");
for (const marker of ["manifest.webmanifest", "app.css", "app.js", "viewport-fit=cover", "Connect USB", "Serial console"]) {
  if (!html.includes(marker)) throw new Error(`index.html is missing ${marker}`);
}

console.log(`Verified ${required.length} PWA assets, manifest metadata, and offline shell.`);
