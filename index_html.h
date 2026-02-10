// Auto-generated — do not edit by hand
#pragma once
#include <Arduino.h>

const char INDEX_HTML[] PROGMEM = R"BECA_UI_HTML(
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>BECA • Plant Synth</title>
    <style>
      :root {
        --bg: #010503;
        --card: #0a0f0b;
        --grid: #0f1f14;
        --fg: #e9ffee;
        --green: #00ff7a;
        --stroke: #133820;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 14px;
        background: var(--bg);
        color: var(--fg);
        font:
          14px/1.5 system-ui,
          Arial;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
      }
      .brand img {
        height: 28px;
        filter: drop-shadow(0 0 6px rgba(0, 255, 122, 0.35));
      }
      .pill {
        padding: 2px 10px;
        border: 1px solid var(--stroke);
        border-radius: 999px;
        background: #041006;
      }
      .row {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      .card {
        background: var(--card);
        border: 1px solid var(--stroke);
        border-radius: 14px;
        padding: 14px;
        flex: 1;
        min-width: 300px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
      }
      .kv {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 6px 10px;
      }
      .label {
        opacity: 0.85;
      }
      .mono {
        font-family: ui-monospace, Menlo, Consolas, monospace;
      }
      .ctrl {
        margin-top: 10px;
        position: relative;
      }
      .hdr {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .val {
        font-variant-numeric: tabular-nums;
        font-family: ui-monospace, Menlo, Consolas;
      }
      .btn,
      select,
      input[type="range"],
      input[type="checkbox"] {
        width: 100%;
        background: #050b06;
        color: var(--fg);
        border: 1px solid var(--stroke);
        border-radius: 10px;
        padding: 8px;
      }
      .btn {
        cursor: pointer;
        transition: all 0.15s;
        text-align: center;
      }
      .btn:hover {
        background: #022;
        box-shadow: 0 0 14px var(--green);
        transform: translateY(-1px);
      }
      input[type="range"] {
        height: 32px;
        -webkit-appearance: none;
        appearance: none;
        padding: 0;
        background: transparent;
      }
      input[type="range"]::-webkit-slider-runnable-track {
        height: 6px;
        background: linear-gradient(90deg, #0d2617, #173824);
        border-radius: 999px;
      }
      input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        margin-top: -6px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--green);
        border: 1px solid #1cff96;
        box-shadow: 0 0 12px rgba(0, 255, 122, 0.65);
      }
      .kbd {
        display: flex;
        gap: 2px;
        margin-top: 8px;
        user-select: none;
      }
      .key {
        width: 22px;
        height: 62px;
        border: 1px solid var(--stroke);
        background: #0b120d;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s;
      }
      .key.white {
        background: #0a120a;
      }
      .key.black {
        background: #051006;
        height: 42px;
        margin-left: -11px;
        margin-right: -11px;
        z-index: 2;
        width: 20px;
        border-color: #15351f;
      }
      .key.sel {
        outline: 2px solid var(--green);
        box-shadow: 0 0 16px rgba(0, 255, 122, 0.55);
      }

      #osc {
        width: 100%;
        height: 160px;
        border-radius: 10px;
        border: 1px solid var(--stroke);
        background: radial-gradient(
          150% 120% at 50% 50%,
          #041107 0%,
          #030907 60%,
          #020604 100%
        );
      }
      #notegrid {
        width: 100%;
        height: 130px;
        margin-top: 10px;
        border-radius: 10px;
        border: 1px solid var(--stroke);
        background: radial-gradient(
          150% 120% at 50% 50%,
          #041107 0%,
          #030907 60%,
          #020604 100%
        );
      }
      .small {
        font-size: 12px;
        opacity: 0.9;
      }
      .grid2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }

      /* ---- Drum UI ---- */
      #drumWrap {
        margin-top: 12px;
      }
      #drumWrap.hidden {
        display: none;
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
        accent-color: var(--green);
      }
      .dBox {
        height: 56px;
        border-radius: 14px;
        border: 2px solid rgba(233, 255, 238, 0.55);
        background: rgba(0, 0, 0, 0.18);
        box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
        transition: all 0.08s;
      }
      .dBox.hit {
        border-color: rgba(0, 255, 122, 0.95);
        box-shadow:
          0 0 18px rgba(0, 255, 122, 0.55),
          inset 0 0 0 1px rgba(0, 255, 122, 0.35);
        background: rgba(0, 255, 122, 0.14);
      }
      .dLab {
        text-align: center;
        font-size: 12px;
        opacity: 0.9;
        margin-top: -4px;
        font-family: ui-monospace, Menlo, Consolas, monospace;
      }
    </style>
  </head>
  <body>
    <div class="brand">
      <img src="/logo" alt="BECA" />
      <div class="mono">
        <span
          style="color: var(--green); font-weight: 800; letter-spacing: 0.06em"
          >BECA</span
        >
        • Plant Synth
      </div>
      <div class="small">by Fatty Recording Co.</div>
      <div id="status" class="pill mono" style="margin-left: auto">
        connecting…
      </div>
    </div>

    <div class="row">
      <div class="card">
        <div class="hdr">
          <div class="label">Oscilloscope (plant energy)</div>
          <div class="small mono">SSE stream</div>
        </div>
        <canvas id="osc" width="900" height="160"></canvas>

        <div class="hdr" style="margin-top: 10px">
          <div class="label">MIDI Note Grid (C1..C8)</div>
          <div class="small mono" id="gridLab">—</div>
        </div>
        <canvas id="notegrid" width="900" height="130"></canvas>

        <!-- Drum UI (only shown in Drum Machine mode) -->
        <div id="drumWrap" class="hidden">
          <div class="drumTitle">
            <div class="label">Drum Kit (8 parts)</div>
            <div class="small mono" id="drumLab">—</div>
          </div>

          <!-- selectors row -->
          <div class="drumGrid" id="drumSelRow"></div>
          <!-- hit boxes row -->
          <div class="drumGrid" id="drumHitRow" style="margin-top: 8px"></div>
          <!-- labels -->
          <div class="drumGrid" id="drumNameRow" style="margin-top: 6px"></div>
        </div>
      </div>

      <div class="card">
        <div class="kv mono">
          <div class="label">BLE:</div>
          <div id="ble">—</div>
          <div class="label">Clock:</div>
          <div id="clock">—</div>
          <div class="label">Mode:</div>
          <div id="modeLab">—</div>
          <div class="label">Scale:</div>
          <div id="scaleLab">—</div>
          <div class="label">Root:</div>
          <div id="rootLab">—</div>
          <div class="label">BPM:</div>
          <div id="bpmLab">—</div>
          <div class="label">Swing:</div>
          <div id="swingLab">—</div>
          <div class="label">Brightness:</div>
          <div id="brightLab">—</div>
          <div class="label">Sensitivity:</div>
          <div id="sensLab">—</div>
          <div class="label">Effect:</div>
          <div id="fxLab">—</div>
          <div class="label">Palette:</div>
          <div id="palLab">—</div>
          <div class="label">Oct Range:</div>
          <div id="octLab">—</div>
          <div class="label">Time Sig:</div>
          <div id="tsLab">—</div>
          <div class="label">Last:</div>
          <div id="lastLab">—</div>
          <div class="label">Vel:</div>
          <div id="velLab">—</div>
        </div>
      </div>
    </div>

    <div class="row" style="margin-top: 10px">
      <div class="card">
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

        <div class="label" style="margin-top: 10px">Scale</div>
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

        <div class="label" style="margin-top: 10px">Root (piano)</div>
        <div id="piano" class="kbd"></div>
      </div>

      <div class="card">
        <div class="ctrl">
          <div class="hdr">
            <div class="label">BPM</div>
            <div class="val mono" id="bpmVal">—</div>
          </div>
          <input id="bpmRange" type="range" min="20" max="240" step="5" />
        </div>
        <div class="ctrl">
          <div class="hdr">
            <div class="label">Swing %</div>
            <div class="val mono" id="swingVal">—</div>
          </div>
          <input id="swingRange" type="range" min="0" max="60" step="1" />
        </div>
        <div class="ctrl">
          <div class="hdr">
            <div class="label">Brightness</div>
            <div class="val mono" id="brightVal">—</div>
          </div>
          <input id="brightRange" type="range" min="10" max="255" step="1" />
        </div>
        <div class="ctrl">
          <div class="hdr">
            <div class="label">Sensitivity</div>
            <div class="val mono" id="sensVal">—</div>
          </div>
          <input
            id="sensRange"
            type="range"
            min="0.00"
            max="0.50"
            step="0.05"
          />
        </div>
        <div class="grid2">
          <div class="ctrl">
            <div class="hdr">
              <div class="label">Low Oct</div>
              <div class="val mono" id="loVal">—</div>
            </div>
            <input id="loct" type="range" min="0" max="9" step="1" />
          </div>
          <div class="ctrl">
            <div class="hdr">
              <div class="label">High Oct</div>
              <div class="val mono" id="hiVal">—</div>
            </div>
            <input id="hoct" type="range" min="0" max="9" step="1" />
          </div>
        </div>
        <div class="ctrl">
          <div class="hdr">
            <div class="label">Time Signature</div>
            <div class="val mono" id="tsVal">—</div>
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

      <div class="card">
        <div class="ctrl">
          <div class="hdr">
            <div class="label">Effect</div>
            <div class="val mono" id="fxVal">—</div>
          </div>
          <select id="effect"></select>
        </div>
        <div class="ctrl">
          <div class="hdr">
            <div class="label">Palette</div>
            <div class="val mono" id="palVal">—</div>
          </div>
          <select id="palette"></select>
        </div>
        <div class="ctrl">
          <div class="hdr">
            <div class="label">Visual Speed</div>
            <div class="val mono" id="vsVal">—</div>
          </div>
          <input id="visSpd" type="range" min="0" max="255" step="1" />
        </div>
        <div class="ctrl">
          <div class="hdr">
            <div class="label">Visual Intensity</div>
            <div class="val mono" id="viVal">—</div>
          </div>
          <input id="visInt" type="range" min="0" max="255" step="1" />
        </div>
        <div class="ctrl">
          <div class="hdr">
            <div class="label">Rest %</div>
            <div class="val mono" id="restVal">—</div>
          </div>
          <input id="rest" type="range" min="0" max="80" step="1" />
        </div>
        <div class="ctrl">
          <div class="hdr">
            <div class="label">Avoid repeats</div>
            <div class="val mono" id="nrVal">—</div>
          </div>
          <input id="norep" type="checkbox" />
        </div>
        <div style="display: flex; gap: 8px; margin-top: 12px">
          <button id="rnd" class="btn">Randomize</button>
        </div>
      </div>
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

      let plantA = new Array(N).fill(0);

      function grid() {
        const w = osc.width,
          h = osc.height;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "#041107";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#0e2116";
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
        const w = osc.width,
          h = osc.height;
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
        el.textContent = v;
      }

      const debouncers = {};
      function sendNow(url) {
        fetch(url, { cache: "no-store" }).catch(() => {});
      }
      function debouncedSend(key, url, delay = 90) {
        if (debouncers[key]) clearTimeout(debouncers[key]);
        debouncers[key] = setTimeout(() => sendNow(url), delay);
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

      // ---- MIDI NOTE GRID ----
      const gridLab = $("gridLab");
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
        const w = noteGrid.width,
          h = noteGrid.height;
        ng.clearRect(0, 0, w, h);

        ng.fillStyle = "#041107";
        ng.fillRect(0, 0, w, h);

        const pad = 10;
        const gx = pad,
          gy = pad;
        const gw = w - pad * 2,
          gh = h - pad * 2;

        const cellW = gw / GRID_COLS;
        const cellH = gh / GRID_ROWS;

        ng.strokeStyle = "#0e2116";
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

        ng.fillStyle = "rgba(233,255,238,.7)";
        ng.font = "12px ui-monospace, Menlo, Consolas, monospace";
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

          ng.fillStyle = `rgba(0,255,122,${0.14 * a + 0.45 * a * v})`;
          ng.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);

          ng.strokeStyle = `rgba(0,255,122,${0.6 * a})`;
          ng.lineWidth = 2;
          ng.strokeRect(x + 2, y + 2, cellW - 4, cellH - 4);
        });

        if (!midiList.length) {
          gridLab.textContent = "—";
        } else {
          const names = midiList.slice(0, 6).map(noteName).join(" ");
          gridLab.textContent = `${held ? "HOLD" : "hit"} • ${names}${midiList.length > 6 ? " …" : ""} • vel ${vel | 0}`;
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

      const drumSelChecks = [];
      const drumHitBoxes = [];

      function buildDrumUI() {
        drumSelRow.innerHTML = "";
        drumHitRow.innerHTML = "";
        drumNameRow.innerHTML = "";

        for (let i = 0; i < 8; i++) {
          // selector
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

          // hit box
          const b = document.createElement("div");
          b.className = "dBox";
          drumHitRow.appendChild(b);
          drumHitBoxes.push(b);

          // label
          const l = document.createElement("div");
          l.className = "dLab";
          l.textContent = DRUM_NAMES[i];
          drumNameRow.appendChild(l);
        }
      }

      function applyDrumSelMask(mask) {
        drumSelMask = mask & 255;
        for (let i = 0; i < 8; i++) {
          drumSelChecks[i].checked = !!(drumSelMask & (1 << i));
        }
        drumLab.textContent = "enabled: " + drumSelMask;
      }

      function applyDrumHitMask(hitMask) {
        for (let i = 0; i < 8; i++) {
          drumHitBoxes[i].classList.toggle("hit", !!(hitMask & (1 << i)));
        }
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

          grid();
          drawNoteGridMulti([], 96, false);
        } catch (e) {
          status.textContent = "ui error";
        }
      })();

      // SSE stream
      const es = new EventSource("/events");

      es.addEventListener("hello", () => {
        status.textContent = "ok";
      });

      es.onerror = () => {
        status.textContent = "reconnecting…";
      };

      es.addEventListener("state", (e) => {
        const j = JSON.parse(e.data);
        status.textContent = "ok";

        ble.textContent = j.ble ? "connected" : "—";
        clock.textContent = j.clock ? "Plant" : "Internal";
        modeLab.textContent = MODE_NAMES[j.mode] || "—";
        scaleLab.textContent = SCALE_NAMES[j.scale] || "—";
        rootLab.textContent = NOTE_NAMES[j.root] || "—";
        bpmLab.textContent = j.bpm;
        swingLab.textContent = j.swing + "%";
        brightLab.textContent = j.bright;
        sensLab.textContent = (+j.sens).toFixed(2);
        fxLab.textContent = j.fxname || "—";
        palLab.textContent = j.palname || "—";
        octLab.textContent = "C" + j.lo + " .. C" + j.hi;
        tsLab.textContent = j.ts;
        lastLab.textContent = j.last;
        velLab.textContent = j.vel;

        bpmRange.value = j.bpm;
        swingRange.value = j.swing;
        brightRange.value = j.bright;
        sensRange.value = j.sens;
        loct.value = j.lo;
        hoct.value = j.hi;

        mode.value = j.mode;
        clockSel.value = j.clock;
        scale.value = j.scale;
        tsSel.value = j.ts.replace("/", "-");

        effect.value = j.fx;
        palette.value = j.pal;

        visSpd.value = j.vs;
        visInt.value = j.vi;

        rest.value = Math.round(j.rest * 100);
        norep.checked = !!j.nr;

        setVal(bpmVal, j.bpm);
        setVal(swingVal, j.swing + "%");
        setVal(brightVal, j.bright);
        setVal(sensVal, (+j.sens).toFixed(2));
        setVal(loVal, "C" + j.lo);
        setVal(hiVal, "C" + j.hi);
        setVal(fxVal, fxLab.textContent);
        setVal(palVal, palLab.textContent);
        setVal(vsVal, j.vs);
        setVal(viVal, j.vi);
        setVal(restVal, Math.round(j.rest * 100) + "%");
        setVal(nrVal, j.nr ? "ON" : "OFF");
        setVal(tsVal, j.ts);

        updatePianoSel(j.root | 0);

        // show/hide drum UI based on mode
        const isDrum = (j.mode | 0) === 3;
        drumWrap.classList.toggle("hidden", !isDrum);

        // apply drum selection state from device
        if (typeof j.drumsel !== "undefined") applyDrumSelMask(j.drumsel | 0);

        // reflect last note in grid on state updates
        const lastMidi = parseInt(j.last, 10);
        if (!Number.isNaN(lastMidi))
          drawNoteGridMulti([lastMidi], j.vel | 0, false);
      });

      // scope now expects 1 value only: plant
      es.addEventListener("scope", (e) => {
        const plant = Number(e.data);
        plantA.push(plant);
        plantA.shift();
        grid();
        line(plantA, "#00ff7a", 1.0);
      });

      // note grid event: held|vel|n|m1,m2,m3...
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
        drawNoteGridMulti(list, vel, held);
      });

      // drum event: hitMask|selMask
      es.addEventListener("drum", (e) => {
        const [hitS, selS] = e.data.split("|");
        const hit = (Number(hitS) || 0) & 255;
        const sel = (Number(selS) || 0) & 255;
        applyDrumSelMask(sel);
        applyDrumHitMask(hit);
      });

      // Controls
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

      rnd.onclick = () => sendNow("/rand");
    </script>
  </body>
</html>

)BECA_UI_HTML";
