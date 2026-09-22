import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const svg = await readFile(resolve(root, "icons", "icon.svg"), "utf8");
const browser = await chromium.launch({ channel: "chrome" });
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<style>*{margin:0}body,svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.locator("svg").screenshot({ path: resolve(root, "icons", `icon-${size}.png`), omitBackground: true });
  await page.close();
}
await browser.close();
console.log("Generated 192px and 512px PWA icons.");
