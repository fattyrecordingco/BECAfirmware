const NOTE_LABELS = ["C", "C'", "D", "D'", "E", "F'", "F", "G", "G'", "A'", "A", "B"];
const NOTE_READOUTS = ["c", "c#", "d", "d#", "e", "f#", "f", "g", "g#", "a#", "a", "b"];
const OUTPUTS = ["ble", "serial", "aux out"];
const METER_COLORS = ["#8bc43e", "#8bc43e", "#a8cd39", "#d2d52b", "#fed605", "#ffb500", "#ff7b17", "#f12129"];
const BASIC_RANDOM_IDS = ["sensitivity", "preset", "scale", "root", "tempo", "timeSig", "swing", "rest", "octaveRange"];
const CHORDS = [
  { notes: [0, 4, 7], name: "cmaj" },
  { notes: [7, 11, 2], name: "gmaj" },
  { notes: [9, 0, 4], name: "amin" },
  { notes: [5, 9, 0], name: "fmaj" }
];

const SETTING_COLORS = {
  sensitivity: "#8bc43e",
  preset: "#fed605",
  scale: "#fe5501",
  root: "#1bc8f8",
  tempo: "#f12129",
  swing: "#7239d9",
  rest: "#ed29ac",
  octaveRange: "#7b7b7b",
  timeSig: "#12c99c",
  noteLength: "#124cec",
  filter: "#25bf45",
  resonance: "#ffb500"
};

const settings = [
  {
    id: "sensitivity",
    label: "sensitivity",
    color: SETTING_COLORS.sensitivity,
    value: 0.25,
    min: 0,
    max: 0.5,
    step: 0.01,
    format: (setting) => setting.value.toFixed(2)
  },
  {
    id: "preset",
    label: "preset",
    color: SETTING_COLORS.preset,
    value: 2,
    options: ["notes", "arp", "chords", "drums"],
    format: (setting) => setting.options[setting.value]
  },
  {
    id: "scale",
    label: "scale",
    color: SETTING_COLORS.scale,
    value: 0,
    options: ["maj", "min", "dorian", "mix", "lyd", "phryg", "pent", "harm"],
    format: (setting) => setting.options[setting.value]
  },
  {
    id: "root",
    label: "root note",
    color: SETTING_COLORS.root,
    value: 0,
    options: ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"],
    format: (setting) => setting.options[setting.value]
  },
  {
    id: "tempo",
    label: "tempo",
    color: SETTING_COLORS.tempo,
    value: 120,
    min: 40,
    max: 220,
    step: 1,
    format: (setting) => String(setting.value)
  },
  {
    id: "timeSig",
    label: "time sig",
    color: SETTING_COLORS.timeSig,
    value: 3,
    options: ["1/1", "2/4", "3/4", "4/4", "5/4", "6/8", "7/4", "12/8"],
    format: (setting) => setting.options[setting.value]
  },
  {
    id: "swing",
    label: "swing",
    color: SETTING_COLORS.swing,
    value: 0,
    min: 0,
    max: 100,
    step: 1,
    format: (setting) => String(setting.value)
  },
  {
    id: "rest",
    label: "rest",
    color: SETTING_COLORS.rest,
    value: 0,
    min: 0,
    max: 1,
    step: 0.01,
    format: (setting) => setting.value.toFixed(0)
  },
  {
    id: "octaveRange",
    label: "oct range",
    color: SETTING_COLORS.octaveRange,
    low: 1,
    high: 8,
    min: 1,
    max: 8,
    format: (setting) => `c${setting.low} - c${setting.high}`
  },
  {
    id: "noteLength",
    label: "note length",
    color: SETTING_COLORS.noteLength,
    value: 2,
    auxOnly: true,
    options: ["1/32", "1/16t", "1/16", "1/8t", "1/8", "1/4", "1/2", "1/1"],
    format: (setting) => setting.options[setting.value]
  },
  {
    id: "filter",
    label: "filter",
    color: SETTING_COLORS.filter,
    value: 220,
    min: 20,
    max: 1000,
    step: 10,
    auxOnly: true,
    format: (setting) => `${Math.round(setting.value)} hz`
  },
  {
    id: "resonance",
    label: "resonance",
    color: SETTING_COLORS.resonance,
    value: 0.7,
    min: 0,
    max: 1,
    step: 0.01,
    auxOnly: true,
    format: (setting) => setting.value.toFixed(2)
  }
];

const state = {
  selectedSettingId: "sensitivity",
  outputMode: "serial",
  volumeModeActive: false,
  syncEnabled: true,
  volume: 0.25,
  meterLevel: 0.25,
  chordIndex: 0,
  activeNotes: CHORDS[0].notes,
  chordName: CHORDS[0].name,
  plantPoints: Array.from({ length: 34 }, (_, index) => 0.45 + Math.sin(index * 0.62) * 0.11),
  encoderAngle: 0,
  clickCount: 0,
  clickTimer: null,
  holdTimer: null,
  longPressTriggered: false,
  suppressClickUntil: 0,
  dragStartY: null,
  dragLastY: null,
  dragMoved: false
};

const elements = {
  viewport: document.querySelector("#proto-viewport"),
  brandLockup: document.querySelector("#brand-lockup"),
  waveIcon: document.querySelector("#wave-icon"),
  gearIcon: document.querySelector("#gear-icon"),
  midiStrip: document.querySelector("#midi-strip"),
  midiReadout: document.querySelector("#midi-readout"),
  settingsGrid: document.querySelector("#settings-grid"),
  plantChart: document.querySelector("#plant-chart"),
  volumeCard: document.querySelector("#volume-card"),
  volumeMeter: document.querySelector("#volume-meter"),
  volumeValue: document.querySelector("#volume-value"),
  outputToggleGroup: document.querySelector("#output-toggle-group"),
  syncToggle: document.querySelector("#sync-toggle"),
  syncReadout: document.querySelector("#sync-readout"),
  ledStack: document.querySelector("#led-stack"),
  randomizeButton: document.querySelector("#randomize-button"),
  diceIcon: document.querySelector("#dice-icon"),
  encoder: document.querySelector("#encoder"),
  flowerIcon: document.querySelector("#flower-icon")
};

function logoSvg() {
  return `
    <svg viewBox="0 0 498 372" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M397.017 323.145V137.412c0-2.944.935-4.876 2.805-5.795 2.244-1.104 6.358-1.656 12.342-1.656h70.689c5.984 0 9.911.552 11.781 1.656 2.244.919 3.366 2.851 3.366 5.795v185.733h-45.442v-55.747h-11.221v55.747h-44.32Zm44.32-173.866v98.524h11.221v-98.524h-11.221Z" fill="currentColor"/>
      <path d="M329.951 338.074h11.22V205.554h44.321v153.018c0 5.084-1.123 8.58-3.367 10.487-1.87 1.589-5.797 2.383-11.781 2.383h-70.688c-5.984 0-10.098-.794-12.342-2.383-1.87-1.907-2.805-5.403-2.805-10.487V50.63c0-5.085.935-8.422 2.805-10.011 2.244-1.907 6.358-2.86 12.342-2.86h70.688c5.984 0 9.911.953 11.781 2.86 2.244 1.589 3.367 4.926 3.367 10.011v145.39h-44.321V71.128h-11.22v266.946Z" fill="currentColor"/>
      <path d="M272.984 144.437v33.368h-55.541v122.51h11.22V187.816h44.321v145.867H172.001V0h100.983v134.903h-44.321V33.368h-11.22v111.069h55.541Z" fill="currentColor"/>
      <path d="M103.659 23.27v77.456h11.579V23.27h-11.579Zm0 100.726v85.434h11.579v-85.434h-11.579Zm45.16-13.297h-1.737v3.989h1.737c5.017 0 8.491.665 10.421 1.994 1.93 1.108 2.895 3.435 2.895 6.981v100.061c0 3.546-1.158 5.984-3.474 7.314-1.93 1.108-5.79 1.662-11.579 1.662H56.762V0h90.32c5.789 0 9.649.665 11.579 1.995 2.316 1.108 3.474 3.435 3.474 6.981v92.747c0 3.324-.965 5.651-2.895 6.981-1.93 1.33-5.404 1.995-10.421 1.995Z" fill="currentColor"/>
      <path fill-rule="evenodd" clip-rule="evenodd" d="M24.588 195.819c-12.009 0-21.744-9.735-21.744-21.744V92.865C2.844 80.856 12.579 71.121 24.588 71.121c12.009 0 21.744 9.735 21.744 21.744v81.21c0 12.009-9.735 21.744-21.744 21.744Zm-14.224-21.744c0 7.856 6.368 14.225 14.224 14.225 7.856 0 14.224-6.369 14.224-14.225V92.865c0-7.856-6.368-14.224-14.224-14.224-7.856 0-14.224 6.368-14.224 14.224v81.21Z" fill="currentColor"/>
      <path d="M24.588 16.854c13.579 0 24.588 11.008 24.588 24.588 0 13.579-11.009 24.587-24.588 24.587C11.008 66.029 0 55.021 0 41.442 0 27.862 11.008 16.854 24.588 16.854Z" fill="currentColor"/>
    </svg>
  `;
}

function waveSvg() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M2 12h5l2.2-6 4.2 13 2.3-7H22" />
    </svg>
  `;
}

function gearSvg() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19 12.8v-1.6l-1.8-.6a5.7 5.7 0 0 0-.5-1.2l.9-1.7-1.1-1.1-1.7.9a5.7 5.7 0 0 0-1.2-.5L13 5h-1.6l-.6 1.8a5.7 5.7 0 0 0-1.2.5l-1.7-.9-1.1 1.1.9 1.7a5.7 5.7 0 0 0-.5 1.2L5 11.2v1.6l1.8.6a5.7 5.7 0 0 0 .5 1.2l-.9 1.7 1.1 1.1 1.7-.9a5.7 5.7 0 0 0 1.2.5l.6 1.8H13l.6-1.8a5.7 5.7 0 0 0 1.2-.5l1.7.9 1.1-1.1-.9-1.7a5.7 5.7 0 0 0 .5-1.2z" />
    </svg>
  `;
}

function leafSvg() {
  return `
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fill-rule="evenodd" clip-rule="evenodd" d="M100 48.864C100 77.106 77.106 100 48.864 100H0V51.136C0 22.894 22.894 0 51.136 0H100v48.864ZM51.136 11.364c-21.965 0-39.772 17.807-39.772 39.772V81.17l42.005-42.005c2.219-2.219 5.817-2.219 8.036 0 2.219 2.219 2.219 5.817 0 8.036L19.967 88.636h28.897c21.965 0 39.772-17.807 39.772-39.772V11.364H51.136Z" fill="currentColor"/>
    </svg>
  `;
}

function flowerSvg() {
  return `
    <svg viewBox="0 0 525 513" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M320.693 210.915C503.433 -70.305 21.113 -70.305 203.853 210.915C21.113 -70.305 -127.947 388.415 167.743 322.035C-127.947 388.415 262.263 671.935 262.263 390.715C262.263 671.935 652.483 388.415 356.783 322.035C652.473 388.415 503.423 -70.305 320.673 210.915H320.693ZM262.273 356.985C182.593 466.305 118.003 401.705 227.323 322.035C118.003 242.355 182.593 177.775 262.273 287.095C341.953 177.775 406.543 242.355 297.223 322.035C406.543 401.705 341.953 466.305 262.273 356.985Z" fill="currentColor"/>
    </svg>
  `;
}

function diceSvg() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="8" cy="16" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  `;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getSetting(settingId) {
  return settings.find((setting) => setting.id === settingId);
}

function getSettingValueText(setting) {
  return setting.format(setting);
}

function getCyclableSettings() {
  return settings.filter((setting) => !setting.auxOnly || state.outputMode === "aux out");
}

function setScale() {
  const availableWidth = window.innerWidth - 40;
  const availableHeight = window.innerHeight - 40;
  const scale = Math.min(availableWidth / 575, availableHeight / 842, 1);
  document.documentElement.style.setProperty("--proto-scale", scale.toFixed(4));
}

function renderStaticArt() {
  elements.brandLockup.innerHTML = logoSvg();
  elements.waveIcon.innerHTML = waveSvg();
  elements.gearIcon.innerHTML = gearSvg();
  elements.diceIcon.innerHTML = diceSvg();
  elements.flowerIcon.innerHTML = flowerSvg();
}

function renderChart() {
  const points = state.plantPoints
    .map((value, index) => {
      const x = index * (350 / (state.plantPoints.length - 1));
      const y = 130 - value * 72;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  elements.plantChart.innerHTML = `
    <rect x="0" y="0" width="350" height="162" fill="#ffffff" />
    <polyline
      points="${points}"
      fill="none"
      stroke="#008351"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  `;
}

function renderMidi() {
  elements.midiReadout.textContent = `${state.activeNotes.map((note) => `${NOTE_READOUTS[note]}3`).join(" ")} | ${state.chordName}`;
  elements.midiStrip.innerHTML = "";

  NOTE_LABELS.forEach((label, index) => {
    const cell = document.createElement("div");
    cell.className = "proto-midi-cell";
    if (state.activeNotes.includes(index)) {
      cell.classList.add("is-on");
    }

    const leaf = document.createElement("span");
    leaf.className = "proto-midi-leaf";
    leaf.innerHTML = leafSvg();

    const note = document.createElement("span");
    note.className = "proto-midi-note";
    note.textContent = label;

    cell.append(leaf, note);
    elements.midiStrip.appendChild(cell);
  });
}

function renderSettings() {
  elements.settingsGrid.innerHTML = "";

  settings.forEach((setting) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "proto-setting-button";
    button.style.color = state.selectedSettingId === setting.id && !state.volumeModeActive ? "#ffffff" : "#008351";
    if (state.selectedSettingId === setting.id && !state.volumeModeActive) {
      button.classList.add("is-selected");
    }

    const name = document.createElement("span");
    name.className = "proto-setting-name";
    name.textContent = setting.label;

    const value = document.createElement("span");
    value.className = "proto-setting-value";
    value.textContent = getSettingValueText(setting);
    value.style.color = state.selectedSettingId === setting.id && !state.volumeModeActive ? setting.color : setting.color;

    button.append(name, value);
    button.addEventListener("click", () => {
      state.volumeModeActive = false;
      state.selectedSettingId = setting.id;
      renderAll();
    });

    elements.settingsGrid.appendChild(button);
  });
}

function renderVolume() {
  elements.volumeCard.classList.toggle("is-active", state.volumeModeActive);
  elements.volumeValue.textContent = state.volume.toFixed(2);
  elements.volumeMeter.innerHTML = "";
  const litCount = Math.max(1, Math.round(state.meterLevel * METER_COLORS.length));

  METER_COLORS.forEach((color, index) => {
    const dot = document.createElement("span");
    dot.className = "proto-meter-dot";
    dot.style.background = color;
    if (index < litCount) {
      dot.classList.add("is-on");
    }
    elements.volumeMeter.appendChild(dot);
  });
}

function renderOutputs() {
  elements.outputToggleGroup.innerHTML = "";
  OUTPUTS.forEach((output) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "proto-output-option";
    option.textContent = output;
    if (state.outputMode === output) {
      option.classList.add("is-active");
    }
    option.addEventListener("click", () => {
      state.outputMode = output;
      if (output !== "aux out" && getSetting(state.selectedSettingId).auxOnly) {
        state.selectedSettingId = "sensitivity";
      }
      renderAll();
    });
    elements.outputToggleGroup.appendChild(option);
  });
}

function renderSync() {
  elements.syncReadout.textContent = state.syncEnabled ? "ON" : "OFF";
  elements.syncToggle.style.opacity = state.syncEnabled ? "1" : "0.75";
}

function getLedModel() {
  if (state.volumeModeActive) {
    const activeCount = Math.max(1, Math.round(state.volume * 8));
    return METER_COLORS.map((color, index) => ({
      color,
      on: index < activeCount
    }));
  }

  const setting = getSetting(state.selectedSettingId);
  let count = 8;

  if (setting.options) {
    count = Math.round((setting.value / Math.max(setting.options.length - 1, 1)) * 7) + 1;
  } else if (setting.id === "octaveRange") {
    count = clamp(setting.high - setting.low + 1, 1, 8);
  } else {
    const normalized = (setting.value - setting.min) / Math.max(setting.max - setting.min, 1);
    count = clamp(Math.round(normalized * 8), 1, 8);
  }

  return Array.from({ length: 8 }, (_, index) => ({
    color: setting.color,
    on: index >= 8 - count
  }));
}

function renderLeds() {
  const ledModel = getLedModel();
  elements.ledStack.innerHTML = "";

  ledModel.forEach((entry) => {
    const led = document.createElement("span");
    led.className = "proto-led";
    if (entry.on) {
      led.classList.add("is-on");
    }
    led.style.color = entry.color;
    led.innerHTML = leafSvg();
    elements.ledStack.appendChild(led);
  });
}

function renderEncoder() {
  elements.encoder.style.setProperty("--encoder-angle", `${state.encoderAngle}deg`);
}

function renderAll() {
  renderChart();
  renderMidi();
  renderSettings();
  renderVolume();
  renderOutputs();
  renderSync();
  renderLeds();
  renderEncoder();
}

function nextSetting() {
  const available = getCyclableSettings();
  const currentIndex = available.findIndex((setting) => setting.id === state.selectedSettingId);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % available.length;
  state.selectedSettingId = available[nextIndex].id;
  state.volumeModeActive = false;
}

function cycleOutput() {
  const index = OUTPUTS.indexOf(state.outputMode);
  state.outputMode = OUTPUTS[(index + 1) % OUTPUTS.length];
  if (state.outputMode !== "aux out" && getSetting(state.selectedSettingId).auxOnly) {
    state.selectedSettingId = "sensitivity";
  }
}

function randomizeBasicSettings() {
  settings.forEach((setting) => {
    if (!BASIC_RANDOM_IDS.includes(setting.id)) {
      return;
    }

    if (setting.options) {
      setting.value = Math.floor(Math.random() * setting.options.length);
      return;
    }

    if (setting.id === "octaveRange") {
      const low = 1 + Math.floor(Math.random() * 4);
      const high = low + 3 + Math.floor(Math.random() * (8 - low - 2));
      setting.low = low;
      setting.high = clamp(high, low + 1, 8);
      return;
    }

    const steps = Math.round((setting.max - setting.min) / setting.step);
    const chosen = Math.floor(Math.random() * (steps + 1));
    setting.value = Number((setting.min + chosen * setting.step).toFixed(2));
  });
}

function stepOption(setting, direction) {
  setting.value = clamp(setting.value + direction, 0, setting.options.length - 1);
}

function stepNumber(setting, direction) {
  if (setting.id === "octaveRange") {
    if (direction > 0 && setting.high < 8) {
      if (setting.high - setting.low >= 6) {
        setting.low += 1;
      }
      setting.high += 1;
    } else if (direction < 0 && setting.low > 1) {
      if (setting.high - setting.low >= 6) {
        setting.high -= 1;
      }
      setting.low -= 1;
    }
    return;
  }

  const nextValue = setting.value + setting.step * direction;
  setting.value = Number(clamp(nextValue, setting.min, setting.max).toFixed(2));
}

function rotateCurrentValue(direction) {
  state.encoderAngle += direction * 16;
  if (state.volumeModeActive) {
    state.volume = Number(clamp(state.volume + direction * 0.01, 0, 1).toFixed(2));
    state.meterLevel = clamp(state.volume + 0.2, 0.12, 1);
    renderAll();
    return;
  }

  const setting = getSetting(state.selectedSettingId);
  if (!setting) {
    return;
  }

  if (setting.options) {
    stepOption(setting, direction);
  } else {
    stepNumber(setting, direction);
  }

  renderAll();
}

function beginHold() {
  clearTimeout(state.holdTimer);
  state.holdTimer = window.setTimeout(() => {
    state.longPressTriggered = true;
    state.suppressClickUntil = performance.now() + 350;
    cycleOutput();
    renderAll();
  }, 520);
}

function clearHold() {
  clearTimeout(state.holdTimer);
  state.holdTimer = null;
}

function registerEncoderClick() {
  const now = performance.now();
  if (state.longPressTriggered || now < state.suppressClickUntil) {
    state.longPressTriggered = false;
    return;
  }

  state.clickCount += 1;
  clearTimeout(state.clickTimer);

  if (state.clickCount === 3) {
    state.clickCount = 0;
    randomizeBasicSettings();
    renderAll();
    return;
  }

  state.clickTimer = window.setTimeout(() => {
    if (state.clickCount === 1) {
      nextSetting();
    } else if (state.clickCount === 2) {
      state.volumeModeActive = !state.volumeModeActive;
    }
    state.clickCount = 0;
    renderAll();
  }, 260);
}

function advancePlayback() {
  state.chordIndex = (state.chordIndex + 1) % CHORDS.length;
  const chord = CHORDS[state.chordIndex];
  state.activeNotes = chord.notes;
  state.chordName = chord.name;
  state.meterLevel = clamp(0.28 + state.volume * 0.72 + Math.random() * 0.16, 0.1, 1);
}

function animateData() {
  const last = state.plantPoints[state.plantPoints.length - 1];
  const drift = Math.sin(Date.now() / 260) * 0.03 + (Math.random() - 0.5) * 0.16;
  const next = clamp(last + drift, 0.2, 0.9);
  state.plantPoints = [...state.plantPoints.slice(1), next];
  state.meterLevel = clamp(state.meterLevel * 0.92, 0.08, 1);
  renderChart();
  renderVolume();
}

function bindEvents() {
  elements.volumeCard.addEventListener("click", () => {
    state.volumeModeActive = true;
    renderAll();
  });

  elements.syncToggle.addEventListener("click", () => {
    state.syncEnabled = !state.syncEnabled;
    renderSync();
  });

  elements.randomizeButton.addEventListener("click", () => {
    randomizeBasicSettings();
    renderAll();
  });

  elements.encoder.addEventListener("wheel", (event) => {
    event.preventDefault();
    rotateCurrentValue(event.deltaY > 0 ? -1 : 1);
  });

  elements.encoder.addEventListener("pointerdown", (event) => {
    elements.encoder.setPointerCapture(event.pointerId);
    state.dragStartY = event.clientY;
    state.dragLastY = event.clientY;
    state.dragMoved = false;
    state.longPressTriggered = false;
    beginHold();
  });

  elements.encoder.addEventListener("pointermove", (event) => {
    if (state.dragLastY == null) {
      return;
    }

    const delta = state.dragLastY - event.clientY;
    if (Math.abs(event.clientY - state.dragStartY) > 5) {
      state.dragMoved = true;
      clearHold();
    }

    if (Math.abs(delta) >= 12) {
      rotateCurrentValue(delta > 0 ? 1 : -1);
      state.dragLastY = event.clientY;
      state.suppressClickUntil = performance.now() + 250;
    }
  });

  elements.encoder.addEventListener("pointerup", (event) => {
    clearHold();
    state.dragStartY = null;
    state.dragLastY = null;
    if (state.dragMoved) {
      state.suppressClickUntil = performance.now() + 250;
    }
    elements.encoder.releasePointerCapture(event.pointerId);
  });

  elements.encoder.addEventListener("pointercancel", () => {
    clearHold();
    state.dragStartY = null;
    state.dragLastY = null;
  });

  elements.encoder.addEventListener("click", () => {
    registerEncoderClick();
  });

  window.addEventListener("resize", setScale);
}

renderStaticArt();
setScale();
bindEvents();
renderAll();

window.setInterval(() => {
  advancePlayback();
  renderMidi();
  renderVolume();
}, 940);

window.setInterval(animateData, 120);
