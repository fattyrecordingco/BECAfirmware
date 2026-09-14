import { expect, test } from "@playwright/test";
import axeCore from "axe-core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const uiRoot = resolve(import.meta.dirname, "..", "ui");

async function expectNoVisibleHorizontalOverflow(page, selector) {
  const overflow = await page.locator(selector).evaluate((root) =>
    Array.from(root.querySelectorAll("*"))
      .filter((node) => {
        const style = window.getComputedStyle(node);
        if (node.classList.contains("sr-only") || node.classList.contains("support-hidden")) {
          return false;
        }
        if (style.visibility === "hidden" || style.display === "none" || node.offsetParent === null) {
          return false;
        }
        return node.scrollWidth > Math.ceil(node.clientWidth + 1);
      })
      .slice(0, 12)
      .map((node) => ({
        tag: node.tagName.toLowerCase(),
        id: node.id,
        className: String(node.className),
        text: node.textContent.trim().slice(0, 48),
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth
      }))
  );

  expect(overflow).toEqual([]);
}

test("Setup and routing remain readable and scroll on smaller screens", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".setup-frame")).toBeVisible();
  await expect(page.locator(".vite-error-overlay, #webpack-dev-server-client-overlay")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "connect beca" })).toBeVisible();
  await expect(page.getByRole("button", { name: "scan device" })).toBeVisible();

  const frame = await page.locator(".setup-frame").boundingBox();
  const viewport = page.viewportSize();
  expect(frame.width).toBeLessThanOrEqual(viewport.width);
  expect(frame.height).toBeGreaterThan(500);

  await expectNoVisibleHorizontalOverflow(page, ".setup-frame");
});

test("setup and control use matching header geometry", async ({ browser }) => {
  const setupPage = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
  const controlPage = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
  await setupPage.goto("/");
  await controlPage.goto("/control.html");

  const setupHeader = await setupPage.evaluate(() => {
    const frame = document.querySelector(".setup-frame").getBoundingClientRect();
    const logo = document.querySelector(".setup-logo").getBoundingClientRect();
    const actions = document.querySelector(".setup-top-actions").getBoundingClientRect();
    return {
      logoX: logo.x - frame.x,
      logoY: logo.y - frame.y,
      logoWidth: logo.width,
      logoHeight: logo.height,
      actionsRight: frame.right - actions.right,
      actionsY: actions.y - frame.y,
      actionsHeight: actions.height
    };
  });

  const controlHeader = await controlPage.evaluate(() => {
    const frame = document.querySelector(".control-frame").getBoundingClientRect();
    const logo = document.querySelector(".logo-lockup").getBoundingClientRect();
    const actions = document.querySelector(".mode-actions").getBoundingClientRect();
    return {
      logoX: logo.x - frame.x,
      logoY: logo.y - frame.y,
      logoWidth: logo.width,
      logoHeight: logo.height,
      actionsRight: frame.right - actions.right,
      actionsY: actions.y - frame.y,
      actionsHeight: actions.height
    };
  });

  expect(setupHeader).toEqual(controlHeader);
  await setupPage.close();
  await controlPage.close();
});

test("setup panel has no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  await page.addScriptTag({ content: axeCore.source });
  const results = await page.evaluate(async () => {
    return window.axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa"]
      },
      resultTypes: ["violations"]
    });
  });

  const serious = results.violations
    .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => node.target)
    }));

  expect(serious).toEqual([]);
});

test("control surface labels fit and arrow keys drive the encoder", async ({ page }) => {
  await page.route("**/api/set", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true })
    });
  });
  await page.goto("/control.html");
  await expect(page.locator(".control-frame")).toBeVisible();
  await expect(page.getByRole("button", { name: "On-screen encoder" })).toBeVisible();
  await expectNoVisibleHorizontalOverflow(page, ".control-frame");

  const before = await page.locator("#encoder-button").evaluate((node) =>
    node.style.getPropertyValue("--encoder-angle")
  );
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () =>
    page.locator("#encoder-button").evaluate((node) => node.style.getPropertyValue("--encoder-angle"))
  ).not.toBe(before);
});

test("control Wi-Fi MIDI follows firmware capabilities and sends mode 4", async ({ page }, testInfo) => {
  const writes = [];
  await page.route("**/api/state", (route) => route.fulfill({ json: { outputmode: 1, outputname: "Serial MIDI" } }));
  await page.route("**/api/params", (route) => route.fulfill({ json: { output_modes: ["BLE MIDI", "Serial MIDI", "Aux audio", "Serial MIDI + Aux", "Wi-Fi MIDI"] } }));
  await page.route("**/api/set", (route) => {
    writes.push(Object.fromEntries(new URLSearchParams(route.request().postData())));
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/control.html");
  const wifi = page.getByRole("button", { name: "Wi-Fi MIDI", exact: true });
  await expect(wifi).toBeVisible();
  await expect(page.getByRole("button", { name: "serial + aux", exact: true })).toBeVisible();
  await wifi.click();
  await expect(wifi).toHaveClass(/is-active/);
  await expect.poll(() => writes.some((write) => write.key === "outputmode" && write.value === "4")).toBe(true);
  const outputBounds = await page.locator(".output-card").boundingBox();
  const nextBounds = await page.locator(".random-card").boundingBox();
  expect(outputBounds.y + outputBounds.height).toBeLessThan(nextBounds.y);
  await expectNoVisibleHorizontalOverflow(page, ".control-frame");
  await page.screenshot({ path: testInfo.outputPath("wifi-midi-control.png"), fullPage: true });
});

test("control hides Wi-Fi MIDI on firmware without output capabilities", async ({ page }) => {
  await page.route("**/api/state", (route) => route.fulfill({ json: { outputmode: 1 } }));
  await page.route("**/api/params", (route) => route.fulfill({ json: {} }));
  await page.goto("/control.html");
  await expect(page.getByRole("button", { name: "Wi-Fi MIDI", exact: true })).toBeHidden();
});

test("ui source does not use gradients", async () => {
  const files = [
    resolve(uiRoot, "index.html"),
    resolve(uiRoot, "control.html"),
    resolve(uiRoot, "src", "styles.css"),
    resolve(uiRoot, "src", "performance.css"),
    resolve(uiRoot, "src", "performance-instrument.css"),
    resolve(uiRoot, "src", "midi-routing.css")
  ];
  const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
  expect(source).not.toMatch(/(?:linear|radial|conic)-gradient|gradient\(/i);
});
