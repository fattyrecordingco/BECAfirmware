/******************************************************
 * BECA — Plant-Played MIDI Synth + BLE + Visualizer
 * ESP32-PICO-V3 (Arduino "ESP32 Dev Module")
 *
 * Stability + UI smoothness version:
 * - Coexistence: WiFi modem sleep enabled when BLE active
 * - SSE: scope throttled + state pushed only when changed
 * - WDT friendly: frequent delay(0)
 *
 * VIS UPDATE:
 * - Oscilloscope shows ONLY plant input (energy 0..1)
 * - MIDI note grid under scope (12 semis × 8 rows)
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

CRGB leds[LED_COUNT];
uint8_t gBrightness = 160;

// -------------------- BLE-MIDI --------------------
volatile bool gMidiConnected = false;

// --- BLE advertising keepalive ---
uint32_t gLastBleKickMs = 0;
const uint32_t BLE_KICK_INTERVAL_MS = 2500; // kick advertise every 2.5s when not connected

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

static inline void allNotesOff() {
  for (uint8_t ch = 1; ch <= 16; ++ch) MIDI.sendControlChange(123, 0, ch);
  for (auto &q : offQ) q.on = false;
}

static inline void onBleMidiConnect()    { gMidiConnected = true; }
static inline void onBleMidiDisconnect() {
  gMidiConnected = false;
  allNotesOff();
  // Immediately resume advertising after disconnect
  bleKickAdvertising();
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
      MIDI.sendNoteOff(q.note, 0, q.ch);
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

float sens = 0.1f;

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
ClockMode gClock = CLOCK_PLANT;

uint16_t bpm      = 120;
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
Mode gMode = MODE_NOTE;

uint8_t rootMidi = 60; // stored as MIDI, we expose root "semi" in UI via rootMidi%12
uint8_t lowOct   = 1;
uint8_t highOct  = 8;

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

static inline void drumMarkHit(uint8_t part, uint16_t holdMs=110){
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

static inline uint32_t hashActiveNotes(uint8_t held, uint8_t vel) {
  uint32_t h = 2166136261u;
  h = (h ^ held) * 16777619u;
  h = (h ^ vel ) * 16777619u;
  h = (h ^ gActiveCount) * 16777619u;
  for (uint8_t i = 0; i < gActiveCount; i++) {
    h = (h ^ gActiveNotes[i]) * 16777619u;
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
  if (!gMidiConnected) return;
  if (humanize) gateMs = (uint16_t)constrain((int)gateMs + (int)random(-12, 12), 50, 600);

  MIDI.sendNoteOn(note, vel, ch);
  queueNoteOff(note, ch, gateMs);
  triggerVisual(note, vel);
  activeAdd(note);

  uint32_t now = millis();
  uint32_t until = now + gateMs;
  if (until > gHoldUntilMs) gHoldUntilMs = until;
}

// drums also light drum-grid + extend hold window (for feel)
static inline void sendDrum(uint8_t note, uint8_t vel = 110, uint16_t gateMs = 60) {
  if (!gMidiConnected) return;

  int8_t part = drumPartFromNote(note);
  if (part >= 0) {
    // respect selection mask
    if (((uint8_t)drumSelMask & (1u << (uint8_t)part)) == 0) return;
  }

  MIDI.sendNoteOn(note, vel, DRUM_CH);
  queueNoteOff(note, DRUM_CH, gateMs);
  triggerVisual(note, vel);

  if (part >= 0) drumMarkHit((uint8_t)part, 110);

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
uint8_t currentPaletteIndex = 0;

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

static void WiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
    Serial.printf("STA_DISCONNECTED reason=%d\n", info.wifi_sta_disconnected.reason);
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
bool    avoidRepeats = true;
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
LastState LS = {255,255,255,255,255,0,255,255,255,255,255,9999.0f,255,255,255,255,2.0f,255,255,255,255,255};

static inline void sseSend(const char* event, const char* data) {
  if (!sseConnected) return;
  if (!sseClient.connected()) { sseConnected = false; return; }
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

  char buf[620];
  snprintf(buf, sizeof(buf),
    "{\"ver\":%u,"
    "\"ble\":%u,"
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

// ✅ FULL HTML (adds Drum UI section)
const char INDEX_HTML[] PROGMEM = R"HTML(
<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>BECA • Plant Synth</title>
<style>
:root{
  --bg:#010503; --card:#0a0f0b; --grid:#0f1f14; --fg:#e9ffee;
  --green:#00ff7a; --stroke:#133820;
}
*{box-sizing:border-box}
body{margin:14px;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Arial}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.brand img{height:28px;filter:drop-shadow(0 0 6px rgba(0,255,122,.35))}
.pill{padding:2px 10px;border:1px solid var(--stroke);border-radius:999px;background:#041006}
.row{display:flex;gap:12px;flex-wrap:wrap}
.card{background:var(--card);border:1px solid var(--stroke);border-radius:14px;padding:14px;flex:1;min-width:300px;box-shadow:0 8px 24px rgba(0,0,0,.25)}
.kv{display:grid;grid-template-columns:auto 1fr;gap:6px 10px}
.label{opacity:.85}
.mono{font-family:ui-monospace,Menlo,Consolas,monospace}
.ctrl{margin-top:10px;position:relative}
.hdr{display:flex;justify-content:space-between;align-items:center}
.val{font-variant-numeric:tabular-nums;font-family:ui-monospace,Menlo,Consolas}
.btn,select,input[type="range"],input[type="checkbox"]{
  width:100%;background:#050b06;color:var(--fg);border:1px solid var(--stroke);
  border-radius:10px;padding:8px
}
.btn{cursor:pointer;transition:all .15s;text-align:center}
.btn:hover{background:#022;box-shadow:0 0 14px var(--green);transform:translateY(-1px)}
input[type="range"]{height:32px;-webkit-appearance:none;appearance:none;padding:0;background:transparent}
input[type="range"]::-webkit-slider-runnable-track{
  height:6px;background:linear-gradient(90deg,#0d2617,#173824);border-radius:999px
}
input[type="range"]::-webkit-slider-thumb{
  -webkit-appearance:none;appearance:none;margin-top:-6px;
  width:18px;height:18px;border-radius:50%;background:var(--green);
  border:1px solid #1cff96;box-shadow:0 0 12px rgba(0,255,122,.65)
}
.kbd{display:flex;gap:2px;margin-top:8px;user-select:none}
.key{width:22px;height:62px;border:1px solid var(--stroke);background:#0b120d;border-radius:6px;cursor:pointer;transition:all .15s}
.key.white{background:#0a120a}
.key.black{background:#051006;height:42px;margin-left:-11px;margin-right:-11px;z-index:2;width:20px;border-color:#15351f}
.key.sel{outline:2px solid var(--green);box-shadow:0 0 16px rgba(0,255,122,.55)}

#osc{
  width:100%;height:160px;border-radius:10px;border:1px solid var(--stroke);
  background:radial-gradient(150% 120% at 50% 50%,#041107 0%,#030907 60%,#020604 100%)
}
#notegrid{
  width:100%;height:130px;margin-top:10px;border-radius:10px;border:1px solid var(--stroke);
  background:radial-gradient(150% 120% at 50% 50%,#041107 0%,#030907 60%,#020604 100%)
}
.small{font-size:12px;opacity:.9}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}

/* ---- Drum UI ---- */
#drumWrap{margin-top:12px}
#drumWrap.hidden{display:none}
.drumTitle{display:flex;justify-content:space-between;align-items:center;margin-top:8px}
.drumGrid{
  display:grid;
  grid-template-columns:repeat(8, 1fr);
  gap:10px;
  margin-top:10px;
  align-items:center;
}
.dSel{
  display:flex;justify-content:center;align-items:center;
}
.dSel input{
  width:18px;height:18px;accent-color:var(--green);
}
.dBox{
  height:56px;border-radius:14px;
  border:2px solid rgba(233,255,238,.55);
  background:rgba(0,0,0,.18);
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.25);
  transition:all .08s;
}
.dBox.hit{
  border-color: rgba(0,255,122,.95);
  box-shadow:0 0 18px rgba(0,255,122,.55), inset 0 0 0 1px rgba(0,255,122,.35);
  background:rgba(0,255,122,.14);
}
.dLab{
  text-align:center;
  font-size:12px;
  opacity:.9;
  margin-top:-4px;
  font-family:ui-monospace, Menlo, Consolas, monospace;
}
</style>
</head><body>
<div class="brand">
  <img src="/logo" alt="BECA"/>
  <div class="mono"><span style="color:var(--green);font-weight:800;letter-spacing:.06em">BECA</span> • Plant Synth</div>
  <div class="small">by Fatty Recording Co.</div>
  <div id="status" class="pill mono" style="margin-left:auto">connecting…</div>
</div>

<div class="row">
  <div class="card">
    <div class="hdr">
      <div class="label">Oscilloscope (plant energy)</div>
      <div class="small mono">SSE stream</div>
    </div>
    <canvas id="osc" width="900" height="160"></canvas>

    <div class="hdr" style="margin-top:10px">
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
      <div class="drumGrid" id="drumHitRow" style="margin-top:8px"></div>
      <!-- labels -->
      <div class="drumGrid" id="drumNameRow" style="margin-top:6px"></div>
    </div>
  </div>

  <div class="card">
    <div class="kv mono">
      <div class="label">BLE:</div><div id="ble">—</div>
      <div class="label">Clock:</div><div id="clock">—</div>
      <div class="label">Mode:</div><div id="modeLab">—</div>
      <div class="label">Scale:</div><div id="scaleLab">—</div>
      <div class="label">Root:</div><div id="rootLab">—</div>
      <div class="label">BPM:</div><div id="bpmLab">—</div>
      <div class="label">Swing:</div><div id="swingLab">—</div>
      <div class="label">Brightness:</div><div id="brightLab">—</div>
      <div class="label">Sensitivity:</div><div id="sensLab">—</div>
      <div class="label">Effect:</div><div id="fxLab">—</div>
      <div class="label">Palette:</div><div id="palLab">—</div>
      <div class="label">Oct Range:</div><div id="octLab">—</div>
      <div class="label">Time Sig:</div><div id="tsLab">—</div>
      <div class="label">Last:</div><div id="lastLab">—</div>
      <div class="label">Vel:</div><div id="velLab">—</div>
    </div>
  </div>
</div>

<div class="row" style="margin-top:10px">
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

    <div class="label" style="margin-top:10px">Scale</div>
    <select id="scale">
      <option value="0">Major</option><option value="1">Minor</option>
      <option value="2">Dorian</option><option value="3">Lydian</option>
      <option value="4">Mixolydian</option><option value="5">Pent Minor</option>
      <option value="6">Pent Major</option><option value="7">Harm Minor</option>
      <option value="8">Phrygian</option><option value="9">Whole Tone</option>
      <option value="10">Maj7</option><option value="11">Min7</option>
      <option value="12">Dom7</option><option value="13">Sus2</option>
      <option value="14">Sus4</option>
    </select>

    <div class="label" style="margin-top:10px">Root (piano)</div>
    <div id="piano" class="kbd"></div>
  </div>

  <div class="card">
    <div class="ctrl">
      <div class="hdr"><div class="label">BPM</div><div class="val mono" id="bpmVal">—</div></div>
      <input id="bpmRange" type="range" min="20" max="240" step="5"/>
    </div>
    <div class="ctrl">
      <div class="hdr"><div class="label">Swing %</div><div class="val mono" id="swingVal">—</div></div>
      <input id="swingRange" type="range" min="0" max="60" step="1"/>
    </div>
    <div class="ctrl">
      <div class="hdr"><div class="label">Brightness</div><div class="val mono" id="brightVal">—</div></div>
      <input id="brightRange" type="range" min="10" max="255" step="1"/>
    </div>
    <div class="ctrl">
      <div class="hdr"><div class="label">Sensitivity</div><div class="val mono" id="sensVal">—</div></div>
      <input id="sensRange" type="range" min="0.00" max="0.50" step="0.05"/>
    </div>
    <div class="grid2">
      <div class="ctrl">
        <div class="hdr"><div class="label">Low Oct</div><div class="val mono" id="loVal">—</div></div>
        <input id="loct" type="range" min="0" max="9" step="1"/>
      </div>
      <div class="ctrl">
        <div class="hdr"><div class="label">High Oct</div><div class="val mono" id="hiVal">—</div></div>
        <input id="hoct" type="range" min="0" max="9" step="1"/>
      </div>
    </div>
    <div class="ctrl">
      <div class="hdr"><div class="label">Time Signature</div><div class="val mono" id="tsVal">—</div></div>
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
      <div class="hdr"><div class="label">Effect</div><div class="val mono" id="fxVal">—</div></div>
      <select id="effect"></select>
    </div>
    <div class="ctrl">
      <div class="hdr"><div class="label">Palette</div><div class="val mono" id="palVal">—</div></div>
      <select id="palette"></select>
    </div>
    <div class="ctrl">
      <div class="hdr"><div class="label">Visual Speed</div><div class="val mono" id="vsVal">—</div></div>
      <input id="visSpd" type="range" min="0" max="255" step="1"/>
    </div>
    <div class="ctrl">
      <div class="hdr"><div class="label">Visual Intensity</div><div class="val mono" id="viVal">—</div></div>
      <input id="visInt" type="range" min="0" max="255" step="1"/>
    </div>
    <div class="ctrl">
      <div class="hdr"><div class="label">Rest %</div><div class="val mono" id="restVal">—</div></div>
      <input id="rest" type="range" min="0" max="80" step="1"/>
    </div>
    <div class="ctrl">
      <div class="hdr"><div class="label">Avoid repeats</div><div class="val mono" id="nrVal">—</div></div>
      <input id="norep" type="checkbox"/>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button id="rnd" class="btn">Randomize</button>
    </div>
  </div>
</div>

<script>
const $ = (id)=>document.getElementById(id);

const status   = $('status');
const ble      = $('ble');
const clock    = $('clock');
const modeLab  = $('modeLab');
const scaleLab = $('scaleLab');
const rootLab  = $('rootLab');
const bpmLab   = $('bpmLab');
const swingLab = $('swingLab');
const brightLab= $('brightLab');
const sensLab  = $('sensLab');
const fxLab    = $('fxLab');
const palLab   = $('palLab');
const octLab   = $('octLab');
const tsLab    = $('tsLab');
const lastLab  = $('lastLab');
const velLab   = $('velLab');

const mode     = $('mode');
const clockSel = $('clockSel');
const scale    = $('scale');
const tsSel    = $('tsSel');

const bpmRange    = $('bpmRange');
const swingRange  = $('swingRange');
const brightRange = $('brightRange');
const sensRange   = $('sensRange');
const loct        = $('loct');
const hoct        = $('hoct');

const effect   = $('effect');
const palette  = $('palette');

const visSpd   = $('visSpd');
const visInt   = $('visInt');
const rest     = $('rest');
const norep    = $('norep');
const rnd      = $('rnd');

const bpmVal   = $('bpmVal');
const swingVal = $('swingVal');
const brightVal= $('brightVal');
const sensVal  = $('sensVal');
const loVal    = $('loVal');
const hiVal    = $('hiVal');
const fxVal    = $('fxVal');
const palVal   = $('palVal');
const vsVal    = $('vsVal');
const viVal    = $('viVal');
const restVal  = $('restVal');
const nrVal    = $('nrVal');
const tsVal    = $('tsVal');

const osc  = $('osc');
const ctx  = osc.getContext('2d');
const N    = 220;

let plantA = new Array(N).fill(0);

function grid(){
  const w = osc.width, h = osc.height;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle = "#041107";
  ctx.fillRect(0,0,w,h);
  ctx.strokeStyle = "#0e2116";
  ctx.lineWidth = 1;
  for(let i=0;i<=8;i++){
    const y=i*(h/8);
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
  }
  for(let j=0;j<=12;j++){
    const x=j*(w/12);
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke();
  }
}
function line(arr,col,maxv){
  const w=osc.width,h=osc.height;
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for(let i=0;i<arr.length;i++){
    const X=i*(w/(N-1));
    const Y=h - Math.min(arr[i]/maxv,1)*h;
    if(!i) ctx.moveTo(X,Y); else ctx.lineTo(X,Y);
  }
  ctx.stroke();
}
function setVal(el,v){ el.textContent = v; }

const debouncers = {};
function sendNow(url){ fetch(url,{cache:'no-store'}).catch(()=>{}); }
function debouncedSend(key,url,delay=90){
  if (debouncers[key]) clearTimeout(debouncers[key]);
  debouncers[key] = setTimeout(()=>sendNow(url),delay);
}

const MODE_NAMES  = ["Notes","Arpeggiator","Chords","Drum Machine"];
const SCALE_NAMES = ["Major","Minor","Dorian","Lydian","Mixolydian","Pent Minor","Pent Major","Harm Minor","Phrygian","Whole Tone","Maj7","Min7","Dom7","Sus2","Sus4"];
const NOTE_NAMES  = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

function updatePianoSel(semi){
  const piano = $('piano');
  [...piano.children].forEach((k,i)=>k.classList.toggle('sel', i===semi));
}

// ---- MIDI NOTE GRID ----
const gridLab = $('gridLab');
const noteGrid = $('notegrid');
const ng = noteGrid.getContext('2d');

const GRID_COLS = 12;
const GRID_ROWS = 8;

function noteName(m){
  const semi = ((m%12)+12)%12;
  const oct = Math.floor(m/12)-1;
  return NOTE_NAMES[semi]+oct;
}

function drawNoteGridMulti(midiList, vel, held){
  const w = noteGrid.width, h = noteGrid.height;
  ng.clearRect(0,0,w,h);

  ng.fillStyle = "#041107";
  ng.fillRect(0,0,w,h);

  const pad = 10;
  const gx = pad, gy = pad;
  const gw = w - pad*2, gh = h - pad*2;

  const cellW = gw / GRID_COLS;
  const cellH = gh / GRID_ROWS;

  ng.strokeStyle = "#0e2116";
  ng.lineWidth = 1;
  for(let r=0;r<=GRID_ROWS;r++){
    const y = gy + r*cellH;
    ng.beginPath(); ng.moveTo(gx,y); ng.lineTo(gx+gw,y); ng.stroke();
  }
  for(let c=0;c<=GRID_COLS;c++){
    const x = gx + c*cellW;
    ng.beginPath(); ng.moveTo(x,gy); ng.lineTo(x,gy+gh); ng.stroke();
  }

  ng.fillStyle = "rgba(233,255,238,.7)";
  ng.font = "12px ui-monospace, Menlo, Consolas, monospace";
  for(let c=0;c<12;c++){
    ng.fillText(NOTE_NAMES[c], gx + c*cellW + 6, gy - 2);
  }

  const a = held ? 1.0 : 0.6;
  const v = Math.max(0, Math.min(127, vel|0)) / 127;

  midiList.forEach(midi=>{
    let m = Math.max(12, Math.min(119, midi|0));
    let idx = m - 12;
    let semi = idx % 12;
    let oct  = Math.floor(idx / 12);
    if (oct > 7) oct = 7;

    const x = gx + semi*cellW;
    const y = gy + (GRID_ROWS-1-oct)*cellH;

    ng.fillStyle = `rgba(0,255,122,${0.14*a + 0.45*a*v})`;
    ng.fillRect(x+1, y+1, cellW-2, cellH-2);

    ng.strokeStyle = `rgba(0,255,122,${0.60*a})`;
    ng.lineWidth = 2;
    ng.strokeRect(x+2, y+2, cellW-4, cellH-4);
  });

  if (!midiList.length) {
    gridLab.textContent = "—";
  } else {
    const names = midiList.slice(0,6).map(noteName).join(' ');
    gridLab.textContent = `${held ? "HOLD" : "hit"} • ${names}${midiList.length>6 ? " …" : ""} • vel ${vel|0}`;
  }
}

// ---- DRUM UI ----
const drumWrap = $('drumWrap');
const drumLab  = $('drumLab');
const drumSelRow = $('drumSelRow');
const drumHitRow = $('drumHitRow');
const drumNameRow= $('drumNameRow');

const DRUM_NAMES = ["kick","snare","closed\nhihat","open\nhihat","tom1","tom2","ride","crash"];
let drumSelMask = 0xFF;

const drumSelChecks = [];
const drumHitBoxes  = [];

function buildDrumUI(){
  drumSelRow.innerHTML = '';
  drumHitRow.innerHTML = '';
  drumNameRow.innerHTML = '';

  for(let i=0;i<8;i++){
    // selector
    const s = document.createElement('div');
    s.className = 'dSel';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.onchange = ()=>{
      drumSelMask = 0;
      for(let k=0;k<8;k++){
        if (drumSelChecks[k].checked) drumSelMask |= (1<<k);
      }
      debouncedSend('drumsel','/drumsel?mask='+drumSelMask,30);
      drumLab.textContent = 'enabled: ' + drumSelMask;
    };
    s.appendChild(cb);
    drumSelRow.appendChild(s);
    drumSelChecks.push(cb);

    // hit box
    const b = document.createElement('div');
    b.className = 'dBox';
    drumHitRow.appendChild(b);
    drumHitBoxes.push(b);

    // label
    const l = document.createElement('div');
    l.className = 'dLab';
    l.textContent = DRUM_NAMES[i];
    drumNameRow.appendChild(l);
  }
}

function applyDrumSelMask(mask){
  drumSelMask = mask & 255;
  for(let i=0;i<8;i++){
    drumSelChecks[i].checked = !!(drumSelMask & (1<<i));
  }
  drumLab.textContent = 'enabled: ' + drumSelMask;
}

function applyDrumHitMask(hitMask){
  for(let i=0;i<8;i++){
    drumHitBoxes[i].classList.toggle('hit', !!(hitMask & (1<<i)));
  }
}

// ---- Boot UI ----
(async ()=>{
  try{
    const E = await (await fetch('/effects',{cache:'force-cache'})).json();
    const P = await (await fetch('/palettes',{cache:'force-cache'})).json();

    (E.list||[]).forEach((name,idx)=>{
      const o=document.createElement('option');
      o.value=idx; o.textContent=name;
      effect.appendChild(o);
    });
    (P.list||[]).forEach((name,idx)=>{
      const o=document.createElement('option');
      o.value=idx; o.textContent=name;
      palette.appendChild(o);
    });

    const piano = $('piano');
    for(let i=0;i<12;i++){
      const isBlack = NOTE_NAMES[i].includes('#');
      const div=document.createElement('div');
      div.className='key '+(isBlack?'black':'white');
      div.title=NOTE_NAMES[i];
      div.onclick=()=>{
        sendNow('/root?semi='+i);
        updatePianoSel(i);
      };
      piano.appendChild(div);
    }

    buildDrumUI();

    grid();
    drawNoteGridMulti([], 96, false);
  }catch(e){
    status.textContent = 'ui error';
  }
})();

// SSE stream
const es = new EventSource('/events');

es.addEventListener('hello', ()=>{
  status.textContent = 'ok';
});

es.onerror = ()=>{
  status.textContent = 'reconnecting…';
};

es.addEventListener('state', e=>{
  const j = JSON.parse(e.data);
  status.textContent = 'ok';

  ble.textContent       = j.ble ? "connected" : "—";
  clock.textContent     = j.clock ? "Plant" : "Internal";
  modeLab.textContent   = MODE_NAMES[j.mode] || "—";
  scaleLab.textContent  = SCALE_NAMES[j.scale] || "—";
  rootLab.textContent   = NOTE_NAMES[j.root] || "—";
  bpmLab.textContent    = j.bpm;
  swingLab.textContent  = j.swing + "%";
  brightLab.textContent = j.bright;
  sensLab.textContent   = (+j.sens).toFixed(2);
  fxLab.textContent     = j.fxname || "—";
  palLab.textContent    = j.palname || "—";
  octLab.textContent    = "C"+j.lo+" .. C"+j.hi;
  tsLab.textContent     = j.ts;
  lastLab.textContent   = j.last;
  velLab.textContent    = j.vel;

  bpmRange.value    = j.bpm;
  swingRange.value  = j.swing;
  brightRange.value = j.bright;
  sensRange.value   = j.sens;
  loct.value        = j.lo;
  hoct.value        = j.hi;

  mode.value     = j.mode;
  clockSel.value = j.clock;
  scale.value    = j.scale;
  tsSel.value    = j.ts.replace('/','-');

  effect.value   = j.fx;
  palette.value  = j.pal;

  visSpd.value   = j.vs;
  visInt.value   = j.vi;

  rest.value     = Math.round(j.rest * 100);
  norep.checked  = !!j.nr;

  setVal(bpmVal,   j.bpm);
  setVal(swingVal, j.swing+"%");
  setVal(brightVal,j.bright);
  setVal(sensVal,  (+j.sens).toFixed(2));
  setVal(loVal,    "C"+j.lo);
  setVal(hiVal,    "C"+j.hi);
  setVal(fxVal,    fxLab.textContent);
  setVal(palVal,   palLab.textContent);
  setVal(vsVal,    j.vs);
  setVal(viVal,    j.vi);
  setVal(restVal,  Math.round(j.rest*100)+"%");
  setVal(nrVal,    j.nr ? "ON" : "OFF");
  setVal(tsVal,    j.ts);

  updatePianoSel(j.root|0);

  // show/hide drum UI based on mode
  const isDrum = (j.mode|0) === 3;
  drumWrap.classList.toggle('hidden', !isDrum);

  // apply drum selection state from device
  if (typeof j.drumsel !== 'undefined') applyDrumSelMask(j.drumsel|0);

  // reflect last note in grid on state updates
  const lastMidi = parseInt(j.last,10);
  if (!Number.isNaN(lastMidi)) drawNoteGridMulti([lastMidi], j.vel|0, false);
});

// scope now expects 1 value only: plant
es.addEventListener('scope', e=>{
  const plant = Number(e.data);
  plantA.push(plant); plantA.shift();
  grid();
  line(plantA,"#00ff7a",1.0);
});

// note grid event: held|vel|n|m1,m2,m3...
es.addEventListener('note', e=>{
  const [heldS, velS, nS, listS] = e.data.split('|');
  const held = (Number(heldS) === 1);
  const vel  = Number(velS)||96;
  const list = (listS && listS.length)
    ? listS.split(',').map(x=>Number(x)).filter(x=>!Number.isNaN(x))
    : [];
  drawNoteGridMulti(list, vel, held);
});

// drum event: hitMask|selMask
es.addEventListener('drum', e=>{
  const [hitS, selS] = e.data.split('|');
  const hit = (Number(hitS)||0) & 255;
  const sel = (Number(selS)||0) & 255;
  applyDrumSelMask(sel);
  applyDrumHitMask(hit);
});

// Controls
bpmRange.oninput   = e=>{ const v=e.target.value; setVal(bpmVal,v); debouncedSend('bpm','/bpm?v='+v,60); };
swingRange.oninput = e=>{ const v=e.target.value; setVal(swingVal,v+"%"); debouncedSend('swing','/swing?v='+v,60); };
brightRange.oninput= e=>{ const v=e.target.value; setVal(brightVal,v); debouncedSend('bright','/b?v='+v,60); };
sensRange.oninput  = e=>{ const v=e.target.value; setVal(sensVal,(+v).toFixed(2)); debouncedSend('sens','/s?v='+v,60); };
loct.oninput       = e=>{ const v=e.target.value; setVal(loVal,"C"+v); debouncedSend('lo','/lo?v='+v,60); };
hoct.oninput       = e=>{ const v=e.target.value; setVal(hiVal,"C"+v); debouncedSend('hi','/hi?v='+v,60); };

mode.onchange      = e=> debouncedSend('mode','/mode?i='+e.target.value,30);
clockSel.onchange  = e=> debouncedSend('clock','/clock?v='+e.target.value,30);
scale.onchange     = e=> debouncedSend('scale','/scale?i='+e.target.value,30);

effect.onchange = e=>{
  const idx = e.target.value;
  const name = e.target.options[e.target.selectedIndex].text;
  setVal(fxVal,name);
  debouncedSend('fx','/fxset?i='+idx,30);
};
palette.onchange = e=>{
  const idx = e.target.value;
  const name = e.target.options[e.target.selectedIndex].text;
  setVal(palVal,name);
  debouncedSend('pal','/pal?i='+idx,30);
};

visSpd.oninput = e=>{ const v=e.target.value; setVal(vsVal,v); debouncedSend('vs','/visspd?v='+v,60); };
visInt.oninput = e=>{ const v=e.target.value; setVal(viVal,v); debouncedSend('vi','/visint?v='+v,60); };
rest.oninput   = e=>{ const v=e.target.value; setVal(restVal,v+"%"); debouncedSend('rest','/rest?v='+(v/100),60); };
norep.onchange = e=>{ const v=e.target.checked?1:0; setVal(nrVal,v?"ON":"OFF"); debouncedSend('nr','/norep?v='+v,30); };

tsSel.onchange = e=>{
  const v = e.target.value;
  setVal(tsVal, v.replace('-','/'));
  debouncedSend('ts','/ts?v='+v,30);
};

rnd.onclick = ()=>sendNow('/rand');
</script>
</body></html>
)HTML";

static inline void handleLogo() {
  server.sendHeader("Content-Encoding", "gzip");
  server.sendHeader("Cache-Control", "public, max-age=31536000, immutable");
  server.send_P(200, "image/svg+xml", (const char*)LOGO_SVG_GZ, LOGO_SVG_GZ_LEN);
}

static inline void handlePage() {
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

static inline void setMode()   { if (server.hasArg("i")) gMode = (Mode)constrain(server.arg("i").toInt(), 0, 3); pushStateIfChanged(true); server.send(200,"text/plain","OK"); }
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
  gMode  = (Mode)random(0, 4);
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

static inline String shortChipId() {
  uint8_t mac[6]; WiFi.macAddress(mac);
  char id[8];
  snprintf(id, sizeof(id), "%02X%02X", mac[4], mac[5]);
  return String(id);
}

static inline void startMDNS() {
  if (gDeviceName.length() == 0) gDeviceName = "beca-" + shortChipId();
  if (MDNS.begin(gDeviceName.c_str())) {
    MDNS.addService("http", "tcp", 80);
  }
}

const char SETUP_HTML[] PROGMEM = R"HTML(
<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BECA • Setup</title>
<style>
body{font:14px system-ui;background:#010503;color:#e9ffee;margin:24px}
.card{max-width:560px;margin:auto;background:#0a0f0b;border:1px solid #133820;border-radius:14px;padding:16px}
h1{margin:0 0 8px}label{display:block;margin:10px 0 6px}
input,select,button{width:100%;padding:10px;border:1px solid #133820;border-radius:10px;background:#050b06;color:#e9ffee}
button{cursor:pointer}
.small{opacity:.8}
</style>
<div class="card">
  <h1>BECA Wi-Fi Setup</h1>
  <div class="small">Pick your home Wi-Fi (saved on device).</div>
  <label>Device name (for .local)</label>
  <input id="name" placeholder="beca-xxxx">
  <label>Wi-Fi SSID</label>
  <select id="ssid"><option>Scanning…</option></select>
  <label>Password</label>
  <input id="pass" type="password" placeholder="••••••••">
  <button onclick="save()">Save & Connect</button>
  <p class="small">If it fails you’ll come back here.</p>
  <hr>
  <button onclick="forget()">Forget Wi-Fi</button>
</div>
<script>
async function load(){
  try{
    const s = await (await fetch('/wifi/scan')).json();
    const info = await (await fetch('/api/info')).json();
    const sel = document.getElementById('ssid'); sel.innerHTML='';
    (s.list||[]).forEach(n=>{ const o=document.createElement('option'); o.textContent=n; sel.appendChild(o); });
    if(info.name) document.getElementById('name').value = info.name;
    if(info.ssid){ [...sel.options].forEach(o=>{ if(o.textContent===info.ssid) o.selected=true; }); }
  }catch(e){}
}
async function save(){
  const body = new URLSearchParams();
  body.set('name', document.getElementById('name').value);
  body.set('ssid', document.getElementById('ssid').value);
  body.set('pass', document.getElementById('pass').value);
  await fetch('/wifi/save',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  setTimeout(()=>location.href='/',1500);
}
async function forget(){
  await fetch('/wifi/forget');
  alert('Forgotten. Rebooting to AP…');
  setTimeout(()=>location.reload(),1200);
}
load();
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
  json += "\"mode\":\"";   json += (gIsSta ? "sta" : "ap"); json += "\",";
  json += "\"ip\":\"";     json += (gIsSta ? WiFi.localIP().toString() : gApIP.toString()); json += "\",";
  json += "\"name\":\"";   json += gDeviceName; json += "\",";
  json += "\"ssid\":\"";   json += gStaSsid;    json += "\"";
  json += "}";
  server.send(200, "application/json", json);
}

static inline void handleWifiSave() {
  if (server.hasArg("name")) gDeviceName = server.arg("name");
  if (server.hasArg("ssid")) gStaSsid    = server.arg("ssid");
  if (server.hasArg("pass")) gStaPass    = server.arg("pass");
  prefs.begin("beca", false);
  prefs.putString("name", gDeviceName);
  prefs.putString("ssid", gStaSsid);
  prefs.putString("pass", gStaPass);
  prefs.end();
  server.send(200, "text/plain", "OK");
  delay(80);
  ESP.restart();
}

static inline void handleWifiForget() {
  prefs.begin("beca", false);
  prefs.remove("ssid");
  prefs.remove("pass");
  prefs.end();
  server.send(200, "text/plain", "OK");
  delay(80);
  ESP.restart();
}

static inline void handleReboot() {
  server.send(200, "text/plain", "Rebooting…");
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
  WiFi.disconnect(true, true);
  gIsSta = false;
  return false;
}

static inline void startAPPortal() {
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
  Serial.begin(115200);
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
  prefs.end();
  if (gDeviceName.length() == 0) gDeviceName = "beca-" + shortChipId();

  bool staOK = false;
  if (gStaSsid.length()) staOK = tryConnectSTA(gStaSsid, gStaPass);
  if (!staOK) startAPPortal();

  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);

  // Coexistence-safe
  WiFi.setSleep(true);

  // Routes
  server.on("/",         handlePage);
  server.on("/logo",     handleLogo);
  server.on("/effects",  handleEffects);
  server.on("/palettes", handlePalettes);
  server.on("/events",   handleEvents);

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
  server.on("/ts",      setTS);
  server.on("/rand",    randomize);

  // NEW
  server.on("/drumsel", setDrumSel);

  server.on("/setup",       handleSetupPage);
  server.on("/wifi/scan",   handleWifiScan);
  server.on("/wifi/save",   HTTP_POST, handleWifiSave);
  server.on("/wifi/forget", handleWifiForget);
  server.on("/api/info",    handleApiInfo);
  server.on("/reboot",      handleReboot);

  server.onNotFound([](){
    String uri = server.uri();
    if (uri == "/generate_204" || uri == "/gen_204" || uri == "/favicon.ico") {
      server.sendHeader("Location", "/setup", true);
      server.send(302, "text/plain", "");
    } else {
      server.sendHeader("Location", "/", true);
      server.send(302, "text/plain", "");
    }
  });

  server.begin();
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
  startMDNS();

  for (auto &q : offQ) q.on = false;

  recalcTransport(true);
  pushStateIfChanged(true);
}

// -------------------- loop() --------------------
void loop() {
  uint32_t now = millis();

  if (!gIsSta) dns.processNextRequest();
  server.handleClient();
  applyEncoder();

  // keep WDT + WiFi/BLE happy
  delay(0);
  warmupPlantBackground();

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
  if (!gMidiConnected && (millis() - gLastBleKickMs) > BLE_KICK_INTERVAL_MS) {
    gLastBleKickMs = millis();
    bleKickAdvertising();
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

        const uint8_t held = ((int32_t)(millis() - gHoldUntilMs) < 0) ? 1 : 0;
        const uint8_t vel  = (uint8_t)lastVel;

        uint32_t h = hashActiveNotes(held, vel);
        if (h != lastNoteHash) {
          lastNoteHash = h;

          char buf[256];
          int n = 0;
          n += snprintf(buf + n, sizeof(buf) - n, "%u|%u|%u|",
                        (unsigned)held,
                        (unsigned)vel,
                        (unsigned)gActiveCount);

          for (uint8_t i = 0; i < gActiveCount; i++) {
            n += snprintf(buf + n, sizeof(buf) - n, "%u%s",
                          (unsigned)gActiveNotes[i],
                          (i + 1 < gActiveCount) ? "," : "");
            if (n >= (int)sizeof(buf) - 8) break;
          }
          sseSend("note", buf);
        }
      }

      // Drum UI stream (diff-based): hitMask|selMask
      if ((int32_t)(now - lastSseDrumMs) >= (int32_t)SSE_DRUM_MS) {
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
        sseClient.print(": ping\n\n");
      }
    }
  }

  serviceNoteOffs();
  MIDI.read();
}