const CACHE_NAME = "beca-phone-v1.8.0-sound-controls";
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./protocol.js",
  "./webusb-serial.js",
  "./tablet-link.js",
  "./wifi-provider.js",
  "./phone-audio.js", "./plant-arp.js", "./compatibility.js", "./apple-native.js",
  "./audio-engine.js",
  "./audio-worklet.js",
  "./recordings.js",
  "./recordings-ui.js",
  "./recording-formats.js",
  "./beca-synth.wasm",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/wordmark.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];
const shellPaths = new Set(APP_SHELL.map((file) => new URL(file, self.registration.scope).pathname));

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL.map((file) => new Request(new URL(file, self.registration.scope), { cache: "reload" }))))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("beca-phone-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || !shellPaths.has(url.pathname)) return;
  // Load HTML, scripts and WASM from the same installed release.
  event.respondWith(caches.open(CACHE_NAME)
    .then((cache) => cache.match(event.request, { ignoreSearch: true }))
    .then((cached) => cached || fetch(event.request)));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
