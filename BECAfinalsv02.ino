/******************************************************
 * BECA - Plant-Played MIDI Synth (BLE + Serial) + Visualizer
 * ESP32-PICO-V3 (Arduino "ESP32 Dev Module")
 *
 * Stability + UI smoothness version:
 * - Coexistence: WiFi modem sleep enabled when BLE active
 * - SSE: scope throttled + state pushed only when changed
 * - WDT friendly: frequent delay(0)
 *
 * VIS UPDATE:
 * - Oscilloscope shows ONLY plant input (energy 0..1)
 * - MIDI note grid under scope (12 semis x 8 rows)
 * - NEW (this edit): Drum Machine UI:
 *     - Drum selectors (8 parts)
 *     - Drum hit indicators (8 parts)
 *     - SSE event "drum": hitMask|selMask
 ******************************************************/

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <FastLED.h>
#include <math.h>

#include <BLEMIDI_Transport.h>
#include <hardware/BLEMIDI_ESP32_NimBLE.h>
#include <NimBLEDevice.h>
#include <MIDI.h>
BLEMIDI_CREATE_INSTANCE("BECA BLE-MIDI", MIDI);

#include <Preferences.h>
#include <DNSServer.h>
#include <ESPmDNS.h>

#include <esp_wifi.h>
#include <esp_system.h>

#include "logo_svg.h"
#include "index_html.h"
#include "synth_engine.h"

extern const char SETUP_HTML[] PROGMEM;

// -------------------- Hardware --------------------
#define LED_PIN            19
#define LED_COUNT          8
#define LED_TYPE           WS2812B
#define LED_COLOR_ORDER    GRB

#define PLANT1_PIN         34   // degree stream
#define PLANT2_PIN         35   // octave stream

#define ENC_PIN_A          4
#define ENC_PIN_B          5
#define ENC_PIN_SW         15

#define PLANT_JACK_PIN     32
#define AUX_JACK_PIN       33

#ifndef BECA_ENCODER_SWITCH_PIN_MODE
#define BECA_ENCODER_SWITCH_PIN_MODE INPUT_PULLDOWN
#endif
#ifndef BECA_ENCODER_SWITCH_PRESSED_LEVEL
#define BECA_ENCODER_SWITCH_PRESSED_LEVEL HIGH
#endif

#ifndef BECA_PLANT_JACK_DETECT_ENABLED
#define BECA_PLANT_JACK_DETECT_ENABLED 0
#endif
#ifndef BECA_AUX_JACK_DETECT_ENABLED
#define BECA_AUX_JACK_DETECT_ENABLED 1
#endif
#ifndef BECA_PLANT_JACK_PIN_MODE
#define BECA_PLANT_JACK_PIN_MODE INPUT_PULLDOWN
#endif
#ifndef BECA_AUX_JACK_PIN_MODE
#define BECA_AUX_JACK_PIN_MODE INPUT_PULLDOWN
#endif
#ifndef BECA_PLANT_JACK_CONNECTED_LEVEL
#define BECA_PLANT_JACK_CONNECTED_LEVEL HIGH
#endif
#ifndef BECA_AUX_JACK_CONNECTED_LEVEL
#define BECA_AUX_JACK_CONNECTED_LEVEL HIGH
#endif

// PCM5102A I2S defaults for AUX OUT
#define I2S_BCK_PIN        26
#define I2S_WS_PIN         27
#define I2S_DATA_PIN       25

CRGB leds[LED_COUNT];
CRGB ledsPhysical[LED_COUNT];
uint8_t gBrightness = 154;

// -------------------- BLE-MIDI --------------------
volatile bool gMidiConnected = false;
enum OutputMode : uint8_t { OUTPUT_BLE = 0, OUTPUT_SERIAL = 1, OUTPUT_AUX = 2 };
volatile uint8_t gOutputMode = OUTPUT_BLE;
enum OutputChangeSource : uint8_t {
  OUTPUT_CHANGE_USER = 0,
  OUTPUT_CHANGE_AUX_AUTO,
  OUTPUT_CHANGE_AUX_RESTORE
};
const uint32_t SERIAL_MIDI_BAUD = 115200;
const uint32_t SERIAL_MIDI_BEACON_MS = 2000;
const uint32_t AUX_STARTUP_LOCK_MS = 12000;
#ifndef BECA_SERIAL_JSON_TELEMETRY_DEFAULT
#define BECA_SERIAL_JSON_TELEMETRY_DEFAULT 0
#endif
uint32_t gLastSerialBeaconMs = 0;
uint32_t gAuxUnlockAtMs = 0;
volatile bool gIoMuted = false;
volatile bool gPlantAutoMuted = false;
volatile bool gSerialJsonTelemetry = (BECA_SERIAL_JSON_TELEMETRY_DEFAULT != 0);
uint32_t gLastSerialPlantTelemetryMs = 0;
const uint32_t JACK_DEBOUNCE_MS = 60;
uint8_t gPlantJackRawLevel = HIGH;
uint8_t gPlantJackStableLevel = HIGH;
uint32_t gPlantJackChangedAtMs = 0;
volatile bool gPlantJackConnected = true;
uint8_t gAuxJackRawLevel = HIGH;
uint8_t gAuxJackStableLevel = HIGH;
uint32_t gAuxJackChangedAtMs = 0;
volatile bool gAuxJackConnected = false;
bool gAuxJackAutoActive = false;
bool gAuxJackAutoSuppressed = false;
uint8_t gAuxJackPreviousOutput = OUTPUT_BLE;
uint32_t gLastAuxAutoLogMs = 0;

beca::SynthEngine gSynth;
uint32_t gLastSynthUnderrunLogMs = 0;

// --- BLE advertising keepalive ---
uint32_t gLastBleKickMs = 0;
const uint32_t BLE_KICK_INTERVAL_MS = 2500; // kick advertise every 2.5s when not connected

static inline bool outputModeIsAux() { return gOutputMode == OUTPUT_AUX; }
static inline bool outputModeIsBle() { return gOutputMode == OUTPUT_BLE; }
static inline bool outputModeIsSerial() { return gOutputMode == OUTPUT_SERIAL; }
static inline bool ioMuteManualActive() { return gIoMuted; }
static inline bool plantAutoMuteActive() { return gPlantAutoMuted; }
static inline bool ioMuteActive() { return gIoMuted || gPlantAutoMuted; }
static inline bool midiOutIsSerial() { return outputModeIsSerial(); }
static inline bool midiOutReady()    { return !ioMuteActive() && (outputModeIsSerial() || (outputModeIsBle() && gMidiConnected)); }
static inline bool plantJackConnected();
static inline bool auxJackConnected();
static inline void setupJackInputs();
static inline void serviceJackInputs(uint32_t nowMs);
static inline bool auxSwitchReady() { return (int32_t)(millis() - gAuxUnlockAtMs) >= 0; }
static inline uint32_t auxSwitchWaitMs() {
  if (auxSwitchReady()) return 0;
  return gAuxUnlockAtMs - millis();
}
static inline uint8_t nextOutputModeForCycle();
static inline bool drumsAllowedForCurrentOutput();
static inline void enforceAuxDrumGuard();
static inline bool isValidDen(uint8_t d);
static inline void recalcTransport(bool resetPhase);
static inline void pushStateIfChanged(bool force=false);
static inline void saveOutputModePref();
static inline void normalizeEncoderSetting();
static inline void activeClear();

extern Preferences prefs;
extern float restProb;
extern bool avoidRepeats;

static inline void serialJsonMidiEvent(uint8_t note, uint8_t vel, uint8_t ch, bool on) {
  if (!gSerialJsonTelemetry) return;
  char line[128];
  int n = snprintf(
    line, sizeof(line),
    "{\"type\":\"midi\",\"note\":%u,\"vel\":%u,\"ch\":%u,\"on\":%u,\"ts\":%lu}\n",
    (unsigned)note, (unsigned)vel, (unsigned)ch, on ? 1u : 0u, (unsigned long)millis()
  );
  if (n > 0) Serial.write((const uint8_t*)line, (size_t)n);
}

static inline void serialMidiSend3(uint8_t st, uint8_t d1, uint8_t d2) {
  char line[24];
  int n = snprintf(line, sizeof(line), "@M %02X %02X %02X\n", st, d1 & 0x7F, d2 & 0x7F);
  if (n > 0) Serial.write((const uint8_t*)line, (size_t)n);
}

static inline void midiSendNoteOn(uint8_t note, uint8_t vel, uint8_t ch) {
  uint8_t status = 0x90 | ((ch - 1) & 0x0F);
  serialJsonMidiEvent(note, vel, ch, true);
  if (outputModeIsAux() || ioMuteActive()) return;
  if (midiOutIsSerial()) serialMidiSend3(status, note, vel);
  else if (outputModeIsBle() && gMidiConnected) MIDI.sendNoteOn(note, vel, ch);
}

static inline void midiSendNoteOff(uint8_t note, uint8_t vel, uint8_t ch) {
  uint8_t status = 0x80 | ((ch - 1) & 0x0F);
  serialJsonMidiEvent(note, vel, ch, false);
  if (outputModeIsAux() || ioMuteActive()) return;
  if (midiOutIsSerial()) serialMidiSend3(status, note, vel);
  else if (outputModeIsBle() && gMidiConnected) MIDI.sendNoteOff(note, vel, ch);
}

static inline void midiSendControlChange(uint8_t cc, uint8_t val, uint8_t ch) {
  uint8_t status = 0xB0 | ((ch - 1) & 0x0F);
  if (outputModeIsAux() || ioMuteActive()) return;
  if (midiOutIsSerial()) serialMidiSend3(status, cc, val);
  else if (outputModeIsBle() && gMidiConnected) MIDI.sendControlChange(cc, val, ch);
}

static inline void allNotesOffBothTransports() {
  for (uint8_t ch = 1; ch <= 16; ++ch) {
    MIDI.sendControlChange(123, 0, ch);
    serialMidiSend3((uint8_t)(0xB0 | ((ch - 1) & 0x0F)), 123, 0);
  }
}

static inline void allNotesOffCurrentTransport() {
  if (outputModeIsAux()) return;
  for (uint8_t ch = 1; ch <= 16; ++ch) midiSendControlChange(123, 0, ch);
}

static inline void bleKickAdvertising() {
  // Only kick when not connected; avoids messing with active sessions
  if (gMidiConnected) return;

  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  if (!adv) return;

  // Start advertising even if it thinks it already is (this is the "kick")
  adv->start();

  // Optional: these hints can improve compatibility with some Windows BT stacks
  adv->setMinPreferred(0x06);
  adv->setMaxPreferred(0x12);
}

struct NoteOff {
  uint8_t  note;
  uint8_t  ch;
  uint32_t tOff;
  bool     on;
};
NoteOff offQ[16];

struct UiHeldNote {
  uint8_t  note;
  uint32_t tOff;
  bool     on;
};
UiHeldNote uiNoteQ[24];
static const uint16_t UI_NOTE_MIN_HOLD_MS = 320;

static inline void uiQueueHeldNote(uint8_t note, uint16_t durMs) {
  const uint16_t uiDurMs = max<uint16_t>(durMs, UI_NOTE_MIN_HOLD_MS);
  uint32_t until = millis() + uiDurMs;
  for (auto &q : uiNoteQ) {
    if (q.on && q.note == note) {
      if ((int32_t)(until - q.tOff) > 0) q.tOff = until;
      return;
    }
  }
  for (auto &q : uiNoteQ) {
    if (!q.on) {
      q.note = note;
      q.tOff = until;
      q.on = true;
      return;
    }
  }
  uint8_t oldest = 0;
  for (uint8_t i = 1; i < (uint8_t)(sizeof(uiNoteQ) / sizeof(uiNoteQ[0])); ++i) {
    if ((int32_t)(uiNoteQ[i].tOff - uiNoteQ[oldest].tOff) < 0) oldest = i;
  }
  uiNoteQ[oldest].note = note;
  uiNoteQ[oldest].tOff = until;
  uiNoteQ[oldest].on = true;
}

static inline uint8_t uiCollectHeldNotes(uint8_t* out, uint8_t maxOut) {
  uint32_t now = millis();
  uint8_t count = 0;
  for (auto &q : uiNoteQ) {
    if (!q.on) continue;
    if ((int32_t)(now - q.tOff) >= 0) {
      q.on = false;
      continue;
    }
    bool exists = false;
    for (uint8_t i = 0; i < count; ++i) {
      if (out[i] == q.note) { exists = true; break; }
    }
    if (!exists && count < maxOut) out[count++] = q.note;
  }
  for (uint8_t i = 0; i + 1 < count; ++i) {
    for (uint8_t j = i + 1; j < count; ++j) {
      if (out[j] < out[i]) {
        uint8_t t = out[i];
        out[i] = out[j];
        out[j] = t;
      }
    }
  }
  return count;
}

static inline void allNotesOff() {
  allNotesOffCurrentTransport();
  gSynth.allNotesOff();
  gSynth.allDrumsOff();
  for (auto &q : offQ) q.on = false;
  for (auto &q : uiNoteQ) q.on = false;
}

static inline const char* outputModeName(uint8_t mode) {
  switch (mode) {
    case OUTPUT_BLE: return "BLE";
    case OUTPUT_SERIAL: return "SERIAL";
    case OUTPUT_AUX: return "AUX";
    default: return "BLE";
  }
}

static inline bool jackLevelIsConnected(uint8_t level, uint8_t connectedLevel) {
  return level == connectedLevel;
}

static inline bool encoderSwitchLevelIsPressed(bool level) {
  return level == (BECA_ENCODER_SWITCH_PRESSED_LEVEL == HIGH);
}

static inline bool plantJackConnected() {
#if BECA_PLANT_JACK_DETECT_ENABLED
  return gPlantJackConnected;
#else
  return true;
#endif
}

static inline bool auxJackConnected() {
#if BECA_AUX_JACK_DETECT_ENABLED
  return gAuxJackConnected;
#else
  return false;
#endif
}

static inline bool updateDebouncedJack(uint8_t pin,
                                       uint8_t connectedLevel,
                                       uint8_t& rawLevel,
                                       uint8_t& stableLevel,
                                       uint32_t& changedAtMs,
                                       volatile bool& connected,
                                       uint32_t nowMs) {
  const uint8_t raw = (uint8_t)digitalRead(pin);
  if (raw != rawLevel) {
    rawLevel = raw;
    changedAtMs = nowMs;
  }

  if (raw == stableLevel || (int32_t)(nowMs - changedAtMs) < (int32_t)JACK_DEBOUNCE_MS) {
    return false;
  }

  stableLevel = raw;
  const bool nextConnected = jackLevelIsConnected(stableLevel, connectedLevel);
  if (nextConnected == connected) return false;
  connected = nextConnected;
  return true;
}

static inline void setupJackInputs() {
#if BECA_PLANT_JACK_DETECT_ENABLED
  pinMode(PLANT_JACK_PIN, BECA_PLANT_JACK_PIN_MODE);
  gPlantJackRawLevel = (uint8_t)digitalRead(PLANT_JACK_PIN);
  gPlantJackStableLevel = gPlantJackRawLevel;
  gPlantJackChangedAtMs = millis();
  gPlantJackConnected = jackLevelIsConnected(gPlantJackStableLevel, BECA_PLANT_JACK_CONNECTED_LEVEL);
#else
  gPlantJackConnected = true;
#endif

#if BECA_AUX_JACK_DETECT_ENABLED
  pinMode(AUX_JACK_PIN, BECA_AUX_JACK_PIN_MODE);
  gAuxJackRawLevel = (uint8_t)digitalRead(AUX_JACK_PIN);
  gAuxJackStableLevel = gAuxJackRawLevel;
  gAuxJackChangedAtMs = millis();
  gAuxJackConnected = jackLevelIsConnected(gAuxJackStableLevel, BECA_AUX_JACK_CONNECTED_LEVEL);
#else
  gAuxJackConnected = false;
#endif
}

static inline uint8_t nextOutputModeForCycle() {
  if (outputModeIsBle()) return auxSwitchReady() ? OUTPUT_AUX : OUTPUT_SERIAL;
  if (outputModeIsAux()) return OUTPUT_SERIAL;
  return OUTPUT_BLE;
}

static inline bool startAuxAudio() {
  if (ioMuteActive()) return true;
  if (gSynth.running()) return true;
  const bool ok = gSynth.start(I2S_BCK_PIN, I2S_WS_PIN, I2S_DATA_PIN, 44100, 128);
  if (ok) {
    gSynth.fadeIn(24);
    Serial.println("@I I2S START OK");
  } else {
    Serial.println("@E I2S START FAIL");
  }
  return ok;
}

static inline void stopAuxAudio() {
  if (!gSynth.running()) return;
  gSynth.fadeOut(24);
  delay(26);
  gSynth.stop();
  Serial.println("@I I2S STOP OK");
}

static inline void applyIoMute(bool muteOn) {
  if ((bool)gIoMuted == muteOn) return;

  gIoMuted = muteOn;
  allNotesOffBothTransports();
  gSynth.allNotesOff();
  gSynth.allDrumsOff();
  for (auto &q : offQ) q.on = false;
  for (auto &q : uiNoteQ) q.on = false;

  if (muteOn) {
    stopAuxAudio();
    Serial.println("@I IO MUTE ON");
    return;
  }

  Serial.println("@I IO MUTE OFF");
  if (outputModeIsAux()) {
    enforceAuxDrumGuard();
    gSynth.setDrumsEnabled(false);
    startAuxAudio();
  }
}

static inline void applyPlantAutoMute(bool muteOn) {
  if ((bool)gPlantAutoMuted == muteOn) return;

  gPlantAutoMuted = muteOn;
  allNotesOffBothTransports();
  gSynth.allNotesOff();
  gSynth.allDrumsOff();
  for (auto &q : offQ) q.on = false;
  for (auto &q : uiNoteQ) q.on = false;
  activeClear();

  if (muteOn) {
    stopAuxAudio();
    Serial.println("@I PLANT AUTO MUTE ON");
    return;
  }

  Serial.println("@I PLANT AUTO MUTE OFF");
  if (!ioMuteManualActive() && outputModeIsAux()) {
    enforceAuxDrumGuard();
    gSynth.setDrumsEnabled(false);
    startAuxAudio();
  }
}

static inline bool setOutputMode(uint8_t mode, OutputChangeSource source = OUTPUT_CHANGE_USER) {
  uint8_t next = (uint8_t)constrain((int)mode, 0, 2);
  if (source == OUTPUT_CHANGE_USER) {
    gAuxJackAutoActive = false;
    if (next != OUTPUT_AUX) {
      gAuxJackPreviousOutput = next;
      if (auxJackConnected()) gAuxJackAutoSuppressed = true;
    } else {
      gAuxJackAutoSuppressed = false;
    }
  }

  if (next == OUTPUT_AUX && !auxSwitchReady()) {
    Serial.printf("@I AUX LOCKED %lu ms\n", (unsigned long)auxSwitchWaitMs());
    return false;
  }
  if (next == gOutputMode) return true;

  Serial.printf("@I OUTPUTMODE %s -> %s\n", outputModeName(gOutputMode), outputModeName(next));
  allNotesOffBothTransports();
  gSynth.allNotesOff();
  gSynth.allDrumsOff();
  for (auto &q : offQ) q.on = false;
  for (auto &q : uiNoteQ) q.on = false;

  if (outputModeIsAux() && next != OUTPUT_AUX) {
    stopAuxAudio();
  }

  gOutputMode = next;
  normalizeEncoderSetting();

  if (outputModeIsAux()) {
    enforceAuxDrumGuard();
    gSynth.setDrumsEnabled(false);
    if (!ioMuteActive()) startAuxAudio();
    return true;
  }

  gSynth.setDrumsEnabled(true);

  if (outputModeIsSerial()) {
    gLastSerialBeaconMs = 0;
    Serial.println("@I MIDIMODE SERIAL");
  } else {
    Serial.println("@I MIDIMODE BLE");
    bleKickAdvertising();
  }
  return true;
}

static inline void setMidiOutModeLegacy(uint8_t mode) {
  const uint8_t next = (uint8_t)constrain((int)mode, 0, 1);
  setOutputMode(next == 1 ? OUTPUT_SERIAL : OUTPUT_BLE);
}

static inline void onBleMidiConnect()    { gMidiConnected = true; }
static inline void onBleMidiDisconnect() {
  gMidiConnected = false;
  allNotesOff();
  // Immediately resume advertising after disconnect
  if (outputModeIsBle()) bleKickAdvertising();
}

static inline void queueNoteOff(uint8_t note, uint8_t ch, uint16_t durMs) {
  uint32_t t = millis() + durMs;
  for (auto &q : offQ) {
    if (!q.on) { q.note = note; q.ch = ch; q.tOff = t; q.on = true; return; }
  }
  // if full, drop (better than blocking)
}

static inline void serviceNoteOffs() {
  uint32_t now = millis();
  for (auto &q : offQ) {
    if (q.on && (int32_t)(now - q.tOff) >= 0) {
      midiSendNoteOff(q.note, 0, q.ch);
      q.on = false;
    }
  }
}

// -------------------- Plant signal (EMA + baseline + noise tracking) --------------------
const float   EMA_ALPHA         = 0.03f;
const float   BASELINE_ALPHA    = 0.0012f;
const float   NOISE_TRACK_ALPHA = 0.0007f;
const float   PLANT_FLOOR_MAX   = 2.6f;
const float   PLANT_SCALE_MAX   = 80.0f;

float ema1 = 0, ema2 = 0, base1 = 0, base2 = 0;
float noise1 = 1.0f, noise2 = 1.0f;

float env = 0.0f;
const float ENV_ATTACK  = 0.35f;
const float ENV_RELEASE = 0.05f;

float sens = 0.2f;
const float AGC_ACTIVITY_GATE = 0.030f;
const float AGC_TARGET_LEVEL  = 0.30f;
const float AGC_MIN_GAIN      = 0.70f;
const float AGC_MAX_GAIN      = 3.80f;
const float AGC_LEVEL_ATTACK  = 0.09f;
const float AGC_LEVEL_RELEASE = 0.02f;
const float AGC_GAIN_SLEW     = 0.08f;
float agcLevel = AGC_TARGET_LEVEL;
float agcGain  = 1.0f;

// Cached features for UI (SSE)
volatile float   gFeatDeg    = 0.0f;
volatile float   gFeatOct    = 0.0f;
volatile float   gFeatEnergy = 0.0f;
volatile uint8_t gFeatVel    = 0;

// -------------------- Scope helpers --------------------
volatile float    gScopePlant   = 0.0f;   // 0..1
volatile uint16_t gPlantRaw1    = 0;
volatile uint16_t gPlantRaw2    = 0;

// Note-hold info still used (for MIDI grid + note hold state)
volatile uint32_t gHoldUntilMs  = 0;      // ms

// ---- Active note tracking for visual grid (supports chords) ----
static const uint8_t MAX_ACTIVE_NOTES = 16;
uint8_t gActiveNotes[MAX_ACTIVE_NOTES];
uint8_t gActiveCount = 0;

static inline void activeClear() { gActiveCount = 0; }
static inline void activeAdd(uint8_t midi) {
  for (uint8_t i = 0; i < gActiveCount; i++) if (gActiveNotes[i] == midi) return;
  if (gActiveCount < MAX_ACTIVE_NOTES) gActiveNotes[gActiveCount++] = midi;
}

// -------------------- Timing / Clock --------------------
enum ClockMode { CLOCK_INTERNAL = 0, CLOCK_PLANT = 1 };
ClockMode gClock = CLOCK_INTERNAL;

uint16_t bpm      = 60;
uint8_t  swingPct = 0;
bool     humanize = true;

struct TimeSignature {
  uint8_t beats;
  uint8_t noteVal;
  bool    triplet;
};
TimeSignature gTS = {4, 4, false};

static const uint8_t NOTE_LENGTH_COUNT = 8;
static const uint8_t NOTE_LENGTH_DENOMS[NOTE_LENGTH_COUNT] = {32, 16, 16, 8, 8, 4, 2, 1};
static const uint8_t NOTE_LENGTH_TRIPLETS[NOTE_LENGTH_COUNT] = {0, 1, 0, 1, 0, 0, 0, 0};
static const char* NOTE_LENGTH_LABELS[NOTE_LENGTH_COUNT] = {
  "1/32", "1/16t", "1/16", "1/8t", "1/8", "1/4", "1/2", "1/1"
};
uint8_t gNoteLengthIndex = 2;  // 1/16

static inline uint8_t currentStepDen() {
  return NOTE_LENGTH_DENOMS[(uint8_t)constrain((int)gNoteLengthIndex, 0, (int)NOTE_LENGTH_COUNT - 1)];
}

static inline bool currentStepTriplet() {
  return NOTE_LENGTH_TRIPLETS[(uint8_t)constrain((int)gNoteLengthIndex, 0, (int)NOTE_LENGTH_COUNT - 1)] != 0;
}

static inline const char* currentNoteLengthLabelC() {
  return NOTE_LENGTH_LABELS[(uint8_t)constrain((int)gNoteLengthIndex, 0, (int)NOTE_LENGTH_COUNT - 1)];
}

static inline float currentStepQuarterFactor() {
  float factor = 4.0f / (float)currentStepDen();
  if (currentStepTriplet()) factor *= (2.0f / 3.0f);
  return factor;
}

enum EncoderSettingId : uint8_t {
  ENC_SET_SENS = 0,
  ENC_SET_MODE,
  ENC_SET_SCALE,
  ENC_SET_ROOT,
  ENC_SET_TEMPO,
  ENC_SET_SWING,
  ENC_SET_REST,
  ENC_SET_OCTAVE_LOW,
  ENC_SET_OCTAVE_HIGH,
  ENC_SET_TIME_SIG,
  ENC_SET_NOTE_LENGTH,
  ENC_SET_FILTER,
  ENC_SET_RESONANCE,
  ENC_SET_COUNT
};

EncoderSettingId gEncoderSetting = ENC_SET_SENS;
bool gEncoderVolumeMode = false;
uint32_t gEncoderNavUntilMs = 0;
enum LedDisplayMode : uint8_t {
  LED_DISPLAY_SETTING = 0,
  LED_DISPLAY_VOLUME,
  LED_DISPLAY_OUTPUT,
  LED_DISPLAY_RANDOM
};
LedDisplayMode gLedDisplayTransientMode = LED_DISPLAY_SETTING;
uint32_t gLedDisplayTransientUntilMs = 0;
static inline bool encoderNavVisible(uint32_t nowMs);
static inline const char* encoderSettingApiName(EncoderSettingId setting);
static inline bool parseEncoderSettingArg(const String& value, EncoderSettingId& out);
static inline void normalizeEncoderSetting();
static inline LedDisplayMode currentLedDisplayMode(uint32_t nowMs);
static inline void clearLedDisplayTransient();
static inline void showLedDisplay(LedDisplayMode mode, uint32_t holdMs);

struct Transport {
  uint16_t bpm;
  uint8_t  beats;
  uint8_t  barDen;
  uint8_t  stepDen;
  uint8_t  stepTriplet;
  uint32_t stepMs;
  uint8_t  stepsPerBar;
  uint8_t  stepInBar;
  bool     swingOdd;
  uint32_t nextTickMs;
};
Transport T;

// -------------------- DAW Sync --------------------
volatile bool gDawSyncEnabled = false;
volatile bool gDawClockRunning = false;
volatile uint8_t gDawClockPulseAcc = 0;
volatile uint8_t gDawStepPending = 0;
volatile uint32_t gDawLastPulseMs = 0;
const uint32_t DAW_SYNC_TIMEOUT_MS = 1000;

static inline uint8_t dawPulsesPerStep();
static inline bool dawSyncLocked(uint32_t nowMs = 0);
static inline void applyDawSyncEnabled(bool enabled);
static inline void onMidiClock();
static inline void onMidiStart();
static inline void onMidiStop();
static inline void onMidiContinue();
static inline bool resetReasonIsCrash(esp_reset_reason_t reason);
static inline const char* resetReasonName(esp_reset_reason_t reason);

// -------------------- Runtime Recovery --------------------
static const uint32_t RUNTIME_STATE_MAGIC = 0x42454341UL;  // "BECA"
static const uint8_t RUNTIME_STATE_VER = 2;
const uint32_t RUNTIME_SAVE_DEBOUNCE_MS = 1400;
const uint32_t RUNTIME_SAVE_MIN_INTERVAL_MS = 7000;

enum StartupCheckStatus : uint8_t {
  STARTUP_CHECK_PENDING = 0,
  STARTUP_CHECK_OK,
  STARTUP_CHECK_WARN,
  STARTUP_CHECK_FAIL
};

enum StartupCheckId : uint8_t {
  STARTUP_CHECK_PREFS = 0,
  STARTUP_CHECK_SESSION,
  STARTUP_CHECK_PLANT,
  STARTUP_CHECK_BLE,
  STARTUP_CHECK_OUTPUT,
  STARTUP_CHECK_WIFI_SAVED,
  STARTUP_CHECK_NETWORK,
  STARTUP_CHECK_SERVICES
};

static const char* STARTUP_CHECK_LABELS[LED_COUNT] = {
  "prefs",
  "session",
  "plant",
  "ble",
  "output",
  "wifi_saved",
  "network",
  "services"
};

struct RuntimeStateBlob {
  uint32_t magic;
  uint8_t version;
  uint8_t outputmode;
  uint8_t io_muted;
  uint8_t daw_sync;
  uint8_t mode;
  uint8_t clock;
  uint8_t scale;
  uint8_t root;
  uint16_t bpm;
  uint8_t swing;
  uint8_t bright;
  uint8_t lo;
  uint8_t hi;
  uint8_t fx;
  uint8_t pal;
  uint8_t vs;
  uint8_t vi;
  uint8_t nr;
  uint8_t beats;
  uint8_t den;
  uint8_t note_length;
  uint8_t drumsel;
  float sens;
  float rest;
  beca::SynthParams synth;
};

volatile bool gRecoveringFromCrash = false;
uint8_t gCrashCount = 0;
uint8_t gLastResetReasonCode = 0;
uint32_t gLastRuntimeSig = 0;
uint32_t gLastRuntimeProbeMs = 0;
uint32_t gLastRuntimeSaveMs = 0;
uint32_t gRuntimeDirtySinceMs = 0;
bool gRuntimeSigInit = false;
bool gRuntimeDirty = false;
bool gSoftRestartPending = false;
uint32_t gSoftRestartAtMs = 0;
uint8_t gUnderrunHighStreak = 0;
StartupCheckStatus gStartupChecks[LED_COUNT] = {};

static inline uint32_t hashBytesFnv1a(uint32_t h, const void* data, size_t len);
static inline uint32_t runtimeStateSignature();
static inline void captureRuntimeState(RuntimeStateBlob& out);
static inline bool loadRuntimeStateFromOpenPrefs(RuntimeStateBlob& out);
static inline bool runtimeStateValid(const RuntimeStateBlob& in);
static inline void applyRuntimeState(const RuntimeStateBlob& in, bool applyOutputMode, bool applyMute);
static inline void saveRuntimeStateNow();
static inline void serviceRuntimeAutoSave(uint32_t nowMs);
static inline void requestSoftRestart(const char* reason);
static inline void resetStartupChecks();
static inline void setStartupCheck(StartupCheckId id, StartupCheckStatus status);
static inline void renderStartupCheckLeds(int8_t scanIndex = -1);
static inline void playStartupCheckAnimation();
static inline void logStartupCheckSummary();

// -------------------- Music theory --------------------
enum Mode { MODE_NOTE = 0, MODE_ARP = 1, MODE_CHORD = 2, MODE_DRUM = 3 };
Mode gMode = MODE_CHORD;

static inline bool drumsAllowedForCurrentOutput() { return !outputModeIsAux(); }
static inline void enforceAuxDrumGuard() {
  if (!drumsAllowedForCurrentOutput() && gMode == MODE_DRUM) {
    gMode = MODE_NOTE;
    Serial.println("@I AUX DRUM MODE BLOCKED -> NOTES");
  }
}

uint8_t rootMidi = 60; // stored as MIDI, we expose root "semi" in UI via rootMidi%12
uint8_t lowOct   = 3;
uint8_t highOct  = 6;

const int MAJOR[]    = {0,2,4,5,7,9,11};
const int MINOR[]    = {0,2,3,5,7,8,10};
const int DORIAN[]   = {0,2,3,5,7,9,10};
const int LYDIAN[]   = {0,2,4,6,7,9,11};
const int MIXOLY[]   = {0,2,4,5,7,9,10};
const int PENT_M[]   = {0,3,5,7,10};
const int PENT_MAJ[] = {0,2,4,7,9};
const int HARM_MIN[] = {0,2,3,5,7,8,11};
const int PHRYGIAN[] = {0,1,3,5,7,8,10};
const int WHOLE_T[]  = {0,2,4,6,8,10};

enum ScaleType {
  SCALE_MAJOR, SCALE_MINOR, SCALE_DORIAN, SCALE_LYDIAN, SCALE_MIXO,
  SCALE_PENT_MINOR, SCALE_PENT_MAJOR, SCALE_HARM_MIN, SCALE_PHRYGIAN, SCALE_WHOLE,
  SCALE_MAJ7, SCALE_MIN7, SCALE_DOM7, SCALE_SUS2, SCALE_SUS4
};
ScaleType gScale = SCALE_MAJOR;

// -------------------- Drum kit (FULL 8 PIECES) --------------------
static const uint8_t DRUM_CH = 10;

// GM-ish defaults:
static const uint8_t DR_KICK   = 36;
static const uint8_t DR_SNARE  = 38;
static const uint8_t DR_CHH    = 42; // closed hihat
static const uint8_t DR_OHH    = 46; // open hihat
static const uint8_t DR_TOM1   = 45;
static const uint8_t DR_TOM2   = 47;
static const uint8_t DR_RIDE   = 51;
static const uint8_t DR_CRASH  = 49;

enum DrumPart : uint8_t {
  DP_KICK=0, DP_SNARE=1, DP_CHH=2, DP_OHH=3, DP_TOM1=4, DP_TOM2=5, DP_RIDE=6, DP_CRASH=7,
  DP_COUNT=8
};

static inline uint8_t drumNoteForPart(uint8_t p){
  switch(p){
    case DP_KICK:  return DR_KICK;
    case DP_SNARE: return DR_SNARE;
    case DP_CHH:   return DR_CHH;
    case DP_OHH:   return DR_OHH;
    case DP_TOM1:  return DR_TOM1;
    case DP_TOM2:  return DR_TOM2;
    case DP_RIDE:  return DR_RIDE;
    case DP_CRASH: return DR_CRASH;
    default:       return DR_CHH;
  }
}

static inline int8_t drumPartFromNote(uint8_t note){
  if (note == DR_KICK)  return DP_KICK;
  if (note == DR_SNARE) return DP_SNARE;
  if (note == DR_CHH)   return DP_CHH;
  if (note == DR_OHH)   return DP_OHH;
  if (note == DR_TOM1)  return DP_TOM1;
  if (note == DR_TOM2)  return DP_TOM2;
  if (note == DR_RIDE)  return DP_RIDE;
  if (note == DR_CRASH) return DP_CRASH;
  return -1;
}

// bitmask of selected (enabled) drum parts; default all on
volatile uint8_t drumSelMask = 0xFF;

// drum hit visual hold
uint32_t gDrumHoldUntil[DP_COUNT] = {0};

static inline void drumMarkHit(uint8_t part, uint16_t holdMs=220){
  if (part >= DP_COUNT) return;
  uint32_t until = millis() + holdMs;
  if (until > gDrumHoldUntil[part]) gDrumHoldUntil[part] = until;
}

static inline uint8_t drumHitMaskNow(){
  uint32_t now = millis();
  uint8_t m = 0;
  for (uint8_t i=0;i<DP_COUNT;i++){
    if ((int32_t)(now - gDrumHoldUntil[i]) < 0) m |= (1u<<i);
  }
  return m;
}

// -------------------- Visuals --------------------
float   noteEnergy = 0.0f;
float   noteDecay  = 0.92f;
uint8_t lastNote   = 60;
uint8_t lastVel    = 96;

uint8_t visSpeed     = 128;
uint8_t visIntensity = 200;

// -------------------- Utilities --------------------
static inline float clampf(float x, float lo, float hi) {
  return x < lo ? lo : (x > hi ? hi : x);
}
static inline uint8_t clampToC1B8(uint8_t midi) {
  if (midi < 24)  return 24;   // C1
  if (midi > 119) return 119;  // B8
  return midi;
}

static inline uint32_t hashActiveNotes(const uint8_t* notes, uint8_t count, uint8_t held, uint8_t vel) {
  uint32_t h = 2166136261u;
  h = (h ^ held) * 16777619u;
  h = (h ^ vel ) * 16777619u;
  h = (h ^ count) * 16777619u;
  for (uint8_t i = 0; i < count; i++) {
    h = (h ^ notes[i]) * 16777619u;
  }
  return h;
}

static inline void triggerVisual(uint8_t note, uint8_t vel) {
  lastNote   = note;
  lastVel    = vel;
  noteEnergy = 1.0f;
}

// sendMelodic extends hold window (used by MIDI grid)
static inline void sendMelodic(uint8_t note, uint8_t vel = 96, uint8_t ch = 1, uint16_t gateMs = 120) {
  if (ioMuteActive()) return;
  if (humanize) gateMs = (uint16_t)constrain((int)gateMs + (int)random(-12, 12), 50, 600);
  uiQueueHeldNote(note, gateMs);

  if (outputModeIsAux()) {
    gSynth.noteOn(note, vel, gateMs);
  } else if (midiOutReady()) {
    midiSendNoteOn(note, vel, ch);
    queueNoteOff(note, ch, gateMs);
  }
  triggerVisual(note, vel);
  activeAdd(note);

  uint32_t now = millis();
  uint32_t until = now + gateMs;
  if (until > gHoldUntilMs) gHoldUntilMs = until;
}

// drums also light drum-grid + extend hold window (for feel)
static inline void sendDrum(uint8_t note, uint8_t vel = 110, uint16_t gateMs = 60) {
  if (ioMuteActive()) return;
  if (!drumsAllowedForCurrentOutput()) return;
  int8_t part = drumPartFromNote(note);
  if (part >= 0) {
    // respect selection mask
    if (((uint8_t)drumSelMask & (1u << (uint8_t)part)) == 0) return;
  }

  uiQueueHeldNote(note, gateMs);
  if (midiOutReady()) {
    midiSendNoteOn(note, vel, DRUM_CH);
    queueNoteOff(note, DRUM_CH, gateMs);
  }
  triggerVisual(note, vel);
  activeAdd(note);

  if (part >= 0) drumMarkHit((uint8_t)part, 220);

  uint32_t now = millis();
  uint32_t until = now + gateMs;
  if (until > gHoldUntilMs) gHoldUntilMs = until;
}

// -------------------- Palettes --------------------
DEFINE_GRADIENT_PALETTE(Sunset_gp)     {0,0,0,0, 20,30,1,2, 64,255,80,0, 130,255,0,0, 200,120,0,20, 255,10,0,30};
DEFINE_GRADIENT_PALETTE(OceanDeep_gp)  {0,0,2,10, 64,0,30,80, 128,0,70,120, 192,2,130,180, 255,0,6,18};
DEFINE_GRADIENT_PALETTE(ForestGlow_gp) {0,0,6,0, 80,0,40,0, 140,0,130,0, 200,5,200,10, 255,2,10,2};
DEFINE_GRADIENT_PALETTE(Cosmic_gp)     {0,5,0,10, 64,60,0,80, 128,2,10,30, 192,0,80,255, 255,255,255,255};
DEFINE_GRADIENT_PALETTE(Aurora_gp)     {0,0,10,0, 64,0,60,10, 128,20,200,30, 192,0,80,10, 255,0,10,0};
DEFINE_GRADIENT_PALETTE(IceBlue_gp)    {0,0,10,20, 64,0,40,90, 128,0,150,255, 192,180,220,255, 255,255,255,255};
DEFINE_GRADIENT_PALETTE(HeatSoft_gp)   {0,0,0,0, 64,255,30,0, 128,255,120,0, 192,255,200,0, 255,255,255,255};
DEFINE_GRADIENT_PALETTE(Vintage_gp)    {0,20,10,0, 80,70,30,5, 140,130,70,20, 200,200,150,80, 255,255,230,160};
DEFINE_GRADIENT_PALETTE(Pastel_gp)     {0,255,200,200, 64,200,255,200, 128,200,200,255, 192,255,220,180, 255,200,255,220};
DEFINE_GRADIENT_PALETTE(Retro_gp)      {0,5,5,5, 64,30,200,30, 128,220,30,60, 192,240,160,20, 255,10,10,10};
DEFINE_GRADIENT_PALETTE(Mojito_gp)     {0,2,20,8, 64,2,120,40, 128,4,200,80, 192,2,120,40, 255,2,20,8};
DEFINE_GRADIENT_PALETTE(TeaRose_gp)    {0,25,10,12, 64,80,30,40, 128,160,70,100, 192,230,120,160, 255,255,190,220};

const CRGBPalette16 builtinPalettes[] = {
  CRGBPalette16(RainbowColors_p), CRGBPalette16(RainbowStripeColors_p),
  CRGBPalette16(CloudColors_p),   CRGBPalette16(OceanColors_p),
  CRGBPalette16(ForestColors_p),  CRGBPalette16(LavaColors_p),
  CRGBPalette16(HeatColors_p),    CRGBPalette16(PartyColors_p)
};
const char* BUILTIN_NAMES[] = {
  "Rainbow","Rainbow Stripe","Cloud","Ocean","Forest","Lava","Heat","Party"
};

const CRGBPalette16 customPalettes[] = {
  CRGBPalette16(Sunset_gp),  CRGBPalette16(OceanDeep_gp), CRGBPalette16(ForestGlow_gp),
  CRGBPalette16(Cosmic_gp),  CRGBPalette16(Aurora_gp),    CRGBPalette16(IceBlue_gp),
  CRGBPalette16(HeatSoft_gp),CRGBPalette16(Vintage_gp),   CRGBPalette16(Pastel_gp),
  CRGBPalette16(Retro_gp),   CRGBPalette16(Mojito_gp),    CRGBPalette16(TeaRose_gp)
};
const char* CUSTOM_NAMES[] = {
  "Sunset","Ocean Deep","Forest Glow","Cosmic","Aurora","Ice Blue",
  "Heat Soft","Vintage","Pastel","Retro","Mojito","Tea Rose"
};

const uint8_t NUM_BUILTIN = sizeof(builtinPalettes) / sizeof(builtinPalettes[0]);
const uint8_t NUM_CUSTOM  = sizeof(customPalettes)  / sizeof(customPalettes[0]);
uint8_t currentPaletteIndex = NUM_BUILTIN + 10;

static inline CRGBPalette16 currentPalette() {
  if (currentPaletteIndex < NUM_BUILTIN) return builtinPalettes[currentPaletteIndex];
  return customPalettes[currentPaletteIndex - NUM_BUILTIN];
}

static inline const char* currentPaletteNameC() {
  if (currentPaletteIndex < NUM_BUILTIN) return BUILTIN_NAMES[currentPaletteIndex];
  return CUSTOM_NAMES[currentPaletteIndex - NUM_BUILTIN];
}

// -------------------- Effects --------------------
enum EffectMode {
  FX_GRADIENT_FLOW = 0, FX_PALETTE_WAVE, FX_SOFT_SWEEP, FX_COMET_TRAILS,
  FX_JUGGLE, FX_GLITTER_VEIL, FX_QUIET_FIRE, FX_NEON_BARS, FX_SPARKLE_MIST, FX_SPLIT_FADE,
  FX_COUNT
};
EffectMode fxMode = FX_GRADIENT_FLOW;

const char* EFFECT_NAMES[] = {
  "Gradient Flow","Palette Wave","Soft Sweep","Comet Trails",
  "Juggle","Glitter Veil","Quiet Fire","Neon Bars","Sparkle Mist","Split Fade"
};

const char EFFECTS_JSON[] PROGMEM = R"JSON({"list":[
"Gradient Flow","Palette Wave","Soft Sweep","Comet Trails","Juggle",
"Glitter Veil","Quiet Fire","Neon Bars","Sparkle Mist","Split Fade"
]})JSON";

const char PALETTES_JSON[] PROGMEM = R"JSON({"list":[
"Rainbow","Rainbow Stripe","Cloud","Ocean","Forest","Lava","Heat","Party",
"Sunset","Ocean Deep","Forest Glow","Cosmic","Aurora","Ice Blue",
"Heat Soft","Vintage","Pastel","Retro","Mojito","Tea Rose"
]})JSON";

static inline bool resetReasonIsCrash(esp_reset_reason_t reason) {
  return reason == ESP_RST_PANIC ||
         reason == ESP_RST_INT_WDT ||
         reason == ESP_RST_TASK_WDT ||
         reason == ESP_RST_WDT ||
         reason == ESP_RST_BROWNOUT;
}

static inline const char* resetReasonName(esp_reset_reason_t reason) {
  switch (reason) {
    case ESP_RST_UNKNOWN:   return "unknown";
    case ESP_RST_POWERON:   return "poweron";
    case ESP_RST_EXT:       return "ext";
    case ESP_RST_SW:        return "software";
    case ESP_RST_PANIC:     return "panic";
    case ESP_RST_INT_WDT:   return "int_wdt";
    case ESP_RST_TASK_WDT:  return "task_wdt";
    case ESP_RST_WDT:       return "wdt";
    case ESP_RST_DEEPSLEEP: return "deepsleep";
    case ESP_RST_BROWNOUT:  return "brownout";
    case ESP_RST_SDIO:      return "sdio";
    default:                return "other";
  }
}

static inline uint32_t hashBytesFnv1a(uint32_t h, const void* data, size_t len) {
  const uint8_t* p = (const uint8_t*)data;
  for (size_t i = 0; i < len; ++i) {
    h ^= p[i];
    h *= 16777619u;
  }
  return h;
}

static inline void captureRuntimeState(RuntimeStateBlob& out) {
  memset(&out, 0, sizeof(out));
  out.magic = RUNTIME_STATE_MAGIC;
  out.version = RUNTIME_STATE_VER;
  out.outputmode = (uint8_t)constrain((int)gOutputMode, 0, 2);
  out.io_muted = ioMuteManualActive() ? 1 : 0;
  out.daw_sync = gDawSyncEnabled ? 1 : 0;
  out.mode = (uint8_t)gMode;
  out.clock = (uint8_t)gClock;
  out.scale = (uint8_t)gScale;
  out.root = (uint8_t)(rootMidi % 12);
  out.bpm = (uint16_t)constrain((int)bpm, 20, 240);
  out.swing = (uint8_t)constrain((int)swingPct, 0, 60);
  out.bright = gBrightness;
  out.lo = (uint8_t)constrain((int)lowOct, 1, 8);
  out.hi = (uint8_t)constrain((int)highOct, 1, 8);
  out.fx = (uint8_t)fxMode;
  out.pal = (uint8_t)constrain((int)currentPaletteIndex, 0, (int)(NUM_BUILTIN + NUM_CUSTOM - 1));
  out.vs = visSpeed;
  out.vi = visIntensity;
  out.nr = avoidRepeats ? 1 : 0;
  out.beats = (uint8_t)constrain((int)gTS.beats, 1, 16);
  out.den = isValidDen(gTS.noteVal) ? gTS.noteVal : 4;
  out.note_length = (uint8_t)constrain((int)gNoteLengthIndex, 0, (int)NOTE_LENGTH_COUNT - 1);
  out.drumsel = (uint8_t)drumSelMask;
  out.sens = clampf(sens, 0.0f, 0.5f);
  out.rest = clampf(restProb, 0.0f, 0.8f);
  gSynth.getParams(out.synth);
}

static inline bool runtimeStateValid(const RuntimeStateBlob& in) {
  if (in.magic != RUNTIME_STATE_MAGIC) return false;
  if (in.version != RUNTIME_STATE_VER) return false;
  if (in.outputmode > 2) return false;
  if (in.mode > 3) return false;
  if (in.clock > 1) return false;
  if (in.scale > 14) return false;
  if (in.root > 11) return false;
  if (in.bpm < 20 || in.bpm > 240) return false;
  if (in.swing > 60) return false;
  if (in.lo < 1 || in.lo > 8) return false;
  if (in.hi < 1 || in.hi > 8) return false;
  if (in.fx >= (uint8_t)FX_COUNT) return false;
  if (in.pal >= (uint8_t)(NUM_BUILTIN + NUM_CUSTOM)) return false;
  if (!isValidDen(in.den)) return false;
  if (in.note_length >= NOTE_LENGTH_COUNT) return false;
  return true;
}

static inline bool loadRuntimeStateFromOpenPrefs(RuntimeStateBlob& out) {
  if (!prefs.isKey("rt_state")) return false;
  size_t n = prefs.getBytesLength("rt_state");
  if (n != sizeof(RuntimeStateBlob)) return false;
  if (prefs.getBytes("rt_state", &out, sizeof(RuntimeStateBlob)) != sizeof(RuntimeStateBlob)) return false;
  return runtimeStateValid(out);
}

static inline void applyRuntimeState(const RuntimeStateBlob& in, bool applyOutputMode, bool applyMute) {
  gMode = (Mode)constrain((int)in.mode, 0, 3);
  gClock = in.clock == (uint8_t)CLOCK_PLANT ? CLOCK_PLANT : CLOCK_INTERNAL;
  gScale = (ScaleType)constrain((int)in.scale, 0, 14);
  rootMidi = (uint8_t)(60 + (in.root % 12));
  bpm = (uint16_t)constrain((int)in.bpm, 20, 240);
  swingPct = (uint8_t)constrain((int)in.swing, 0, 60);
  gBrightness = (uint8_t)constrain((int)in.bright, 10, 255);
  lowOct = (uint8_t)constrain((int)in.lo, 1, 8);
  highOct = (uint8_t)constrain((int)in.hi, 1, 8);
  if (highOct < lowOct) highOct = lowOct;
  fxMode = (EffectMode)constrain((int)in.fx, 0, (int)FX_COUNT - 1);
  currentPaletteIndex = (uint8_t)constrain((int)in.pal, 0, (int)(NUM_BUILTIN + NUM_CUSTOM - 1));
  visSpeed = in.vs;
  visIntensity = in.vi;
  sens = clampf(in.sens, 0.0f, 0.5f);
  restProb = clampf(in.rest, 0.0f, 0.8f);
  avoidRepeats = (in.nr != 0);
  gTS.beats = (uint8_t)constrain((int)in.beats, 1, 16);
  gTS.noteVal = isValidDen(in.den) ? in.den : 4;
  gTS.triplet = false;
  gNoteLengthIndex = (uint8_t)constrain((int)in.note_length, 0, (int)NOTE_LENGTH_COUNT - 1);
  drumSelMask = in.drumsel;
  applyDawSyncEnabled(in.daw_sync != 0);
  if (applyOutputMode) gOutputMode = (uint8_t)constrain((int)in.outputmode, 0, 2);
  if (applyMute) gIoMuted = in.io_muted ? 1 : 0;
  gSynth.setParams(in.synth);
  enforceAuxDrumGuard();
  recalcTransport(true);
}

static inline uint32_t runtimeStateSignature() {
  RuntimeStateBlob snap;
  captureRuntimeState(snap);
  uint32_t h = 2166136261u;
  h = hashBytesFnv1a(h, &snap, sizeof(snap));
  h = (h ^ (uint8_t)gEncoderSetting) * 16777619u;
  h = (h ^ (gEncoderVolumeMode ? 1u : 0u)) * 16777619u;
  return h;
}

static inline void saveRuntimeStateNow() {
  RuntimeStateBlob snap;
  captureRuntimeState(snap);
  if (!prefs.begin("beca", false)) {
    gLastRuntimeSaveMs = millis();
    gRuntimeDirty = false;
    return;
  }
  prefs.putBytes("rt_state", &snap, sizeof(snap));
  prefs.putUChar("outputmode", snap.outputmode);
  prefs.putUChar("midimode", snap.outputmode == OUTPUT_SERIAL ? 1 : 0);  // legacy compatibility
  prefs.putUChar("encset", (uint8_t)gEncoderSetting);
  prefs.putUChar("encvol", gEncoderVolumeMode ? 1u : 0u);
  prefs.end();
  gLastRuntimeSaveMs = millis();
  gRuntimeDirty = false;
}

static inline void serviceRuntimeAutoSave(uint32_t nowMs) {
  if ((int32_t)(nowMs - gLastRuntimeProbeMs) < 450) return;
  gLastRuntimeProbeMs = nowMs;

  const uint32_t sig = runtimeStateSignature();
  if (!gRuntimeSigInit) {
    gLastRuntimeSig = sig;
    gRuntimeSigInit = true;
    gLastRuntimeSaveMs = nowMs;
    return;
  }

  if (sig != gLastRuntimeSig) {
    gLastRuntimeSig = sig;
    gRuntimeDirty = true;
    gRuntimeDirtySinceMs = nowMs;
  }

  if (gRuntimeDirty &&
      (int32_t)(nowMs - gRuntimeDirtySinceMs) >= (int32_t)RUNTIME_SAVE_DEBOUNCE_MS &&
      (int32_t)(nowMs - gLastRuntimeSaveMs) >= (int32_t)RUNTIME_SAVE_MIN_INTERVAL_MS) {
    saveRuntimeStateNow();
  }
}

static inline void requestSoftRestart(const char* reason) {
  if (gSoftRestartPending) return;
  saveRuntimeStateNow();
  gSoftRestartPending = true;
  gSoftRestartAtMs = millis() + 140;
  Serial.printf("@W SOFT RESTART %s\n", reason);
}

static inline void addGlitter(uint8_t chance, uint8_t v = 200) {
  if (random8() < chance) leds[random8(LED_COUNT)] += CHSV(0, 0, v);
}

void fxGradientFlow() {
  static uint16_t phase = 0;
  phase = (uint16_t)(phase + 1 + (visSpeed >> 5));

  const uint8_t level = (uint8_t)constrain(
      (int)(lastVel * noteEnergy * (visIntensity / 255.0f)), 12, 255);

  for (int i = 0; i < LED_COUNT; ++i) {
    const uint8_t idx =
        (uint8_t)((i * 255 / LED_COUNT + (phase >> 1) + (lastNote % 12) * 8) & 0xFF);
    leds[i] = ColorFromPalette(currentPalette(), idx, level, LINEARBLEND);
  }
}

void fxPaletteWave() {
  static uint16_t phase = 0;
  phase = (uint16_t)(phase + 2 + (visSpeed >> 5));

  const uint8_t level = (uint8_t)(noteEnergy * visIntensity);
  for (int i = 0; i < LED_COUNT; ++i) {
    const uint8_t sample = sin8(phase + i * 32);
    const uint8_t idx = (uint8_t)(sample + (lastNote % 12) * 4);
    leds[i] = ColorFromPalette(currentPalette(), idx, level, LINEARBLEND);
  }
  addGlitter(14, (uint8_t)(60 + (visIntensity >> 1)));
}

void fxSoftSweep() {
  static uint8_t base = 0; base += (1 + (visSpeed >> 6));
  uint8_t v = (uint8_t)constrain((int)(noteEnergy * visIntensity), 8, 255);
  for (int i = 0; i < LED_COUNT; i++) {
    uint8_t idx = base + i * 18;
    leds[i] = ColorFromPalette(currentPalette(), idx, v, LINEARBLEND);
  }
}

void fxCometTrails() {
  fadeToBlackBy(leds, LED_COUNT, 40);
  static uint16_t head = 0; head = (head + 1 + (visSpeed >> 6)) % (LED_COUNT * 6);
  int pos = head / 6;
  CRGB c = ColorFromPalette(currentPalette(), (millis() / 5 + lastNote * 3),
                            (uint8_t)(noteEnergy * visIntensity), LINEARBLEND);
  leds[pos] += c;
}

void fxJuggle() {
  fadeToBlackBy(leds, LED_COUNT, 28);
  uint8_t v = (uint8_t)(noteEnergy * visIntensity);
  for (uint8_t d = 0; d < 3; d++) {
    uint8_t pos = beatsin8(10 + d * 3 + (visSpeed >> 5), 0, LED_COUNT - 1);
    leds[pos] += ColorFromPalette(currentPalette(), (d * 85 + lastNote * 2), v, LINEARBLEND);
  }
}

void fxGlitterVeil() {
  for (int i = 0; i < LED_COUNT; i++) {
    leds[i] = ColorFromPalette(currentPalette(),
                               (i * 32 + millis() / (8 + (255 - visSpeed) / 12)),
                               (uint8_t)(noteEnergy * visIntensity), LINEARBLEND);
  }
  addGlitter(22, (uint8_t)(50 + (visIntensity >> 2)));
}

void fxQuietFire() {
  for (int i = 0; i < LED_COUNT; i++) {
    uint8_t idx = (millis() / (10 + (255 - visSpeed) / 10) + i * 20) & 0xFF;
    uint8_t v = (uint8_t)constrain((int)(noteEnergy * visIntensity), 12, 255);
    leds[i] = ColorFromPalette(currentPalette(), idx, v, LINEARBLEND);
  }
}

void fxNeonBars() {
  int bars = map(lastVel, 0, 127, 0, LED_COUNT);
  fill_solid(leds, LED_COUNT, CRGB::Black);
  for (int i = 0; i < bars; i++) {
    uint8_t idx = (i * 255 / LED_COUNT + (lastNote % 12) * 6);
    leds[i] = ColorFromPalette(currentPalette(), idx,
                               (uint8_t)(noteEnergy * visIntensity), LINEARBLEND);
  }
}

void fxSparkleMist() {
  fadeToBlackBy(leds, LED_COUNT, 26);
  uint8_t v = (uint8_t)(noteEnergy * visIntensity);
  leds[random8(LED_COUNT)] += ColorFromPalette(currentPalette(),
                                               (millis() / (7 + (255 - visSpeed) / 10) + lastNote * 5),
                                               v, LINEARBLEND);
}

void fxSplitFade() {
  uint8_t v = (uint8_t)(noteEnergy * visIntensity);
  int mid = LED_COUNT / 2;
  for (int i = 0; i < mid; i++)
    leds[i] = ColorFromPalette(currentPalette(),
                               (i * 40 + millis() / (10 + (255 - visSpeed) / 12)),
                               v, LINEARBLEND);
  for (int i = mid; i < LED_COUNT; i++)
    leds[i] = ColorFromPalette(currentPalette(),
                               (255 - i * 40 + millis() / (10 + (255 - visSpeed) / 12)),
                               v, LINEARBLEND);
}

static inline CRGB encoderSettingColor(EncoderSettingId setting) {
  switch (setting) {
    case ENC_SET_SENS:        return CRGB(0, 200, 83);
    case ENC_SET_MODE:        return CRGB(255, 212, 0);
    case ENC_SET_SCALE:       return CRGB(255, 90, 0);
    case ENC_SET_ROOT:        return CRGB(0, 200, 255);
    case ENC_SET_TEMPO:       return CRGB(241, 33, 41);
    case ENC_SET_SWING:       return CRGB(110, 44, 255);
    case ENC_SET_REST:        return CRGB(237, 41, 172);
    case ENC_SET_OCTAVE_LOW:
    case ENC_SET_OCTAVE_HIGH: return CRGB(255, 255, 255);
    case ENC_SET_TIME_SIG:    return CRGB(0, 196, 154);
    case ENC_SET_NOTE_LENGTH: return CRGB(18, 76, 236);
    case ENC_SET_FILTER:      return CRGB(0, 191, 69);
    case ENC_SET_RESONANCE:   return CRGB(255, 159, 0);
    default:                  return CRGB::Green;
  }
}

static inline const char* encoderSettingApiName(EncoderSettingId setting) {
  switch (setting) {
    case ENC_SET_SENS:        return "sensitivity";
    case ENC_SET_MODE:        return "preset";
    case ENC_SET_SCALE:       return "scale";
    case ENC_SET_ROOT:        return "root";
    case ENC_SET_TEMPO:       return "tempo";
    case ENC_SET_SWING:       return "swing";
    case ENC_SET_REST:        return "rest";
    case ENC_SET_OCTAVE_LOW:  return "octave_low";
    case ENC_SET_OCTAVE_HIGH: return "octave_high";
    case ENC_SET_TIME_SIG:    return "time_sig";
    case ENC_SET_NOTE_LENGTH: return "note_length";
    case ENC_SET_FILTER:      return "filter";
    case ENC_SET_RESONANCE:   return "resonance";
    default:                  return "sensitivity";
  }
}

static inline bool parseEncoderSettingArg(const String& value, EncoderSettingId& out) {
  if (value.length() == 0) return false;
  bool isNumeric = true;
  for (uint16_t i = 0; i < value.length(); ++i) {
    char c = value.charAt(i);
    if (c < '0' || c > '9') { isNumeric = false; break; }
  }
  if (isNumeric) {
    int idx = value.toInt();
    if (idx < 0 || idx >= (int)ENC_SET_COUNT) return false;
    out = (EncoderSettingId)idx;
    return true;
  }

  String key = value;
  key.toLowerCase();
  key.replace(" ", "_");
  if (key == "sensitivity" || key == "sens")                    { out = ENC_SET_SENS; return true; }
  if (key == "preset" || key == "mode")                         { out = ENC_SET_MODE; return true; }
  if (key == "scale")                                           { out = ENC_SET_SCALE; return true; }
  if (key == "root" || key == "root_note")                      { out = ENC_SET_ROOT; return true; }
  if (key == "tempo" || key == "bpm")                           { out = ENC_SET_TEMPO; return true; }
  if (key == "swing")                                           { out = ENC_SET_SWING; return true; }
  if (key == "rest")                                            { out = ENC_SET_REST; return true; }
  if (key == "octave" || key == "octave_range" || key == "oct_range" ||
      key == "octave_low" || key == "low_octave" || key == "low_oct") {
    out = ENC_SET_OCTAVE_LOW;
    return true;
  }
  if (key == "octave_high" || key == "high_octave" || key == "high_oct") {
    out = ENC_SET_OCTAVE_HIGH;
    return true;
  }
  if (key == "time_sig" || key == "timesig" || key == "ts")     { out = ENC_SET_TIME_SIG; return true; }
  if (key == "note_length" || key == "notelength")              { out = ENC_SET_NOTE_LENGTH; return true; }
  if (key == "filter" || key == "cutoff")                       { out = ENC_SET_FILTER; return true; }
  if (key == "resonance")                                       { out = ENC_SET_RESONANCE; return true; }
  return false;
}

static inline uint8_t encoderSettingLedCount() {
  beca::SynthParams p;
  switch (gEncoderSetting) {
    case ENC_SET_SENS:
      return (uint8_t)constrain((int)roundf((sens / 0.5f) * LED_COUNT), 1, LED_COUNT);
    case ENC_SET_MODE:
      if (outputModeIsAux()) {
        gSynth.getParams(p);
        return (uint8_t)constrain((int)roundf(((float)p.preset / (float)(beca::SynthEngine::kPresetCount - 1)) * (LED_COUNT - 1)) + 1, 1, LED_COUNT);
      }
      return (uint8_t)constrain((int)roundf(((float)gMode / 3.0f) * (LED_COUNT - 1)) + 1, 1, LED_COUNT);
    case ENC_SET_SCALE:
      return (uint8_t)constrain((int)roundf(((float)gScale / 14.0f) * (LED_COUNT - 1)) + 1, 1, LED_COUNT);
    case ENC_SET_ROOT:
      return (uint8_t)constrain((int)roundf((((float)(rootMidi % 12)) / 11.0f) * (LED_COUNT - 1)) + 1, 1, LED_COUNT);
    case ENC_SET_TEMPO:
      return 1;
    case ENC_SET_SWING:
      return (uint8_t)constrain((int)roundf(((float)swingPct / 60.0f) * LED_COUNT), 1, LED_COUNT);
    case ENC_SET_REST:
      return (uint8_t)constrain((int)roundf((restProb / 0.8f) * LED_COUNT), 1, LED_COUNT);
    case ENC_SET_OCTAVE_LOW:
    case ENC_SET_OCTAVE_HIGH:
      return (uint8_t)constrain((int)(highOct - lowOct + 1), 1, LED_COUNT);
    case ENC_SET_TIME_SIG:
      return (uint8_t)constrain((int)roundf(((float)gTS.beats / 12.0f) * LED_COUNT), 1, LED_COUNT);
    case ENC_SET_NOTE_LENGTH:
      return (uint8_t)constrain((int)roundf(((float)gNoteLengthIndex / (float)(NOTE_LENGTH_COUNT - 1)) * (LED_COUNT - 1)) + 1, 1, LED_COUNT);
    case ENC_SET_FILTER:
      gSynth.getParams(p);
      return (uint8_t)constrain((int)roundf(((log10f(max(20.0f, p.cutoffHz)) - log10f(20.0f)) / (log10f(18000.0f) - log10f(20.0f))) * LED_COUNT), 1, LED_COUNT);
    case ENC_SET_RESONANCE:
      gSynth.getParams(p);
      return (uint8_t)constrain((int)roundf((p.resonance / 10.0f) * LED_COUNT), 1, LED_COUNT);
    default:
      return 4;
  }
}

static inline uint8_t encoderDisplayedLedCount() {
  if (gEncoderVolumeMode) {
    beca::SynthParams p;
    gSynth.getParams(p);
    return (uint8_t)constrain((int)roundf(p.master * LED_COUNT), 1, LED_COUNT);
  }
  return encoderSettingLedCount();
}

static inline void copyLogicalLedsToPhysical() {
  for (uint8_t i = 0; i < LED_COUNT; ++i) {
    ledsPhysical[i] = leds[i];
  }
}

static inline const char* startupCheckStatusName(StartupCheckStatus status) {
  switch (status) {
    case STARTUP_CHECK_OK:   return "ok";
    case STARTUP_CHECK_WARN: return "warn";
    case STARTUP_CHECK_FAIL: return "fail";
    case STARTUP_CHECK_PENDING:
    default:                 return "pending";
  }
}

static inline CRGB startupCheckColor(StartupCheckStatus status) {
  switch (status) {
    case STARTUP_CHECK_OK:   return CRGB(36, 196, 92);
    case STARTUP_CHECK_WARN: return CRGB(255, 184, 28);
    case STARTUP_CHECK_FAIL: return CRGB(236, 52, 36);
    case STARTUP_CHECK_PENDING:
    default:                 return CRGB::Black;
  }
}

static inline void resetStartupChecks() {
  for (uint8_t i = 0; i < LED_COUNT; ++i) {
    gStartupChecks[i] = STARTUP_CHECK_PENDING;
  }
}

static inline void setStartupCheck(StartupCheckId id, StartupCheckStatus status) {
  if ((uint8_t)id >= LED_COUNT) return;
  gStartupChecks[(uint8_t)id] = status;
}

static inline void renderStartupCheckLeds(int8_t scanIndex) {
  fill_solid(leds, LED_COUNT, CRGB::Black);
  for (uint8_t i = 0; i < LED_COUNT; ++i) {
    leds[i] = startupCheckColor(gStartupChecks[i]);
  }

  if (scanIndex >= 0 && scanIndex < LED_COUNT) {
    uint8_t idx = (uint8_t)scanIndex;
    if (gStartupChecks[idx] == STARTUP_CHECK_PENDING) {
      leds[idx] = CRGB(40, 86, 160);
    } else {
      leds[idx] += CRGB(26, 26, 26);
    }
  }

  FastLED.setBrightness(max<uint8_t>(gBrightness, 110));
  copyLogicalLedsToPhysical();
  FastLED.show();
  delay(0);
}

static inline void playStartupCheckAnimation() {
  for (uint8_t i = 0; i < LED_COUNT; ++i) {
    renderStartupCheckLeds((int8_t)i);
    delay(90);
    delay(0);
  }
  renderStartupCheckLeds(-1);
  delay(420);
  delay(0);
  FastLED.setBrightness(gBrightness);
}

static inline void logStartupCheckSummary() {
  for (uint8_t i = 0; i < LED_COUNT; ++i) {
    Serial.printf("@I STARTUP CHECK %u %s %s\n",
                  (unsigned)(i + 1u),
                  STARTUP_CHECK_LABELS[i],
                  startupCheckStatusName(gStartupChecks[i]));
  }
}

static inline uint8_t tempoMetronomeLedIndex(uint32_t nowMs) {
  const uint16_t bpmSafe = (uint16_t)constrain((int)bpm, 20, 240);
  const uint32_t beatMs = max<uint32_t>(120, (uint32_t)(60000UL / bpmSafe));
  return (uint8_t)((nowMs / beatMs) % LED_COUNT);
}

static inline void renderOctaveRangeInfoLeds(const CRGB& color) {
  const uint8_t lo = (uint8_t)constrain((int)lowOct, 1, LED_COUNT);
  const uint8_t hi = (uint8_t)constrain((int)highOct, lo, LED_COUNT);
  for (uint8_t octave = lo; octave <= hi; ++octave) {
    leds[octave - 1] = color;
  }
}

static inline void renderSettingInfoLeds() {
  fill_solid(leds, LED_COUNT, CRGB::Black);

  const CRGB color = encoderSettingColor(gEncoderSetting);
  switch (gEncoderSetting) {
    case ENC_SET_TEMPO:
      leds[tempoMetronomeLedIndex(millis())] = color;
      break;
    case ENC_SET_OCTAVE_LOW:
    case ENC_SET_OCTAVE_HIGH:
      renderOctaveRangeInfoLeds(color);
      break;
    default: {
      const uint8_t onCount = encoderSettingLedCount();
      for (uint8_t i = 0; i < onCount; ++i) {
        leds[i] = color;
      }
      break;
    }
  }
}

static inline void renderVolumeInfoLeds() {
  static const CRGB kVolumeColors[LED_COUNT] = {
    CRGB(0, 200, 83),
    CRGB(0, 200, 83),
    CRGB(127, 217, 0),
    CRGB(216, 223, 0),
    CRGB(255, 212, 0),
    CRGB(255, 159, 0),
    CRGB(255, 90, 0),
    CRGB(241, 33, 41)
  };

  fill_solid(leds, LED_COUNT, CRGB::Black);
  const uint8_t onCount = encoderDisplayedLedCount();
  for (uint8_t i = 0; i < onCount; ++i) {
    leds[i] = kVolumeColors[i];
  }
}

static inline void renderOutputInfoLeds() {
  static const CRGB kBlePattern[LED_COUNT] = {
    CRGB(0, 200, 255),
    CRGB::Black,
    CRGB(0, 200, 255),
    CRGB::Black,
    CRGB(0, 200, 255),
    CRGB::Black,
    CRGB(0, 200, 255),
    CRGB::Black
  };
  static const CRGB kSerialPattern[LED_COUNT] = {
    CRGB(110, 44, 255),
    CRGB(0, 196, 154),
    CRGB(0, 200, 83),
    CRGB(0, 200, 83),
    CRGB(255, 212, 0),
    CRGB(255, 212, 0),
    CRGB(255, 90, 0),
    CRGB(241, 33, 41)
  };
  static const CRGB kAuxPattern[LED_COUNT] = {
    CRGB(0, 200, 83),
    CRGB(0, 200, 83),
    CRGB::Black,
    CRGB::Black,
    CRGB::Black,
    CRGB::Black,
    CRGB::Black,
    CRGB::Black
  };

  const CRGB* pattern = kBlePattern;
  if (outputModeIsSerial()) pattern = kSerialPattern;
  else if (outputModeIsAux()) pattern = kAuxPattern;
  for (uint8_t i = 0; i < LED_COUNT; ++i) {
    leds[i] = pattern[i];
  }
}

static inline void renderRandomInfoLeds() {
  static const CRGB kRandomPattern[LED_COUNT] = {
    CRGB(110, 44, 255),
    CRGB::Black,
    CRGB(0, 200, 83),
    CRGB::Black,
    CRGB(255, 212, 0),
    CRGB::Black,
    CRGB(255, 90, 0),
    CRGB::Black
  };

  for (uint8_t i = 0; i < LED_COUNT; ++i) {
    leds[i] = kRandomPattern[i];
  }
}

static inline void renderLEDs() {
  switch (currentLedDisplayMode(millis())) {
    case LED_DISPLAY_VOLUME:
      renderVolumeInfoLeds();
      break;
    case LED_DISPLAY_OUTPUT:
      renderOutputInfoLeds();
      break;
    case LED_DISPLAY_RANDOM:
      renderRandomInfoLeds();
      break;
    case LED_DISPLAY_SETTING:
    default:
      renderSettingInfoLeds();
      break;
  }
  FastLED.setBrightness(gBrightness);
  copyLogicalLedsToPhysical();
  FastLED.show();
}

static inline void startupAnim() {
  fill_solid(leds, LED_COUNT, CRGB::Green); copyLogicalLedsToPhysical(); FastLED.show(); delay(35);
  fill_solid(leds, LED_COUNT, CRGB::Black); copyLogicalLedsToPhysical(); FastLED.show(); delay(20);
  delay(0);
}

// -------------------- Scale helpers --------------------
static inline void getScaleArr(const int* &S, int &len) {
  switch (gScale) {
    case SCALE_MAJOR:      S = MAJOR;    len = 7; break;
    case SCALE_MINOR:      S = MINOR;    len = 7; break;
    case SCALE_DORIAN:     S = DORIAN;   len = 7; break;
    case SCALE_LYDIAN:     S = LYDIAN;   len = 7; break;
    case SCALE_MIXO:       S = MIXOLY;   len = 7; break;
    case SCALE_PENT_MINOR: S = PENT_M;   len = 5; break;
    case SCALE_PENT_MAJOR: S = PENT_MAJ; len = 5; break;
    case SCALE_HARM_MIN:   S = HARM_MIN; len = 7; break;
    case SCALE_PHRYGIAN:   S = PHRYGIAN; len = 7; break;
    case SCALE_WHOLE:      S = WHOLE_T;  len = 6; break;
    case SCALE_MAJ7:       S = MAJOR;    len = 7; break;
    case SCALE_MIN7:       S = MINOR;    len = 7; break;
    case SCALE_DOM7:       S = MIXOLY;   len = 7; break;
    case SCALE_SUS2:       S = MAJOR;    len = 7; break;
    case SCALE_SUS4:       S = MAJOR;    len = 7; break;
    default:               S = MAJOR;    len = 7; break;
  }
}

static inline bool isValidDen(uint8_t d) {
  return d == 1 || d == 2 || d == 4 || d == 8 || d == 16 || d == 32;
}

static inline void recalcTransport(bool resetPhase = true) {
  T.bpm         = (uint16_t)constrain((int)bpm, 20, 240);
  T.beats       = (uint8_t)constrain((int)gTS.beats, 1, 16);
  T.barDen      = isValidDen(gTS.noteVal) ? gTS.noteVal : 4;
  T.stepDen     = currentStepDen();
  T.stepTriplet = currentStepTriplet() ? 1 : 0;

  const float quarterMs = 60000.0f / (float)T.bpm;
  const float stepQuarterFactor = currentStepQuarterFactor();
  const float barQuarterFactor = (float)T.beats * (4.0f / (float)T.barDen);
  const float stepsPerBarF = max(1.0f, barQuarterFactor / max(0.01f, stepQuarterFactor));

  T.stepMs = (uint32_t)max(10.0f, quarterMs * stepQuarterFactor);
  T.stepsPerBar = (uint8_t)constrain((int)roundf(stepsPerBarF), 1, 32);

  if (resetPhase) {
    T.stepInBar  = 0;
    T.swingOdd   = false;
    T.nextTickMs = millis() + T.stepMs;
  }
}

static inline uint8_t dawPulsesPerStep() {
  float pulsesF = 24.0f * currentStepQuarterFactor();
  uint8_t pulses = (uint8_t)constrain((int)roundf(pulsesF), 1, 48);
  return pulses ? pulses : 1;
}

static inline bool dawSyncLocked(uint32_t nowMs) {
  if (!gDawSyncEnabled || !gDawClockRunning) return false;
  if (nowMs == 0) nowMs = millis();
  uint32_t last = gDawLastPulseMs;
  if (last == 0) return false;
  return (int32_t)(nowMs - last) <= (int32_t)DAW_SYNC_TIMEOUT_MS;
}

static inline void applyDawSyncEnabled(bool enabled) {
  if ((bool)gDawSyncEnabled == enabled) return;
  gDawSyncEnabled = enabled;
  gDawClockRunning = false;
  gDawClockPulseAcc = 0;
  gDawStepPending = 0;
  gDawLastPulseMs = 0;
  if (!enabled) T.nextTickMs = millis() + T.stepMs;
}

static inline void onMidiClock() {
  if (!gDawSyncEnabled) return;

  const uint32_t nowMs = millis();
  gDawLastPulseMs = nowMs;

  if (!gDawClockRunning) return;

  uint8_t acc = (uint8_t)(gDawClockPulseAcc + 1);
  const uint8_t pulsesPerStep = dawPulsesPerStep();
  while (acc >= pulsesPerStep) {
    acc = (uint8_t)(acc - pulsesPerStep);
    if (gDawStepPending < 8) gDawStepPending++;
  }
  gDawClockPulseAcc = acc;
}

static inline void onMidiStart() {
  if (!gDawSyncEnabled) return;
  gDawClockRunning = true;
  gDawClockPulseAcc = 0;
  gDawStepPending = 0;
  gDawLastPulseMs = millis();
  T.stepInBar = 0;
  T.swingOdd = false;
}

static inline void onMidiStop() {
  if (!gDawSyncEnabled) return;
  gDawClockRunning = false;
  gDawClockPulseAcc = 0;
  gDawStepPending = 0;
}

static inline void onMidiContinue() {
  if (!gDawSyncEnabled) return;
  gDawClockRunning = true;
  gDawLastPulseMs = millis();
}

// -------------------- Encoder --------------------
int  encLastA  = HIGH;
bool encLastSW = HIGH;
bool encRawSW = HIGH;
uint32_t encRawSwChangedMs = 0;
bool encPressed = false;
bool encHoldHandled = false;
uint32_t encPressStartMs = 0;
uint32_t encLastReleaseMs = 0;
uint32_t encLastStepMs = 0;
uint8_t encTapCount = 0;
const uint16_t ENC_SW_DEBOUNCE_MS = 28;
const uint16_t ENC_HOLD_MS = 550;
const uint16_t ENC_TAP_GAP_RESET_MS = 450;
const uint16_t ENC_TAP_SETTLE_MS = 260;

static inline void showEncoderNav(uint32_t holdMs = 4000) {
  gEncoderNavUntilMs = millis() + holdMs;
}

static inline void clearLedDisplayTransient() {
  gLedDisplayTransientMode = LED_DISPLAY_SETTING;
  gLedDisplayTransientUntilMs = 0;
}

static inline void showLedDisplay(LedDisplayMode mode, uint32_t holdMs) {
  gLedDisplayTransientMode = mode;
  gLedDisplayTransientUntilMs = millis() + holdMs;
}

static inline LedDisplayMode currentLedDisplayMode(uint32_t nowMs) {
  if (gEncoderVolumeMode) return LED_DISPLAY_VOLUME;
  if (gLedDisplayTransientMode != LED_DISPLAY_SETTING &&
      (int32_t)(gLedDisplayTransientUntilMs - nowMs) > 0) {
    return gLedDisplayTransientMode;
  }
  return LED_DISPLAY_SETTING;
}

static inline bool encoderNavVisible(uint32_t nowMs) {
  return gEncoderVolumeMode || (int32_t)(gEncoderNavUntilMs - nowMs) > 0;
}

static inline bool encoderSettingEnabled(EncoderSettingId setting) {
  switch (setting) {
    case ENC_SET_FILTER:
    case ENC_SET_RESONANCE:
      return outputModeIsAux();
    default:
      return true;
  }
}

static inline void normalizeEncoderSetting() {
  if (encoderSettingEnabled(gEncoderSetting)) return;
  gEncoderSetting = ENC_SET_SENS;
}

static inline void cycleEncoderSetting() {
  for (uint8_t i = 0; i < (uint8_t)ENC_SET_COUNT; ++i) {
    uint8_t next = ((uint8_t)gEncoderSetting + 1u + i) % (uint8_t)ENC_SET_COUNT;
    if (encoderSettingEnabled((EncoderSettingId)next)) {
      gEncoderSetting = (EncoderSettingId)next;
      return;
    }
  }
  gEncoderSetting = ENC_SET_SENS;
}

static inline void stepEncoderTimeSignature(int dir) {
  static const uint8_t beatsList[] = {1, 2, 2, 3, 4, 5, 7, 6, 9, 12, 4, 4, 8};
  static const uint8_t denList[]   = {1, 2, 4, 4, 4, 4, 4, 8, 8, 8, 8, 16, 32};
  static const uint8_t count = sizeof(beatsList) / sizeof(beatsList[0]);

  uint8_t idx = 4;
  for (uint8_t i = 0; i < count; ++i) {
    if (beatsList[i] == gTS.beats && denList[i] == gTS.noteVal) {
      idx = i;
      break;
    }
  }
  idx = (uint8_t)constrain((int)idx + dir, 0, (int)count - 1);
  gTS.beats = beatsList[idx];
  gTS.noteVal = denList[idx];
  gTS.triplet = false;
  recalcTransport(true);
}

static inline void randomizeBasicSettingsInline() {
  gMode  = (Mode)random(0, drumsAllowedForCurrentOutput() ? 4 : 3);
  gScale = (ScaleType)random(0, 15);
  bpm = (uint16_t)random(90, 151);
  lowOct  = random(1, 5);
  highOct = max<uint8_t>(lowOct, (uint8_t)random(lowOct, 9));
  sens = clampf(((float)random(0, 11)) / 20.0f, 0.0f, 0.5f);
  swingPct = (uint8_t)random(0, 40);
  restProb = (float)random(5, 20) / 100.0f;
  recalcTransport(true);
}

static inline void stepEncoderSelection(int dir) {
  beca::SynthParams p;
  const uint8_t prevMode = gOutputMode;
  clearLedDisplayTransient();

  switch (gEncoderSetting) {
    case ENC_SET_SENS:
      sens = clampf(sens + (dir * 0.01f), 0.0f, 0.5f);
      break;
    case ENC_SET_MODE: {
      if (outputModeIsAux()) {
        gSynth.getParams(p);
        const int nextPreset = constrain((int)p.preset + dir, 0, (int)beca::SynthEngine::kPresetCount - 1);
        gSynth.loadPreset((uint8_t)nextPreset);
      } else {
        int maxMode = drumsAllowedForCurrentOutput() ? 3 : 2;
        gMode = (Mode)constrain((int)gMode + dir, 0, maxMode);
      }
      break;
    }
    case ENC_SET_SCALE:
      gScale = (ScaleType)constrain((int)gScale + dir, 0, 14);
      break;
    case ENC_SET_ROOT: {
      int semi = constrain((rootMidi % 12) + dir, 0, 11);
      int oct = (rootMidi / 12) * 12;
      rootMidi = (uint8_t)(oct + semi);
      break;
    }
    case ENC_SET_TEMPO: {
      bpm = (uint16_t)constrain((int)bpm + dir, 20, 240);
      recalcTransport(false);
      break;
    }
    case ENC_SET_SWING:
      swingPct = (uint8_t)constrain((int)swingPct + dir, 0, 60);
      break;
    case ENC_SET_REST:
      restProb = clampf(restProb + dir * 0.01f, 0.0f, 0.8f);
      break;
    case ENC_SET_OCTAVE_LOW:
      lowOct = (uint8_t)constrain((int)lowOct + dir, 1, 8);
      if (lowOct > highOct) highOct = lowOct;
      break;
    case ENC_SET_OCTAVE_HIGH:
      highOct = (uint8_t)constrain((int)highOct + dir, 1, 8);
      if (highOct < lowOct) lowOct = highOct;
      break;
    case ENC_SET_TIME_SIG:
      stepEncoderTimeSignature(dir);
      break;
    case ENC_SET_NOTE_LENGTH:
      gNoteLengthIndex = (uint8_t)constrain((int)gNoteLengthIndex + dir, 0, (int)NOTE_LENGTH_COUNT - 1);
      recalcTransport(true);
      break;
    case ENC_SET_FILTER:
      gSynth.getParams(p);
      p.cutoffHz = clampf(p.cutoffHz * (dir > 0 ? 1.12f : (1.0f / 1.12f)), 20.0f, 18000.0f);
      gSynth.setParams(p);
      break;
    case ENC_SET_RESONANCE:
      gSynth.getParams(p);
      p.resonance = clampf(p.resonance + dir * 0.05f, 0.1f, 10.0f);
      gSynth.setParams(p);
      break;
    default:
      break;
  }

  if (prevMode != gOutputMode) normalizeEncoderSetting();
}

static inline void stepEncoderVolume(int dir) {
  beca::SynthParams p;
  clearLedDisplayTransient();
  gSynth.getParams(p);
  p.master = clampf(p.master + dir * 0.01f, 0.0f, 1.0f);
  gSynth.setParams(p);
}

static inline void setupEncoder() {
  pinMode(ENC_PIN_A,  INPUT_PULLUP);
  pinMode(ENC_PIN_B,  INPUT_PULLUP);
  pinMode(ENC_PIN_SW, BECA_ENCODER_SWITCH_PIN_MODE);
  encLastA  = digitalRead(ENC_PIN_A);
  encRawSW = digitalRead(ENC_PIN_SW);
  encLastSW = encRawSW;
  encRawSwChangedMs = millis();
}

static inline void applyEncoder() {
  const uint32_t nowMs = millis();
  int a = digitalRead(ENC_PIN_A);
  if (a != encLastA && a == LOW) {
    int b = digitalRead(ENC_PIN_B);
    if ((int32_t)(nowMs - encLastStepMs) >= 4) {
      encLastStepMs = nowMs;
      int dir = (b == HIGH) ? 1 : -1;
      if (gEncoderVolumeMode) stepEncoderVolume(dir);
      else stepEncoderSelection(dir);
      showEncoderNav();
      pushStateIfChanged(true);
    }
  }
  encLastA = a;

  const bool rawSw = digitalRead(ENC_PIN_SW);
  if (rawSw != encRawSW) {
    encRawSW = rawSw;
    encRawSwChangedMs = nowMs;
  }

  bool sw = encLastSW;
  if (rawSw != encLastSW &&
      (int32_t)(nowMs - encRawSwChangedMs) >= (int32_t)ENC_SW_DEBOUNCE_MS) {
      sw = rawSw;
  }

  const bool lastSwPressed = encoderSwitchLevelIsPressed(encLastSW);
  const bool swPressed = encoderSwitchLevelIsPressed(sw);

  if (!encPressed && !lastSwPressed && swPressed) {
    encPressed = true;
    encHoldHandled = false;
    encPressStartMs = nowMs;
  }

  if (encPressed && !encHoldHandled && swPressed &&
      (int32_t)(nowMs - encPressStartMs) >= (int32_t)ENC_HOLD_MS) {
    encHoldHandled = true;
    uint8_t next = nextOutputModeForCycle();
    setOutputMode(next);
    saveOutputModePref();
    normalizeEncoderSetting();
    showLedDisplay(LED_DISPLAY_OUTPUT, 1600);
    showEncoderNav(5200);
    pushStateIfChanged(true);
  }

  if (encPressed && lastSwPressed && !swPressed) {
    encPressed = false;
    if (!encHoldHandled) {
      if ((int32_t)(nowMs - encLastReleaseMs) > (int32_t)ENC_TAP_GAP_RESET_MS) {
        encTapCount = 0;
      }
      encTapCount++;
      encLastReleaseMs = nowMs;
      showEncoderNav();
    }
  }

  if (!encPressed && encTapCount > 0 &&
      (int32_t)(nowMs - encLastReleaseMs) > (int32_t)ENC_TAP_SETTLE_MS) {
    if (encTapCount == 1) {
      clearLedDisplayTransient();
      gEncoderVolumeMode = false;
      cycleEncoderSetting();
    } else if (encTapCount == 2) {
      gEncoderVolumeMode = true;
    } else {
      gEncoderVolumeMode = false;
      randomizeBasicSettingsInline();
      showLedDisplay(LED_DISPLAY_RANDOM, 1200);
    }
    encTapCount = 0;
    showEncoderNav(gEncoderVolumeMode ? 6000 : 4000);
    pushStateIfChanged(true);
  }
  encLastSW = sw;
}

// Forward declarations for WiFi event handler
extern Preferences prefs;
extern String gDeviceName;
extern String gStaSsid, gStaPass;
extern bool   gIsSta;
extern uint32_t gLastWifiOkMs;
extern uint32_t gLastWifiAttemptMs;
extern uint8_t  gWifiFailCount;
extern bool     gMdnsStarted;
extern String   gMdnsName;
extern uint32_t gLastMdnsAttemptMs;
extern volatile int32_t gLastStaDisconnectReason;
static inline void startMDNS();
static inline void serviceMDNS(uint32_t now);
static inline String sanitizeDeviceName(const String &raw);
static inline void normalizeDeviceName();
static inline bool setupPortalActive();

static void WiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  switch (event) {
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      Serial.printf("STA_DISCONNECTED reason=%d\n", info.wifi_sta_disconnected.reason);
      gLastStaDisconnectReason = info.wifi_sta_disconnected.reason;
      if (gWifiFailCount < 255) gWifiFailCount++;
      gLastWifiAttemptMs = 0;
      MDNS.end();
      gMdnsStarted = false;
      gMdnsName = "";
      gLastMdnsAttemptMs = 0;
      break;
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      gIsSta = true;
      gLastWifiOkMs = millis();
      gWifiFailCount = 0;
      gLastMdnsAttemptMs = 0;
      startMDNS();
      break;
    case ARDUINO_EVENT_WIFI_STA_LOST_IP:
      Serial.println("STA_LOST_IP");
      break;
    default:
      break;
  }
}

// -------------------- Plant performer --------------------
const float BIN_HYST = 0.08f;
float lastDegBinF = 0.0f, lastOctBinF = 0.0f;
int   heldDegIdx  = 0,     heldOctIdx  = 0;

float lastEnergy = 0.0f;
float triggerEnergy = 0.0f;
bool  gPlantTriggerReady = true;
uint32_t gPlantTriggerReleaseMs = 0;
const float   TRIG_THRESH_ON     = 0.14f;
const float   TRIG_THRESH_OFF    = 0.08f;
const float   TRIG_SMOOTH_ALPHA  = 0.22f;
uint32_t      lastNoteMs         = 0;
const uint16_t MIN_INTER_NOTE_MS = 130;
const uint16_t TRIG_REARM_MS     = 55;

float   restProb     = 0.12f;
bool    avoidRepeats = false;
uint8_t lastMidiOut  = 255;

volatile bool    gPlantArmed  = false;
volatile uint8_t gPlantVel    = 96;
volatile float   gPlantEnergy = 0.0f;

static inline int stickyBin(float f, float &fLast, int currentIdx, int bins) {
  float target = (float)currentIdx / max(1, bins - 1);
  if (fabsf(f - target) > BIN_HYST) {
    int idx = (int)roundf(f * (bins - 1));
    idx = constrain(idx, 0, bins - 1);
    fLast = f;
    return idx;
  }
  return currentIdx;
}

static inline uint8_t buildMidiFromBins(int degIdx, int octIdx) {
  const int* S; int len; getScaleArr(S, len);
  int interval = S[constrain(degIdx, 0, len - 1)];

  int octMin   = lowOct;
  int octMax   = max(lowOct, highOct);
  int bins     = max(1, octMax - octMin + 1);
  int octave   = octMin + constrain(octIdx, 0, bins - 1);

  uint8_t rootSemi = (uint8_t)(rootMidi % 12);
  int baseC = 12 * (octave + 1);
  int m = baseC + (int)rootSemi + interval;
  m = constrain(m, 24, 120);
  return (uint8_t)m;
}

static inline void resetPlantTrackingToRaw(float raw1, float raw2) {
  ema1 = base1 = raw1;
  ema2 = base2 = raw2;
  noise1 = noise2 = 1.0f;
  env = 0.0f;
  agcLevel = AGC_TARGET_LEVEL;
  agcGain = 1.0f;
  lastEnergy = 0.0f;
  triggerEnergy = 0.0f;
  gPlantArmed = false;
  gPlantVel = 0;
  gPlantEnergy = 0.0f;
  gFeatDeg = 0.0f;
  gFeatOct = 0.0f;
  gFeatEnergy = 0.0f;
  gFeatVel = 0;
  gScopePlant = 0.0f;
}

static inline void resetPlantTrackingToCurrentRaw() {
  const float raw1 = analogRead(PLANT1_PIN);
  const float raw2 = (PLANT2_PIN == PLANT1_PIN) ? raw1 : analogRead(PLANT2_PIN);
  gPlantRaw1 = (uint16_t)constrain((int)raw1, 0, 4095);
  gPlantRaw2 = (uint16_t)constrain((int)raw2, 0, 4095);
  resetPlantTrackingToRaw(raw1, raw2);
}

static inline void serviceJackInputs(uint32_t nowMs) {
  bool plantChanged = false;
  bool auxChanged = false;

#if BECA_PLANT_JACK_DETECT_ENABLED
  plantChanged = updateDebouncedJack(
    PLANT_JACK_PIN,
    BECA_PLANT_JACK_CONNECTED_LEVEL,
    gPlantJackRawLevel,
    gPlantJackStableLevel,
    gPlantJackChangedAtMs,
    gPlantJackConnected,
    nowMs
  );
#endif

#if BECA_AUX_JACK_DETECT_ENABLED
  auxChanged = updateDebouncedJack(
    AUX_JACK_PIN,
    BECA_AUX_JACK_CONNECTED_LEVEL,
    gAuxJackRawLevel,
    gAuxJackStableLevel,
    gAuxJackChangedAtMs,
    gAuxJackConnected,
    nowMs
  );
#endif

  if (plantChanged) {
    const bool plantConnected = plantJackConnected();
    applyPlantAutoMute(!plantConnected);
    resetPlantTrackingToCurrentRaw();
    gPlantTriggerReady = false;
    gPlantTriggerReleaseMs = nowMs;
    lastNoteMs = nowMs;
    setStartupCheck(STARTUP_CHECK_PLANT, plantConnected ? STARTUP_CHECK_OK : STARTUP_CHECK_WARN);
    Serial.printf("@I PLANT JACK %s\n", plantConnected ? "CONNECTED" : "DISCONNECTED");
    pushStateIfChanged(true);
  }

  if (auxChanged) {
    Serial.printf("@I AUX JACK %s\n", auxJackConnected() ? "CONNECTED" : "DISCONNECTED");
    pushStateIfChanged(true);
  }

  if (!auxJackConnected()) {
    gAuxJackAutoSuppressed = false;
    if (gAuxJackAutoActive) {
      const uint8_t restore = (gAuxJackPreviousOutput == OUTPUT_SERIAL) ? OUTPUT_SERIAL : OUTPUT_BLE;
      gAuxJackAutoActive = false;
      if (setOutputMode(restore, OUTPUT_CHANGE_AUX_RESTORE)) {
        showLedDisplay(LED_DISPLAY_OUTPUT, 1600);
        showEncoderNav(4000);
        pushStateIfChanged(true);
        Serial.printf("@I AUX JACK AUTO RESTORE %s\n", outputModeName(restore));
      }
    }
    return;
  }

  if (gAuxJackAutoSuppressed || outputModeIsAux()) return;

  if (!auxSwitchReady()) {
    if ((int32_t)(nowMs - gLastAuxAutoLogMs) >= 1000) {
      gLastAuxAutoLogMs = nowMs;
      Serial.printf("@I AUX JACK AUTO WAIT %lu ms\n", (unsigned long)auxSwitchWaitMs());
    }
    return;
  }

  gAuxJackPreviousOutput = outputModeIsSerial() ? OUTPUT_SERIAL : OUTPUT_BLE;
  if (setOutputMode(OUTPUT_AUX, OUTPUT_CHANGE_AUX_AUTO)) {
    gAuxJackAutoActive = true;
    showLedDisplay(LED_DISPLAY_OUTPUT, 1600);
    showEncoderNav(5200);
    pushStateIfChanged(true);
    Serial.println("@I AUX JACK AUTO OUTPUT AUX");
  }
}

static inline void samplePlant(float &fDeg, float &fOct, uint8_t &velOut, float &energyOut) {
  float raw1 = analogRead(PLANT1_PIN);
  float raw2 = (PLANT2_PIN == PLANT1_PIN) ? raw1 : analogRead(PLANT2_PIN);
  gPlantRaw1 = (uint16_t)constrain((int)raw1, 0, 4095);
  gPlantRaw2 = (uint16_t)constrain((int)raw2, 0, 4095);

  if (!plantJackConnected()) {
    resetPlantTrackingToRaw(raw1, raw2);
    fDeg = 0.0f;
    fOct = 0.0f;
    velOut = 0;
    energyOut = 0.0f;
    return;
  }

  ema1  += EMA_ALPHA      * (raw1 - ema1);
  ema2  += EMA_ALPHA      * (raw2 - ema2);
  base1 += BASELINE_ALPHA * (ema1 - base1);
  base2 += BASELINE_ALPHA * (ema2 - base2);

  float d1 = fabsf(ema1 - base1);
  float d2 = fabsf(ema2 - base2);

  noise1 += NOISE_TRACK_ALPHA * (d1 - noise1);
  noise2 += NOISE_TRACK_ALPHA * (d2 - noise2);

  float envNoise = max(noise1, noise2);
  const float MIN_FLOOR = 0.25f;
  float floorLevel = max(MIN_FLOOR, envNoise * 0.15f);
  floorLevel = clampf(floorLevel, MIN_FLOOR, PLANT_FLOOR_MAX);

  if (d1 < floorLevel) d1 = 0.0f;
  if (d2 < floorLevel) d2 = 0.0f;

  float scale = envNoise;
  if (scale < 4.0f)   scale = 4.0f;
  if (scale > PLANT_SCALE_MAX) scale = PLANT_SCALE_MAX;

  float a1 = (d1 / scale) * sens * 2.5f;
  float a2 = (d2 / scale) * sens * 2.5f;
  a1 = clampf(a1, 0.0f, 3.0f);
  a2 = clampf(a2, 0.0f, 3.0f);

  // Adaptive gain keeps sensor response consistent across different power/noise setups.
  float ampPre = clampf((a1 + a2) * 0.5f, 0.0f, 1.6f);
  if (ampPre > AGC_ACTIVITY_GATE) {
    const float levelAlpha = (ampPre > agcLevel) ? AGC_LEVEL_ATTACK : AGC_LEVEL_RELEASE;
    agcLevel += levelAlpha * (ampPre - agcLevel);
  } else {
    agcLevel += 0.0015f * (AGC_TARGET_LEVEL - agcLevel);
  }
  float gainTarget = clampf(AGC_TARGET_LEVEL / max(0.06f, agcLevel), AGC_MIN_GAIN, AGC_MAX_GAIN);
  if (ampPre <= AGC_ACTIVITY_GATE) gainTarget = 1.0f;
  agcGain += AGC_GAIN_SLEW * (gainTarget - agcGain);

  a1 = clampf(a1 * agcGain, 0.0f, 3.0f);
  a2 = clampf(a2 * agcGain, 0.0f, 3.0f);

  float amp = clampf((a1 + a2) * 0.5f, 0.0f, 1.6f);
  if (amp > env) env += ENV_ATTACK  * (amp - env);
  else           env += ENV_RELEASE * (amp - env);
  env = clampf(env, 0.0f, 1.6f);

  fDeg = clampf(a1 / (1.0f + a1), 0.0f, 1.0f);
  fOct = clampf(a2 / (1.0f + a2), 0.0f, 1.0f);

  float e = clampf(env / 1.6f, 0.0f, 1.0f);
  energyOut = e;
  velOut = (uint8_t)constrain((int)(52 + 72 * e), 38, 127);

  gFeatDeg    = fDeg;
  gFeatOct    = fOct;
  gFeatEnergy = e;
  gFeatVel    = velOut;

  gScopePlant = e;
}

static inline void warmupPlant(uint16_t ms = 700) {
  uint32_t t0 = millis();
  float f1, f2, e; uint8_t v;
  while ((millis() - t0) < ms) {
    samplePlant(f1, f2, v, e);
    delay(2);
    delay(0);
  }
}

extern bool gWarmupDone;
extern uint32_t gWarmupEndMs;

static inline void warmupPlantBackground() {
  if (gWarmupDone) return;
  if ((int32_t)(millis() - gWarmupEndMs) >= 0) {
    gWarmupDone = true;
    return;
  }
  float f1, f2, e; uint8_t v;
  samplePlant(f1, f2, v, e);
}

static inline void plantPerformerTick() {
  float fDeg, fOct, energy; uint8_t vel;
  samplePlant(fDeg, fOct, vel, energy);

  const int* S; int len; getScaleArr(S, len);
  int octMin  = lowOct;
  int octMax  = max(lowOct, highOct);
  int octSpan = max(1, octMax - octMin + 1);

  heldDegIdx = stickyBin(fDeg, lastDegBinF, heldDegIdx, len);
  heldOctIdx = stickyBin(fOct, lastOctBinF, heldOctIdx, octSpan);

  uint32_t now = millis();
  triggerEnergy += TRIG_SMOOTH_ALPHA * (energy - triggerEnergy);
  triggerEnergy = clampf(triggerEnergy, 0.0f, 1.0f);
  bool spacingOK = (now - lastNoteMs) >= MIN_INTER_NOTE_MS;

  if (gPlantTriggerReady) {
    if (triggerEnergy >= TRIG_THRESH_ON && spacingOK) {
      gPlantArmed  = true;
      gPlantVel    = vel;
      gPlantEnergy = triggerEnergy;
      lastNoteMs   = now;
      gPlantTriggerReady = false;
      gPlantTriggerReleaseMs = 0;
    }
  } else if (triggerEnergy <= TRIG_THRESH_OFF) {
    if (gPlantTriggerReleaseMs == 0) {
      gPlantTriggerReleaseMs = now;
    } else if ((now - gPlantTriggerReleaseMs) >= TRIG_REARM_MS) {
      gPlantTriggerReady = true;
    }
  } else {
    gPlantTriggerReleaseMs = 0;
  }

  lastEnergy = triggerEnergy;
}

static inline uint16_t gateFromStep(float mult = 0.90f) {
  return (uint16_t)constrain((int)((float)T.stepMs * mult), 60, 650);
}

static inline uint16_t melodicGateMs(float mult = 0.90f) {
  return gateFromStep(mult);
}

// -------------------- Internal steps --------------------
static inline void stepNOTE_internal() {
  const int* S; int len; getScaleArr(S, len);
  if (random(100) < (int)(restProb * 100.0f)) return;

  uint8_t note = buildMidiFromBins(heldDegIdx, heldOctIdx);
  if (avoidRepeats && lastMidiOut == note && len > 1) {
    int alt = constrain(heldDegIdx + (random(0, 2) ? 1 : -1), 0, len - 1);
    note = buildMidiFromBins(alt, heldOctIdx);
  }

  uint8_t vel = (uint8_t)constrain((int)(56 + 70 * lastEnergy), 40, 127);
  sendMelodic(note, vel, 1, gateFromStep(0.90f));
  lastMidiOut = note;
}

static inline void stepARP_internal() {
  const int* S; int len; getScaleArr(S, len);
  int baseDeg = heldDegIdx;
  static int dir = 1, pos = 0;
  pos += dir;
  if (pos >= 2)  { dir = -1; pos = 1; }
  if (pos <= -1) { dir = +1; pos = 0; }

  int d = constrain(baseDeg + pos, 0, len - 1);
  uint8_t note = buildMidiFromBins(d, heldOctIdx);
  uint8_t vel  = (uint8_t)constrain((int)(56 + 70 * lastEnergy), 40, 127);
  sendMelodic(note, vel, 1, gateFromStep(0.90f));
  lastMidiOut = note;
}

static inline void stepCHORD_internal() {
  const int* S; int len; getScaleArr(S, len);

  uint8_t step = T.stepInBar;
  bool onStart = (step == 0);
  bool onMid   = (T.stepsPerBar % 2 == 0) && (step == (T.stepsPerBar / 2));
  if (!(onStart || onMid)) return;

  uint8_t vel  = (uint8_t)constrain((int)(54 + 66 * lastEnergy), 40, 120);

  int chordDegrees[4] = {0, 2, 4, 6};
  int numNotes = (len >= 7 ? 4 : 3);

  for (int i = 0; i < numNotes; ++i) {
    int deg = (heldDegIdx + chordDegrees[i]) % len;
    uint8_t note = buildMidiFromBins(deg, heldOctIdx);
    if (i >= 2) note = clampToC1B8((uint8_t)constrain((int)note + 12, 24, 119));
    sendMelodic(note, vel, 1,
      (uint16_t)constrain((int)((float)T.stepMs * (float)T.stepsPerBar * 0.85f), 180, 1200)
    );
    lastMidiOut = note;
  }
}

static inline void stepDRUM_internal() {
  if (!drumsAllowedForCurrentOutput()) {
    stepNOTE_internal();
    return;
  }
  float fd, fo, e; uint8_t vel;
  samplePlant(fd, fo, vel, e);

  uint8_t b = T.stepInBar % max<uint8_t>(T.stepsPerBar, 1);

  uint8_t kickVel  = (uint8_t)max((int)80, (int)vel);
  uint8_t snareVel = (uint8_t)max((int)70, (int)((uint8_t)(vel * 0.9f)));

  // Core backbeat
  if (b == 0) sendDrum(DR_KICK, kickVel);

  if ((T.stepsPerBar % 2 == 0 && b == T.stepsPerBar / 2) ||
      (T.stepsPerBar % 2 == 1 && b == T.stepsPerBar - 1))
    sendDrum(DR_SNARE, snareVel);

  // Hats: closed on most steps, open on energy peaks
  if (e > 0.72f && (b % 4 == 2)) sendDrum(DR_OHH, (uint8_t)constrain((int)(55 + 55*e), 55, 120));
  else sendDrum(DR_CHH, (uint8_t)(58 + (b % 2 ? 12 : 0)));

  if (gTS.triplet && (b == ((T.stepsPerBar * 2) / 3))) sendDrum(DR_CHH, 52);

  // Fills: toms + cymbals near bar-end if energy high
  if (e > 0.62f && b == T.stepsPerBar - 2) sendDrum(DR_TOM1, vel);
  if (e > 0.68f && b == T.stepsPerBar - 1) sendDrum(DR_TOM2, vel);

  if (e > 0.78f && b == 0) sendDrum(DR_CRASH, (uint8_t)constrain((int)(70 + 40*e), 70, 127));
  if (e > 0.70f && (b % 4 == 0)) sendDrum(DR_RIDE, (uint8_t)constrain((int)(55 + 35*e), 55, 110));
}

static inline void step_fromPlantTrigger() {
  if (!plantJackConnected()) {
    gPlantArmed = false;
    return;
  }
  if (!gPlantArmed) return;
  activeClear();
  gPlantArmed = false;

  const int* S; int len; getScaleArr(S, len);
  (void)S;

  uint8_t vel   = gPlantVel;
  float   energ = gPlantEnergy;

  uint8_t note = buildMidiFromBins(heldDegIdx, heldOctIdx);

  uint16_t gate = (uint16_t)constrain((int)(120 + 480 * energ), 80, 700);

  switch (gMode) {
    case MODE_NOTE:
      sendMelodic(note, vel, 1, gate);
      lastMidiOut = note;
      break;

    case MODE_ARP: {
      static int dir = 1, pos = 0;
      pos += dir;
      if (pos >= 2)  { dir = -1; pos = 1; }
      if (pos <= -1) { dir = +1; pos = 0; }
      int d = constrain(heldDegIdx + pos, 0, len - 1);
      uint8_t n = buildMidiFromBins(d, heldOctIdx);
      sendMelodic(n, vel, 1, gateFromStep(0.85f));
      lastMidiOut = n;
    } break;

    case MODE_CHORD: {
      int chordDegrees[4] = {0, 2, 4, 6};
      int numNotes = (len >= 7 ? 4 : 3);
      for (int i = 0; i < numNotes; ++i) {
        int deg = (heldDegIdx + chordDegrees[i]) % len;
        uint8_t n = buildMidiFromBins(deg, heldOctIdx);
        if (i >= 2) n = clampToC1B8((uint8_t)constrain((int)n + 12, 24, 108));
        sendMelodic(n, (uint8_t)constrain((int)(vel * 0.92f), 30, 127), 1,
                    (uint16_t)constrain((int)(gate * 1.4f), 120, 1200));
        lastMidiOut = n;
      }
    } break;

    case MODE_DRUM: {
      if (!drumsAllowedForCurrentOutput()) {
        sendMelodic(note, vel, 1, gate);
        lastMidiOut = note;
        break;
      }
      // Plant-triggered "hit" can play multiple parts depending on energy,
      // but still respects drumSelMask.
      uint8_t kickVel  = (uint8_t)max((int)80, (int)vel);
      uint8_t snareVel = (uint8_t)max((int)70, (int)((uint8_t)(vel * 0.9f)));

      sendDrum(DR_KICK, kickVel);
      if (energ > 0.40f) sendDrum(DR_SNARE, snareVel);

      if (energ > 0.75f) sendDrum(DR_OHH, (uint8_t)constrain((int)(70 + 40*energ), 60, 127));
      else sendDrum(DR_CHH, (uint8_t)constrain((int)(50 + 40 * energ), 40, 110));

      if (energ > 0.60f) sendDrum(DR_TOM1, (uint8_t)constrain((int)(60 + 50*energ), 50, 127));
      if (energ > 0.70f) sendDrum(DR_TOM2, (uint8_t)constrain((int)(60 + 55*energ), 50, 127));

      if (energ > 0.82f) sendDrum(DR_CRASH, (uint8_t)constrain((int)(75 + 40*energ), 75, 127));
      else if (energ > 0.68f) sendDrum(DR_RIDE, (uint8_t)constrain((int)(55 + 35*energ), 55, 115));
    } break;
  }
}

static inline void transportTick() {
  activeClear();
  T.stepInBar++;
  if (T.stepInBar >= T.stepsPerBar) T.stepInBar = 0;
  if (ioMuteActive()) return;
  if (!plantJackConnected()) return;

  switch (gMode) {
    case MODE_NOTE:  stepNOTE_internal();  break;
    case MODE_ARP:   stepARP_internal();   break;
    case MODE_CHORD: stepCHORD_internal(); break;
    case MODE_DRUM:  stepDRUM_internal();  break;
  }
}

// -------------------- WebServer + SSE --------------------
WebServer server(80);
static inline void noteWebActivity() {}

static inline void sendNoCacheHeaders() {
  noteWebActivity();
  server.sendHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  server.sendHeader("Pragma", "no-cache");
  server.sendHeader("Expires", "0");
}

// SSE single client (kept intentionally for stability)
WiFiClient sseClient;
bool sseConnected = false;
uint32_t sseConnectedAt = 0;
uint32_t lastSseScopeMs = 0;
uint32_t lastSseKeepAliveMs = 0;
uint32_t lastStatePushMs = 0;

// MIDI note grid SSE throttle
uint32_t lastSseNoteMs = 0;
uint32_t lastNoteHash = 0;

// Drum SSE throttle
uint32_t lastSseDrumMs = 0;
uint32_t lastDrumHash = 0;

// lifetime prevents browsers keeping dead sockets forever
const uint32_t SSE_MAX_LIFETIME_MS = 180000;
const uint32_t SSE_KEEPALIVE_MS = 15000;

// ---- State push (diff-based) ----
uint32_t stateVersion = 0;

// these mirror the last pushed state; if unchanged, we don't send
struct LastState {
  uint8_t  ble;
  uint8_t  midimode;
  uint8_t  outputmode;
  uint8_t  io_muted;
  uint8_t  plant_auto_mute;
  uint8_t  daw_sync;
  uint8_t  daw_lock;
  uint8_t  clock;
  uint8_t  mode;
  uint8_t  scale;
  uint8_t  root;
  uint16_t bpm;
  uint8_t  swing;
  uint8_t  bright;
  uint8_t  lo;
  uint8_t  hi;
  float    sens;
  uint8_t  fx;
  uint8_t  pal;
  uint8_t  vs;
  uint8_t  vi;
  float    rest;
  uint8_t  nr;
  uint8_t  last;
  uint8_t  vel;
  uint8_t  beats;
  uint8_t  den;
  uint8_t  drumsel;
  uint8_t  auxready;
  uint8_t  plant_jack;
  uint8_t  aux_jack;
  uint8_t  aux_auto;
  uint8_t  preset;
  uint8_t  note_length;
  uint8_t  encoder_setting;
  uint8_t  encoder_volume_mode;
  uint8_t  encoder_nav_active;
  uint8_t  led_display_mode;
  float    cutoff;
  float    resonance;
  float    master;
};
LastState LS = {};

static inline bool sseCanWrite(size_t need) {
  if (!sseConnected) return false;
  if (!sseClient.connected()) { sseConnected = false; return false; }
  int avail = sseClient.availableForWrite();
  return avail < 0 || avail >= (int)need;
}

static inline void sseSend(const char* event, const char* data) {
  if (!sseConnected) return;
  if (!sseClient.connected()) { sseConnected = false; return; }

  const bool mustDeliver = (strcmp(event, "hello") == 0) || (strcmp(event, "state") == 0);
  const size_t need = 8 + strlen(event) + 7 + strlen(data) + 2;
  if (!mustDeliver && !sseCanWrite(need)) {
    return;
  }

  const size_t n1 = sseClient.printf("event: %s\n", event);
  const size_t n2 = sseClient.printf("data: %s\n\n", data);
  if (n1 == 0 || n2 == 0) {
    sseClient.stop();
    sseConnected = false;
  }
  delay(0);
}

static inline void handleEvents() {
  noteWebActivity();
  WiFiClient c = server.client();
  c.setNoDelay(true);

  if (sseConnected) {
    sseClient.stop();
    sseConnected = false;
  }

  sseClient = c;
  sseConnected = true;
  sseConnectedAt = millis();
  lastSseScopeMs = 0;
  lastSseKeepAliveMs = sseConnectedAt;
  lastSseNoteMs = 0;
  lastNoteHash = 0;
  lastSseDrumMs = 0;
  lastDrumHash = 0;

  sseClient.println("HTTP/1.1 200 OK");
  sseClient.println("Content-Type: text/event-stream");
  sseClient.println("Cache-Control: no-cache");
  sseClient.println("Access-Control-Allow-Origin: *");
  sseClient.println("Connection: keep-alive");
  sseClient.println("X-Accel-Buffering: no");
  sseClient.println();

  sseSend("hello", "{\"ok\":1}");
  pushStateIfChanged(true);
}

static inline bool stateChanged() {
  uint8_t ble = gMidiConnected ? 1 : 0;
  uint8_t root = (uint8_t)(rootMidi % 12);
  beca::SynthParams p;
  gSynth.getParams(p);

  if (LS.ble   != ble) return true;
  if (LS.midimode != (uint8_t)(outputModeIsSerial() ? 1 : 0)) return true;
  if (LS.outputmode != (uint8_t)gOutputMode) return true;
  if (LS.io_muted != (ioMuteActive() ? 1 : 0)) return true;
  if (LS.plant_auto_mute != (plantAutoMuteActive() ? 1 : 0)) return true;
  if (LS.daw_sync != (gDawSyncEnabled ? 1 : 0)) return true;
  if (LS.daw_lock != (dawSyncLocked(0) ? 1 : 0)) return true;
  if (LS.clock != (uint8_t)gClock) return true;
  if (LS.mode  != (uint8_t)gMode) return true;
  if (LS.scale != (uint8_t)gScale) return true;
  if (LS.root  != root) return true;
  if (LS.bpm   != bpm) return true;
  if (LS.swing != swingPct) return true;
  if (LS.bright!= gBrightness) return true;
  if (fabsf(LS.sens - sens) > 0.0001f) return true;
  if (LS.lo    != lowOct) return true;
  if (LS.hi    != highOct) return true;
  if (LS.fx    != (uint8_t)fxMode) return true;
  if (LS.pal   != currentPaletteIndex) return true;
  if (LS.vs    != visSpeed) return true;
  if (LS.vi    != visIntensity) return true;
  if (fabsf(LS.rest - restProb) > 0.0001f) return true;
  if (LS.nr    != (avoidRepeats ? 1 : 0)) return true;
  if (LS.beats != gTS.beats) return true;
  if (LS.den   != gTS.noteVal) return true;
  if (LS.drumsel != (uint8_t)drumSelMask) return true;
  if (LS.auxready != (auxSwitchReady() ? 1 : 0)) return true;
  if (LS.plant_jack != (plantJackConnected() ? 1 : 0)) return true;
  if (LS.aux_jack != (auxJackConnected() ? 1 : 0)) return true;
  if (LS.aux_auto != (gAuxJackAutoActive ? 1 : 0)) return true;
  if (LS.preset != p.preset) return true;
  if (LS.note_length != gNoteLengthIndex) return true;
  if (LS.encoder_setting != (uint8_t)gEncoderSetting) return true;
  if (LS.encoder_volume_mode != (gEncoderVolumeMode ? 1u : 0u)) return true;
  if (LS.encoder_nav_active != (encoderNavVisible(millis()) ? 1u : 0u)) return true;
  if (LS.led_display_mode != (uint8_t)currentLedDisplayMode(millis())) return true;
  if (fabsf(LS.cutoff - p.cutoffHz) > 0.01f) return true;
  if (fabsf(LS.resonance - p.resonance) > 0.0001f) return true;
  if (fabsf(LS.master - p.master) > 0.0001f) return true;

  return false;
}

static inline void captureState() {
  beca::SynthParams p;
  gSynth.getParams(p);
  LS.ble   = gMidiConnected ? 1 : 0;
  LS.midimode = (uint8_t)(outputModeIsSerial() ? 1 : 0);
  LS.outputmode = (uint8_t)gOutputMode;
  LS.io_muted = ioMuteActive() ? 1 : 0;
  LS.plant_auto_mute = plantAutoMuteActive() ? 1 : 0;
  LS.daw_sync = gDawSyncEnabled ? 1 : 0;
  LS.daw_lock = dawSyncLocked(0) ? 1 : 0;
  LS.clock = (uint8_t)gClock;
  LS.mode  = (uint8_t)gMode;
  LS.scale = (uint8_t)gScale;
  LS.root  = (uint8_t)(rootMidi % 12);
  LS.bpm   = bpm;
  LS.swing = swingPct;
  LS.bright= gBrightness;
  LS.sens  = sens;
  LS.lo    = lowOct;
  LS.hi    = highOct;
  LS.fx    = (uint8_t)fxMode;
  LS.pal   = currentPaletteIndex;
  LS.vs    = visSpeed;
  LS.vi    = visIntensity;
  LS.rest  = restProb;
  LS.nr    = avoidRepeats ? 1 : 0;
  LS.last  = lastNote;
  LS.vel   = lastVel;
  LS.beats = gTS.beats;
  LS.den   = gTS.noteVal;
  LS.drumsel = (uint8_t)drumSelMask;
  LS.auxready = auxSwitchReady() ? 1 : 0;
  LS.plant_jack = plantJackConnected() ? 1 : 0;
  LS.aux_jack = auxJackConnected() ? 1 : 0;
  LS.aux_auto = gAuxJackAutoActive ? 1 : 0;
  LS.preset = p.preset;
  LS.note_length = gNoteLengthIndex;
  LS.encoder_setting = (uint8_t)gEncoderSetting;
  LS.encoder_volume_mode = gEncoderVolumeMode ? 1u : 0u;
  LS.encoder_nav_active = encoderNavVisible(millis()) ? 1u : 0u;
  LS.led_display_mode = (uint8_t)currentLedDisplayMode(millis());
  LS.cutoff = p.cutoffHz;
  LS.resonance = p.resonance;
  LS.master = p.master;
}

static inline size_t renderStateJson(char* out, size_t outLen, bool bumpVersion) {
  captureState();
  if (bumpVersion) stateVersion++;
  const uint32_t ver = stateVersion;
  char buf[1792];
  snprintf(buf, sizeof(buf),
    "{\"ver\":%u,"
    "\"ble\":%u,"
    "\"midimode\":%u,"
    "\"outputmode\":%u,"
    "\"outputname\":\"%s\","
    "\"io_muted\":%u,"
    "\"plant_auto_mute\":%u,"
    "\"daw_sync\":%u,"
    "\"daw_lock\":%u,"
    "\"clock\":%u,"
    "\"mode\":%u,"
    "\"scale\":%u,"
    "\"root\":%u,"
    "\"bpm\":%u,"
    "\"swing\":%u,"
    "\"bright\":%u,"
    "\"sens\":%.2f,"
    "\"lo\":%u,"
    "\"hi\":%u,"
    "\"fx\":%u,"
    "\"fxname\":\"%s\","
    "\"pal\":%u,"
    "\"palname\":\"%s\","
    "\"vs\":%u,"
    "\"vi\":%u,"
    "\"rest\":%.2f,"
    "\"nr\":%u,"
    "\"aux_ready\":%u,"
    "\"aux_wait_ms\":%lu,"
    "\"plant_jack\":%u,"
    "\"aux_jack\":%u,"
    "\"aux_auto\":%u,"
    "\"preset\":%u,"
    "\"preset_name\":\"%s\","
    "\"note_length_idx\":%u,"
    "\"note_length\":\"%s\","
    "\"encoder_setting\":%u,"
    "\"encoder_setting_name\":\"%s\","
    "\"encoder_volume_mode\":%u,"
    "\"encoder_nav_active\":%u,"
    "\"led_display_mode\":%u,"
    "\"encoder_led_count\":%u,"
    "\"cutoff\":%.2f,"
    "\"resonance\":%.3f,"
    "\"master\":%.2f,"
    "\"ts\":\"%u/%u\","
    "\"last\":\"%u\","
    "\"vel\":%u,"
    "\"drumsel\":%u}",
    ver,
    LS.ble,
    LS.midimode,
    LS.outputmode,
    outputModeName(LS.outputmode),
    LS.io_muted,
    LS.plant_auto_mute,
    LS.daw_sync,
    LS.daw_lock,
    LS.clock,
    LS.mode,
    LS.scale,
    LS.root,
    LS.bpm,
    LS.swing,
    LS.bright,
    (double)LS.sens,
    LS.lo,
    LS.hi,
    LS.fx,
    EFFECT_NAMES[LS.fx],
    LS.pal,
    currentPaletteNameC(),
    LS.vs,
    LS.vi,
    (double)LS.rest,
    LS.nr,
    LS.auxready,
    (unsigned long)auxSwitchWaitMs(),
    LS.plant_jack,
    LS.aux_jack,
    LS.aux_auto,
    LS.preset,
    beca::SynthEngine::presetName(LS.preset),
    LS.note_length,
    currentNoteLengthLabelC(),
    LS.encoder_setting,
    encoderSettingApiName((EncoderSettingId)LS.encoder_setting),
    LS.encoder_volume_mode,
    LS.encoder_nav_active,
    LS.led_display_mode,
    encoderDisplayedLedCount(),
    (double)LS.cutoff,
    (double)LS.resonance,
    (double)LS.master,
    LS.beats,
    LS.den,
    LS.last,
    LS.vel,
    LS.drumsel
  );
  if (outLen == 0) return 0;
  strncpy(out, buf, outLen - 1);
  out[outLen - 1] = '\0';
  return strlen(out);
}

static inline void pushStateIfChanged(bool force) {
  if (!sseConnected) return;
  if (!sseClient.connected()) { sseConnected = false; return; }
  if (!force && !stateChanged()) return;

  char buf[1500];
  renderStateJson(buf, sizeof(buf), true);

  sseSend("state", buf);
}

// ✅ FULL HTML moved to index_html.h (generated from index.html)

static inline void handleLogo() {
  noteWebActivity();
  server.sendHeader("Content-Encoding", "gzip");
  server.sendHeader("Cache-Control", "public, max-age=31536000, immutable");
  server.send_P(200, "image/svg+xml", (const char*)LOGO_SVG_GZ, LOGO_SVG_GZ_LEN);
}

static inline void handlePage() {
  if (setupPortalActive()) {
    server.sendHeader("Location", "/setup", true);
    server.send(302, "text/plain", "");
    return;
  }
  sendNoCacheHeaders();
  server.send_P(200, "text/html", INDEX_HTML);
}

static inline void handleSetupPage() {
  sendNoCacheHeaders();
  server.send_P(200, "text/html", SETUP_HTML);
}

// -------------------- JSON lists for selects --------------------
static inline void handleEffects() {
  noteWebActivity();
  server.sendHeader("Cache-Control","public, max-age=86400");
  server.send_P(200, "application/json", EFFECTS_JSON);
}

static inline void handlePalettes() {
  noteWebActivity();
  server.sendHeader("Cache-Control","public, max-age=86400");
  server.send_P(200, "application/json", PALETTES_JSON);
}

static inline void handleNotFound() {
  const String uri = server.uri();
  if (uri == "/generate_204" ||
      uri == "/hotspot-detect.html" ||
      uri == "/ncsi.txt" ||
      uri == "/favicon.ico") {
    server.send(204);
    return;
  }
  server.send(404, "text/plain", "Not found");
}

// -------------------- Control endpoints --------------------
static inline void setBPM() {
  if (server.hasArg("v")) {
    bpm = (uint16_t)constrain(server.arg("v").toInt(), 20, 240);
    recalcTransport(false);
    pushStateIfChanged(true);
  }
  server.send(200, "text/plain", "OK");
}
static inline void setSwing()   { if (server.hasArg("v")) { swingPct = (uint8_t)constrain(server.arg("v").toInt(), 0, 60); pushStateIfChanged(true);} server.send(200,"text/plain","OK"); }
static inline void setBright()  { if (server.hasArg("v")) { gBrightness = (uint8_t)constrain(server.arg("v").toInt(), 10, 255); pushStateIfChanged(true);} server.send(200,"text/plain","OK"); }
static inline void setSens()    {
  if (server.hasArg("v")) {
    sens = clampf(server.arg("v").toFloat(), 0.0f, 0.5f);
    pushStateIfChanged(true);
  }
  server.send(200,"text/plain","OK");
}

static inline void setLowOct() {
  if (server.hasArg("v")) lowOct = (uint8_t)constrain(server.arg("v").toInt(), 1, 8);
  if (lowOct > highOct) highOct = lowOct;
  pushStateIfChanged(true);
  server.send(200, "text/plain", "OK");
}
static inline void setHighOct() {
  if (server.hasArg("v")) highOct = (uint8_t)constrain(server.arg("v").toInt(), 1, 8);
  if (highOct < lowOct) lowOct = highOct;
  pushStateIfChanged(true);
  server.send(200, "text/plain", "OK");
}

static inline void setMode() {
  if (server.hasArg("i")) {
    Mode next = (Mode)constrain(server.arg("i").toInt(), 0, 3);
    if (!drumsAllowedForCurrentOutput() && next == MODE_DRUM) next = MODE_NOTE;
    gMode = next;
  }
  pushStateIfChanged(true);
  server.send(200, "text/plain", "OK");
}
static inline void setClock()  {
  if (server.hasArg("v")) {
    gClock = server.arg("v").toInt() == (int)CLOCK_PLANT ? CLOCK_PLANT : CLOCK_INTERNAL;
  }
  pushStateIfChanged(true);
  server.send(200,"text/plain","OK");
}
static inline void setScale()  { if (server.hasArg("i")) gScale = (ScaleType)constrain(server.arg("i").toInt(), 0, 14); pushStateIfChanged(true); server.send(200,"text/plain","OK"); }

static inline void setRoot() {
  if (server.hasArg("semi")) {
    int s = constrain(server.arg("semi").toInt(), 0, 11);
    int oct = (rootMidi / 12) * 12;
    rootMidi = (uint8_t)(oct + s);
  }
  pushStateIfChanged(true);
  server.send(200, "text/plain", "OK");
}

static inline void setFX()      { if (server.hasArg("i")) fxMode = (EffectMode)constrain(server.arg("i").toInt(), 0, (int)FX_COUNT - 1); pushStateIfChanged(true); server.send(200,"text/plain","OK"); }
static inline void setPalette() { if (server.hasArg("i")) currentPaletteIndex = (uint8_t)constrain(server.arg("i").toInt(), 0, (int)(NUM_BUILTIN + NUM_CUSTOM - 1)); pushStateIfChanged(true); server.send(200,"text/plain","OK"); }
static inline void setVisSpd()  { if (server.hasArg("v")) visSpeed = (uint8_t)constrain(server.arg("v").toInt(), 0, 255); pushStateIfChanged(true); server.send(200,"text/plain","OK"); }
static inline void setVisInt()  { if (server.hasArg("v")) visIntensity = (uint8_t)constrain(server.arg("v").toInt(), 0, 255); pushStateIfChanged(true); server.send(200,"text/plain","OK"); }
static inline void setRest()    { if (server.hasArg("v")) restProb = clampf(server.arg("v").toFloat(), 0.0f, 0.8f); pushStateIfChanged(true); server.send(200,"text/plain","OK"); }
static inline void setNoRep()   { if (server.hasArg("v")) avoidRepeats = (server.arg("v").toInt() != 0); pushStateIfChanged(true); server.send(200,"text/plain","OK"); }

static inline void saveOutputModePref() {
  saveRuntimeStateNow();
}

static inline void setMidiMode() {
  if (server.hasArg("v")) {
    uint8_t nextMode = (uint8_t)constrain(server.arg("v").toInt(), 0, 1);
    setMidiOutModeLegacy(nextMode);
    saveOutputModePref();
    pushStateIfChanged(true);
  }
  server.send(200, "text/plain", "OK");
}

static inline bool parseOutputModeArg(const String& in, uint8_t& outMode) {
  String v = in;
  v.trim();
  v.toUpperCase();
  if (v == "BLE")    { outMode = OUTPUT_BLE; return true; }
  if (v == "SERIAL") { outMode = OUTPUT_SERIAL; return true; }
  if (v == "AUX" || v == "AUX OUT" || v == "AUX_OUT") { outMode = OUTPUT_AUX; return true; }
  if (v.length() && isDigit(v[0])) {
    int m = constrain(v.toInt(), 0, 2);
    outMode = (uint8_t)m;
    return true;
  }
  return false;
}

static inline void handleApiOutputModeGet() {
  sendNoCacheHeaders();
  char buf[160];
  snprintf(
    buf, sizeof(buf),
    "{\"mode\":\"%s\",\"value\":%u,\"aux_ready\":%u,\"aux_wait_ms\":%lu,\"aux_jack\":%u,\"aux_auto\":%u}",
    outputModeName(gOutputMode), (unsigned)gOutputMode,
    auxSwitchReady() ? 1u : 0u,
    (unsigned long)auxSwitchWaitMs(),
    auxJackConnected() ? 1u : 0u,
    gAuxJackAutoActive ? 1u : 0u
  );
  server.send(200, "application/json", buf);
}

static inline void handleApiOutputModePost() {
  uint8_t next = gOutputMode;
  bool ok = false;
  if (server.hasArg("mode")) ok = parseOutputModeArg(server.arg("mode"), next);
  else if (server.hasArg("v")) ok = parseOutputModeArg(server.arg("v"), next);
  else if (server.hasArg("plain")) ok = parseOutputModeArg(server.arg("plain"), next);

  if (!ok) {
    server.send(400, "application/json", "{\"ok\":0,\"err\":\"mode required\"}");
    return;
  }
  if (next == OUTPUT_AUX && !auxSwitchReady()) {
    char buf[128];
    snprintf(
      buf, sizeof(buf),
      "{\"ok\":0,\"err\":\"aux not ready\",\"aux_ready\":0,\"aux_wait_ms\":%lu}",
      (unsigned long)auxSwitchWaitMs()
    );
    server.send(409, "application/json", buf);
    return;
  }

  setOutputMode(next);
  saveOutputModePref();
  pushStateIfChanged(true);
  handleApiOutputModeGet();
}

static inline bool parseOnOffArg(const String& in, bool& outOn) {
  String v = in;
  v.trim();
  v.toLowerCase();
  if (v == "1" || v == "on" || v == "true")  { outOn = true; return true; }
  if (v == "0" || v == "off" || v == "false") { outOn = false; return true; }
  return false;
}

static inline void handleApiSyncPost() {
  bool nextSync = gDawSyncEnabled;
  bool ok = false;

  if (server.hasArg("v")) ok = parseOnOffArg(server.arg("v"), nextSync);
  else if (server.hasArg("sync")) ok = parseOnOffArg(server.arg("sync"), nextSync);
  else if (server.hasArg("plain")) ok = parseOnOffArg(server.arg("plain"), nextSync);

  if (!ok) {
    server.send(400, "application/json", "{\"ok\":0,\"err\":\"sync flag required\"}");
    return;
  }

  applyDawSyncEnabled(nextSync);
  pushStateIfChanged(true);
  server.send(200, "application/json", "{\"ok\":1}");
}

static inline void handleApiMuteGet() {
  sendNoCacheHeaders();
  char buf[192];
  snprintf(
    buf, sizeof(buf),
    "{\"io_muted\":%u,\"manual_muted\":%u,\"plant_auto_mute\":%u,\"outputmode\":%u,\"aux_running\":%u}",
    ioMuteActive() ? 1u : 0u,
    ioMuteManualActive() ? 1u : 0u,
    plantAutoMuteActive() ? 1u : 0u,
    (unsigned)gOutputMode,
    gSynth.running() ? 1u : 0u
  );
  server.send(200, "application/json", buf);
}

static inline void handleApiMutePost() {
  bool nextMute = ioMuteManualActive();
  bool ok = false;

  if (server.hasArg("v")) ok = parseOnOffArg(server.arg("v"), nextMute);
  else if (server.hasArg("mute")) ok = parseOnOffArg(server.arg("mute"), nextMute);
  else if (server.hasArg("io_muted")) ok = parseOnOffArg(server.arg("io_muted"), nextMute);
  else if (server.hasArg("plain")) ok = parseOnOffArg(server.arg("plain"), nextMute);

  if (!ok) {
    server.send(400, "application/json", "{\"ok\":0,\"err\":\"mute flag required\"}");
    return;
  }

  applyIoMute(nextMute);
  pushStateIfChanged(true);
  handleApiMuteGet();
}

static inline String buildApiSynthJson() {
  beca::SynthParams p;
  gSynth.getParams(p);
  char buf[512];
  snprintf(
    buf, sizeof(buf),
    "{\"preset\":%u,\"preset_name\":\"%s\",\"wave_a\":%u,\"wave_b\":%u,\"osc_mix\":%.3f,"
    "\"mono\":%u,\"voices\":%u,\"attack\":%.3f,\"decay\":%.3f,\"sustain\":%.3f,\"release\":%.3f,"
    "\"filter\":%u,\"cutoff\":%.2f,\"resonance\":%.3f,\"reverb\":%.3f,\"delay_ms\":%.2f,"
    "\"delay_feedback\":%.3f,\"delay_mix\":%.3f,\"drive\":%.3f,\"master\":%.3f,\"detune\":%.3f,"
    "\"gain_trim\":%.3f,\"drumkit\":%u,\"note_length_idx\":%u,\"note_length\":\"%s\"}",
    (unsigned)p.preset, beca::SynthEngine::presetName(p.preset),
    (unsigned)p.waveA, (unsigned)p.waveB, (double)p.oscMix,
    (unsigned)p.mono, (unsigned)p.maxVoices, (double)p.attack, (double)p.decay, (double)p.sustain, (double)p.release,
    (unsigned)p.filterType, (double)p.cutoffHz, (double)p.resonance, (double)p.reverb, (double)p.delayMs,
    (double)p.delayFeedback, (double)p.delayMix, (double)p.distDrive, (double)p.master, (double)p.detuneCents,
    (double)p.gainTrim, (unsigned)p.drumKit,
    (unsigned)gNoteLengthIndex, currentNoteLengthLabelC()
  );
  return String(buf);
}

static inline void handleApiSynthGet() {
  sendNoCacheHeaders();
  server.send(200, "application/json", buildApiSynthJson());
}

static inline void handleApiSynthPost() {
  beca::SynthParams p;
  gSynth.getParams(p);

  if (server.hasArg("preset")) {
    const uint8_t idx = (uint8_t)constrain(server.arg("preset").toInt(), 0, (int)beca::SynthEngine::kPresetCount - 1);
    p.preset = idx;
    gSynth.loadPreset(idx);
    gSynth.getParams(p);
  }
  if (server.hasArg("reset") && server.arg("reset").toInt() != 0) {
    gSynth.resetPreset();
    gSynth.getParams(p);
  }

  if (server.hasArg("wave_a")) p.waveA = (uint8_t)constrain(server.arg("wave_a").toInt(), 0, 3);
  if (server.hasArg("wave_b")) p.waveB = (uint8_t)constrain(server.arg("wave_b").toInt(), 0, 3);
  if (server.hasArg("osc_mix")) p.oscMix = server.arg("osc_mix").toFloat();
  if (server.hasArg("mono")) p.mono = (server.arg("mono").toInt() != 0) ? 1 : 0;
  if (server.hasArg("voices")) p.maxVoices = (uint8_t)constrain(server.arg("voices").toInt(), 1, 12);
  if (server.hasArg("attack")) p.attack = server.arg("attack").toFloat();
  if (server.hasArg("decay")) p.decay = server.arg("decay").toFloat();
  if (server.hasArg("sustain")) p.sustain = server.arg("sustain").toFloat();
  if (server.hasArg("release")) p.release = server.arg("release").toFloat();
  if (server.hasArg("filter")) p.filterType = (uint8_t)constrain(server.arg("filter").toInt(), 0, 2);
  if (server.hasArg("cutoff")) p.cutoffHz = server.arg("cutoff").toFloat();
  if (server.hasArg("resonance")) p.resonance = server.arg("resonance").toFloat();
  if (server.hasArg("reverb")) p.reverb = server.arg("reverb").toFloat();
  if (server.hasArg("delay_ms")) p.delayMs = server.arg("delay_ms").toFloat();
  if (server.hasArg("delay_feedback")) p.delayFeedback = server.arg("delay_feedback").toFloat();
  if (server.hasArg("delay_mix")) p.delayMix = server.arg("delay_mix").toFloat();
  if (server.hasArg("drive")) p.distDrive = server.arg("drive").toFloat();
  if (server.hasArg("master")) p.master = server.arg("master").toFloat();
  if (server.hasArg("detune")) p.detuneCents = server.arg("detune").toFloat();
  if (server.hasArg("gain_trim")) p.gainTrim = server.arg("gain_trim").toFloat();
  if (server.hasArg("drumkit")) p.drumKit = (uint8_t)constrain(server.arg("drumkit").toInt(), 0, 2);

  gSynth.setParams(p);
  handleApiSynthGet();
}

static inline void handleApiSynthTest() {
  if (ioMuteActive()) {
    server.send(423, "application/json", "{\"ok\":0,\"err\":\"I/O muted\"}");
    return;
  }
  if (!outputModeIsAux()) {
    server.send(409, "application/json", "{\"ok\":0,\"err\":\"AUX mode required\"}");
    return;
  }
  if (!gSynth.running() && !startAuxAudio()) {
    server.send(500, "application/json", "{\"ok\":0,\"err\":\"audio start failed\"}");
    return;
  }
  const bool ok = gSynth.triggerTestChord(2000);
  server.send(ok ? 200 : 500, "application/json", ok ? "{\"ok\":1}" : "{\"ok\":0}");
}

static inline void setTS() {
  if (server.hasArg("v")) {
    String v = server.arg("v"); v.trim();
    int dash = v.indexOf('-');
    if (dash > 0) {
      uint8_t beats = (uint8_t)constrain(v.substring(0, dash).toInt(), 1, 16);
      uint8_t den   = (uint8_t)constrain(v.substring(dash + 1).toInt(), 1, 32);
      if (isValidDen(den)) {
        gTS.beats   = beats;
        gTS.noteVal = den;
        gTS.triplet = false;
        recalcTransport(true);
      }
    }
  }
  pushStateIfChanged(true);
  server.send(200, "text/plain", "OK");
}

// NEW: drum selectors endpoint
static inline void setDrumSel() {
  if (server.hasArg("mask")) {
    int m = server.arg("mask").toInt();
    drumSelMask = (uint8_t)constrain(m, 0, 255);
    pushStateIfChanged(true);
  }
  server.send(200, "text/plain", "OK");
}

static const char* MODE_NAMES_API[] = {
  "Notes",
  "Arpeggiator",
  "Chords",
  "Drum Machine"
};

static const char* SCALE_NAMES_API[] = {
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
  "Sus4"
};

static const char* TS_VALUES_API[] = {
  "1-1","2-2","2-4","3-4","4-4","5-4","7-4","6-8","9-8","12-8","4-8","4-16","8-32"
};

static inline String buildApiParamsJson() {
  String json = "{";
  json += "\"modes\":[";
  for (uint8_t i = 0; i < (uint8_t)(sizeof(MODE_NAMES_API) / sizeof(MODE_NAMES_API[0])); ++i) {
    if (i) json += ",";
    json += "\""; json += MODE_NAMES_API[i]; json += "\"";
  }
  json += "],\"scales\":[";
  for (uint8_t i = 0; i < (uint8_t)(sizeof(SCALE_NAMES_API) / sizeof(SCALE_NAMES_API[0])); ++i) {
    if (i) json += ",";
    json += "\""; json += SCALE_NAMES_API[i]; json += "\"";
  }
  json += "],\"time_signatures\":[";
  for (uint8_t i = 0; i < (uint8_t)(sizeof(TS_VALUES_API) / sizeof(TS_VALUES_API[0])); ++i) {
    if (i) json += ",";
    json += "\""; json += TS_VALUES_API[i]; json += "\"";
  }
  json += "],\"note_lengths\":[";
  for (uint8_t i = 0; i < NOTE_LENGTH_COUNT; ++i) {
    if (i) json += ",";
    json += "\""; json += NOTE_LENGTH_LABELS[i]; json += "\"";
  }
  json += "],\"output_modes\":[\"BLE\",\"SERIAL\",\"AUX OUT\"]";
  json += ",\"synth_presets\":[";
  for (uint8_t i = 0; i < beca::SynthEngine::kPresetCount; ++i) {
    if (i) json += ",";
    json += "\""; json += beca::SynthEngine::presetName(i); json += "\"";
  }
  json += "],\"ranges\":{";
  json += "\"bpm\":[20,240],\"swing\":[0,60],\"sens\":[0,0.5],\"lo\":[1,9],\"hi\":[1,9],";
  json += "\"rest\":[0,0.8],\"bright\":[10,255],\"cutoff\":[20,18000],\"resonance\":[0.1,10],";
  json += "\"attack\":[0,5],\"decay\":[0,5],\"sustain\":[0,1],\"release\":[0.01,10],";
  json += "\"delay_ms\":[0,800],\"delay_feedback\":[0,0.95],\"delay_mix\":[0,1],\"drive\":[0,1],";
  json += "\"master\":[0,1],\"detune\":[0,8],\"gain_trim\":[0.45,1]";
  json += "}}";
  return json;
}

static inline bool parseTimeSignatureToken(const String& in, uint8_t& beatsOut, uint8_t& denOut) {
  String v = in;
  v.trim();
  int sep = v.indexOf('-');
  if (sep < 0) sep = v.indexOf('/');
  if (sep <= 0) return false;
  uint8_t beats = (uint8_t)constrain(v.substring(0, sep).toInt(), 1, 16);
  uint8_t den = (uint8_t)constrain(v.substring(sep + 1).toInt(), 1, 32);
  if (!isValidDen(den)) return false;
  beatsOut = beats;
  denOut = den;
  return true;
}

static inline bool parseNoteLengthToken(const String& in, uint8_t& idxOut) {
  String v = in;
  v.trim();
  if (v.length() == 0) return false;

  bool numeric = true;
  for (size_t i = 0; i < v.length(); ++i) {
    if (!isDigit(v.charAt(i))) {
      numeric = false;
      break;
    }
  }
  if (numeric) {
    int idx = constrain(v.toInt(), 0, (int)NOTE_LENGTH_COUNT - 1);
    idxOut = (uint8_t)idx;
    return true;
  }

  v.toLowerCase();
  for (uint8_t i = 0; i < NOTE_LENGTH_COUNT; ++i) {
    String label = NOTE_LENGTH_LABELS[i];
    label.toLowerCase();
    if (v == label) {
      idxOut = i;
      return true;
    }
  }
  return false;
}

static inline bool applyParamByKey(const String& keyIn, const String& valueIn, String& err) {
  String key = keyIn;
  String value = valueIn;
  key.trim();
  value.trim();
  key.toLowerCase();
  clearLedDisplayTransient();

  if (key == "bpm") {
    bpm = (uint16_t)constrain(value.toInt(), 20, 240);
    recalcTransport(false);
    return true;
  }
  if (key == "swing") { swingPct = (uint8_t)constrain(value.toInt(), 0, 60); return true; }
  if (key == "bright") { gBrightness = (uint8_t)constrain(value.toInt(), 10, 255); return true; }
  if (key == "sens") { sens = clampf(value.toFloat(), 0.0f, 0.5f); return true; }
  if (key == "lo") {
    lowOct = (uint8_t)constrain(value.toInt(), 1, 8);
    if (lowOct > highOct) highOct = lowOct;
    return true;
  }
  if (key == "hi") {
    highOct = (uint8_t)constrain(value.toInt(), 1, 8);
    if (highOct < lowOct) lowOct = highOct;
    return true;
  }
  if (key == "mode") {
    Mode next = (Mode)constrain(value.toInt(), 0, 3);
    if (!drumsAllowedForCurrentOutput() && next == MODE_DRUM) next = MODE_NOTE;
    gMode = next;
    return true;
  }
  if (key == "clock") {
    gClock = value.toInt() == (int)CLOCK_PLANT ? CLOCK_PLANT : CLOCK_INTERNAL;
    return true;
  }
  if (key == "scale") { gScale = (ScaleType)constrain(value.toInt(), 0, 14); return true; }
  if (key == "root") {
    int semi = constrain(value.toInt(), 0, 11);
    int oct = (rootMidi / 12) * 12;
    rootMidi = (uint8_t)(oct + semi);
    return true;
  }
  if (key == "fx") { fxMode = (EffectMode)constrain(value.toInt(), 0, (int)FX_COUNT - 1); return true; }
  if (key == "pal") { currentPaletteIndex = (uint8_t)constrain(value.toInt(), 0, (int)(NUM_BUILTIN + NUM_CUSTOM - 1)); return true; }
  if (key == "vs") { visSpeed = (uint8_t)constrain(value.toInt(), 0, 255); return true; }
  if (key == "vi") { visIntensity = (uint8_t)constrain(value.toInt(), 0, 255); return true; }
  if (key == "rest") { restProb = clampf(value.toFloat(), 0.0f, 0.8f); return true; }
  if (key == "nr" || key == "norep") { avoidRepeats = value.toInt() != 0; return true; }
  if (key == "drumsel") { drumSelMask = (uint8_t)constrain(value.toInt(), 0, 255); return true; }
  if (key == "ts") {
    uint8_t beats = 0, den = 0;
    if (!parseTimeSignatureToken(value, beats, den)) {
      err = "invalid time signature";
      return false;
    }
    gTS.beats = beats;
    gTS.noteVal = den;
    gTS.triplet = false;
    recalcTransport(true);
    return true;
  }
  if (key == "note_length" || key == "notelength") {
    uint8_t nextIdx = gNoteLengthIndex;
    if (!parseNoteLengthToken(value, nextIdx)) {
      err = "invalid note length";
      return false;
    }
    gNoteLengthIndex = nextIdx;
    recalcTransport(true);
    return true;
  }
  if (key == "encoder_setting") {
    EncoderSettingId next = gEncoderSetting;
    if (!parseEncoderSettingArg(value, next)) {
      err = "invalid encoder setting";
      return false;
    }
    gEncoderSetting = next;
    normalizeEncoderSetting();
    gEncoderVolumeMode = false;
    showEncoderNav(4000);
    return true;
  }
  if (key == "encoder_volume_mode") {
    bool on = gEncoderVolumeMode;
    if (!parseOnOffArg(value, on)) {
      err = "invalid encoder volume mode";
      return false;
    }
    gEncoderVolumeMode = on;
    showEncoderNav(gEncoderVolumeMode ? 6000 : 4000);
    return true;
  }
  if (key == "encoder_action") {
    String action = value;
    action.toLowerCase();
    if (action == "next") {
      gEncoderVolumeMode = false;
      cycleEncoderSetting();
      showEncoderNav(4000);
      return true;
    }
    if (action == "toggle_volume") {
      gEncoderVolumeMode = !gEncoderVolumeMode;
      showEncoderNav(gEncoderVolumeMode ? 6000 : 4000);
      return true;
    }
    if (action == "volume") {
      gEncoderVolumeMode = true;
      showEncoderNav(6000);
      return true;
    }
    if (action == "cycle_output") {
      uint8_t next = nextOutputModeForCycle();
      setOutputMode(next);
      saveOutputModePref();
      normalizeEncoderSetting();
      gEncoderVolumeMode = false;
      showLedDisplay(LED_DISPLAY_OUTPUT, 1600);
      showEncoderNav(5200);
      return true;
    }
    if (action == "randomize") {
      gEncoderVolumeMode = false;
      randomizeBasicSettingsInline();
      showLedDisplay(LED_DISPLAY_RANDOM, 1200);
      showEncoderNav(4000);
      return true;
    }
    err = "invalid encoder action";
    return false;
  }

  if (key == "outputmode") {
    uint8_t next = gOutputMode;
    if (!parseOutputModeArg(value, next)) {
      err = "invalid output mode";
      return false;
    }
    if (next == OUTPUT_AUX && !auxSwitchReady()) {
      err = "aux not ready";
      return false;
    }
    setOutputMode(next);
    saveOutputModePref();
    showLedDisplay(LED_DISPLAY_OUTPUT, 1600);
    return true;
  }
  if (key == "sync" || key == "daw_sync") {
    bool on = gDawSyncEnabled;
    if (!parseOnOffArg(value, on)) {
      err = "invalid sync value";
      return false;
    }
    applyDawSyncEnabled(on);
    return true;
  }
  if (key == "mute" || key == "io_muted") {
    bool on = ioMuteManualActive();
    if (!parseOnOffArg(value, on)) {
      err = "invalid mute value";
      return false;
    }
    applyIoMute(on);
    return true;
  }

  beca::SynthParams p;
  gSynth.getParams(p);
  bool synthTouched = false;
  if (key == "preset") {
    const uint8_t idx = (uint8_t)constrain(value.toInt(), 0, (int)beca::SynthEngine::kPresetCount - 1);
    gSynth.loadPreset(idx);
    gSynth.getParams(p);
    synthTouched = true;
  } else if (key == "preset_reset") {
    if (value.toInt() != 0) {
      gSynth.resetPreset();
      gSynth.getParams(p);
      synthTouched = true;
    }
  } else if (key == "wave_a") { p.waveA = (uint8_t)constrain(value.toInt(), 0, 3); synthTouched = true; }
  else if (key == "wave_b") { p.waveB = (uint8_t)constrain(value.toInt(), 0, 3); synthTouched = true; }
  else if (key == "osc_mix") { p.oscMix = value.toFloat(); synthTouched = true; }
  else if (key == "mono") { p.mono = (value.toInt() != 0) ? 1 : 0; synthTouched = true; }
  else if (key == "voices") { p.maxVoices = (uint8_t)constrain(value.toInt(), 1, 12); synthTouched = true; }
  else if (key == "attack") { p.attack = value.toFloat(); synthTouched = true; }
  else if (key == "decay") { p.decay = value.toFloat(); synthTouched = true; }
  else if (key == "sustain") { p.sustain = value.toFloat(); synthTouched = true; }
  else if (key == "release") { p.release = value.toFloat(); synthTouched = true; }
  else if (key == "filter") { p.filterType = (uint8_t)constrain(value.toInt(), 0, 2); synthTouched = true; }
  else if (key == "cutoff") { p.cutoffHz = value.toFloat(); synthTouched = true; }
  else if (key == "resonance") { p.resonance = value.toFloat(); synthTouched = true; }
  else if (key == "reverb") { p.reverb = value.toFloat(); synthTouched = true; }
  else if (key == "delay_ms") { p.delayMs = value.toFloat(); synthTouched = true; }
  else if (key == "delay_feedback") { p.delayFeedback = value.toFloat(); synthTouched = true; }
  else if (key == "delay_mix") { p.delayMix = value.toFloat(); synthTouched = true; }
  else if (key == "drive") { p.distDrive = value.toFloat(); synthTouched = true; }
  else if (key == "master") { p.master = value.toFloat(); synthTouched = true; }
  else if (key == "detune") { p.detuneCents = value.toFloat(); synthTouched = true; }
  else if (key == "gain_trim") { p.gainTrim = value.toFloat(); synthTouched = true; }
  else if (key == "drumkit") { p.drumKit = (uint8_t)constrain(value.toInt(), 0, 2); synthTouched = true; }
  else {
    err = "unknown key";
    return false;
  }

  if (synthTouched) gSynth.setParams(p);
  return true;
}

static inline void handleApiStateGet() {
  sendNoCacheHeaders();
  char buf[1500];
  renderStateJson(buf, sizeof(buf), false);
  server.send(200, "application/json", buf);
}

static inline String buildApiPlantJson() {
  char buf[224];
  snprintf(
    buf, sizeof(buf),
    "{\"value\":%.4f,\"raw\":%u,\"raw2\":%u,\"connected\":%u,\"plant_auto_mute\":%u,\"ts\":%lu}",
    (double)gScopePlant,
    (unsigned)gPlantRaw1,
    (unsigned)gPlantRaw2,
    plantJackConnected() ? 1u : 0u,
    plantAutoMuteActive() ? 1u : 0u,
    (unsigned long)millis()
  );
  return String(buf);
}

static inline void handleApiPlantGet() {
  sendNoCacheHeaders();
  server.send(200, "application/json", buildApiPlantJson());
}

static inline String buildApiNotesJson() {
  uint8_t uiNotes[MAX_ACTIVE_NOTES];
  const uint8_t uiCount = uiCollectHeldNotes(uiNotes, MAX_ACTIVE_NOTES);
  char notesCsv[196];
  int n = 0;
  for (uint8_t i = 0; i < uiCount; ++i) {
    n += snprintf(
      notesCsv + n,
      sizeof(notesCsv) - (size_t)n,
      "%u%s",
      (unsigned)uiNotes[i],
      (i + 1u < uiCount) ? "," : ""
    );
    if (n >= (int)sizeof(notesCsv) - 8) break;
  }
  if (uiCount == 0) notesCsv[0] = '\0';

  char buf[360];
  snprintf(
    buf, sizeof(buf),
    "{\"held\":%u,\"vel\":%u,\"count\":%u,\"notes\":[%s],\"last\":%u,\"last_vel\":%u,\"ts\":%lu}",
    uiCount > 0 ? 1u : 0u,
    (unsigned)lastVel,
    (unsigned)uiCount,
    notesCsv,
    (unsigned)lastNote,
    (unsigned)lastVel,
    (unsigned long)millis()
  );
  return String(buf);
}

static inline void handleApiNotesGet() {
  sendNoCacheHeaders();
  server.send(200, "application/json", buildApiNotesJson());
}

static inline String buildApiDrumJson() {
  char buf[128];
  snprintf(
    buf, sizeof(buf),
    "{\"hit\":%u,\"sel\":%u,\"ts\":%lu}",
    (unsigned)drumHitMaskNow(),
    (unsigned)((uint8_t)drumSelMask),
    (unsigned long)millis()
  );
  return String(buf);
}

static inline void handleApiDrumGet() {
  sendNoCacheHeaders();
  server.send(200, "application/json", buildApiDrumJson());
}

static inline String buildApiLiveJson() {
  char stateBuf[1500];
  renderStateJson(stateBuf, sizeof(stateBuf), false);

  String out;
  out.reserve(2400);
  out += "{\"state\":";
  out += stateBuf;
  out += ",\"plant\":";
  out += buildApiPlantJson();
  out += ",\"notes\":";
  out += buildApiNotesJson();
  out += ",\"drum\":";
  out += buildApiDrumJson();
  out += "}";
  return out;
}

static inline void handleApiLiveGet() {
  sendNoCacheHeaders();
  server.send(200, "application/json", buildApiLiveJson());
}

static inline void handleApiParamsGet() {
  sendNoCacheHeaders();
  server.send(200, "application/json", buildApiParamsJson());
}

static inline void handleApiSetPost() {
  String key = server.hasArg("key") ? server.arg("key") : "";
  String value = server.hasArg("value") ? server.arg("value") : "";

  if ((key.length() == 0 || value.length() == 0) && server.hasArg("plain")) {
    String plain = server.arg("plain");
    int eq = plain.indexOf('=');
    if (eq > 0) {
      key = plain.substring(0, eq);
      value = plain.substring(eq + 1);
    }
  }

  if (key.length() == 0 || value.length() == 0) {
    server.send(400, "application/json", "{\"ok\":0,\"err\":\"key and value required\"}");
    return;
  }

  String err;
  if (!applyParamByKey(key, value, err)) {
    String out = "{\"ok\":0,\"err\":\"";
    out += err;
    out += "\"}";
    server.send(400, "application/json", out);
    return;
  }

  pushStateIfChanged(true);
  handleApiStateGet();
}

static inline void randomize() {
  gMode  = (Mode)random(0, drumsAllowedForCurrentOutput() ? 4 : 3);
  gScale = (ScaleType)random(0, 15);
  fxMode = (EffectMode)random(0, (int)FX_COUNT);
  currentPaletteIndex = (uint8_t)random(0, NUM_BUILTIN + NUM_CUSTOM);

  bpm = (uint16_t)random(90, 151);
  lowOct  = random(1, 5);
  highOct = max<uint8_t>(lowOct, (uint8_t)random(lowOct, 9));
  sens = clampf(((float)random(0, 11)) / 20.0f, 0.0f, 0.5f); // 0.00..0.50
  swingPct = (uint8_t)random(0, 40);
  visSpeed = (uint8_t)random(80, 220);
  visIntensity = (uint8_t)random(140, 255);
  restProb = (float)random(5, 20) / 100.0f;
  avoidRepeats = (random(0, 2) == 1);

  // random drum selection too
  drumSelMask = (uint8_t)random(1, 256);

  recalcTransport(true);
  pushStateIfChanged(true);
  server.send(200, "text/plain", "OK");
}

// -------------------- WiFi provisioning (AP portal minimal) --------------------
Preferences prefs;
DNSServer  dns;

String gDeviceName;
String gStaSsid, gStaPass;
bool   gIsSta = false;
IPAddress gApIP(192,168,4,1);
uint32_t gLastWifiOkMs = 0;
uint32_t gLastWifiAttemptMs = 0;
uint32_t gLastWifiResetMs = 0;
uint8_t  gWifiFailCount = 0;
bool     gMdnsStarted = false;
String   gMdnsName;
uint32_t gLastMdnsAttemptMs = 0;
volatile int32_t gLastStaDisconnectReason = 0;
String gWifiLastError;
String gWifiLastHint;
const uint32_t WIFI_CHECK_MS = 1000;
const uint32_t WIFI_RECONNECT_MS = 5000;
const uint32_t WIFI_RESET_MS = 30000;
const uint32_t WIFI_RESET_COOLDOWN_MS = 60000;
const uint32_t MDNS_RETRY_MS = 10000;
char gSerialCtrlBuf[192];
uint16_t gSerialCtrlLen = 0;
bool gSerialCtrlCollect = false;

static inline bool setupPortalActive() {
  wifi_mode_t mode = WiFi.getMode();
  return mode == WIFI_MODE_AP || mode == WIFI_MODE_APSTA;
}

static inline String wifiFailureMessage(int32_t reason) {
  switch (reason) {
    case WIFI_REASON_AUTH_FAIL:
    case WIFI_REASON_4WAY_HANDSHAKE_TIMEOUT:
    case WIFI_REASON_HANDSHAKE_TIMEOUT:
      gWifiLastHint = "Password may be wrong. Please re-check and try again.";
      return "Could not sign in to that Wi-Fi network.";
    case WIFI_REASON_NO_AP_FOUND:
    case WIFI_REASON_BEACON_TIMEOUT:
      gWifiLastHint = "ESP32 only supports 2.4GHz Wi-Fi. Try 2.4GHz or a mobile hotspot.";
      return "Wi-Fi network not found.";
    case WIFI_REASON_ASSOC_FAIL:
    case WIFI_REASON_ASSOC_TOOMANY:
      gWifiLastHint = "Router rejected the connection. Try again or reboot the router/hotspot.";
      return "Router refused connection.";
    case WIFI_REASON_CONNECTION_FAIL:
      gWifiLastHint = "Signal may be weak. Move BECA closer to the router.";
      return "Connection dropped before setup finished.";
    default:
      gWifiLastHint = "Try a 2.4GHz Wi-Fi or mobile hotspot near BECA.";
      return "Could not connect to Wi-Fi.";
  }
}

static inline String shortChipId() {
  uint8_t mac[6]; WiFi.macAddress(mac);
  char id[8];
  snprintf(id, sizeof(id), "%02X%02X", mac[4], mac[5]);
  return String(id);
}

static inline String sanitizeDeviceName(const String &raw) {
  String in = raw;
  in.trim();
  in.toLowerCase();

  String out;
  out.reserve(in.length());
  bool prevDash = false;
  for (size_t i = 0; i < in.length(); ++i) {
    const char c = in.charAt(i);
    const bool isAlnum = ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9'));
    if (isAlnum) {
      out += c;
      prevDash = false;
      continue;
    }
    const bool isSep = (c == '-' || c == '_' || c == ' ' || c == '.');
    if (isSep && !prevDash && out.length() > 0) {
      out += '-';
      prevDash = true;
    }
  }

  while (out.length() > 0 && out.charAt(out.length() - 1) == '-') out.remove(out.length() - 1);
  if (out.length() == 0) out = "beca-" + shortChipId();
  if (out.length() > 63) out = out.substring(0, 63);
  while (out.length() > 0 && out.charAt(out.length() - 1) == '-') out.remove(out.length() - 1);
  if (out.length() == 0) out = "beca";
  return out;
}

static inline void normalizeDeviceName() {
  const String clean = sanitizeDeviceName(gDeviceName);
  if (clean != gDeviceName) {
    Serial.printf("@I DEVICE NAME NORMALIZED %s\n", clean.c_str());
  }
  gDeviceName = clean;
}

static inline bool wifiReady();

static inline void startMDNS() {
  normalizeDeviceName();
  if (!wifiReady()) return;
  if (gMdnsStarted && gMdnsName == gDeviceName) return;

  if (gMdnsStarted) {
    MDNS.end();
    gMdnsStarted = false;
    gMdnsName = "";
  }

  gLastMdnsAttemptMs = millis();
  if (!MDNS.begin(gDeviceName.c_str())) {
    Serial.printf("@W MDNS START FAIL %s.local\n", gDeviceName.c_str());
    return;
  }

  if (!MDNS.addService("http", "tcp", 80)) {
    MDNS.end();
    Serial.printf("@W MDNS HTTP SERVICE FAIL %s.local\n", gDeviceName.c_str());
    return;
  }

  gMdnsStarted = true;
  gMdnsName = gDeviceName;
  Serial.printf("@I MDNS READY %s.local\n", gMdnsName.c_str());
}

static inline bool wifiReady() {
  return WiFi.status() == WL_CONNECTED && WiFi.localIP() != IPAddress(0,0,0,0);
}

static inline void serviceMDNS(uint32_t now) {
  if (!gIsSta || !wifiReady()) return;
  if (gMdnsStarted) return;
  if ((int32_t)(now - gLastMdnsAttemptMs) < (int32_t)MDNS_RETRY_MS) return;
  startMDNS();
}

static inline void maintainWiFi(uint32_t now) {
  if (!gIsSta || gStaSsid.length() == 0) return;
  static uint32_t lastCheckMs = 0;
  if ((int32_t)(now - lastCheckMs) < (int32_t)WIFI_CHECK_MS) return;
  lastCheckMs = now;

  if (wifiReady()) {
    gLastWifiOkMs = now;
    gWifiFailCount = 0;
    return;
  }

  if ((int32_t)(now - gLastWifiAttemptMs) >= (int32_t)WIFI_RECONNECT_MS) {
    gLastWifiAttemptMs = now;
    bool shouldReset =
      (gLastWifiOkMs == 0) ? false : ((int32_t)(now - gLastWifiOkMs) >= (int32_t)WIFI_RESET_MS);

    if (gWifiFailCount >= 6) shouldReset = true;

    if (shouldReset && (int32_t)(now - gLastWifiResetMs) >= (int32_t)WIFI_RESET_COOLDOWN_MS) {
      gLastWifiResetMs = now;
      WiFi.disconnect(true, true);
      WiFi.mode(WIFI_STA);
      normalizeDeviceName();
      WiFi.setHostname(gDeviceName.c_str());
      WiFi.begin(gStaSsid.c_str(), gStaPass.c_str());
    } else {
      WiFi.reconnect();
    }
  }
}

static inline void sendCaptiveRedirect(const String &target = "/setup") {
  if (setupPortalActive()) {
    String loc = "http://" + gApIP.toString() + target;
    server.sendHeader("Location", loc, true);
    server.send(302, "text/plain", "");
  } else {
    server.send(204);
  }
}

static inline String buildWifiScanJson() {
  int n = WiFi.scanNetworks();
  String json = "{\"list\":[";
  for (int i = 0; i < n; i++) {
    if (i) json += ',';
    json += '\"'; json += WiFi.SSID(i); json += '\"';
    delay(0);
  }
  json += "]}";
  return json;
}

static inline String buildApiInfoJson() {
  String json = "{";
  json += "\"mode\":\"";   json += (setupPortalActive() ? "ap" : "sta"); json += "\",";
  json += "\"ip\":\"";     json += (gIsSta ? WiFi.localIP().toString() : gApIP.toString()); json += "\",";
  json += "\"name\":\"";   json += gDeviceName; json += "\",";
  json += "\"ssid\":\"";   json += gStaSsid;    json += "\",";
  json += "\"wifi_error\":\""; json += gWifiLastError; json += "\",";
  json += "\"wifi_hint\":\"";  json += gWifiLastHint;  json += "\",";
  json += "\"midimode\":"; json += (outputModeIsSerial() ? 1 : 0); json += ",";
  json += "\"outputmode\":\""; json += outputModeName(gOutputMode); json += "\",";
  json += "\"io_muted\":"; json += (ioMuteActive() ? 1 : 0); json += ",";
  json += "\"manual_muted\":"; json += (ioMuteManualActive() ? 1 : 0); json += ",";
  json += "\"plant_auto_mute\":"; json += (plantAutoMuteActive() ? 1 : 0); json += ",";
  json += "\"ble_connected\":"; json += (gMidiConnected ? 1 : 0); json += ",";
  json += "\"plant_jack\":"; json += (plantJackConnected() ? 1 : 0); json += ",";
  json += "\"aux_jack\":"; json += (auxJackConnected() ? 1 : 0); json += ",";
  json += "\"last_reset\":\""; json += resetReasonName((esp_reset_reason_t)gLastResetReasonCode); json += "\",";
  json += "\"recovering\":"; json += (gRecoveringFromCrash ? 1 : 0); json += ",";
  json += "\"crash_count\":"; json += gCrashCount;
  json += "}";
  return json;
}

const char SETUP_HTML[] PROGMEM = R"HTML(
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BECA - Setup</title>
<style>
  :root {
    color-scheme: light;
    --accent: #008351;
    --accent-strong: #006a43;
    --bg: #eef3ee;
    --bg-soft: #dce8df;
    --surface: rgba(255, 255, 255, 0.76);
    --surface-soft: rgba(233, 242, 236, 0.82);
    --edge: rgba(70, 96, 83, 0.24);
    --edge-strong: rgba(70, 96, 83, 0.36);
    --text: #143025;
    --text-muted: rgba(20, 48, 37, 0.66);
    --shadow: 0 18px 36px rgba(18, 30, 24, 0.1), 0 12px 24px rgba(0, 131, 81, 0.12);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body {
    min-height: 100vh;
    padding: clamp(18px, 3vw, 32px);
    font: 14px "Avenir Next", "SF Pro Text", "Segoe UI", sans-serif;
    color: var(--text);
    background:
      radial-gradient(900px 520px at 82% -10%, rgba(0, 131, 81, 0.2), transparent 60%),
      radial-gradient(760px 560px at 14% 14%, rgba(120, 190, 150, 0.22), transparent 58%),
      linear-gradient(155deg, var(--bg) 0%, var(--bg-soft) 46%, var(--bg) 100%);
  }
  body::before {
    content: "";
    position: fixed;
    inset: 0;
    background-image:
      linear-gradient(rgba(0, 131, 81, 0.045) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0, 131, 81, 0.045) 1px, transparent 1px);
    background-size: 28px 28px;
    opacity: 0.32;
    pointer-events: none;
    z-index: -1;
  }
  .shell {
    width: min(860px, 100%);
    margin: 0 auto;
    display: grid;
    gap: 16px;
  }
  .card {
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(236, 244, 239, 0.78)),
      var(--surface);
    border: 1px solid var(--edge-strong);
    border-radius: 24px;
    padding: clamp(16px, 2vw, 22px);
    box-shadow: var(--shadow);
    backdrop-filter: blur(22px) saturate(160%);
  }
  .hero {
    display: grid;
    gap: 14px;
  }
  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--accent);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.16em;
  }
  h1 {
    margin: 0;
    font-size: clamp(24px, 3vw, 32px);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  p {
    margin: 0;
    color: var(--text-muted);
    line-height: 1.55;
  }
  .hero-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(220px, 0.85fr);
    gap: 14px;
  }
  .info-box {
    display: grid;
    gap: 10px;
    padding: 14px;
    border-radius: 18px;
    border: 1px solid var(--edge);
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.9), rgba(231, 243, 236, 0.76)),
      var(--surface-soft);
  }
  .info-row {
    display: grid;
    gap: 4px;
  }
  .label {
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .value {
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
    word-break: break-word;
  }
  .setup-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(220px, 0.8fr);
    gap: 16px;
  }
  label {
    display: block;
    margin: 12px 0 6px;
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  input, select, button {
    width: 100%;
    min-height: 46px;
    padding: 10px 12px;
    border: 1px solid var(--edge-strong);
    border-radius: 14px;
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.94), rgba(230, 241, 234, 0.82)),
      var(--surface-soft);
    color: var(--text);
    font: inherit;
    box-shadow: 0 6px 14px rgba(18, 30, 24, 0.06);
  }
  button {
    cursor: pointer;
  }
  button.primary {
    color: #fff;
    border-color: var(--accent);
    background: linear-gradient(145deg, #0b9461, var(--accent));
    font-weight: 700;
  }
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: end;
  }
  .btn-mini {
    width: auto;
    min-width: 120px;
  }
  .actions {
    display: grid;
    gap: 10px;
    margin-top: 14px;
  }
  .status {
    margin-top: 14px;
    padding: 12px 14px;
    border-radius: 16px;
    border: 1px solid rgba(70, 96, 83, 0.28);
    background: rgba(214, 227, 219, 0.66);
    display: none;
  }
  .status.show { display: block; }
  .status.ok {
    border-color: rgba(0, 131, 81, 0.44);
    background: rgba(0, 131, 81, 0.09);
  }
  .status.err {
    border-color: rgba(176, 67, 67, 0.4);
    background: rgba(176, 67, 67, 0.1);
  }
  .status .hint {
    display: block;
    margin-top: 6px;
    opacity: 0.8;
  }
  .note-list {
    display: grid;
    gap: 10px;
  }
  .note {
    padding: 12px 14px;
    border-radius: 16px;
    border: 1px solid var(--edge);
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.88), rgba(231, 243, 236, 0.74)),
      var(--surface-soft);
  }
  .note strong {
    display: block;
    margin-bottom: 5px;
    font-size: 13px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--accent-strong);
  }
  @media (max-width: 760px) {
    .hero-grid,
    .setup-grid {
      grid-template-columns: 1fr;
    }
    .row {
      grid-template-columns: 1fr;
    }
    .btn-mini {
      width: 100%;
    }
  }
</style>
</head>
<body>
<main class="shell">
  <section class="card hero">
    <div class="eyebrow">BECA Recovery Setup</div>
    <h1>Join Wi-Fi and return to the desktop flow</h1>
    <p>
      This lightweight page is BECA's fallback setup environment. Use it when the desktop app
      cannot provision Wi-Fi directly, or when the device is still in setup mode after a reset.
    </p>
    <div class="hero-grid">
      <div class="info-box">
        <div class="info-row">
          <span class="label">Current mode</span>
          <span class="value" id="modeVal">Loading...</span>
        </div>
        <div class="info-row">
          <span class="label">Current IP</span>
          <span class="value" id="ipVal">Loading...</span>
        </div>
        <div class="info-row">
          <span class="label">Saved SSID</span>
          <span class="value" id="ssidVal">Loading...</span>
        </div>
      </div>
      <div class="note-list">
        <div class="note">
          <strong>2.4 GHz only</strong>
          Use a 2.4 GHz network for ESP32 compatibility.
        </div>
        <div class="note">
          <strong>Manual fallback</strong>
          If scanning is unreliable, type the SSID manually below.
        </div>
      </div>
    </div>
  </section>

  <section class="card">
    <div class="setup-grid">
      <div>
        <label for="name">Device name (for .local)</label>
        <input id="name" placeholder="beca-xxxx">

        <label for="ssid">Wi-Fi SSID (scanned)</label>
        <div class="row">
          <select id="ssid">
            <option value="">Scanning...</option>
          </select>
          <button class="btn-mini" id="scanBtn" type="button">Rescan</button>
        </div>

        <label for="ssidManual">Wi-Fi SSID (manual)</label>
        <input id="ssidManual" placeholder="Type SSID if scan is unavailable">

        <label for="pass">Password</label>
        <input id="pass" type="password" placeholder="********">

        <div class="actions">
          <button class="primary" id="saveBtn" type="button">Save and Connect</button>
          <button id="forgetBtn" type="button">Forget Wi-Fi</button>
        </div>
        <div id="netStatus" class="status"></div>
      </div>

      <div class="note-list">
        <div class="note">
          <strong>What happens next</strong>
          BECA tests the credentials here, then reboots back into your normal network environment.
        </div>
        <div class="note">
          <strong>If setup fails</strong>
          BECA stays in setup mode so you can retry without losing the recovery page.
        </div>
      </div>
    </div>
  </section>
</main>
<script>
const statusEl = document.getElementById('netStatus');
const nameEl = document.getElementById('name');
const ssidEl = document.getElementById('ssid');
const ssidManualEl = document.getElementById('ssidManual');
const passEl = document.getElementById('pass');

function showStatus(type, msg, hint = '') {
  statusEl.className = 'status show ' + (type || 'info');
  statusEl.innerHTML = '<strong>' + msg + '</strong>' + (hint ? '<span class="hint">' + hint + '</span>' : '');
}

function currentSsid() {
  return (ssidManualEl.value || '').trim() || (ssidEl.value || '').trim();
}

async function scan() {
  try {
    const s = await (await fetch('/wifi/scan', { cache: 'no-store' })).json();
    const previous = currentSsid();
    ssidEl.innerHTML = '<option value="">Select scanned SSID</option>';
    (s.list || []).forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      if (name === previous) option.selected = true;
      ssidEl.appendChild(option);
    });
    if (!(s.list || []).length) {
      showStatus('err', 'No nearby Wi-Fi networks were returned.', 'Type the SSID manually if you already know it.');
    }
  } catch (e) {
    showStatus('err', 'Could not scan Wi-Fi right now.', 'Try again in a few seconds or type the SSID manually.');
  }
}

async function loadInfo() {
  try {
    const info = await (await fetch('/api/info', { cache: 'no-store' })).json();
    document.getElementById('modeVal').textContent = info.mode || '--';
    document.getElementById('ipVal').textContent = info.ip || '--';
    document.getElementById('ssidVal').textContent = info.ssid || 'Not saved';
    if (info.name) nameEl.value = info.name;
    if (info.ssid) {
      [...ssidEl.options].forEach((option) => {
        if (option.value === info.ssid) option.selected = true;
      });
      if (!ssidManualEl.value) ssidManualEl.placeholder = info.ssid;
    }
    if (info.wifi_error) showStatus('err', info.wifi_error, info.wifi_hint || '');
  } catch (e) {}
}

async function save() {
  const ssid = currentSsid();
  if (!ssid) {
    showStatus('err', 'Please choose or type a Wi-Fi network first.');
    return;
  }
  showStatus('info', 'Connecting...', 'This can take up to 15 seconds.');
  const body = new URLSearchParams();
  body.set('name', nameEl.value);
  body.set('ssid', ssid);
  body.set('pass', passEl.value);
  try {
    const r = await fetch('/wifi/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const j = await r.json();
    if (j.ok) {
      showStatus('ok', j.msg || 'Connected successfully.', j.hint || 'BECA is rebooting now.');
      setTimeout(() => fetch('/reboot').catch(() => {}), 900);
      setTimeout(() => { location.href = '/'; }, 3200);
      return;
    }
    showStatus('err', j.msg || 'Could not connect to Wi-Fi.', j.hint || '');
  } catch (e) {
    showStatus('err', 'Could not complete Wi-Fi setup.', 'Please retry. If needed, use a 2.4GHz hotspot.');
  }
}

async function forget() {
  await fetch('/wifi/forget');
  showStatus('ok', 'Saved Wi-Fi removed.', 'BECA is rebooting into setup mode.');
  setTimeout(() => location.reload(), 1500);
}

document.getElementById('scanBtn').addEventListener('click', scan);
document.getElementById('saveBtn').addEventListener('click', save);
document.getElementById('forgetBtn').addEventListener('click', forget);

(async () => {
  await scan();
  await loadInfo();
})();
</script>
</body>
</html>
)HTML";

static inline void handleWifiScan() {
  sendNoCacheHeaders();
  server.send(200, "application/json", buildWifiScanJson());
}

static inline void handleApiInfo() {
  sendNoCacheHeaders();
  server.send(200, "application/json", buildApiInfoJson());
}

static inline bool testStaFromPortal(const String &ssid, const String &pass, String &msg, String &hint, uint32_t timeoutMs = 15000) {
  gLastStaDisconnectReason = 0;
  normalizeDeviceName();
  WiFi.mode(WIFI_AP_STA);
  WiFi.setHostname(gDeviceName.c_str());
  WiFi.begin(ssid.c_str(), pass.c_str());

  uint32_t t0 = millis();
  while ((WiFi.status() != WL_CONNECTED || WiFi.localIP() == IPAddress(0,0,0,0)) &&
         (millis() - t0) < timeoutMs) {
    delay(250);
    delay(0);
  }

  if (WiFi.status() == WL_CONNECTED && WiFi.localIP() != IPAddress(0,0,0,0)) {
    msg = "Connected to Wi-Fi successfully.";
    hint = "BECA will reboot and rejoin your Wi-Fi network.";
    WiFi.disconnect(false, true);
    return true;
  }

  if (WiFi.status() == WL_CONNECTED && WiFi.localIP() == IPAddress(0,0,0,0)) {
    gWifiLastHint = "Router did not assign an IP address (DHCP). Try rebooting router/hotspot.";
    msg = "Wi-Fi connected, but no network address was assigned.";
    hint = gWifiLastHint;
  } else {
    msg = wifiFailureMessage(gLastStaDisconnectReason);
    hint = gWifiLastHint;
  }

  WiFi.disconnect(false, true);
  return false;
}

static inline bool applyWifiProvisioning(
  const String &nextName,
  const String &nextSsid,
  const String &nextPass,
  String &msg,
  String &hint
) {
  gDeviceName = sanitizeDeviceName(nextName);
  bool ok = testStaFromPortal(nextSsid, nextPass, msg, hint);
  if (ok) {
    gStaSsid = nextSsid;
    gStaPass = nextPass;
    gWifiLastError = "";
    gWifiLastHint = "";
    prefs.begin("beca", false);
    prefs.putString("name", gDeviceName);
    prefs.putString("ssid", gStaSsid);
    prefs.putString("pass", gStaPass);
    prefs.end();
    return true;
  }

  gWifiLastError = msg;
  gWifiLastHint = hint;
  prefs.begin("beca", false);
  prefs.putString("name", gDeviceName);
  prefs.end();
  return false;
}

static inline void clearSavedWifiCredentials() {
  prefs.begin("beca", false);
  prefs.remove("ssid");
  prefs.remove("pass");
  prefs.end();
  gStaSsid = "";
  gStaPass = "";
  gWifiLastError = "No Wi-Fi saved yet.";
  gWifiLastHint = "Pick a 2.4GHz Wi-Fi network to continue.";
}

static inline void handleWifiSave() {
  String nextName = server.hasArg("name") ? server.arg("name") : gDeviceName;
  String nextSsid = server.hasArg("ssid") ? server.arg("ssid") : "";
  String nextPass = server.hasArg("pass") ? server.arg("pass") : "";
  nextName.trim();
  nextSsid.trim();
  nextName = sanitizeDeviceName(nextName);

  sendNoCacheHeaders();
  if (nextSsid.length() == 0) {
    server.send(400, "application/json",
      "{\"ok\":0,\"msg\":\"Please choose a Wi-Fi network first.\",\"hint\":\"Pick a 2.4GHz Wi-Fi and retry.\"}");
    return;
  }

  String msg, hint;
  bool ok = applyWifiProvisioning(nextName, nextSsid, nextPass, msg, hint);
  if (ok) {
    server.send(200, "application/json",
      "{\"ok\":1,\"msg\":\"Connected to Wi-Fi successfully.\",\"hint\":\"BECA will reboot now and join your Wi-Fi.\"}");
    return;
  }

  String errJson = "{\"ok\":0,\"msg\":\"" + msg + "\",\"hint\":\"" + hint + "\"}";
  server.send(200, "application/json", errJson);
}

static inline void handleWifiForget() {
  clearSavedWifiCredentials();
  server.send(200, "text/plain", "OK");
  delay(80);
  ESP.restart();
}

static inline void handleReboot() {
  server.send(200, "text/plain", "Rebooting...");
  delay(80);
  ESP.restart();
}

static inline void serialCtrlReply(const char *tag, const String &jsonPayload) {
  Serial.print("@R ");
  Serial.print(tag);
  Serial.print(" ");
  Serial.println(jsonPayload);
}

static inline String wifiResultJsonRaw(bool ok, const String &msg, const String &hint) {
  String out = "{\"ok\":";
  out += (ok ? "1" : "0");
  out += ",\"msg\":\"";
  out += msg;
  out += "\",\"hint\":\"";
  out += hint;
  out += "\"}";
  return out;
}

static inline void handleSerialControlLine(const char *line) {
  if (!line || strncmp(line, "@C ", 3) != 0) return;
  const char *cmd = line + 3;

  if (strcmp(cmd, "PING") == 0) {
    serialCtrlReply("PING", "{\"ok\":1}");
    return;
  }

  if (strcmp(cmd, "WIFI_SCAN") == 0) {
    serialCtrlReply("WIFI_SCAN", buildWifiScanJson());
    return;
  }

  if (strcmp(cmd, "WIFI_INFO") == 0) {
    serialCtrlReply("WIFI_INFO", buildApiInfoJson());
    return;
  }

  if (strcmp(cmd, "STATE") == 0) {
    char buf[1500];
    renderStateJson(buf, sizeof(buf), false);
    serialCtrlReply("STATE", String(buf));
    return;
  }

  if (strcmp(cmd, "LIVE") == 0) {
    serialCtrlReply("LIVE", buildApiLiveJson());
    return;
  }

  if (strcmp(cmd, "PARAMS") == 0) {
    serialCtrlReply("PARAMS", buildApiParamsJson());
    return;
  }

  if (strcmp(cmd, "SYNTH") == 0) {
    serialCtrlReply("SYNTH", buildApiSynthJson());
    return;
  }

  if (strcmp(cmd, "PLANT") == 0) {
    char buf[256];
    snprintf(
      buf, sizeof(buf),
      "{\"value\":%.4f,\"raw\":%u,\"raw2\":%u,\"connected\":%u,\"plant_auto_mute\":%u,\"ts\":%lu}",
      (double)gScopePlant,
      (unsigned)gPlantRaw1,
      (unsigned)gPlantRaw2,
      plantJackConnected() ? 1u : 0u,
      plantAutoMuteActive() ? 1u : 0u,
      (unsigned long)millis()
    );
    serialCtrlReply("PLANT", String(buf));
    return;
  }

  if (strcmp(cmd, "PINS") == 0) {
    const uint16_t adc1 = (uint16_t)constrain((int)analogRead(PLANT1_PIN), 0, 4095);
    const uint16_t adc2 = (uint16_t)constrain((int)analogRead(PLANT2_PIN), 0, 4095);
    const uint8_t plantDetectRaw =
#if BECA_PLANT_JACK_DETECT_ENABLED
      digitalRead(PLANT_JACK_PIN) ? 1u : 0u;
#else
      1u;
#endif
    char buf[384];
    snprintf(
      buf, sizeof(buf),
      "{\"enc_sw_raw\":%u,\"enc_sw_stable\":%u,\"enc_pressed\":%u,"
      "\"plant_detect_enabled\":%u,\"plant_raw\":%u,\"plant_stable\":%u,\"plant_connected\":%u,"
      "\"aux_raw\":%u,\"aux_stable\":%u,\"aux_connected\":%u,"
      "\"plant_adc1\":%u,\"plant_adc2\":%u,\"io_muted\":%u,"
      "\"manual_muted\":%u,\"plant_auto_mute\":%u}",
      digitalRead(ENC_PIN_SW) ? 1u : 0u,
      encLastSW ? 1u : 0u,
      encPressed ? 1u : 0u,
#if BECA_PLANT_JACK_DETECT_ENABLED
      1u,
#else
      0u,
#endif
      plantDetectRaw,
      (unsigned)gPlantJackStableLevel,
      plantJackConnected() ? 1u : 0u,
      digitalRead(AUX_JACK_PIN) ? 1u : 0u,
      (unsigned)gAuxJackStableLevel,
      auxJackConnected() ? 1u : 0u,
      (unsigned)adc1,
      (unsigned)adc2,
      ioMuteActive() ? 1u : 0u,
      ioMuteManualActive() ? 1u : 0u,
      plantAutoMuteActive() ? 1u : 0u
    );
    serialCtrlReply("PINS", String(buf));
    return;
  }

  if (strcmp(cmd, "NOTES") == 0) {
    uint8_t uiNotes[MAX_ACTIVE_NOTES];
    const uint8_t uiCount = uiCollectHeldNotes(uiNotes, MAX_ACTIVE_NOTES);
    String payload = "{\"held\":";
    payload += (uiCount > 0 ? "1" : "0");
    payload += ",\"vel\":";
    payload += (unsigned)lastVel;
    payload += ",\"count\":";
    payload += (unsigned)uiCount;
    payload += ",\"notes\":[";
    for (uint8_t i = 0; i < uiCount; ++i) {
      if (i) payload += ",";
      payload += (unsigned)uiNotes[i];
    }
    payload += "],\"last\":";
    payload += (unsigned)lastNote;
    payload += ",\"last_vel\":";
    payload += (unsigned)lastVel;
    payload += ",\"ts\":";
    payload += (unsigned long)millis();
    payload += "}";
    serialCtrlReply("NOTES", payload);
    return;
  }

  if (strcmp(cmd, "DRUM") == 0) {
    char buf[128];
    snprintf(
      buf, sizeof(buf),
      "{\"hit\":%u,\"sel\":%u,\"ts\":%lu}",
      (unsigned)drumHitMaskNow(),
      (unsigned)((uint8_t)drumSelMask),
      (unsigned long)millis()
    );
    serialCtrlReply("DRUM", String(buf));
    return;
  }

  if (strcmp(cmd, "EFFECTS") == 0) {
    serialCtrlReply("EFFECTS", String(EFFECTS_JSON));
    return;
  }

  if (strcmp(cmd, "PALETTES") == 0) {
    serialCtrlReply("PALETTES", String(PALETTES_JSON));
    return;
  }

  if (strcmp(cmd, "TELEMETRY") == 0) {
    char buf[64];
    snprintf(buf, sizeof(buf), "{\"ok\":1,\"enabled\":%u}", gSerialJsonTelemetry ? 1u : 0u);
    serialCtrlReply("TELEMETRY", String(buf));
    return;
  }

  if (strncmp(cmd, "TELEMETRY ", 10) == 0) {
    bool next = gSerialJsonTelemetry;
    if (!parseOnOffArg(String(cmd + 10), next)) {
      serialCtrlReply("TELEMETRY", "{\"ok\":0,\"err\":\"invalid flag\"}");
      return;
    }
    gSerialJsonTelemetry = next;
    gLastSerialPlantTelemetryMs = 0;
    char buf[64];
    snprintf(buf, sizeof(buf), "{\"ok\":1,\"enabled\":%u}", gSerialJsonTelemetry ? 1u : 0u);
    serialCtrlReply("TELEMETRY", String(buf));
    return;
  }

  if (strncmp(cmd, "SET ", 4) == 0) {
    String payload = String(cmd + 4);
    payload.trim();
    int sep = payload.indexOf(' ');
    if (sep < 0) sep = payload.indexOf('=');
    if (sep <= 0) {
      serialCtrlReply("SET", "{\"ok\":0,\"err\":\"use: SET <key> <value>\"}");
      return;
    }

    String key = payload.substring(0, sep);
    String value = payload.substring(sep + 1);
    key.trim();
    value.trim();
    if (key.length() == 0 || value.length() == 0) {
      serialCtrlReply("SET", "{\"ok\":0,\"err\":\"key/value required\"}");
      return;
    }

    String err;
    if (!applyParamByKey(key, value, err)) {
      String out = "{\"ok\":0,\"err\":\"";
      out += err;
      out += "\"}";
      serialCtrlReply("SET", out);
      return;
    }

    pushStateIfChanged(true);
    serialCtrlReply("SET", "{\"ok\":1}");
    return;
  }

  if (strcmp(cmd, "SYNTH_TEST") == 0) {
    if (ioMuteActive()) {
      serialCtrlReply("SYNTH_TEST", "{\"ok\":0,\"err\":\"I/O muted\"}");
      return;
    }
    if (!outputModeIsAux()) {
      serialCtrlReply("SYNTH_TEST", "{\"ok\":0,\"err\":\"AUX mode required\"}");
      return;
    }
    if (!gSynth.running() && !startAuxAudio()) {
      serialCtrlReply("SYNTH_TEST", "{\"ok\":0,\"err\":\"audio start failed\"}");
      return;
    }
    const bool ok = gSynth.triggerTestChord(2000);
    serialCtrlReply("SYNTH_TEST", ok ? "{\"ok\":1}" : "{\"ok\":0}");
    return;
  }

  if (strcmp(cmd, "RANDOMIZE") == 0) {
    gMode  = (Mode)random(0, drumsAllowedForCurrentOutput() ? 4 : 3);
    gScale = (ScaleType)random(0, 15);
    fxMode = (EffectMode)random(0, (int)FX_COUNT);
    currentPaletteIndex = (uint8_t)random(0, NUM_BUILTIN + NUM_CUSTOM);

    bpm = (uint16_t)random(90, 151);
    lowOct  = random(1, 5);
    highOct = max<uint8_t>(lowOct, (uint8_t)random(lowOct, 9));
    sens = clampf(((float)random(0, 11)) / 20.0f, 0.0f, 0.5f);
    swingPct = (uint8_t)random(0, 40);
    visSpeed = (uint8_t)random(80, 220);
    visIntensity = (uint8_t)random(140, 255);
    restProb = (float)random(5, 20) / 100.0f;
    avoidRepeats = (random(0, 2) == 1);
    drumSelMask = (uint8_t)random(1, 256);

    recalcTransport(true);
    pushStateIfChanged(true);
    serialCtrlReply("RANDOMIZE", "{\"ok\":1}");
    return;
  }

  if (strncmp(cmd, "WIFI_SAVE", 9) == 0) {
    const char *payload = cmd + 9;
    if (*payload == ' ') payload++;
    String packed = String(payload);
    int t1 = packed.indexOf('\t');
    int t2 = (t1 >= 0) ? packed.indexOf('\t', t1 + 1) : -1;
    if (t1 <= 0 || t2 <= t1) {
      serialCtrlReply("WIFI_SAVE", "{\"ok\":0,\"msg\":\"Malformed WIFI_SAVE payload.\",\"hint\":\"Retry from setup app.\"}");
      return;
    }

    String nextName = packed.substring(0, t1);
    String nextSsid = packed.substring(t1 + 1, t2);
    String nextPass = packed.substring(t2 + 1);
    nextName.trim();
    nextSsid.trim();
    if (nextName.length() == 0) nextName = "beca-" + shortChipId();
    if (nextSsid.length() == 0) {
      serialCtrlReply("WIFI_SAVE", "{\"ok\":0,\"msg\":\"Please choose a Wi-Fi network first.\",\"hint\":\"Pick a 2.4GHz Wi-Fi and retry.\"}");
      return;
    }

    String msg, hint;
    bool ok = applyWifiProvisioning(nextName, nextSsid, nextPass, msg, hint);
    serialCtrlReply("WIFI_SAVE", wifiResultJsonRaw(ok, msg, hint));
    return;
  }

  if (strcmp(cmd, "WIFI_FORGET") == 0) {
    clearSavedWifiCredentials();
    serialCtrlReply("WIFI_FORGET", "{\"ok\":1,\"msg\":\"Saved Wi-Fi removed.\",\"hint\":\"BECA is rebooting into setup mode.\"}");
    Serial.flush();
    delay(80);
    ESP.restart();
    return;
  }

  if (strcmp(cmd, "REBOOT") == 0) {
    serialCtrlReply("REBOOT", "{\"ok\":1,\"msg\":\"Rebooting now.\",\"hint\":\"\"}");
    Serial.flush();
    delay(80);
    ESP.restart();
    return;
  }

  serialCtrlReply("ERR", "{\"ok\":0,\"msg\":\"unknown command\"}");
}

static inline void serviceSerialControlCommands() {
  while (Serial.available() > 0) {
    int raw = Serial.read();
    if (raw < 0) break;
    char ch = (char)raw;

    if (ch == '\r') continue;
    if (ch == '\n') {
      if (gSerialCtrlCollect && gSerialCtrlLen > 0) {
        gSerialCtrlBuf[gSerialCtrlLen] = '\0';
        handleSerialControlLine(gSerialCtrlBuf);
      }
      gSerialCtrlCollect = false;
      gSerialCtrlLen = 0;
      continue;
    }

    if (!gSerialCtrlCollect) {
      if (ch != '@') continue;
      gSerialCtrlCollect = true;
      gSerialCtrlLen = 0;
    }

    if (gSerialCtrlLen < (sizeof(gSerialCtrlBuf) - 1)) {
      gSerialCtrlBuf[gSerialCtrlLen++] = ch;
    } else {
      gSerialCtrlCollect = false;
      gSerialCtrlLen = 0;
      serialCtrlReply("ERR", "{\"ok\":0,\"msg\":\"command too long\"}");
    }
  }
}

static inline bool tryConnectSTA(const String &ssid, const String &pass, uint32_t timeoutMs = 9000) {
  // Force clean STA start (prevents half-connected states + 0.0.0.0)
  WiFi.disconnect(true, true);
  delay(100);

  WiFi.mode(WIFI_STA);
  delay(100);

  normalizeDeviceName();
  WiFi.setHostname(gDeviceName.c_str());

  Serial.printf("Connecting STA to \"%s\" ...\n", ssid.c_str());
  gLastStaDisconnectReason = 0;
  WiFi.begin(ssid.c_str(), pass.c_str());

  uint32_t t0 = millis();
  while ((WiFi.status() != WL_CONNECTED || WiFi.localIP() == IPAddress(0,0,0,0)) &&
         (millis() - t0) < timeoutMs) {
    delay(200);
    delay(0);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED && WiFi.localIP() != IPAddress(0,0,0,0)) {
    gIsSta = true;
    gLastWifiOkMs = millis();
    gLastWifiAttemptMs = gLastWifiOkMs;
    gWifiLastError = "";
    gWifiLastHint = "";

    Serial.println("WiFi STA connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    Serial.print("Open UI: http://");
    Serial.print(WiFi.localIP());
    Serial.println("/");
    Serial.print("Open UI (mDNS): http://");
    Serial.print(gDeviceName);
    Serial.println(".local/");

    // IMPORTANT: enable modem sleep only AFTER DHCP is done
    esp_wifi_set_ps(WIFI_PS_MIN_MODEM);

    return true;
  }

  Serial.println("WiFi STA failed (no DHCP or not connected). Falling back to AP.");
  if (WiFi.status() == WL_CONNECTED && WiFi.localIP() == IPAddress(0,0,0,0)) {
    gWifiLastError = "Wi-Fi connected, but no network address was assigned.";
    gWifiLastHint = "Router DHCP may be busy. Try rebooting router/hotspot.";
  } else {
    gWifiLastError = wifiFailureMessage(gLastStaDisconnectReason);
  }
  WiFi.disconnect(true, true);
  gIsSta = false;
  return false;
}

static inline void startAPPortal() {
  gIsSta = false;
  normalizeDeviceName();
  if (gStaSsid.length() == 0 && gWifiLastError.length() == 0) {
    gWifiLastError = "No Wi-Fi saved yet.";
    gWifiLastHint = "Pick a 2.4GHz Wi-Fi network and tap Save and Connect.";
  }
  WiFi.softAPsetHostname(gDeviceName.c_str());
  String apName = "BECA-" + shortChipId();

  WiFi.mode(WIFI_AP);
  WiFi.softAP(apName.c_str());
  delay(100);

  WiFi.softAPConfig(gApIP, gApIP, IPAddress(255,255,255,0));
  dns.start(53, "*", gApIP);

  Serial.println("Started AP portal!");
  Serial.print("AP SSID: ");
  Serial.println(apName);
  Serial.print("AP IP:   ");
  Serial.println(gApIP);
  Serial.print("Open:    http://");
  Serial.print(gApIP);
  Serial.println("/setup");
}

// -------------------- Loop timing --------------------
const uint32_t PLANT_INTERVAL_MS = 8;    // ~125 Hz
const uint32_t LED_INTERVAL_MS   = 34;   // ~29 FPS
#ifndef BECA_UI_STREAM_FPS
#define BECA_UI_STREAM_FPS 24
#endif
const uint32_t UI_STREAM_FPS     = (uint32_t)constrain((int)BECA_UI_STREAM_FPS, 12, 30);
const uint32_t UI_STREAM_MS      = 1000u / UI_STREAM_FPS;
const uint32_t SSE_SCOPE_MS      = UI_STREAM_MS; // plant scope
const uint32_t SSE_NOTE_MS       = UI_STREAM_MS; // note grid, diff-based
const uint32_t SSE_DRUM_MS       = UI_STREAM_MS; // drum UI, diff-based
const uint32_t SSE_STATE_MS      = 125;          // state is diff-based; keep below visual fps
bool     gWarmupDone = false;
uint32_t gWarmupEndMs = 0;

// -------------------- setup() --------------------
void setup() {
  Serial.begin(SERIAL_MIDI_BAUD);
  delay(240);
  Serial.println();
  Serial.println("=== BECA booting ===");
  randomSeed(esp_random());
  resetStartupChecks();

  WiFi.onEvent(WiFiEvent);

  // BLE-MIDI
  BLEMIDI.setHandleConnected(onBleMidiConnect);
  BLEMIDI.setHandleDisconnected(onBleMidiDisconnect);
  MIDI.begin(MIDI_CHANNEL_OMNI);
  MIDI.setHandleClock(onMidiClock);
  MIDI.setHandleStart(onMidiStart);
  MIDI.setHandleStop(onMidiStop);
  MIDI.setHandleContinue(onMidiContinue);
  setStartupCheck(STARTUP_CHECK_BLE, STARTUP_CHECK_OK);

  // LEDs
  FastLED.addLeds<LED_TYPE, LED_PIN, LED_COLOR_ORDER>(ledsPhysical, LED_COUNT);
  FastLED.setBrightness(gBrightness);
  startupAnim();

  // Plant + encoder
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);
  pinMode(PLANT1_PIN, INPUT);
  pinMode(PLANT2_PIN, INPUT);
  setupJackInputs();
  applyPlantAutoMute(!plantJackConnected());

  ema1 = base1 = analogRead(PLANT1_PIN);
  ema2 = base2 = analogRead(PLANT2_PIN);
  setupEncoder();
  warmupPlant(60);
  gWarmupDone = false;
  gWarmupEndMs = millis() + 1600;
  setStartupCheck(STARTUP_CHECK_PLANT, plantJackConnected() ? STARTUP_CHECK_OK : STARTUP_CHECK_WARN);
  Serial.printf("@I JACKS PLANT %s AUX %s\n",
                plantJackConnected() ? "CONNECTED" : "DISCONNECTED",
                auxJackConnected() ? "CONNECTED" : "DISCONNECTED");

  // Wi-Fi provisioning + runtime recovery boot
  const esp_reset_reason_t resetReason = esp_reset_reason();
  gLastResetReasonCode = (uint8_t)resetReason;
  gRecoveringFromCrash = resetReasonIsCrash(resetReason);
  const bool prefsReady = prefs.begin("beca", false);
  setStartupCheck(STARTUP_CHECK_PREFS, prefsReady ? STARTUP_CHECK_OK : STARTUP_CHECK_FAIL);

  uint8_t legacyMidiMode = 0;
  uint8_t storedOutput = 255;
  bool bootMute = false;
  uint8_t storedEncoderSetting = (uint8_t)gEncoderSetting;
  bool storedEncoderVolumeMode = gEncoderVolumeMode;
  bool hasBootState = false;

  if (prefsReady) {
    const uint8_t prevCrashCount = prefs.getUChar("crashcnt", 0);
    gCrashCount = gRecoveringFromCrash
                    ? (uint8_t)constrain((int)prevCrashCount + 1, 0, 250)
                    : 0;
    prefs.putUChar("lastrst", gLastResetReasonCode);
    prefs.putUChar("crashcnt", gCrashCount);

    gDeviceName = prefs.getString("name", "");
    gStaSsid    = prefs.getString("ssid", "");
    gStaPass    = prefs.getString("pass", "");
    legacyMidiMode = (uint8_t)constrain((int)prefs.getUChar("midimode", 0), 0, 1);
    storedOutput = prefs.getUChar("outputmode", 255);
    storedEncoderSetting = (uint8_t)constrain((int)prefs.getUChar("encset", (uint8_t)gEncoderSetting), 0, (int)ENC_SET_COUNT - 1);
    storedEncoderVolumeMode = prefs.getUChar("encvol", gEncoderVolumeMode ? 1u : 0u) != 0;

    RuntimeStateBlob bootState;
    hasBootState = loadRuntimeStateFromOpenPrefs(bootState);
    if (hasBootState) {
      applyRuntimeState(bootState, false, false);
      storedOutput = bootState.outputmode;
      bootMute = (bootState.io_muted != 0);
      Serial.println("@I RUNTIME STATE RESTORED");
    }
    prefs.end();
  } else {
    gCrashCount = 0;
  }
  setStartupCheck(STARTUP_CHECK_SESSION, hasBootState ? STARTUP_CHECK_OK : STARTUP_CHECK_WARN);

  if (storedOutput > 2) {
    storedOutput = legacyMidiMode;
  }
  const bool bootOutputStabilized = (storedOutput == OUTPUT_AUX);
  uint8_t bootOutput = (uint8_t)constrain((int)storedOutput, 0, 2);
  if (bootOutput == OUTPUT_AUX) {
    bootOutput = (legacyMidiMode == 1) ? OUTPUT_SERIAL : OUTPUT_BLE;
    Serial.printf("@I BOOT MIDI STABILIZE MODE %s (AUX unlock in %lu ms)\n",
                  outputModeName(bootOutput), (unsigned long)AUX_STARTUP_LOCK_MS);
  }
  gOutputMode = bootOutput;
  gIoMuted = bootMute ? 1 : 0;
  gEncoderSetting = (EncoderSettingId)storedEncoderSetting;
  normalizeEncoderSetting();
  gEncoderVolumeMode = storedEncoderVolumeMode;
  setStartupCheck(STARTUP_CHECK_OUTPUT, bootOutput <= OUTPUT_AUX ? STARTUP_CHECK_OK : STARTUP_CHECK_FAIL);

  Serial.printf("@I RESET %s crash_count=%u\n", resetReasonName(resetReason), (unsigned)gCrashCount);
  if (gDeviceName.length() == 0) gDeviceName = "beca-" + shortChipId();
  normalizeDeviceName();
  setStartupCheck(STARTUP_CHECK_WIFI_SAVED, gStaSsid.length() ? STARTUP_CHECK_OK : STARTUP_CHECK_WARN);

  const bool hadSavedWifi = gStaSsid.length() > 0;
  bool staOK = false;
  if (gStaSsid.length()) staOK = tryConnectSTA(gStaSsid, gStaPass);
  if (!staOK) startAPPortal();
  setStartupCheck(
    STARTUP_CHECK_NETWORK,
    staOK ? STARTUP_CHECK_OK : (hadSavedWifi ? STARTUP_CHECK_FAIL : STARTUP_CHECK_WARN)
  );

  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);

  // Coexistence-safe
  WiFi.setSleep(true);

  gAuxUnlockAtMs = millis() + AUX_STARTUP_LOCK_MS;
  gSynth.setDrumsEnabled(true);

  // Routes
  server.on("/",         handlePage);
  server.on("/logo",     handleLogo);
  server.on("/effects",  handleEffects);
  server.on("/palettes", handlePalettes);
  server.on("/events",   handleEvents);

  // Captive portal detection URLs
  server.on("/generate_204",      [](){ sendCaptiveRedirect("/setup"); });
  server.on("/gen_204",           [](){ sendCaptiveRedirect("/setup"); });
  server.on("/hotspot-detect.html", [](){ sendCaptiveRedirect("/setup"); });
  server.on("/ncsi.txt",          [](){ sendCaptiveRedirect("/setup"); });
  server.on("/connecttest.txt",   [](){ sendCaptiveRedirect("/setup"); });
  server.on("/success.txt",       [](){ sendCaptiveRedirect("/setup"); });
  server.on("/wpad.dat",          [](){ sendCaptiveRedirect("/setup"); });
  server.on("/favicon.ico",       [](){ sendCaptiveRedirect("/setup"); });

  server.on("/bpm",     setBPM);
  server.on("/swing",   setSwing);
  server.on("/b",       setBright);
  server.on("/s",       setSens);
  server.on("/lo",      setLowOct);
  server.on("/hi",      setHighOct);
  server.on("/mode",    setMode);
  server.on("/clock",   setClock);
  server.on("/scale",   setScale);
  server.on("/root",    setRoot);
  server.on("/fxset",   setFX);
  server.on("/pal",     setPalette);
  server.on("/visspd",  setVisSpd);
  server.on("/visint",  setVisInt);
  server.on("/rest",    setRest);
  server.on("/norep",   setNoRep);
  server.on("/midimode", setMidiMode);
  server.on("/ts",      setTS);
  server.on("/rand",    randomize);
  server.on("/api/outputmode", HTTP_GET,  handleApiOutputModeGet);
  server.on("/api/outputmode", HTTP_POST, handleApiOutputModePost);
  server.on("/api/mute",       HTTP_GET,  handleApiMuteGet);
  server.on("/api/mute",       HTTP_POST, handleApiMutePost);
  server.on("/api/sync",       HTTP_POST, handleApiSyncPost);
  server.on("/api/live",       HTTP_GET,  handleApiLiveGet);
  server.on("/api/state",      HTTP_GET,  handleApiStateGet);
  server.on("/api/plant",      HTTP_GET,  handleApiPlantGet);
  server.on("/api/notes",      HTTP_GET,  handleApiNotesGet);
  server.on("/api/drum",       HTTP_GET,  handleApiDrumGet);
  server.on("/api/params",     HTTP_GET,  handleApiParamsGet);
  server.on("/api/set",        HTTP_POST, handleApiSetPost);
  server.on("/api/synth",      HTTP_GET,  handleApiSynthGet);
  server.on("/api/synth",      HTTP_POST, handleApiSynthPost);
  server.on("/api/synth/test", HTTP_GET,  handleApiSynthTest);

  // NEW
  server.on("/drumsel", setDrumSel);

  server.on("/setup",       handleSetupPage);
  server.on("/wifi/scan",   handleWifiScan);
  server.on("/wifi/save",   HTTP_POST, handleWifiSave);
  server.on("/wifi/forget", handleWifiForget);
  server.on("/api/info",    handleApiInfo);
  server.on("/reboot",      handleReboot);

  server.onNotFound([](){
    if (setupPortalActive()) {
      sendCaptiveRedirect("/setup");
    } else {
      server.sendHeader("Location", "/", true);
      server.send(302, "text/plain", "");
    }
  });

  server.begin();
  Serial.println("Web server started");

  if (gIsSta) {
    Serial.print("UI:  http://");
    Serial.print(WiFi.localIP());
    Serial.println("/");

    Serial.print("mDNS: http://");
    Serial.print(gDeviceName);
    Serial.println(".local/");
  } else {
    Serial.print("AP UI (setup): http://");
    Serial.print(gApIP);
    Serial.println("/setup");
  }

  Serial.println("Routes:");
  Serial.println("  /");
  Serial.println("  /setup");
  Serial.println("  /api/info");
  Serial.println("  /api/state");
  Serial.println("  /api/plant");
  Serial.println("  /api/notes");
  Serial.println("  /api/params");
  startMDNS();
  setStartupCheck(
    STARTUP_CHECK_SERVICES,
    (gIsSta && gMdnsStarted) ? STARTUP_CHECK_OK : STARTUP_CHECK_WARN
  );
  logStartupCheckSummary();
  playStartupCheckAnimation();
  Serial.print("Output mode: ");
  Serial.println(outputModeName(gOutputMode));
  if (midiOutIsSerial()) {
    gLastSerialBeaconMs = millis();
    Serial.println("@I MIDIMODE SERIAL READY");
  }
  if (outputModeIsAux()) Serial.println("@I AUX OUT ACTIVE");

  for (auto &q : offQ) q.on = false;

  recalcTransport(true);
  pushStateIfChanged(true);
}

// -------------------- loop() --------------------
void loop() {
  uint32_t now = millis();

  if (setupPortalActive()) dns.processNextRequest();
  server.handleClient();
  serviceSerialControlCommands();
  maintainWiFi(now);
  serviceMDNS(now);
  applyEncoder();
  serviceJackInputs(now);

  // keep WDT + WiFi/BLE happy
  delay(0);
  warmupPlantBackground();
  gSynth.service(now);

  // Plant sampling
  static uint32_t lastPlantMs = 0;
  if ((int32_t)(now - lastPlantMs) >= (int32_t)PLANT_INTERVAL_MS) {
    lastPlantMs = now;
    plantPerformerTick();
  }

  if (gSerialJsonTelemetry && (int32_t)(now - gLastSerialPlantTelemetryMs) >= 50) {
    gLastSerialPlantTelemetryMs = now;
    char line[192];
    int n = snprintf(
      line, sizeof(line),
      "{\"type\":\"plant\",\"value\":%.4f,\"raw\":%u,\"raw2\":%u,\"connected\":%u,\"plant_auto_mute\":%u,\"ts\":%lu}\n",
      (double)gScopePlant,
      (unsigned)gPlantRaw1,
      (unsigned)gPlantRaw2,
      plantJackConnected() ? 1u : 0u,
      plantAutoMuteActive() ? 1u : 0u,
      (unsigned long)now
    );
    if (n > 0) Serial.write((const uint8_t*)line, (size_t)n);
  }

  // Process incoming BLE-MIDI realtime clock/messages.
  MIDI.read();

  // Transport tick
  if (gDawSyncEnabled && gDawClockRunning) {
    uint32_t lastPulse = gDawLastPulseMs;
    if (lastPulse == 0 || (int32_t)(now - lastPulse) > (int32_t)DAW_SYNC_TIMEOUT_MS) {
      gDawClockRunning = false;
      gDawClockPulseAcc = 0;
      gDawStepPending = 0;
    }
  }

  static bool wasDawLocked = false;
  if (gClock == CLOCK_PLANT) {
    step_fromPlantTrigger();
    T.nextTickMs = now + T.stepMs;
    gDawStepPending = 0;
    wasDawLocked = false;
  } else {
    const bool dawLocked = dawSyncLocked(now);
    if (dawLocked) {
      if (!wasDawLocked) T.nextTickMs = now + T.stepMs;
      wasDawLocked = true;
      uint8_t pending = gDawStepPending;
      if (pending > 0) {
        if (pending > 6) pending = 6;
        gDawStepPending = (uint8_t)(gDawStepPending - pending);
        while (pending--) transportTick();
      }
    } else {
      if (wasDawLocked) {
        T.nextTickMs = now + T.stepMs;
        wasDawLocked = false;
      }
      if ((int32_t)(now - T.nextTickMs) >= 0) {
        uint8_t maxCatch = 4;
        do {
          uint32_t base = T.stepMs;
          uint32_t swingAdd = 0;

          T.swingOdd = !T.swingOdd;
          if (swingPct && T.swingOdd) swingAdd = (base * swingPct) / 100;

          T.nextTickMs += base + swingAdd;
          transportTick();

          if (--maxCatch == 0) break;
        } while ((int32_t)(now - T.nextTickMs) >= 0);

        if ((int32_t)(now - T.nextTickMs) > (int32_t)T.stepMs * 8) {
          T.nextTickMs = now + T.stepMs;
        }
      }
    }
  }

  // LED update
  static uint32_t lastLedMs = 0;
  if ((int32_t)(now - lastLedMs) >= (int32_t)LED_INTERVAL_MS) {
    lastLedMs = now;
    renderLEDs();
  }

  // BLE advertising keepalive (helps Windows rediscover after odd disconnects)
  if (outputModeIsBle() && !gMidiConnected && (millis() - gLastBleKickMs) > BLE_KICK_INTERVAL_MS) {
    gLastBleKickMs = millis();
    bleKickAdvertising();
  }

  if (outputModeIsSerial() && (millis() - gLastSerialBeaconMs) > SERIAL_MIDI_BEACON_MS) {
    gLastSerialBeaconMs = millis();
    Serial.println("@I MIDIMODE SERIAL READY");
  }

  if ((int32_t)(now - gLastSynthUnderrunLogMs) >= 1000) {
    gLastSynthUnderrunLogMs = now;
    uint32_t u = gSynth.consumeUnderruns();
    if (u > 0) {
      Serial.printf("@W I2S UNDERRUN %lu\n", (unsigned long)u);
    }
    if (u >= 40) {
      if (gUnderrunHighStreak < 255) gUnderrunHighStreak++;
    } else if (gUnderrunHighStreak > 0) {
      gUnderrunHighStreak--;
    }
    if (gUnderrunHighStreak >= 5) {
      requestSoftRestart("audio_underrun");
      gUnderrunHighStreak = 0;
    }
  }

  // SSE maintenance
  if (sseConnected) {
    if (!sseClient.connected()) {
      sseConnected = false;
    } else if ((millis() - sseConnectedAt) > SSE_MAX_LIFETIME_MS) {
      sseClient.stop();
      sseConnected = false;
    } else {
      if ((int32_t)(now - lastSseKeepAliveMs) >= (int32_t)SSE_KEEPALIVE_MS) {
        lastSseKeepAliveMs = now;
        if (sseCanWrite(8)) {
          sseClient.print(": ping\n\n");
          delay(0);
        } else {
          sseClient.stop();
          sseConnected = false;
        }
      }

      // State diff push
      if ((int32_t)(now - lastStatePushMs) >= (int32_t)SSE_STATE_MS) {
        lastStatePushMs = now;
        pushStateIfChanged(false);
      }

      // Scope stream
      if ((int32_t)(now - lastSseScopeMs) >= (int32_t)SSE_SCOPE_MS) {
        lastSseScopeMs = now;
        char buf[32];
        snprintf(buf, sizeof(buf), "%.3f", (double)gScopePlant);
        sseSend("scope", buf);
      }

      // Note grid stream (diff-based)
      if ((int32_t)(now - lastSseNoteMs) >= (int32_t)SSE_NOTE_MS) {
        lastSseNoteMs = now;

        uint8_t uiNotes[MAX_ACTIVE_NOTES];
        const uint8_t uiCount = uiCollectHeldNotes(uiNotes, MAX_ACTIVE_NOTES);
        const uint8_t held = (uiCount > 0) ? 1 : 0;
        const uint8_t vel  = (uint8_t)lastVel;

        uint32_t h = hashActiveNotes(uiNotes, uiCount, held, vel);
        if (h != lastNoteHash) {
          lastNoteHash = h;

          char buf[256];
          int n = 0;
          n += snprintf(buf + n, sizeof(buf) - n, "%u|%u|%u|",
                        (unsigned)held,
                        (unsigned)vel,
                        (unsigned)uiCount);

          for (uint8_t i = 0; i < uiCount; i++) {
            n += snprintf(buf + n, sizeof(buf) - n, "%u%s",
                          (unsigned)uiNotes[i],
                          (i + 1 < uiCount) ? "," : "");
            if (n >= (int)sizeof(buf) - 8) break;
          }
          sseSend("note", buf);
        }
      }

      // Drum UI stream (diff-based): hitMask|selMask
      if (drumsAllowedForCurrentOutput() &&
          (int32_t)(now - lastSseDrumMs) >= (int32_t)SSE_DRUM_MS) {
        lastSseDrumMs = now;
        uint8_t hit = drumHitMaskNow();
        uint8_t sel = (uint8_t)drumSelMask;

        uint32_t dh = ((uint32_t)hit << 8) | (uint32_t)sel;
        if (dh != lastDrumHash) {
          lastDrumHash = dh;
          char buf[32];
          snprintf(buf, sizeof(buf), "%u|%u", (unsigned)hit, (unsigned)sel);
          sseSend("drum", buf);
        }
      }

      // Keepalive
      if ((int32_t)(now - lastSseKeepAliveMs) >= 2000) {
        lastSseKeepAliveMs = now;
        if (sseCanWrite(8)) sseClient.print(": ping\n\n");
      }
    }
  }

  serviceRuntimeAutoSave(now);

  serviceNoteOffs();

  if (gRecoveringFromCrash && now > 45000) {
    gRecoveringFromCrash = false;
    gCrashCount = 0;
    prefs.begin("beca", false);
    prefs.putUChar("crashcnt", 0);
    prefs.end();
    Serial.println("@I RECOVERY STABLE");
  }

  if (gSoftRestartPending && (int32_t)(now - gSoftRestartAtMs) >= 0) {
    Serial.println("@I RESTARTING");
    Serial.flush();
    delay(20);
    ESP.restart();
  }
}


