// Auto-generated — do not edit by hand
#pragma once
#include <Arduino.h>

const char INDEX_HTML[] PROGMEM = R"BECA_UI_HTML(
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>BECA</title>
    <style>
      :root {
        color-scheme: light;
        --accent: #008351;
        --accent-strong: #006c43;
        --bg: #c7ddcf;
        --bg-soft: #d7e7dd;
        --surface: rgba(206, 222, 214, 0.24);
        --surface-strong: rgba(206, 222, 214, 0.34);
        --edge: rgba(70, 96, 83, 0.28);
        --edge-strong: rgba(70, 96, 83, 0.42);
        --text: #1b2c23;
        --text-muted: rgba(27, 44, 35, 0.66);
        --shadow-base: 0 12px 26px rgba(18, 30, 24, 0.12);
        --shadow-green: 0 10px 22px rgba(0, 131, 81, 0.14);
        --radius: 24px;
        --logo-filter: brightness(0) saturate(100%) invert(28%) sepia(62%) saturate(1220%)
          hue-rotate(113deg) brightness(90%) contrast(96%);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        color: var(--text);
        background:
          radial-gradient(900px 520px at 78% -10%, rgba(0, 131, 81, 0.22), transparent 62%),
          radial-gradient(760px 540px at 12% 18%, rgba(136, 200, 170, 0.25), transparent 62%),
          radial-gradient(520px 420px at 88% 84%, rgba(0, 131, 81, 0.18), transparent 60%),
          linear-gradient(160deg, var(--bg) 0%, var(--bg-soft) 58%, var(--bg) 100%);
        font-family:
          "SF Pro Display",
          "SF Pro Text",
          "Avenir Next",
          "Helvetica Neue",
          "Segoe UI",
          sans-serif;
        letter-spacing: 0.01em;
      }

      body::after {
        content: "";
        position: fixed;
        inset: 0;
        background-image:
          linear-gradient(rgba(0, 131, 81, 0.05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0, 131, 81, 0.05) 1px, transparent 1px);
        background-size: 28px 28px;
        opacity: 0.3;
        pointer-events: none;
        z-index: -1;
      }

      .shell {
        width: min(980px, 100%);
        margin: 0 auto;
        padding: 22px;
        display: grid;
        gap: 16px;
      }

      .hero,
      .card {
        background:
          linear-gradient(155deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.03)),
          var(--surface);
        border: 1px solid var(--edge-strong);
        border-radius: var(--radius);
        padding: 18px;
        box-shadow: var(--shadow-base), var(--shadow-green);
        backdrop-filter: blur(22px) saturate(165%);
      }

      .hero {
        display: grid;
        grid-template-columns: minmax(0, 1.4fr) minmax(260px, 0.8fr);
        gap: 16px;
        align-items: stretch;
      }

      .brand {
        display: flex;
        gap: 14px;
        align-items: center;
      }

      .brand img {
        width: 48px;
        height: 48px;
        filter: var(--logo-filter) drop-shadow(0 0 10px rgba(0, 131, 81, 0.22));
      }

      .brand h1 {
        margin: 0;
        font-size: 1.8rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .brand p,
      .muted,
      .meta,
      .small {
        color: var(--text-muted);
      }

      .brand p {
        margin: 6px 0 0;
      }

      .stack {
        display: grid;
        gap: 12px;
      }

      .status-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .label {
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: var(--text-muted);
      }

      .value {
        margin-top: 6px;
        font-size: 1.05rem;
        font-weight: 700;
      }

      .actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 14px;
      }

      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 11px 14px;
        border-radius: 14px;
        border: 1px solid var(--edge);
        color: var(--text);
        background:
          linear-gradient(150deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.05)),
          rgba(226, 236, 230, 0.86);
        box-shadow: 0 3px 8px rgba(18, 30, 24, 0.08);
        text-decoration: none;
      }

      .btn.primary {
        color: #fff;
        border-color: var(--accent);
        background: linear-gradient(145deg, #0b9461, var(--accent));
        box-shadow: 0 8px 14px rgba(0, 131, 81, 0.24);
      }

      .list {
        margin: 0;
        padding-left: 18px;
        color: var(--text-muted);
        line-height: 1.6;
      }

      .meta {
        font-family: "SF Mono", "JetBrains Mono", Consolas, monospace;
        font-size: 0.84rem;
      }

      @media (max-width: 760px) {
        .shell {
          padding: 12px;
        }

        .hero,
        .status-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <div class="stack">
          <div class="brand">
            <img src="/logo" alt="BECA" />
            <div>
              <h1>BECA</h1>
              <p>Desktop-first control, setup, and firmware management now lives in the BECA app.</p>
            </div>
          </div>
          <div class="muted">
            This built-in page is now a lightweight recovery surface so the ESP32 can spend more time
            on sensing, timing, BLE-MIDI, and audio.
          </div>
          <div class="actions">
            <a class="btn primary" href="/setup">Open Emergency Setup</a>
            <a class="btn" href="/api/info">View Device Info JSON</a>
            <a class="btn" href="/api/state">View State JSON</a>
          </div>
        </div>

        <div class="card">
          <div class="label">Recovery Notes</div>
          <ul class="list">
            <li>Use the BECA desktop app for normal control, setup, bridge, and updates.</li>
            <li>If Wi-Fi needs repair, open <code>/setup</code> from this device.</li>
            <li>If USB is connected, the BECA app can still manage flashing and Wi-Fi provisioning directly.</li>
          </ul>
        </div>
      </section>

      <section class="card">
        <div class="label">Current Device</div>
        <div class="status-grid">
          <div>
            <div class="label">Device Name</div>
            <div class="value" id="name">Loading...</div>
          </div>
          <div>
            <div class="label">Wi-Fi Mode</div>
            <div class="value" id="mode">Loading...</div>
          </div>
          <div>
            <div class="label">IP Address</div>
            <div class="value" id="ip">Loading...</div>
          </div>
          <div>
            <div class="label">Saved SSID</div>
            <div class="value" id="ssid">Loading...</div>
          </div>
        </div>
        <div class="actions">
          <button class="btn" id="refresh" type="button">Refresh Status</button>
          <span class="meta" id="hint">Waiting for device data...</span>
        </div>
      </section>
    </main>

    <script>
      const $ = (id) => document.getElementById(id);
      const fields = {
        name: $("name"),
        mode: $("mode"),
        ip: $("ip"),
        ssid: $("ssid"),
        hint: $("hint")
      };

      async function refreshInfo() {
        fields.hint.textContent = "Refreshing...";
        try {
          const info = await (await fetch("/api/info", { cache: "no-store" })).json();
          fields.name.textContent = info.name || "BECA";
          fields.mode.textContent = (info.mode || "--").toUpperCase();
          fields.ip.textContent = info.ip || "--";
          fields.ssid.textContent = info.ssid || "Not saved";
          if (info.wifi_error) {
            fields.hint.textContent = info.wifi_hint
              ? info.wifi_error + " " + info.wifi_hint
              : info.wifi_error;
          } else {
            fields.hint.textContent = "Device ready. Use the BECA desktop app for full control.";
          }
        } catch (err) {
          fields.hint.textContent = "Could not load device info. Try /setup if BECA is recovering.";
          fields.name.textContent = "Unavailable";
          fields.mode.textContent = "--";
          fields.ip.textContent = "--";
          fields.ssid.textContent = "--";
        }
      }

      $("refresh").addEventListener("click", refreshInfo);
      refreshInfo();
    </script>
  </body>
</html>

)BECA_UI_HTML";
