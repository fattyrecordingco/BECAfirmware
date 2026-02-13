// Auto-generated — do not edit by hand
#pragma once
#include <Arduino.h>

const char INDEX_HTML[] PROGMEM = R"BECA_UI_HTML(

<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>BECA - Plant Synth</title>
    <style>
      :root {
        color-scheme: light;
        --accent: #008351;
        --bg: #c7ddcf;
        --bg-soft: #d7e7dd;
        --surface: rgba(206, 222, 214, 0.22);
        --surface-strong: rgba(206, 222, 214, 0.32);
        --surface-soft: rgba(200, 216, 208, 0.26);
        --surface-sunk: rgba(192, 208, 201, 0.22);
        --edge: rgba(70, 96, 83, 0.24);
        --edge-strong: rgba(70, 96, 83, 0.38);
        --text: #1b2c23;
        --text-muted: rgba(27, 44, 35, 0.58);
        --shadow-base: 0 12px 26px rgba(18, 30, 24, 0.12);
        --shadow-green: 0 10px 22px rgba(0, 131, 81, 0.16);
        --glow: 0 0 18px rgba(0, 131, 81, 0.2);
        --radius: 22px;
        --radius-sm: 16px;
        --gap: 16px;
        --grid: rgba(0, 131, 81, 0.05);
        --glass-highlight: linear-gradient(
          135deg,
          rgba(255, 255, 255, 0.14),
          rgba(255, 255, 255, 0.04) 55%,
          rgba(255, 255, 255, 0) 78%
        );
        --glass-border: rgba(255, 255, 255, 0.2);
        --glass-noise: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='table' tableValues='0 0.08'/></feComponentTransfer></filter><rect width='160' height='160' filter='url(%23n)'/></svg>");
        --key-w: clamp(16px, 3.6vw, 22px);
        --key-h: clamp(50px, 7vw, 66px);
        --key-panel: var(--surface-sunk);
        --key-white: rgba(243, 249, 246, 0.68);
        --key-black: rgba(0, 131, 81, 0.72);
        --key-border: rgba(0, 131, 81, 0.45);
        --logo-filter: brightness(0) saturate(100%) invert(28%) sepia(62%) saturate(1220%)
          hue-rotate(113deg) brightness(90%) contrast(96%);
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0 auto;
        padding: clamp(14px, 2vw, 26px);
        min-height: 100vh;
        width: min(1460px, 100%);
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
      body::before {
        content: "";
        position: fixed;
        inset: -20% -20% -10% -20%;
        background:
          radial-gradient(40% 35% at 70% 18%, rgba(0, 131, 81, 0.14), transparent 60%),
          radial-gradient(36% 30% at 18% 80%, rgba(0, 131, 81, 0.12), transparent 65%);
        z-index: -2;
      }
      body::after {
        content: "";
        position: fixed;
        inset: 0;
        background-image:
          linear-gradient(var(--grid) 1px, transparent 1px),
          linear-gradient(90deg, var(--grid) 1px, transparent 1px);
        background-size: 28px 28px;
        opacity: 0.3;
        pointer-events: none;
        z-index: -1;
      }
      a {
        color: inherit;
        text-decoration: none;
      }
      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 4px 6px 18px;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .brand img {
        height: 34px;
        filter: var(--logo-filter) drop-shadow(0 0 10px rgba(0, 131, 81, 0.22));
      }
      .brand .title {
        font-size: 15px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--text);
        font-weight: 700;
      }
      .brand .sub {
        font-size: 12px;
        opacity: 0.7;
      }
      .top-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .pill {
        padding: 7px 14px;
        border: 1px solid var(--edge);
        border-radius: 999px;
        background:
          linear-gradient(150deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.03)),
          var(--surface-soft);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        box-shadow: 0 6px 12px rgba(0, 131, 81, 0.1);
        backdrop-filter: blur(16px) saturate(160%);
      }
      .status-pill::before {
        content: "";
        display: inline-block;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--accent);
        margin-right: 8px;
        box-shadow: 0 0 10px rgba(0, 131, 81, 0.35);
        vertical-align: middle;
      }
      .mono {
        font-family: "SF Mono", "JetBrains Mono", Consolas, monospace;
        letter-spacing: 0.01em;
      }
      .main-grid {
        display: grid;
        grid-template-columns: minmax(360px, 1.35fr) minmax(320px, 1fr);
        grid-template-areas:
          "io io"
          "music led";
        gap: var(--gap);
        align-items: stretch;
      }
      .panel {
        background: var(--surface);
        background-image: var(--glass-noise);
        background-size: 220px 220px;
        background-repeat: repeat;
        background-blend-mode: soft-light;
        border: 1px solid var(--edge-strong);
        border-radius: var(--radius);
        padding: 16px;
        box-shadow: var(--shadow-base), var(--shadow-green);
        position: relative;
        overflow: hidden;
        backdrop-filter: blur(24px) saturate(170%);
      }
      .panel::before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: var(--glass-highlight);
        pointer-events: none;
      }
      .panel::after {
        content: "";
        position: absolute;
        inset: 7px;
        border-radius: calc(var(--radius) - 7px);
        border: 1px solid var(--glass-border);
        pointer-events: none;
      }
      .panel-io {
        grid-area: io;
      }
      .panel-theory {
        grid-area: music;
      }
      .panel-led {
        grid-area: led;
      }
      .panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--edge);
      }
      .panel-title {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.2em;
        color: var(--text);
        font-weight: 700;
      }
      .panel-tag {
        display: none;
      }
      .subcard {
        background:
          var(--glass-noise),
          linear-gradient(155deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.03)),
          var(--surface-strong);
        background-size: 200px 200px, auto, auto;
        background-repeat: repeat;
        background-blend-mode: soft-light, normal, normal;
        border: 1px solid var(--edge);
        border-radius: var(--radius-sm);
        padding: 12px;
        box-shadow: 0 8px 14px rgba(0, 131, 81, 0.1), inset 0 0 0 1px rgba(255, 255, 255, 0.28);
        backdrop-filter: blur(18px) saturate(160%);
      }
      .module,
      .module-azure,
      .module-lilac,
      .module-olive,
      .module-butter,
      .module-salmon,
      .module-rose,
      .module-cyan,
      .module-mint {
        border-color: var(--edge);
        color: var(--text);
      }
      .stack {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .info-stack {
        display: grid;
        grid-template-rows: auto 1fr;
        gap: 12px;
      }
      .info-stack .subcard:last-child {
        min-height: 230px;
      }
      .io-grid {
        display: grid;
        grid-template-columns: minmax(320px, 1.25fr) minmax(260px, 0.85fr);
        gap: 12px;
        align-items: stretch;
      }
      .theory-grid,
      .led-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 12px;
      }
      .grid2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      .label {
        font-size: 12px;
        letter-spacing: 0.06em;
        opacity: 0.82;
        font-weight: 600;
      }
      .hdr {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      .val {
        font-variant-numeric: tabular-nums;
        font-family: "SF Mono", "JetBrains Mono", Consolas, monospace;
      }
      .ctrl {
        margin-top: 12px;
      }
      .btn,
      select,
      input[type="range"],
      input[type="checkbox"] {
        background:
          linear-gradient(150deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.03)),
          var(--surface-soft);
        color: var(--text);
        border: 1px solid var(--edge-strong);
        border-radius: 12px;
        padding: 10px 12px;
        font-family: inherit;
        font-size: 13px;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.28);
        backdrop-filter: blur(16px) saturate(160%);
      }
      select {
        width: 100%;
        appearance: none;
        background-image:
          linear-gradient(45deg, transparent 50%, var(--text) 50%),
          linear-gradient(135deg, var(--text) 50%, transparent 50%);
        background-position: calc(100% - 18px) 50%, calc(100% - 12px) 50%;
        background-size: 6px 6px, 6px 6px;
        background-repeat: no-repeat;
      }
      .select-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(10, 18, 14, 0.16);
        backdrop-filter: blur(16px) saturate(120%);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.15s ease;
        z-index: 90;
      }
      .select-backdrop.active {
        opacity: 1;
        pointer-events: auto;
      }
      body.select-open header,
      body.select-open main,
      body.select-open .utility-bar {
        filter: blur(2px) saturate(0.95);
      }
      .select-wrap {
        position: relative;
      }
      .select-native {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
      }
      .select-btn {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 12px;
        border: 1px solid var(--edge-strong);
        border-radius: 12px;
        background:
          linear-gradient(150deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.03)),
          var(--surface-soft);
        color: var(--text);
        font-family: inherit;
        font-size: 13px;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.28);
        cursor: pointer;
        backdrop-filter: blur(16px) saturate(160%);
      }
      .select-btn::after {
        content: "";
        width: 0;
        height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-top: 6px solid var(--text);
      }
      .select-wrap.open .select-btn {
        border-color: rgba(0, 131, 81, 0.45);
        box-shadow: 0 0 0 2px rgba(0, 131, 81, 0.16);
      }
      .select-list {
        position: fixed;
        max-height: 260px;
        overflow: auto;
        padding: 6px;
        border-radius: 12px;
        border: 1px solid var(--edge-strong);
        background:
          var(--glass-noise),
          linear-gradient(155deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.03)),
          var(--surface-strong);
        background-size: 200px 200px, auto, auto;
        background-repeat: repeat;
        box-shadow: 0 12px 24px rgba(0, 131, 81, 0.12);
        backdrop-filter: blur(18px) saturate(160%);
        z-index: 100;
        display: none;
      }
      .select-list.open {
        display: block;
      }
      .select-option {
        padding: 8px 10px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 13px;
        color: var(--text);
      }
      .select-option:hover {
        background: rgba(0, 131, 81, 0.12);
      }
      .select-option.selected {
        background: rgba(0, 131, 81, 0.18);
        font-weight: 600;
      }
      select:focus {
        outline: none;
        border-color: rgba(0, 131, 81, 0.45);
        box-shadow: 0 0 0 2px rgba(0, 131, 81, 0.16);
      }
      select option,
      select optgroup {
        background: rgba(210, 226, 218, 0.98);
        color: var(--text);
      }
      select option:checked {
        background: rgba(0, 131, 81, 0.18);
        color: var(--text);
      }
      input[type="range"] {
        width: 100%;
        height: 34px;
        -webkit-appearance: none;
        appearance: none;
        padding: 0;
        background: transparent;
      }
      input[type="range"]::-webkit-slider-runnable-track {
        height: 6px;
        background: linear-gradient(90deg, rgba(0, 131, 81, 0.3), rgba(0, 131, 81, 0.18));
        border-radius: 999px;
      }
      input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        margin-top: -6px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--accent);
        border: 1px solid rgba(255, 255, 255, 0.75);
        box-shadow: 0 0 10px rgba(0, 131, 81, 0.35);
      }
      input[type="checkbox"] {
        width: 18px;
        height: 18px;
        padding: 0;
      }
      .btn {
        cursor: pointer;
        transition: all 0.18s ease;
        text-align: center;
      }
      .btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 8px 16px rgba(0, 131, 81, 0.14);
      }
      .btn.trigger:active,
      .btn.trigger.pressed {
        transform: translateY(0);
        box-shadow: inset 0 3px 10px rgba(12, 22, 17, 0.25);
        filter: brightness(0.92);
      }
      .btn.ghost {
        padding: 8px 14px;
        border-radius: 999px;
      }
      .btn.accent {
        border-color: var(--accent-strong);
      }
      .icon-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
      }
      .icon svg {
        width: 100%;
        height: 100%;
      }
      .kv {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 6px 12px;
        font-size: 12px;
      }
      .kv .label {
        font-size: 10px;
        opacity: 0.6;
        letter-spacing: 0.08em;
      }
      .kbd {
        display: flex;
        gap: 2px;
        margin-top: 8px;
        padding: 10px;
        border-radius: 14px;
        border: 1px solid var(--edge-strong);
        background:
          var(--glass-noise),
          linear-gradient(160deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.03)),
          var(--key-panel);
        background-size: 190px 190px, auto, auto;
        background-repeat: repeat;
        background-blend-mode: soft-light, normal, normal;
        justify-content: center;
        min-height: calc(var(--key-h) + 16px);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.24), 0 6px 12px rgba(0, 131, 81, 0.08);
        backdrop-filter: blur(16px) saturate(160%);
      }
      .key {
        width: var(--key-w);
        height: var(--key-h);
        border: 1px solid var(--key-border);
        background: var(--key-white);
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
      }
      .key.white {
        background: var(--key-white);
      }
      .key.black {
        background: var(--key-black);
        height: calc(var(--key-h) * 0.62);
        margin-left: calc(var(--key-w) * -0.48);
        margin-right: calc(var(--key-w) * -0.48);
        z-index: 2;
        width: calc(var(--key-w) * 0.88);
        border-color: var(--key-border);
      }
      .key.sel {
        outline: 2px solid var(--accent);
        box-shadow: 0 0 12px rgba(0, 131, 81, 0.35);
      }
      #osc,
      #notegrid {
        width: 100%;
        border-radius: 12px;
        border: 1px solid var(--edge-strong);
        background:
          var(--glass-noise),
          linear-gradient(160deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.03)),
          radial-gradient(120% 120% at 12% 18%, rgba(0, 131, 81, 0.08), transparent 62%),
          var(--surface-sunk);
        background-size: 200px 200px, auto, auto, auto;
        background-repeat: repeat;
        background-blend-mode: soft-light, normal, normal, normal;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22), inset 0 10px 18px rgba(15, 26, 20, 0.12);
        backdrop-filter: blur(16px) saturate(160%);
      }
      #osc {
        height: 160px;
      }
      #notegrid {
        height: 120px;
        margin-top: 6px;
      }
      .small {
        font-size: 11px;
        opacity: 0.75;
      }
      /* ---- Drum UI ---- */
      #drumWrap {
        margin-top: 12px;
      }
      .hidden {
        display: none !important;
      }
      #drumWrap.tight {
        margin-top: 0;
      }
      .drumTitle {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 8px;
      }
      .drumGrid {
        display: grid;
        grid-template-columns: repeat(8, 1fr);
        gap: 10px;
        margin-top: 10px;
        align-items: center;
      }
      .dSel {
        display: flex;
        justify-content: center;
        align-items: center;
      }
      .dSel input {
        width: 18px;
        height: 18px;
        accent-color: var(--accent);
      }
      .dBox {
        height: 56px;
        border-radius: 14px;
        border: 2px solid rgba(0, 131, 81, 0.38);
        background:
          linear-gradient(150deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.05)),
          var(--surface-soft);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.24), 0 5px 10px rgba(0, 131, 81, 0.1);
        transition: all 0.08s;
      }
      .dBox.hit {
        border-color: rgba(0, 131, 81, 0.75);
        box-shadow: 0 0 14px rgba(0, 131, 81, 0.22), inset 0 0 0 1px rgba(0, 131, 81, 0.3);
        background: rgba(0, 131, 81, 0.16);
      }
      .dLab {
        text-align: center;
        font-size: 11px;
        opacity: 0.75;
        margin-top: -4px;
        font-family: "SF Mono", "JetBrains Mono", Consolas, monospace;
        white-space: pre-line;
      }
      .utility-bar {
        margin-top: 16px;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        align-items: center;
      }
      .toggle {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border: 1px solid var(--edge-strong);
        border-radius: 16px;
        background:
          linear-gradient(155deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.06)),
          var(--surface-strong);
        min-width: 180px;
        box-shadow: 0 6px 12px rgba(0, 131, 81, 0.1);
        backdrop-filter: blur(16px) saturate(160%);
      }
      .toggle input {
        display: none;
      }
      .switch {
        width: 44px;
        height: 24px;
        border-radius: 999px;
        background: rgba(222, 235, 228, 0.6);
        border: 1px solid rgba(0, 131, 81, 0.45);
        position: relative;
        transition: all 0.2s ease;
        flex-shrink: 0;
      }
      .switch::after {
        content: "";
        position: absolute;
        width: 18px;
        height: 18px;
        left: 2px;
        top: 2px;
        border-radius: 50%;
        background: rgba(242, 248, 245, 0.85);
        transition: all 0.2s ease;
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08);
      }
      .toggle input:checked + .switch {
        background: rgba(0, 131, 81, 0.22);
        border-color: rgba(0, 131, 81, 0.6);
      }
      .toggle input:checked + .switch::after {
        left: 24px;
        background: var(--accent);
      }
      .toggle-label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        opacity: 0.85;
      }
      .toggle-val {
        margin-left: auto;
        font-size: 11px;
        opacity: 0.8;
      }
      .utility-bar .btn,
      .utility-bar .toggle {
        width: 100%;
      }
      body.ui-muted main {
        opacity: 0.55;
        filter: grayscale(0.2);
        pointer-events: none;
      }
      body.ui-muted .utility-bar {
        pointer-events: auto;
      }
      body.ui-muted .utility-bar .toggle:not(.mute-toggle):not(.transport-toggle),
      body.ui-muted #rnd {
        opacity: 0.4;
        pointer-events: none;
      }
      body.ui-muted #status {
        border-color: rgba(0, 131, 81, 0.4);
        color: #8b5a35;
      }
      @media (max-width: 1200px) {
        .main-grid {
          grid-template-columns: 1fr;
          grid-template-areas:
            "io"
            "music"
            "led";
        }
      }
      @media (max-width: 900px) {
        .io-grid {
          grid-template-columns: 1fr;
        }
        .topbar {
          flex-direction: column;
          align-items: flex-start;
        }
        .top-actions {
          width: 100%;
          justify-content: space-between;
        }
      }
      @media (max-width: 640px) {
        .brand .title {
          font-size: 14px;
          letter-spacing: 0.14em;
        }
        .panel {
          padding: 14px;
        }
        .grid2 {
          grid-template-columns: 1fr;
        }
        .kbd {
          justify-content: flex-start;
          overflow-x: auto;
        }
      }
    </style>
  </head>
  <body>
    <header class="topbar">
      <div class="brand">
        <img src="/logo" alt="BECA" />
        <div>
          <div class="title">BECA Plant Synth</div>
          <div class="sub">Fatty Recording Co.</div>
        </div>
      </div>
      <div class="top-actions">
        <a class="btn ghost icon-btn" href="/setup" aria-label="Settings">
          <span class="icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M19.4 15a1.6 1.6 0 0 0 .32 1.76l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.76-.32 1.6 1.6 0 0 0-1 1.46V22a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.46 1.6 1.6 0 0 0-1.76.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.6 1.6 0 0 0 4.6 15a1.6 1.6 0 0 0-1.46-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.46-1 1.6 1.6 0 0 0-.32-1.76l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.6 1.6 0 0 0 8.4 4.6a1.6 1.6 0 0 0 1-1.46V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.46 1.6 1.6 0 0 0 1.76-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.6 1.6 0 0 0 19.4 9a1.6 1.6 0 0 0 1.46 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.46 1Z" />
            </svg>
          </span>
          <span>Settings</span>
        </a>
        <div id="status" class="pill mono status-pill">connecting...</div>
      </div>
    </header>

    <main class="main-grid">
      <section class="panel panel-io">
        <div class="panel-head">
          <div class="panel-title">Input / Output</div>
          
        </div>
        <div class="io-grid">
          <div class="stack info-stack">
            <div class="subcard module module-azure">
              <div class="hdr">
                <div class="label">Plant</div>
              </div>
              <canvas id="osc" width="900" height="160"></canvas>
            </div>

            <div class="subcard module module-lilac">
              <div id="noteWrap">
                <div class="hdr">
                  <div class="label">Note Grid</div>
                  <div class="small mono" id="gridLab">--</div>
                </div>
                <canvas id="notegrid" width="900" height="130"></canvas>
              </div>

              <div id="drumWrap" class="hidden">
                <div class="drumTitle">
                  <div class="label">Drum Kit</div>
                  <div class="small mono" id="drumLab">--</div>
                </div>
                <div class="drumGrid" id="drumSelRow"></div>
                <div class="drumGrid" id="drumHitRow" style="margin-top: 8px"></div>
                <div class="drumGrid" id="drumNameRow" style="margin-top: 6px"></div>
              </div>
            </div>
          </div>

          <div class="stack">
            <div class="subcard module module-butter">
              <div class="ctrl" style="margin-top: 0">
                <div class="hdr">
                  <div class="label">Sensitivity</div>
                  <div class="val mono" id="sensVal">--</div>
                </div>
                <input
                  id="sensRange"
                  type="range"
                  min="0.00"
                  max="0.50"
                  step="0.05"
                />
              </div>
            </div>

            <div class="subcard module module-olive">
              <div class="hdr" style="margin-bottom: 8px">
                <div class="label">Info Snapshot</div>
              </div>
              <div class="kv mono">
                <div class="label">MIDI:</div>
                <div id="ble">--</div>
                <div class="label">Clock:</div>
                <div id="clock">--</div>
                <div class="label">Mode:</div>
                <div id="modeLab">--</div>
                <div class="label">Scale:</div>
                <div id="scaleLab">--</div>
                <div class="label">Root:</div>
                <div id="rootLab">--</div>
                <div class="label">BPM:</div>
                <div id="bpmLab">--</div>
                <div class="label">Swing:</div>
                <div id="swingLab">--</div>
                <div class="label">Brightness:</div>
                <div id="brightLab">--</div>
                <div class="label">Sensitivity:</div>
                <div id="sensLab">--</div>
                <div class="label">Effect:</div>
                <div id="fxLab">--</div>
                <div class="label">Palette:</div>
                <div id="palLab">--</div>
                <div class="label">Oct Range:</div>
                <div id="octLab">--</div>
                <div class="label">Time Sig:</div>
                <div id="tsLab">--</div>
                <div class="label">Last:</div>
                <div id="lastLab">--</div>
                <div class="label">Velocity:</div>
                <div id="velLab">--</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="panel panel-theory">
        <div class="panel-head">
          <div class="panel-title">Music</div>
          
        </div>
        <div class="theory-grid">
          <div class="subcard module module-salmon">
            <div class="grid2">
              <div>
                <div class="label">Mode</div>
                <select id="mode">
                  <option value="0">Notes</option>
                  <option value="1">Arpeggiator</option>
                  <option value="2">Chords</option>
                  <option value="3">Drum Machine</option>
                </select>
              </div>
              <div>
                <div class="label">Clock</div>
                <select id="clockSel">
                  <option value="1">Plant</option>
                  <option value="0">Internal</option>
                </select>
              </div>
            </div>

            <div class="label" style="margin-top: 12px">Scale</div>
            <select id="scale">
              <option value="0">Major</option>
              <option value="1">Minor</option>
              <option value="2">Dorian</option>
              <option value="3">Lydian</option>
              <option value="4">Mixolydian</option>
              <option value="5">Pent Minor</option>
              <option value="6">Pent Major</option>
              <option value="7">Harm Minor</option>
              <option value="8">Phrygian</option>
              <option value="9">Whole Tone</option>
              <option value="10">Maj7</option>
              <option value="11">Min7</option>
              <option value="12">Dom7</option>
              <option value="13">Sus2</option>
              <option value="14">Sus4</option>
            </select>

            <div class="label" style="margin-top: 12px">Root (piano)</div>
            <div id="piano" class="kbd"></div>
          </div>

          <div class="subcard module module-rose">
            <div class="ctrl" style="margin-top: 0">
              <div class="hdr">
                <div class="label">Tempo</div>
                <div class="val mono" id="bpmVal">--</div>
              </div>
              <input id="bpmRange" type="range" min="20" max="240" step="5" />
            </div>
            <div class="ctrl">
              <div class="hdr">
                <div class="label">Swing</div>
                <div class="val mono" id="swingVal">--</div>
              </div>
              <input id="swingRange" type="range" min="0" max="60" step="1" />
            </div>
            <div class="ctrl">
              <div class="hdr">
                <div class="label">Rest</div>
                <div class="val mono" id="restVal">--</div>
              </div>
              <input id="rest" type="range" min="0" max="80" step="1" />
            </div>
            <div class="grid2">
              <div class="ctrl">
                <div class="hdr">
                  <div class="label">Low Oct</div>
                  <div class="val mono" id="loVal">--</div>
                </div>
                <input id="loct" type="range" min="0" max="9" step="1" />
              </div>
              <div class="ctrl">
                <div class="hdr">
                  <div class="label">High Oct</div>
                  <div class="val mono" id="hiVal">--</div>
                </div>
                <input id="hoct" type="range" min="0" max="9" step="1" />
              </div>
            </div>
            <div class="ctrl">
              <div class="hdr">
                <div class="label">Time Signature</div>
                <div class="val mono" id="tsVal">--</div>
              </div>
              <select id="tsSel">
                <option value="1-1">1/1</option>
                <option value="2-2">2/2</option>
                <option value="2-4">2/4</option>
                <option value="3-4">3/4</option>
                <option value="4-4" selected>4/4</option>
                <option value="5-4">5/4</option>
                <option value="7-4">7/4</option>
                <option value="6-8">6/8</option>
                <option value="9-8">9/8</option>
                <option value="12-8">12/8</option>
                <option value="4-8">4/8</option>
                <option value="4-16">4/16</option>
                <option value="8-32">8/32</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      <section class="panel panel-led">
        <div class="panel-head">
          <div class="panel-title">LED</div>
          
        </div>
        <div class="led-grid">
          <div class="subcard module module-cyan">
            <div class="ctrl" style="margin-top: 0">
              <div class="hdr">
                <div class="label">Effect</div>
                <div class="val mono" id="fxVal">--</div>
              </div>
              <select id="effect"></select>
            </div>
            <div class="ctrl">
              <div class="hdr">
                <div class="label">Palette</div>
                <div class="val mono" id="palVal">--</div>
              </div>
              <select id="palette"></select>
            </div>
          </div>

          <div class="subcard module module-mint">
            <div class="ctrl" style="margin-top: 0">
              <div class="hdr">
                <div class="label">Brightness</div>
                <div class="val mono" id="brightVal">--</div>
              </div>
              <input id="brightRange" type="range" min="10" max="255" step="1" />
            </div>
            <div class="ctrl">
              <div class="hdr">
                <div class="label">Visual Speed</div>
                <div class="val mono" id="vsVal">--</div>
              </div>
              <input id="visSpd" type="range" min="0" max="255" step="1" />
            </div>
            <div class="ctrl">
              <div class="hdr">
                <div class="label">Visual Intensity</div>
                <div class="val mono" id="viVal">--</div>
              </div>
              <input id="visInt" type="range" min="0" max="255" step="1" />
            </div>
          </div>
        </div>
      </section>
    </main>

    <div class="utility-bar">
      <label class="toggle module module-olive">
        <input id="norep" type="checkbox" />
        <span class="switch"></span>
        <span class="toggle-label">
          <span class="icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 0 1 15.2-6.2" />
              <path d="M18 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-15.2 6.2" />
              <path d="M6 21v-5h5" />
            </svg>
          </span>
          Avoid repeat
        </span>
        <span class="toggle-val mono" id="nrVal">--</span>
      </label>

      <button id="rnd" class="btn accent icon-btn module module-butter trigger">
        <span class="icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
            <circle cx="8.5" cy="8.5" r="1.2" />
            <circle cx="15.5" cy="15.5" r="1.2" />
            <circle cx="15.5" cy="8.5" r="1.2" />
            <circle cx="8.5" cy="15.5" r="1.2" />
            <circle cx="12" cy="12" r="1.2" />
          </svg>
        </span>
        Randomize
      </button>

      <label class="toggle transport-toggle module module-cyan">
        <input id="midiMode" type="checkbox" />
        <span class="switch"></span>
        <span class="toggle-label">
          <span class="icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 7h8" />
              <path d="M8 12h8" />
              <path d="M8 17h8" />
              <rect x="3" y="4" width="4" height="16" rx="1.5" />
              <rect x="17" y="4" width="4" height="16" rx="1.5" />
            </svg>
          </span>
          MIDI Link
        </span>
        <span class="toggle-val mono" id="midiModeVal">BLE</span>
      </label>

      <label class="toggle mute-toggle module module-rose">
        <input id="mute" type="checkbox" />
        <span class="switch"></span>
        <span class="toggle-label">
          <span class="icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3v9" />
              <path d="M7.5 5.5a7 7 0 1 0 9 0" />
            </svg>
          </span>
          Mute I/O
        </span>
        <span class="toggle-val mono" id="muteVal">OFF</span>
      </label>
    </div>

    <script>
      const $ = (id) => document.getElementById(id);

      const status = $("status");
      const ble = $("ble");
      const clock = $("clock");
      const modeLab = $("modeLab");
      const scaleLab = $("scaleLab");
      const rootLab = $("rootLab");
      const bpmLab = $("bpmLab");
      const swingLab = $("swingLab");
      const brightLab = $("brightLab");
      const sensLab = $("sensLab");
      const fxLab = $("fxLab");
      const palLab = $("palLab");
      const octLab = $("octLab");
      const tsLab = $("tsLab");
      const lastLab = $("lastLab");
      const velLab = $("velLab");

      const mode = $("mode");
      const clockSel = $("clockSel");
      const scale = $("scale");
      const tsSel = $("tsSel");

      const bpmRange = $("bpmRange");
      const swingRange = $("swingRange");
      const brightRange = $("brightRange");
      const sensRange = $("sensRange");
      const loct = $("loct");
      const hoct = $("hoct");

      const effect = $("effect");
      const palette = $("palette");

      const visSpd = $("visSpd");
      const visInt = $("visInt");
      const rest = $("rest");
      const norep = $("norep");
      const rnd = $("rnd");
      const midiMode = $("midiMode");
      const midiModeVal = $("midiModeVal");
      const mute = $("mute");
      const muteVal = $("muteVal");

      const bpmVal = $("bpmVal");
      const swingVal = $("swingVal");
      const brightVal = $("brightVal");
      const sensVal = $("sensVal");
      const loVal = $("loVal");
      const hiVal = $("hiVal");
      const fxVal = $("fxVal");
      const palVal = $("palVal");
      const vsVal = $("vsVal");
      const viVal = $("viVal");
      const restVal = $("restVal");
      const nrVal = $("nrVal");
      const tsVal = $("tsVal");

      const osc = $("osc");
      const ctx = osc.getContext("2d");
      const N = 220;
      const GRID_BG = "rgba(205, 222, 214, 0.22)";
      const GRID_LINE = "rgba(0, 131, 81, 0.12)";
      const GRID_TEXT = "rgba(27, 44, 35, 0.7)";
      const NOTE_RGB = "0,131,81";
      const SCOPE_LINE = "rgba(0, 131, 81, 0.9)";

      let plantA = new Array(N).fill(0);
      let uiMuted = false;
      let isDrumMode = false;
      let lastNoteState = { list: [], vel: 96, held: false };
      let oscW = 0;
      let oscH = 0;
      let noteW = 0;
      let noteH = 0;
      let resizeTimer = null;

      const DPR = Math.min(window.devicePixelRatio || 1, 2);

      function resizeCanvas(canvas, ctxRef) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return false;
        const w = Math.round(rect.width * DPR);
        const h = Math.round(rect.height * DPR);
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        ctxRef.setTransform(DPR, 0, 0, DPR, 0, 0);
        return { w: rect.width, h: rect.height };
      }

      function resizeOsc() {
        const size = resizeCanvas(osc, ctx);
        if (!size) return false;
        oscW = size.w;
        oscH = size.h;
        return true;
      }

      function resizeNoteGrid() {
        const size = resizeCanvas(noteGrid, ng);
        if (!size) return false;
        noteW = size.w;
        noteH = size.h;
        return true;
      }

      function resizeAll() {
        const oscChanged = resizeOsc();
        const noteChanged = resizeNoteGrid();
        if (oscChanged && plantA.length) {
          grid();
          line(plantA, SCOPE_LINE, 1.0);
        }
        if (noteChanged && !isDrumMode) {
          drawNoteGridMulti(lastNoteState.list, lastNoteState.vel, lastNoteState.held);
        }
      }


      function grid() {
        const w = oscW || osc.clientWidth,
          h = oscH || osc.clientHeight;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = GRID_BG;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = GRID_LINE;
        ctx.lineWidth = 1;
        for (let i = 0; i <= 8; i++) {
          const y = i * (h / 8);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
        for (let j = 0; j <= 12; j++) {
          const x = j * (w / 12);
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
      }
      function line(arr, col, maxv) {
        const w = oscW || osc.clientWidth,
          h = oscH || osc.clientHeight;
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < arr.length; i++) {
          const X = i * (w / (N - 1));
          const Y = h - Math.min(arr[i] / maxv, 1) * h;
          if (!i) ctx.moveTo(X, Y);
          else ctx.lineTo(X, Y);
        }
        ctx.stroke();
      }
      function setVal(el, v) {
        if (el) el.textContent = v;
      }

      const debouncers = {};
      function sendNow(url, allowWhenMuted = false) {
        if (uiMuted && !allowWhenMuted) return;
        fetch(url, { cache: "no-store" }).catch(() => {});
      }
      function debouncedSend(key, url, delay = 90, allowWhenMuted = false) {
        if (uiMuted && !allowWhenMuted) return;
        if (debouncers[key]) clearTimeout(debouncers[key]);
        debouncers[key] = setTimeout(() => sendNow(url, allowWhenMuted), delay);
      }

      const lastState = {};
      function setTextIfChanged(el, v, key) {
        if (lastState[key] === v) return;
        lastState[key] = v;
        if (el) el.textContent = v;
      }
      function setValueIfChanged(el, v, key) {
        if (lastState[key] === v) return;
        lastState[key] = v;
        if (el) el.value = v;
      }
      function setCheckedIfChanged(el, v, key) {
        const val = !!v;
        if (lastState[key] === val) return;
        lastState[key] = val;
        if (el) el.checked = val;
      }

      const MODE_NAMES = ["Notes", "Arpeggiator", "Chords", "Drum Machine"];
      const SCALE_NAMES = [
        "Major",
        "Minor",
        "Dorian",
        "Lydian",
        "Mixolydian",
        "Pent Minor",
        "Pent Major",
        "Harm Minor",
        "Phrygian",
        "Whole Tone",
        "Maj7",
        "Min7",
        "Dom7",
        "Sus2",
        "Sus4",
      ];
      const NOTE_NAMES = [
        "C",
        "C#",
        "D",
        "D#",
        "E",
        "F",
        "F#",
        "G",
        "G#",
        "A",
        "A#",
        "B",
      ];

      function updatePianoSel(semi) {
        const piano = $("piano");
        [...piano.children].forEach((k, i) =>
          k.classList.toggle("sel", i === semi),
        );
      }

      let selectPortal = null;
      let selectBackdrop = null;
      let activeSelect = null;
      let activeSelectBtn = null;

      function syncCustomSelect(sel) {
        const wrap = sel.closest(".select-wrap");
        if (!wrap) return;
        const label = wrap.querySelector(".select-text");
        const text = sel.options[sel.selectedIndex]
          ? sel.options[sel.selectedIndex].text
          : "";
        if (label) label.textContent = text;
        if (activeSelect === sel && selectPortal) {
          selectPortal
            .querySelectorAll(".select-option")
            .forEach((opt) =>
              opt.classList.toggle("selected", opt.dataset.value === sel.value),
            );
        }
      }

      function ensureSelectPortal() {
        if (selectPortal) return;
        selectPortal = document.createElement("div");
        selectPortal.className = "select-list";
        document.body.appendChild(selectPortal);

        selectBackdrop = document.createElement("div");
        selectBackdrop.className = "select-backdrop";
        document.body.appendChild(selectBackdrop);
        selectBackdrop.addEventListener("click", closeSelectPortal);

        window.addEventListener("resize", positionSelectPortal);
        window.addEventListener("scroll", positionSelectPortal, true);
      }

      function buildPortalOptions(sel) {
        if (!selectPortal) return;
        selectPortal.innerHTML = "";
        [...sel.options].forEach((opt) => {
          const row = document.createElement("div");
          row.className = "select-option";
          row.dataset.value = opt.value;
          row.textContent = opt.text;
          if (opt.disabled) row.style.opacity = "0.5";
          if (opt.selected) row.classList.add("selected");
          row.addEventListener("click", () => {
            sel.value = opt.value;
            sel.dispatchEvent(new Event("change", { bubbles: true }));
            closeSelectPortal();
          });
          selectPortal.appendChild(row);
        });
      }

      function openSelectPortal(sel, btn) {
        ensureSelectPortal();
        activeSelect = sel;
        activeSelectBtn = btn;
        buildPortalOptions(sel);
        positionSelectPortal();
        selectPortal.classList.add("open");
        selectBackdrop.classList.add("active");
        document.body.classList.add("select-open");
        const wrap = sel.closest(".select-wrap");
        if (wrap) wrap.classList.add("open");
      }

      function closeSelectPortal() {
        if (!selectPortal) return;
        selectPortal.classList.remove("open");
        selectBackdrop.classList.remove("active");
        document.body.classList.remove("select-open");
        if (activeSelect) {
          const wrap = activeSelect.closest(".select-wrap");
          if (wrap) wrap.classList.remove("open");
        }
        activeSelect = null;
        activeSelectBtn = null;
      }

      function positionSelectPortal() {
        if (!selectPortal || !activeSelectBtn) return;
        const rect = activeSelectBtn.getBoundingClientRect();
        const left = Math.max(12, rect.left);
        const width = Math.min(rect.width, window.innerWidth - 24);
        const top = rect.bottom + 8;
        const maxHeight = Math.max(160, window.innerHeight - top - 16);
        selectPortal.style.left = left + "px";
        selectPortal.style.top = top + "px";
        selectPortal.style.width = width + "px";
        selectPortal.style.maxHeight = maxHeight + "px";
      }

      function buildCustomSelect(sel) {
        const existing = sel.closest(".select-wrap");
        let wrap = existing;
        let btn;
        let label;

        if (!wrap) {
          wrap = document.createElement("div");
          wrap.className = "select-wrap";

          btn = document.createElement("button");
          btn.type = "button";
          btn.className = "select-btn";
          label = document.createElement("span");
          label.className = "select-text";
          btn.appendChild(label);

          sel.parentNode.insertBefore(wrap, sel);
          wrap.appendChild(btn);
          wrap.appendChild(sel);
          sel.classList.add("select-native");

          btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (activeSelect === sel) {
              closeSelectPortal();
            } else {
              openSelectPortal(sel, btn);
            }
          });

          sel.addEventListener("change", () => syncCustomSelect(sel));
        } else {
          btn = wrap.querySelector(".select-btn");
          label = wrap.querySelector(".select-text");
          if (btn && !label) {
            label = document.createElement("span");
            label.className = "select-text";
            btn.appendChild(label);
          }
        }

        syncCustomSelect(sel);
      }

      function initCustomSelects() {
        document.querySelectorAll("select").forEach((sel) => buildCustomSelect(sel));
        document.addEventListener("click", () => {
          closeSelectPortal();
        });
        document.addEventListener("keydown", (e) => {
          if (e.key === "Escape") closeSelectPortal();
        });
      }

      // ---- MIDI NOTE GRID ----
      const gridLab = $("gridLab");
      const noteWrap = $("noteWrap");
      const noteGrid = $("notegrid");
      const ng = noteGrid.getContext("2d");

      const GRID_COLS = 12;
      const GRID_ROWS = 8;

      function noteName(m) {
        const semi = ((m % 12) + 12) % 12;
        const oct = Math.floor(m / 12) - 1;
        return NOTE_NAMES[semi] + oct;
      }

      function drawNoteGridMulti(midiList, vel, held) {
        const w = noteW || noteGrid.clientWidth,
          h = noteH || noteGrid.clientHeight;
        if (w < 2 || h < 2) return;
        ng.clearRect(0, 0, w, h);

        ng.fillStyle = GRID_BG;
        ng.fillRect(0, 0, w, h);

        const pad = 10;
        const gx = pad,
          gy = pad;
        const gw = w - pad * 2,
          gh = h - pad * 2;

        const cellW = gw / GRID_COLS;
        const cellH = gh / GRID_ROWS;

        ng.strokeStyle = GRID_LINE;
        ng.lineWidth = 1;
        for (let r = 0; r <= GRID_ROWS; r++) {
          const y = gy + r * cellH;
          ng.beginPath();
          ng.moveTo(gx, y);
          ng.lineTo(gx + gw, y);
          ng.stroke();
        }
        for (let c = 0; c <= GRID_COLS; c++) {
          const x = gx + c * cellW;
          ng.beginPath();
          ng.moveTo(x, gy);
          ng.lineTo(x, gy + gh);
          ng.stroke();
        }

        ng.fillStyle = GRID_TEXT;
        ng.font = "12px JetBrains Mono, Consolas, monospace";
        for (let c = 0; c < 12; c++) {
          ng.fillText(NOTE_NAMES[c], gx + c * cellW + 6, gy - 2);
        }

        const a = held ? 1.0 : 0.6;
        const v = Math.max(0, Math.min(127, vel | 0)) / 127;

        midiList.forEach((midi) => {
          let m = Math.max(12, Math.min(119, midi | 0));
          let idx = m - 12;
          let semi = idx % 12;
          let oct = Math.floor(idx / 12);
          if (oct > 7) oct = 7;

          const x = gx + semi * cellW;
          const y = gy + (GRID_ROWS - 1 - oct) * cellH;

          ng.fillStyle = `rgba(${NOTE_RGB},${0.16 * a + 0.45 * a * v})`;
          ng.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);

          ng.strokeStyle = `rgba(${NOTE_RGB},${0.6 * a})`;
          ng.lineWidth = 2;
          ng.strokeRect(x + 2, y + 2, cellW - 4, cellH - 4);
        });

        if (!midiList.length) {
          gridLab.textContent = "--";
        } else {
          const names = midiList.slice(0, 6).map(noteName).join(" ");
          gridLab.textContent = `${held ? "HOLD" : "hit"} | ${names}${midiList.length > 6 ? " ..." : ""} | vel ${vel | 0}`;
        }
      }
      // ---- DRUM UI ----
      const drumWrap = $("drumWrap");
      const drumLab = $("drumLab");
      const drumSelRow = $("drumSelRow");
      const drumHitRow = $("drumHitRow");
      const drumNameRow = $("drumNameRow");

      const DRUM_NAMES = [
        "kick",
        "snare",
        "closed\nhihat",
        "open\nhihat",
        "tom1",
        "tom2",
        "ride",
        "crash",
      ];
      let drumSelMask = 0xff;
      let lastDrumSelMask = null;
      let lastDrumHitMask = null;

      const drumSelChecks = [];
      const drumHitBoxes = [];

      function buildDrumUI() {
        drumSelRow.innerHTML = "";
        drumHitRow.innerHTML = "";
        drumNameRow.innerHTML = "";

        for (let i = 0; i < 8; i++) {
          const s = document.createElement("div");
          s.className = "dSel";
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = true;
          cb.onchange = () => {
            drumSelMask = 0;
            for (let k = 0; k < 8; k++) {
              if (drumSelChecks[k].checked) drumSelMask |= 1 << k;
            }
            debouncedSend("drumsel", "/drumsel?mask=" + drumSelMask, 30);
            drumLab.textContent = "enabled: " + drumSelMask;
          };
          s.appendChild(cb);
          drumSelRow.appendChild(s);
          drumSelChecks.push(cb);

          const b = document.createElement("div");
          b.className = "dBox";
          drumHitRow.appendChild(b);
          drumHitBoxes.push(b);

          const l = document.createElement("div");
          l.className = "dLab";
          l.textContent = DRUM_NAMES[i];
          drumNameRow.appendChild(l);
        }
      }

      function applyDrumSelMask(mask) {
        const next = mask & 255;
        if (lastDrumSelMask === next) return;
        lastDrumSelMask = next;
        drumSelMask = next;
        for (let i = 0; i < 8; i++) {
          drumSelChecks[i].checked = !!(drumSelMask & (1 << i));
        }
        drumLab.textContent = "enabled: " + drumSelMask;
      }

      function applyDrumHitMask(hitMask) {
        const next = hitMask & 255;
        if (lastDrumHitMask === next) return;
        lastDrumHitMask = next;
        for (let i = 0; i < 8; i++) {
          drumHitBoxes[i].classList.toggle("hit", !!(next & (1 << i)));
        }
      }

      let scopeRaf = null;
      let noteRaf = null;
      let pendingNote = null;

      function scheduleScopeDraw() {
        if (scopeRaf) return;
        scopeRaf = requestAnimationFrame(() => {
          scopeRaf = null;
          if (!oscW || !oscH) resizeOsc();
          if (oscW && oscH) {
            grid();
            line(plantA, SCOPE_LINE, 1.0);
          }
        });
      }

      function scheduleNoteDraw(list, vel, held) {
        if (isDrumMode) return;
        pendingNote = { list, vel, held };
        if (noteRaf) return;
        noteRaf = requestAnimationFrame(() => {
          noteRaf = null;
          if (isDrumMode) return;
          if (!noteW || !noteH) resizeNoteGrid();
          if (pendingNote) {
            lastNoteState = pendingNote;
            drawNoteGridMulti(pendingNote.list, pendingNote.vel, pendingNote.held);
          }
        });
      }

      function setUiMuted(on) {
        uiMuted = !!on;
        document.body.classList.toggle("ui-muted", uiMuted);
        setVal(muteVal, uiMuted ? "ON" : "OFF");
        if (uiMuted) status.textContent = "muted";
      }

      // ---- Boot UI ----
      (async () => {
        try {
          const E = await (
            await fetch("/effects", { cache: "force-cache" })
          ).json();
          const P = await (
            await fetch("/palettes", { cache: "force-cache" })
          ).json();

          (E.list || []).forEach((name, idx) => {
            const o = document.createElement("option");
            o.value = idx;
            o.textContent = name;
            effect.appendChild(o);
          });
          (P.list || []).forEach((name, idx) => {
            const o = document.createElement("option");
            o.value = idx;
            o.textContent = name;
            palette.appendChild(o);
          });

          const piano = $("piano");
          for (let i = 0; i < 12; i++) {
            const isBlack = NOTE_NAMES[i].includes("#");
            const div = document.createElement("div");
            div.className = "key " + (isBlack ? "black" : "white");
            div.title = NOTE_NAMES[i];
            div.onclick = () => {
              sendNow("/root?semi=" + i);
              updatePianoSel(i);
            };
            piano.appendChild(div);
          }

          buildDrumUI();
          resizeAll();

          grid();
          drawNoteGridMulti([], 96, false);
        } catch (e) {
          status.textContent = "ui error";
        }
        initCustomSelects();
        window.addEventListener("resize", () => {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(resizeAll, 120);
        });
        setTimeout(resizeAll, 200);
      })();

      // SSE stream
      const es = new EventSource("/events");

      es.addEventListener("hello", () => {
        if (!uiMuted) status.textContent = "ok";
      });

      es.onerror = () => {
        if (!uiMuted) status.textContent = "reconnecting...";
      };

      es.addEventListener("state", (e) => {
        const j = JSON.parse(e.data);
        if (!uiMuted) status.textContent = "ok";

        const midiSerial = (j.midimode | 0) === 1;
        const bleVal = midiSerial ? "serial bridge" : (j.ble ? "connected" : "--");
        const clockVal = j.clock ? "Plant" : "Internal";
        const modeName = MODE_NAMES[j.mode] || "--";
        const scaleName = SCALE_NAMES[j.scale] || "--";
        const rootName = NOTE_NAMES[j.root] || "--";
        const sensStr = (+j.sens).toFixed(2);
        const fxName = j.fxname || "--";
        const palName = j.palname || "--";
        const octStr = "C" + j.lo + " .. C" + j.hi;
        const tsStr = j.ts;
        const lastStr = j.last || "--";

        setTextIfChanged(ble, bleVal, "ble");
        setTextIfChanged(clock, clockVal, "clock");
        setTextIfChanged(modeLab, modeName, "modeLab");
        setTextIfChanged(scaleLab, scaleName, "scaleLab");
        setTextIfChanged(rootLab, rootName, "rootLab");
        setTextIfChanged(bpmLab, j.bpm, "bpmLab");
        setTextIfChanged(swingLab, j.swing + "%", "swingLab");
        setTextIfChanged(brightLab, j.bright, "brightLab");
        setTextIfChanged(sensLab, sensStr, "sensLab");
        setTextIfChanged(fxLab, fxName, "fxLab");
        setTextIfChanged(palLab, palName, "palLab");
        setTextIfChanged(octLab, octStr, "octLab");
        setTextIfChanged(tsLab, tsStr, "tsLab");
        setTextIfChanged(velLab, j.vel, "velLab");
        if (lastLab) setTextIfChanged(lastLab, lastStr, "lastLab");

        setValueIfChanged(bpmRange, j.bpm, "bpmRange");
        setValueIfChanged(swingRange, j.swing, "swingRange");
        setValueIfChanged(brightRange, j.bright, "brightRange");
        setValueIfChanged(sensRange, j.sens, "sensRange");
        setValueIfChanged(loct, j.lo, "loct");
        setValueIfChanged(hoct, j.hi, "hoct");

        setValueIfChanged(mode, j.mode, "mode");
        setValueIfChanged(clockSel, j.clock, "clockSel");
        setValueIfChanged(scale, j.scale, "scale");
        setValueIfChanged(tsSel, tsStr.replace("/", "-"), "tsSel");

        setValueIfChanged(effect, j.fx, "effect");
        setValueIfChanged(palette, j.pal, "palette");

        setValueIfChanged(visSpd, j.vs, "visSpd");
        setValueIfChanged(visInt, j.vi, "visInt");

        setValueIfChanged(rest, Math.round(j.rest * 100), "rest");
        setCheckedIfChanged(norep, !!j.nr, "norep");
        setCheckedIfChanged(midiMode, midiSerial, "midiMode");

        setTextIfChanged(bpmVal, j.bpm, "bpmVal");
        setTextIfChanged(swingVal, j.swing + "%", "swingVal");
        setTextIfChanged(brightVal, j.bright, "brightVal");
        setTextIfChanged(sensVal, sensStr, "sensVal");
        setTextIfChanged(loVal, "C" + j.lo, "loVal");
        setTextIfChanged(hiVal, "C" + j.hi, "hiVal");
        setTextIfChanged(fxVal, fxName, "fxVal");
        setTextIfChanged(palVal, palName, "palVal");
        setTextIfChanged(vsVal, j.vs, "vsVal");
        setTextIfChanged(viVal, j.vi, "viVal");
        setTextIfChanged(restVal, Math.round(j.rest * 100) + "%", "restVal");
        setTextIfChanged(nrVal, j.nr ? "ON" : "OFF", "nrVal");
        setTextIfChanged(midiModeVal, midiSerial ? "SERIAL" : "BLE", "midiModeVal");
        setTextIfChanged(tsVal, tsStr, "tsVal");

        if (lastState.root !== j.root) {
          lastState.root = j.root;
          updatePianoSel(j.root | 0);
        }
        syncCustomSelect(mode);
        syncCustomSelect(clockSel);
        syncCustomSelect(scale);
        syncCustomSelect(tsSel);
        syncCustomSelect(effect);
        syncCustomSelect(palette);

        const nextDrum = (j.mode | 0) === 3;
        if (isDrumMode !== nextDrum) {
          isDrumMode = nextDrum;
          drumWrap.classList.toggle("hidden", !isDrumMode);
          noteWrap.classList.toggle("hidden", isDrumMode);
          drumWrap.classList.toggle("tight", isDrumMode);
        }

        if (typeof j.drumsel !== "undefined") applyDrumSelMask(j.drumsel | 0);

        const lastMidi = parseInt(j.last, 10);
        if (!Number.isNaN(lastMidi) && !isDrumMode) {
          if (lastState.lastMidi !== lastMidi || lastState.lastVel !== j.vel) {
            lastState.lastMidi = lastMidi;
            lastState.lastVel = j.vel;
            scheduleNoteDraw([lastMidi], j.vel | 0, false);
          }
        }
      });
      es.addEventListener("scope", (e) => {
        const plant = Number(e.data);
        plantA.push(plant);
        plantA.shift();
        scheduleScopeDraw();
      });

      es.addEventListener("note", (e) => {
        const [heldS, velS, nS, listS] = e.data.split("|");
        const held = Number(heldS) === 1;
        const vel = Number(velS) || 96;
        const list =
          listS && listS.length
            ? listS
                .split(",")
                .map((x) => Number(x))
                .filter((x) => !Number.isNaN(x))
            : [];
        scheduleNoteDraw(list, vel, held);
      });

      es.addEventListener("drum", (e) => {
        const [hitS, selS] = e.data.split("|");
        const hit = (Number(hitS) || 0) & 255;
        const sel = (Number(selS) || 0) & 255;
        applyDrumSelMask(sel);
        applyDrumHitMask(hit);
      });

      bpmRange.oninput = (e) => {
        const v = e.target.value;
        setVal(bpmVal, v);
        debouncedSend("bpm", "/bpm?v=" + v, 60);
      };
      swingRange.oninput = (e) => {
        const v = e.target.value;
        setVal(swingVal, v + "%");
        debouncedSend("swing", "/swing?v=" + v, 60);
      };
      brightRange.oninput = (e) => {
        const v = e.target.value;
        setVal(brightVal, v);
        debouncedSend("bright", "/b?v=" + v, 60);
      };
      sensRange.oninput = (e) => {
        const v = e.target.value;
        setVal(sensVal, (+v).toFixed(2));
        debouncedSend("sens", "/s?v=" + v, 60);
      };
      loct.oninput = (e) => {
        const v = e.target.value;
        setVal(loVal, "C" + v);
        debouncedSend("lo", "/lo?v=" + v, 60);
      };
      hoct.oninput = (e) => {
        const v = e.target.value;
        setVal(hiVal, "C" + v);
        debouncedSend("hi", "/hi?v=" + v, 60);
      };

      mode.onchange = (e) =>
        debouncedSend("mode", "/mode?i=" + e.target.value, 30);
      clockSel.onchange = (e) =>
        debouncedSend("clock", "/clock?v=" + e.target.value, 30);
      scale.onchange = (e) =>
        debouncedSend("scale", "/scale?i=" + e.target.value, 30);

      effect.onchange = (e) => {
        const idx = e.target.value;
        const name = e.target.options[e.target.selectedIndex].text;
        setVal(fxVal, name);
        debouncedSend("fx", "/fxset?i=" + idx, 30);
      };
      palette.onchange = (e) => {
        const idx = e.target.value;
        const name = e.target.options[e.target.selectedIndex].text;
        setVal(palVal, name);
        debouncedSend("pal", "/pal?i=" + idx, 30);
      };

      visSpd.oninput = (e) => {
        const v = e.target.value;
        setVal(vsVal, v);
        debouncedSend("vs", "/visspd?v=" + v, 60);
      };
      visInt.oninput = (e) => {
        const v = e.target.value;
        setVal(viVal, v);
        debouncedSend("vi", "/visint?v=" + v, 60);
      };
      rest.oninput = (e) => {
        const v = e.target.value;
        setVal(restVal, v + "%");
        debouncedSend("rest", "/rest?v=" + v / 100, 60);
      };
      norep.onchange = (e) => {
        const v = e.target.checked ? 1 : 0;
        setVal(nrVal, v ? "ON" : "OFF");
        debouncedSend("nr", "/norep?v=" + v, 30);
      };

      tsSel.onchange = (e) => {
        const v = e.target.value;
        setVal(tsVal, v.replace("-", "/"));
        debouncedSend("ts", "/ts?v=" + v, 30);
      };

      rnd.onclick = () => {
        rnd.classList.add("pressed");
        setTimeout(() => rnd.classList.remove("pressed"), 140);
        sendNow("/rand");
      };

      midiMode.onchange = (e) => {
        const v = e.target.checked ? 1 : 0;
        setVal(midiModeVal, v ? "SERIAL" : "BLE");
        debouncedSend("midimode", "/midimode?v=" + v, 30, true);
      };

      mute.onchange = (e) => setUiMuted(e.target.checked);
    </script>
  </body>
</html>


)BECA_UI_HTML";
