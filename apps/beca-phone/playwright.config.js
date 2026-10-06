import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.js",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: "http://127.0.0.1:4174",
    colorScheme: "dark",
    reducedMotion: "reduce",
    trace: "on-first-retry"
  },
  webServer: {
    command: "npm run build && npm run preview -- --host 127.0.0.1 --port 4174",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: true,
    timeout: 30_000
  },
  projects: [
    { name: "android", use: { ...devices["Pixel 7"] } },
    { name: "small-phone", use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true } },
    { name: "phone-landscape", use: { ...devices["Pixel 7 landscape"] } },
    { name: "tablet-portrait", use: { ...devices["Desktop Chrome"], viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true } },
    { name: "tablet-landscape", use: { ...devices["Desktop Chrome"], viewport: { width: 1180, height: 820 }, isMobile: true, hasTouch: true } },
    { name: "iphone-webkit", use: { ...devices["iPhone 13"], browserName: "webkit", channel: undefined } },
    { name: "mac-webkit", use: { ...devices["Desktop Safari"], browserName: "webkit", channel: undefined } },
    { name: "ipad-webkit", use: { ...devices["iPad (gen 7)"], browserName: "webkit", channel: undefined } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } }
  ].map((project) => project.name.endsWith("webkit") ? project : { ...project, use: { ...project.use, channel: "chrome" } })
});
