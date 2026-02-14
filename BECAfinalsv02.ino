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

#include "logo_svg.h"
#include "index_html.h"
#include "synth_engine.h"

extern const char SETUP_HTML[] PROGMEM;

// -------------------- Hardware --------------------
#define LED_PIN            19
#define LED_COUNT          8
#define LED_TYPE           WS2812B
#define LED_COLOR_ORDER    GRB

#define PLANT1_PIN         34   // degree
#define PLANT2_PIN         34   // octave (currently same; change if you have 2nd channel)

#define ENC_PIN_A          4
#define ENC_PIN_B          5
#define ENC_PIN_SW         15

// PCM5102A I2S defaults for AUX OUT
#define I2S_BCK_PIN        26
#define I2S_WS_PIN         27
#define I2S_DATA_PIN       25

CRGB leds[LED_COUNT];
uint8_t gBrightness = 154;

// -------------------- BLE-MIDI --------------------
volatile bool gMidiConnected = false;
enum OutputMode : uint8_t { OUTPUT_BLE = 0, OUTPUT_SERIAL = 1, OUTPUT_AUX = 2 };
volatile uint8_t gOutputMode = OUTPUT_BLE;
const uint32_t SERIAL_MIDI_BAUD = 115200;
const uint32_t SERIAL_MIDI_BEACON_MS = 2000;
uint32_t gLastSerialBeaconMs = 0;

beca::SynthEngine gSynth;
uint32_t gLastSynthUnderrunLogMs = 0;

// --- BLE advertising keepalive ---
uint32_t gLastBleKickMs = 0;
const uint32_t BLE_KICK_INTERVAL_MS = 2500; // kick advertise every 2.5s when not connected

static inline bool outputModeIsAux() { return gOutputMode == OUTPUT_AUX; }
static inline bool outputModeIsBle() { return gOutputMode == OUTPUT_BLE; }
static inline bool outputModeIsSerial() { return gOutputMode == OUTPUT_SERIAL; }
static inline bool midiOutIsSerial() { return outputModeIsSerial(); }
static inline bool midiOutReady()    { return outputModeIsSerial() || (outputModeIsBle() && gMidiConnected); }
static inline bool drumsAllowedForCurrentOutput();
static inline void enforceAuxDrumGuard();

static inline void serialMidiSend3(uint8_t st, uint8_t d1, uint8_t d2) {
  char line[24];
  int n = snprintf(line, sizeof(line), "@M %02X %02X %02X\n", st, d1 & 0x7F, d2 & 0x7F);
  if (n > 0) Serial.write((const uint8_t*)line, (size_t)n);
}

static inline void midiSendNoteOn(uint8_t note, uint8_t vel, uint8_t ch) {
  uint8_t status = 0x90 | ((ch - 1) & 0x0F);
  if (outputModeIsAux()) return;
  if (midiOutIsSerial()) serialMidiSend3(status, note, vel);
  else if (outputModeIsBle() && gMidiConnected) MIDI.sendNoteOn(note, vel, ch);
}

static inline void midiSendNoteOff(uint8_t note, uint8_t vel, uint8_t ch) {
  uint8_t status = 0x80 | ((ch - 1) & 0x0F);
  if (outputModeIsAux()) return;
  if (midiOutIsSerial()) serialMidiSend3(status, note, vel);
  else if (outputModeIsBle() && gMidiConnected) MIDI.sendNoteOff(note, vel, ch);
}

static inline void midiSendControlChange(uint8_t cc, uint8_t val, uint8_t ch) {
  uint8_t status = 0xB0 | ((ch - 1) & 0x0F);
  if (outputModeIsAux()) return;
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

static inline void uiQueueHeldNote(uint8_t note, uint16_t durMs) {
  uint32_t until = millis() + durMs;
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

static inline bool startAuxAudio() {
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

static inline void setOutputMode(uint8_t mode) {
  uint8_t next = (uint8_t)constrain((int)mode, 0, 2);
  if (next == gOutputMode) return;

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

  if (outputModeIsAux()) {
    enforceAuxDrumGuard();
    gSynth.setDrumsEnabled(false);
    startAuxAudio();
    return;
  }

  gSynth.setDrumsEnabled(true);

  if (outputModeIsSerial()) {
    gLastSerialBeaconMs = 0;
    Serial.println("@I MIDIMODE SERIAL");
  } else {
    Serial.println("@I MIDIMODE BLE");
    bleKickAdvertising();
  }
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

float ema1 = 0, ema2 = 0, base1 = 0, base2 = 0;
float noise1 = 1.0f, noise2 = 1.0f;

float env = 0.0f;
const float ENV_ATTACK  = 0.35f;
const float ENV_RELEASE = 0.05f;

float sens = 0.2f;

// Cached features for UI (SSE)
volatile float   gFeatDeg    = 0.0f;
volatile float   gFeatOct    = 0.0f;
volatile float   gFeatEnergy = 0.0f;
volatile uint8_t gFeatVel    = 0;

// -------------------- Scope helpers --------------------
volatile float    gScopePlant   = 0.0f;   // 0..1

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

struct Transport {
  uint16_t bpm;
  uint8_t  beats;
  uint8_t  noteVal;
  uint32_t stepMs;
  uint8_t  stepsPerBar;
  uint8_t  stepInBar;
  bool     swingOdd;
  uint32_t nextTickMs;
};
Transport T;

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
  if (!drumsAllowedForCurrentOutput()) return;
  int8_t part = drumPartFromNote(note);
  if (part >= 0) {
    // respect selection mask
    if (((uint8_t)drumSelMask & (1u << (uint8_t)part)) == 0) return;
  }

  if (midiOutReady()) {
    midiSendNoteOn(note, vel, DRUM_CH);
    queueNoteOff(note, DRUM_CH, gateMs);
  }
  triggerVisual(note, vel);

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

static inline void addGlitter(uint8_t chance, uint8_t v = 200) {
  if (random8() < chance) leds[random8(LED_COUNT)] += CHSV(0, 0, v);
}

void fxGradientFlow() {
  static uint16_t t = 0; t += (1 + (visSpeed >> 5));
  uint8_t v = (uint8_t)constrain((int)(lastVel * noteEnergy * (visIntensity / 255.0f)), 12, 255);
  for (int i = 0; i < LED_COUNT; i++) {
    uint8_t idx = (i * 255 / LED_COUNT + (t >> 1) + (lastNote % 12) * 8) & 0xFF;
    leds[i] = ColorFromPalette(currentPalette(), idx, v, LINEARBLEND);
  }
}

void fxPaletteWave() {
  static uint16_t t = 0; t += (2 + (visSpeed >> 5));
  uint8_t v = (uint8_t)(noteEnergy * visIntensity);
  for (int i = 0; i < LED_COUNT; i++) {
    uint8_t s = sin8(t + i * 32);
    uint8_t idx = (s + (lastNote % 12) * 4);
    leds[i] = ColorFromPalette(currentPalette(), idx, v, LINEARBLEND);
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

static inline void renderLEDs() {
  switch (fxMode) {
    case FX_GRADIENT_FLOW: fxGradientFlow(); break;
    case FX_PALETTE_WAVE:  fxPaletteWave();  break;
    case FX_SOFT_SWEEP:    fxSoftSweep();    break;
    case FX_COMET_TRAILS:  fxCometTrails();  break;
    case FX_JUGGLE:        fxJuggle();       break;
    case FX_GLITTER_VEIL:  fxGlitterVeil();  break;
    case FX_QUIET_FIRE:    fxQuietFire();    break;
    case FX_NEON_BARS:     fxNeonBars();     break;
    case FX_SPARKLE_MIST:  fxSparkleMist();  break;
    case FX_SPLIT_FADE:    fxSplitFade();    break;
    default:               fxGradientFlow(); break;
  }
  FastLED.setBrightness(gBrightness);
  FastLED.show();
  noteEnergy *= noteDecay;
}

static inline void startupAnim() {
  fill_solid(leds, LED_COUNT, CRGB::Green); FastLED.show(); delay(60);
  fill_solid(leds, LED_COUNT, CRGB::Black); FastLED.show(); delay(40);
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
  T.bpm     = (uint16_t)constrain((int)bpm, 20, 240);
  T.beats   = (uint8_t)constrain((int)gTS.beats, 1, 16);
  T.noteVal = isValidDen(gTS.noteVal) ? gTS.noteVal : 4;

  float quarterMs = 60000.0f / (float)T.bpm;
  T.stepMs = (uint32_t)max(10.0f, quarterMs * (4.0f / (float)T.noteVal));
  T.stepsPerBar = T.beats;

  if (resetPhase) {
    T.stepInBar  = 0;
    T.swingOdd   = false;
    T.nextTickMs = millis() + T.stepMs;
  }
}

// -------------------- Encoder --------------------
int  encLastA  = HIGH;
bool encLastSW = HIGH;

static inline void setupEncoder() {
  pinMode(ENC_PIN_A,  INPUT_PULLUP);
  pinMode(ENC_PIN_B,  INPUT_PULLUP);
  pinMode(ENC_PIN_SW, INPUT_PULLUP);
  encLastA  = digitalRead(ENC_PIN_A);
  encLastSW = digitalRead(ENC_PIN_SW);
}

static inline void applyEncoder() {
  int a = digitalRead(ENC_PIN_A);
  if (a != encLastA && a == LOW) {
    int b = digitalRead(ENC_PIN_B);
    sens += (b == HIGH) ? 0.05f : -0.05f;
    sens  = clampf(sens, 0.0f, 0.5f);
  }
  encLastA = a;

  bool sw = digitalRead(ENC_PIN_SW);
  if (encLastSW == HIGH && sw == LOW) {
    currentPaletteIndex = (currentPaletteIndex + 1) % (NUM_BUILTIN + NUM_CUSTOM);
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
extern volatile int32_t gLastStaDisconnectReason;
static inline void startMDNS();
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
      break;
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      gIsSta = true;
      gLastWifiOkMs = millis();
      gWifiFailCount = 0;
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
const float   TRIG_THRESH        = 0.12f;
uint32_t      lastNoteMs         = 0;
const uint16_t MIN_INTER_NOTE_MS = 100;

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

static inline void samplePlant(float &fDeg, float &fOct, uint8_t &velOut, float &energyOut) {
  float raw1 = analogRead(PLANT1_PIN);
  float raw2 = (PLANT2_PIN == PLANT1_PIN) ? raw1 : analogRead(PLANT2_PIN);

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

  if (d1 < floorLevel) d1 = 0.0f;
  if (d2 < floorLevel) d2 = 0.0f;

  float scale = envNoise;
  if (scale < 4.0f)   scale = 4.0f;
  if (scale > 120.0f) scale = 120.0f;

  float a1 = (d1 / scale) * sens * 2.5f;
  float a2 = (d2 / scale) * sens * 2.5f;
  a1 = clampf(a1, 0.0f, 3.0f);
  a2 = clampf(a2, 0.0f, 3.0f);

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
  bool rising    = (energy > TRIG_THRESH) && (lastEnergy <= TRIG_THRESH);
  bool spacingOK = (now - lastNoteMs) >= MIN_INTER_NOTE_MS;

  if (rising && spacingOK) {
    gPlantArmed  = true;
    gPlantVel    = vel;
    gPlantEnergy = energy;
    lastNoteMs   = now;
  }
  lastEnergy = energy;
}

static inline uint16_t gateFromStep(float mult = 0.90f) {
  return (uint16_t)constrain((int)((float)T.stepMs * mult), 60, 650);
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
  if (!gPlantArmed) return;
  activeClear();
  gPlantArmed = false;

  if (random(100) < (int)(restProb * 100.0f)) return;

  const int* S; int len; getScaleArr(S, len);
  (void)S;

  uint8_t vel   = gPlantVel;
  float   energ = gPlantEnergy;

  uint8_t note = buildMidiFromBins(heldDegIdx, heldOctIdx);
  if (avoidRepeats && lastMidiOut == note && len > 1) {
    int alt = constrain(heldDegIdx + (random(0, 2) ? 1 : -1), 0, len - 1);
    note = buildMidiFromBins(alt, heldOctIdx);
  }

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

  if (gClock == CLOCK_INTERNAL) {
    switch (gMode) {
      case MODE_NOTE:  stepNOTE_internal();  break;
      case MODE_ARP:   stepARP_internal();   break;
      case MODE_CHORD: stepCHORD_internal(); break;
      case MODE_DRUM:  stepDRUM_internal();  break;
    }
  } else {
    step_fromPlantTrigger();
  }
}

// -------------------- WebServer + SSE --------------------
WebServer server(80);

static inline void sendNoCacheHeaders() {
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

// ---- State push (diff-based) ----
uint32_t stateVersion = 0;

// these mirror the last pushed state; if unchanged, we don't send
struct LastState {
  uint8_t  ble;
  uint8_t  midimode;
  uint8_t  outputmode;
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

  const bool critical =
    (strcmp(event, "hello") == 0) ||
    (strcmp(event, "state") == 0) ||
    (strcmp(event, "scope") == 0) ||
    (strcmp(event, "note") == 0) ||
    (strcmp(event, "drum") == 0);

  if (!critical) {
    size_t need = 8 + strlen(event) + 7 + strlen(data) + 2;
    if (!sseCanWrite(need)) return;
  }
  sseClient.printf("event: %s\n", event);
  sseClient.printf("data: %s\n\n", data);
}

static inline void handleEvents() {
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
  lastSseKeepAliveMs = 0;
  lastSseNoteMs = 0;
  lastNoteHash = 0;
  lastSseDrumMs = 0;
  lastDrumHash = 0;

  sseClient.println("HTTP/1.1 200 OK");
  sseClient.println("Content-Type: text/event-stream");
  sseClient.println("Cache-Control: no-cache");
  sseClient.println("Connection: keep-alive");
  sseClient.println("X-Accel-Buffering: no");
  sseClient.println();

  sseSend("hello", "{\"ok\":1}");
}

static inline bool stateChanged() {
  uint8_t ble = gMidiConnected ? 1 : 0;
  uint8_t root = (uint8_t)(rootMidi % 12);

  if (LS.ble   != ble) return true;
  if (LS.midimode != (uint8_t)(outputModeIsSerial() ? 1 : 0)) return true;
  if (LS.outputmode != (uint8_t)gOutputMode) return true;
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
  if (LS.last  != lastNote) return true;
  if (LS.vel   != lastVel) return true;
  if (LS.drumsel != (uint8_t)drumSelMask) return true;

  return false;
}

static inline void captureState() {
  LS.ble   = gMidiConnected ? 1 : 0;
  LS.midimode = (uint8_t)(outputModeIsSerial() ? 1 : 0);
  LS.outputmode = (uint8_t)gOutputMode;
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
}

static inline void pushStateIfChanged(bool force=false) {
  if (!sseConnected) return;
  if (!sseClient.connected()) { sseConnected = false; return; }
  if (!force && !stateChanged()) return;

  captureState();
  stateVersion++;

  char buf[760];
  snprintf(buf, sizeof(buf),
    "{\"ver\":%u,"
    "\"ble\":%u,"
    "\"midimode\":%u,"
    "\"outputmode\":%u,"
    "\"outputname\":\"%s\","
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
    "\"ts\":\"%u/%u\","
    "\"last\":\"%u\","
    "\"vel\":%u,"
    "\"drumsel\":%u}",
    stateVersion,
    LS.ble,
    LS.midimode,
    LS.outputmode,
    outputModeName(LS.outputmode),
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
    LS.beats,
    LS.den,
    LS.last,
    LS.vel,
    LS.drumsel
  );

  sseSend("state", buf);
}

// ✅ FULL HTML moved to index_html.h (generated from index.html)

static inline void handleLogo() {
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
  server.sendHeader("Cache-Control","public, max-age=86400");
  server.send_P(200, "application/json", EFFECTS_JSON);
}

static inline void handlePalettes() {
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
    int b = server.arg("v").toInt();
    b = (b / 5) * 5;
    bpm = (uint16_t)constrain(b, 20, 240);
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
  if (server.hasArg("v")) lowOct = (uint8_t)constrain(server.arg("v").toInt(), 1, 9);
  if (lowOct > highOct) highOct = lowOct;
  pushStateIfChanged(true);
  server.send(200, "text/plain", "OK");
}
static inline void setHighOct() {
  if (server.hasArg("v")) highOct = (uint8_t)constrain(server.arg("v").toInt(), 1, 9);
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
static inline void setClock()  { if (server.hasArg("v")) gClock = (ClockMode)constrain(server.arg("v").toInt(), 0, 1); pushStateIfChanged(true); server.send(200,"text/plain","OK"); }
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
  prefs.begin("beca", false);
  prefs.putUChar("outputmode", gOutputMode);
  prefs.putUChar("midimode", outputModeIsSerial() ? 1 : 0); // legacy key for compatibility
  prefs.end();
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
  char buf[96];
  snprintf(buf, sizeof(buf), "{\"mode\":\"%s\",\"value\":%u}", outputModeName(gOutputMode), (unsigned)gOutputMode);
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

  setOutputMode(next);
  saveOutputModePref();
  pushStateIfChanged(true);
  handleApiOutputModeGet();
}

static inline void handleApiSynthGet() {
  beca::SynthParams p;
  gSynth.getParams(p);
  char buf[512];
  snprintf(
    buf, sizeof(buf),
    "{\"preset\":%u,\"preset_name\":\"%s\",\"wave_a\":%u,\"wave_b\":%u,\"osc_mix\":%.3f,"
    "\"mono\":%u,\"voices\":%u,\"attack\":%.3f,\"decay\":%.3f,\"sustain\":%.3f,\"release\":%.3f,"
    "\"filter\":%u,\"cutoff\":%.2f,\"resonance\":%.3f,\"reverb\":%.3f,\"delay_ms\":%.2f,"
    "\"delay_feedback\":%.3f,\"delay_mix\":%.3f,\"drive\":%.3f,\"master\":%.3f,\"detune\":%.3f,"
    "\"gain_trim\":%.3f,\"drumkit\":%u}",
    (unsigned)p.preset, beca::SynthEngine::presetName(p.preset),
    (unsigned)p.waveA, (unsigned)p.waveB, (double)p.oscMix,
    (unsigned)p.mono, (unsigned)p.maxVoices, (double)p.attack, (double)p.decay, (double)p.sustain, (double)p.release,
    (unsigned)p.filterType, (double)p.cutoffHz, (double)p.resonance, (double)p.reverb, (double)p.delayMs,
    (double)p.delayFeedback, (double)p.delayMix, (double)p.distDrive, (double)p.master, (double)p.detuneCents,
    (double)p.gainTrim, (unsigned)p.drumKit
  );
  sendNoCacheHeaders();
  server.send(200, "application/json", buf);
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

static inline void randomize() {
  gMode  = (Mode)random(0, drumsAllowedForCurrentOutput() ? 4 : 3);
  gScale = (ScaleType)random(0, 15);
  fxMode = (EffectMode)random(0, (int)FX_COUNT);
  currentPaletteIndex = (uint8_t)random(0, NUM_BUILTIN + NUM_CUSTOM);

  bpm = ((int)random(90, 150) / 5) * 5;
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
volatile int32_t gLastStaDisconnectReason = 0;
String gWifiLastError;
String gWifiLastHint;
const uint32_t WIFI_CHECK_MS = 1000;
const uint32_t WIFI_RECONNECT_MS = 5000;
const uint32_t WIFI_RESET_MS = 30000;
const uint32_t WIFI_RESET_COOLDOWN_MS = 60000;

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

static inline void startMDNS() {
  if (gDeviceName.length() == 0) gDeviceName = "beca-" + shortChipId();
  if (gMdnsStarted) return;
  if (MDNS.begin(gDeviceName.c_str())) {
    if (MDNS.addService("http", "tcp", 80)) {
      gMdnsStarted = true;
    } else {
      MDNS.end();
      gMdnsStarted = false;
    }
  }
}

static inline bool wifiReady() {
  return WiFi.status() == WL_CONNECTED && WiFi.localIP() != IPAddress(0,0,0,0);
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

const char SETUP_HTML[] PROGMEM = R"HTML(
<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BECA - Setup</title>
<style>
:root{  color-scheme: light;  --accent:#008351;  --bg:#c7ddcf;  --bg-soft:#d7e7dd;  --surface:rgba(206,222,214,.22);  --surface-strong:rgba(206,222,214,.32);  --edge:rgba(70,96,83,.24);  --edge-strong:rgba(70,96,83,.38);  --text:#1b2c23;  --text-muted:rgba(27,44,35,.6);  --shadow:0 12px 26px rgba(18,30,24,.12),0 10px 22px rgba(0,131,81,.16);  --glass-noise:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='table' tableValues='0 0.08'/></feComponentTransfer></filter><rect width='160' height='160' filter='url(%23n)'/></svg>");}*{box-sizing:border-box;}body{  margin:0;  min-height:100vh;  padding:24px;  font:14px "SF Pro Text","Avenir Next","Segoe UI",sans-serif;  color:var(--text);  background:    radial-gradient(900px 520px at 78% -10%, rgba(0,131,81,.22), transparent 62%),    radial-gradient(760px 540px at 12% 18%, rgba(136,200,170,.25), transparent 62%),    radial-gradient(520px 420px at 88% 84%, rgba(0,131,81,.18), transparent 60%),    linear-gradient(160deg,var(--bg) 0%,var(--bg-soft) 58%,var(--bg) 100%);}body:before{  content:"";  position:fixed;  inset:-20% -20% -10% -20%;  background:    radial-gradient(40% 35% at 70% 18%, rgba(0,131,81,.14), transparent 60%),    radial-gradient(36% 30% at 18% 80%, rgba(0,131,81,.12), transparent 65%);  z-index:-2;}body:after{  content:"";  position:fixed;  inset:0;  background-image:    linear-gradient(rgba(0,131,81,.05) 1px, transparent 1px),    linear-gradient(90deg, rgba(0,131,81,.05) 1px, transparent 1px);  background-size:28px 28px;  opacity:.3;  pointer-events:none;  z-index:-1;}.card{  max-width:580px;  margin:0 auto;  background:var(--glass-noise),linear-gradient(155deg, rgba(255,255,255,.12), rgba(255,255,255,.03)),var(--surface-strong);  background-size:200px 200px,auto,auto;  background-repeat:repeat;  border:1px solid var(--edge-strong);  border-radius:18px;  padding:18px;  box-shadow:var(--shadow);  backdrop-filter:blur(22px) saturate(160%);}h1{  margin:0 0 6px;  font-size:16px;  letter-spacing:.18em;  text-transform:uppercase;}label{  display:block;  margin:14px 0 6px;  font-size:11px;  letter-spacing:.16em;  text-transform:uppercase;  opacity:.75;}input,select,button{  width:100%;  padding:10px 12px;  border:1px solid var(--edge-strong);  border-radius:12px;  background:linear-gradient(150deg, rgba(255,255,255,.12), rgba(255,255,255,.03)),rgba(200,216,208,.26);  color:var(--text);  font:inherit;  box-shadow:inset 0 0 0 1px rgba(255,255,255,.24);}button{cursor:pointer;}button.primary{  background:linear-gradient(150deg, rgba(0,131,81,.18), rgba(0,131,81,.08)),rgba(200,216,208,.26);  border-color:rgba(0,131,81,.5);  font-weight:600;}.small{font-size:12px;opacity:.75;}.stack{display:flex;flex-direction:column;gap:10px;margin-top:12px;}.status{margin-top:12px;padding:10px 12px;border-radius:12px;border:1px solid rgba(70,96,83,.32);background:rgba(206,222,214,.3);display:none;}.status.show{display:block;}.status.ok{border-color:rgba(0,131,81,.52);background:rgba(0,131,81,.10);}.status.err{border-color:rgba(176,67,67,.48);background:rgba(176,67,67,.10);}.status .hint{display:block;margin-top:5px;opacity:.78;}.row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end;}.btn-mini{width:auto;padding:10px 12px;font-size:12px;}</style>
<div class="card">
  <h1>BECA Wi-Fi Setup</h1>
  <div class="small">Pick your home Wi-Fi (2.4GHz). This page opens automatically while BECA is in setup mode.</div>
  <label>Device name (for .local)</label>
  <input id="name" placeholder="beca-xxxx">
  <label>Wi-Fi SSID</label>
  <div class="row">
    <select id="ssid"><option>Scanning...</option></select>
    <button class="btn-mini" onclick="scan()">Rescan</button>
  </div>
  <label>Password</label>
  <input id="pass" type="password" placeholder="********">
  <div class="stack">
    <button class="primary" onclick="save()">Save and Connect</button>
    <button onclick="forget()">Forget Wi-Fi</button>
  </div>
  <div id="netStatus" class="status"></div>
  <p class="small">If setup fails, BECA stays in setup mode so you can retry.</p>
</div>
<script>
const statusEl = document.getElementById('netStatus');
function showStatus(type, msg, hint = '') {
  statusEl.className = 'status show ' + (type || 'info');
  statusEl.innerHTML = '<strong>' + msg + '</strong>' + (hint ? '<span class="hint">' + hint + '</span>' : '');
}
window.scan = async () => {
  try{
    const s = await (await fetch('/wifi/scan')).json();
    const sel = document.getElementById('ssid'); sel.innerHTML='';
    (s.list||[]).forEach(n=>{ const o=document.createElement('option'); o.textContent=n; sel.appendChild(o); });
  }catch(e){ showStatus('err', 'Could not scan Wi-Fi right now.', 'Try again in a few seconds.'); }
}
window.load = async () => {
  await scan();
  try{
    const info = await (await fetch('/api/info')).json();
    const sel = document.getElementById('ssid');
    if(info.name) document.getElementById('name').value = info.name;
    if(info.ssid){ [...sel.options].forEach(o=>{ if(o.textContent===info.ssid) o.selected=true; }); }
    if(info.wifi_error) showStatus('err', info.wifi_error, info.wifi_hint || '');
  }catch(e){}
}
window.save = async () => {
  const ssid = document.getElementById('ssid').value || '';
  if (!ssid) {
    showStatus('err', 'Please choose a Wi-Fi network first.');
    return;
  }
  showStatus('info', 'Connecting...', 'This can take up to 15 seconds.');
  const body = new URLSearchParams();
  body.set('name', document.getElementById('name').value);
  body.set('ssid', ssid);
  body.set('pass', document.getElementById('pass').value);
  try{
    const r = await fetch('/wifi/save',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
    const j = await r.json();
    if (j.ok) {
      showStatus('ok', j.msg || 'Connected successfully.', j.hint || 'BECA is rebooting now.');
      setTimeout(()=>fetch('/reboot').catch(()=>{}), 900);
      setTimeout(()=>location.href='/', 3200);
      return;
    }
    showStatus('err', j.msg || 'Could not connect to Wi-Fi.', j.hint || '');
  }catch(e){
    showStatus('err', 'Could not complete Wi-Fi setup.', 'Please retry. If needed, use a 2.4GHz hotspot.');
  }
}
window.forget = async () => {
  await fetch('/wifi/forget');
  showStatus('ok', 'Saved Wi-Fi removed.', 'BECA is rebooting into setup mode.');
  setTimeout(()=>location.reload(),1500);
}
window.load();
</script>
)HTML";

static inline void handleWifiScan() {
  sendNoCacheHeaders();
  int n = WiFi.scanNetworks();
  String json = "{\"list\":[";
  for (int i = 0; i < n; i++) {
    if (i) json += ',';
    json += '\"'; json += WiFi.SSID(i); json += '\"';
  }
  json += "]}";
  server.send(200, "application/json", json);
}

static inline void handleApiInfo() {
  sendNoCacheHeaders();
  String json = "{";
  json += "\"mode\":\"";   json += (setupPortalActive() ? "ap" : "sta"); json += "\",";
  json += "\"ip\":\"";     json += (gIsSta ? WiFi.localIP().toString() : gApIP.toString()); json += "\",";
  json += "\"name\":\"";   json += gDeviceName; json += "\",";
  json += "\"ssid\":\"";   json += gStaSsid;    json += "\",";
  json += "\"wifi_error\":\""; json += gWifiLastError; json += "\",";
  json += "\"wifi_hint\":\"";  json += gWifiLastHint;  json += "\",";
  json += "\"midimode\":"; json += (outputModeIsSerial() ? 1 : 0); json += ",";
  json += "\"outputmode\":\""; json += outputModeName(gOutputMode); json += "\",";
  json += "\"ble_connected\":"; json += (gMidiConnected ? 1 : 0);
  json += "}";
  server.send(200, "application/json", json);
}

static inline bool testStaFromPortal(const String &ssid, const String &pass, String &msg, String &hint, uint32_t timeoutMs = 15000) {
  gLastStaDisconnectReason = 0;
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

static inline void handleWifiSave() {
  String nextName = server.hasArg("name") ? server.arg("name") : gDeviceName;
  String nextSsid = server.hasArg("ssid") ? server.arg("ssid") : "";
  String nextPass = server.hasArg("pass") ? server.arg("pass") : "";
  nextName.trim();
  nextSsid.trim();
  if (nextName.length() == 0) nextName = "beca-" + shortChipId();

  sendNoCacheHeaders();
  if (nextSsid.length() == 0) {
    server.send(400, "application/json",
      "{\"ok\":0,\"msg\":\"Please choose a Wi-Fi network first.\",\"hint\":\"Pick a 2.4GHz Wi-Fi and retry.\"}");
    return;
  }

  gDeviceName = nextName;
  String msg, hint;
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
    server.send(200, "application/json",
      "{\"ok\":1,\"msg\":\"Connected to Wi-Fi successfully.\",\"hint\":\"BECA will reboot now and join your Wi-Fi.\"}");
    return;
  }

  gWifiLastError = msg;
  gWifiLastHint = hint;
  prefs.begin("beca", false);
  prefs.putString("name", gDeviceName);
  prefs.end();
  String errJson = "{\"ok\":0,\"msg\":\"" + msg + "\",\"hint\":\"" + hint + "\"}";
  server.send(200, "application/json", errJson);
}

static inline void handleWifiForget() {
  prefs.begin("beca", false);
  prefs.remove("ssid");
  prefs.remove("pass");
  prefs.end();
  gStaSsid = "";
  gStaPass = "";
  gWifiLastError = "No Wi-Fi saved yet.";
  gWifiLastHint = "Pick a 2.4GHz Wi-Fi network to continue.";
  server.send(200, "text/plain", "OK");
  delay(80);
  ESP.restart();
}

static inline void handleReboot() {
  server.send(200, "text/plain", "Rebooting...");
  delay(80);
  ESP.restart();
}

static inline bool tryConnectSTA(const String &ssid, const String &pass, uint32_t timeoutMs = 12000) {
  // Force clean STA start (prevents half-connected states + 0.0.0.0)
  WiFi.disconnect(true, true);
  delay(100);

  WiFi.mode(WIFI_STA);
  delay(100);

  WiFi.setHostname(gDeviceName.c_str());

  Serial.printf("Connecting STA to \"%s\" ...\n", ssid.c_str());
  gLastStaDisconnectReason = 0;
  WiFi.begin(ssid.c_str(), pass.c_str());

  uint32_t t0 = millis();
  while ((WiFi.status() != WL_CONNECTED || WiFi.localIP() == IPAddress(0,0,0,0)) &&
         (millis() - t0) < timeoutMs) {
    delay(250);
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
const uint32_t SSE_SCOPE_MS      = 100;  // 10 fps scope (plant only)
const uint32_t SSE_NOTE_MS       = 60;   // ~16 fps note grid
const uint32_t SSE_DRUM_MS       = 50;   // ~20 fps drum UI
bool     gWarmupDone = false;
uint32_t gWarmupEndMs = 0;

// -------------------- setup() --------------------
void setup() {
  Serial.begin(SERIAL_MIDI_BAUD);
  delay(1000);
  Serial.println();
  Serial.println("=== BECA booting ===");
  randomSeed(esp_random());

  WiFi.onEvent(WiFiEvent);

  // BLE-MIDI
  BLEMIDI.setHandleConnected(onBleMidiConnect);
  BLEMIDI.setHandleDisconnected(onBleMidiDisconnect);
  MIDI.begin(MIDI_CHANNEL_OMNI);

  // LEDs
  FastLED.addLeds<LED_TYPE, LED_PIN, LED_COLOR_ORDER>(leds, LED_COUNT);
  FastLED.setBrightness(gBrightness);
  startupAnim();

  // Plant + encoder
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  ema1 = base1 = analogRead(PLANT1_PIN);
  ema2 = base2 = analogRead(PLANT2_PIN);
  setupEncoder();
  warmupPlant(120);
  gWarmupDone = false;
  gWarmupEndMs = millis() + 1600;

  // Wi-Fi provisioning boot
  prefs.begin("beca", true);
  gDeviceName = prefs.getString("name", "");
  gStaSsid    = prefs.getString("ssid", "");
  gStaPass    = prefs.getString("pass", "");
  uint8_t storedOutput = prefs.getUChar("outputmode", 255);
  if (storedOutput > 2) {
    storedOutput = (uint8_t)constrain((int)prefs.getUChar("midimode", 0), 0, 1);
  }
  gOutputMode = (uint8_t)constrain((int)storedOutput, 0, 2);
  prefs.end();
  if (gDeviceName.length() == 0) gDeviceName = "beca-" + shortChipId();

  bool staOK = false;
  if (gStaSsid.length()) staOK = tryConnectSTA(gStaSsid, gStaPass);
  if (!staOK) startAPPortal();

  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);

  // Coexistence-safe
  WiFi.setSleep(true);

  gSynth.setDrumsEnabled(!outputModeIsAux());
  if (outputModeIsAux()) {
    enforceAuxDrumGuard();
    startAuxAudio();
  }

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
  Serial.print("Output mode: ");
  Serial.println(outputModeName(gOutputMode));
  if (midiOutIsSerial()) Serial.println("@I MIDIMODE SERIAL READY");
  if (outputModeIsAux()) Serial.println("@I AUX OUT ACTIVE");
  startMDNS();

  for (auto &q : offQ) q.on = false;

  recalcTransport(true);
  pushStateIfChanged(true);
}

// -------------------- loop() --------------------
void loop() {
  uint32_t now = millis();

  if (setupPortalActive()) dns.processNextRequest();
  server.handleClient();
  maintainWiFi(now);
  applyEncoder();

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

  // Transport tick
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
  }


  // SSE maintenance
  if (sseConnected) {
    if (!sseClient.connected()) {
      sseConnected = false;
    } else if ((millis() - sseConnectedAt) > SSE_MAX_LIFETIME_MS) {
      sseClient.stop();
      sseConnected = false;
    } else {
      // State diff push
      if ((int32_t)(now - lastStatePushMs) >= 120) {
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

  serviceNoteOffs();
  MIDI.read();
}


