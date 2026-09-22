import { chromium } from "playwright";
import { resolve, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const browser = await chromium.launch({ channel: "chrome" });
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const source = pathToFileURL(resolve(root, "icons", "icon.svg")).href;
  await page.setContent(`<style>*{margin:0}body{width:${size}px;height:${size}px}img{display:block;width:100%;height:100%}</style><img src="${source}" alt="">`);
  await page.locator("img").screenshot({ path: resolve(root, "icons", `icon-${size}.png`), omitBackground: true });
  await page.close();
}
await browser.close();
console.log("Generated 192px and 512px PWA icons.");
