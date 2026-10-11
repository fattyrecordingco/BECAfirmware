import { chromium } from "../beca-phone/node_modules/playwright-core/index.mjs";
import { mkdir, readFile, writeFile } from "node:fs/promises";

// Render the established vector logo; no native app build dependency is added.
const svg = await readFile(new URL("../beca-phone/icons/icon.svg", import.meta.url), "utf8");
const output = new URL("./BECAApple/Assets.xcassets/AppIcon.appiconset/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:white}svg{width:100vw;height:100vh;display:block}</style>${svg}`);
    const png = await page.screenshot({ type: "png", omitBackground: false });
    // App Store icons must have RGB PNG data, without an alpha channel.
    if (png[25] !== 2) throw new Error("Icon renderer emitted a PNG with alpha; RGB output is required.");
    await writeFile(new URL(`icon-${size}.png`, output), png);
  }
} finally {
  await browser.close();
}
const images = [{ filename: "icon-1024.png", idiom: "universal", platform: "ios", size: "1024x1024" }];
for (const size of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2]) images.push({ filename: `icon-${size * scale}.png`, idiom: "mac", size: `${size}x${size}`, scale: `${scale}x` });
}
await writeFile(new URL("Contents.json", output), JSON.stringify({ images, info: { author: "xcode", version: 1 } }, null, 2) + "\n");
console.log("Generated opaque native app icons from the existing BECA vector logo.");
