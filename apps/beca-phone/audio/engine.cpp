#include "synth_engine.h"
#include <emscripten/emscripten.h>
#include <new>
#include <math.h>

uint32_t becaWebMillis = 0;
static beca::SynthEngine engine;
static uint64_t renderedFrames = 0;
static uint32_t rate = 44100;
static int playMode = 0;

// Order matches PARAM_KEYS in audio-engine.js.
#define PARAMS(X) \
 X(0, preset) X(1, waveA) X(2, waveB) X(3, oscMix) X(4, mono) \
 X(5, maxVoices) X(6, attack) X(7, decay) X(8, sustain) X(9, release) \
 X(10, filterType) X(11, cutoffHz) X(12, resonance) X(13, reverb) \
 X(14, delayMs) X(15, delayFeedback) X(16, delayMix) X(17, distDrive) \
 X(18, master) X(19, detuneCents) X(20, gainTrim) X(21, drumKit)

extern "C" {
EMSCRIPTEN_KEEPALIVE void init(int sampleRate) {
  engine.~SynthEngine();
  new (&engine) beca::SynthEngine();
  rate = sampleRate == 48000 ? 48000 : 44100;
  renderedFrames = 0;
  becaWebMillis = 0;
  engine.start(0, 0, 0, rate, 128);
  playMode = 0;
  engine.setDrumsEnabled(false);
}
EMSCRIPTEN_KEEPALIVE void mode(int value) {
  value = constrain(value, 0, 3);
  if (value != playMode) { engine.allNotesOff(); engine.allDrumsOff(); }
  playMode = value;
  engine.setDrumsEnabled(playMode == 3);
}
EMSCRIPTEN_KEEPALIVE const int16_t* render(int frames) {
  frames = constrain(frames, 1, 128);
  becaWebMillis = static_cast<uint32_t>(renderedFrames * 1000 / rate);
  const int16_t* samples = engine.renderWeb(frames);
  renderedFrames += frames;
  return samples;
}
EMSCRIPTEN_KEEPALIVE void preset(int index) { engine.loadPreset(constrain(index, 0, 12)); }
EMSCRIPTEN_KEEPALIVE const char* preset_name(int index) { return beca::SynthEngine::presetName(index); }
EMSCRIPTEN_KEEPALIVE float get_param(int key) {
  beca::SynthParams p;
  engine.getParams(p);
  switch (key) {
#define GET(index, field) case index: return p.field;
    PARAMS(GET)
#undef GET
    default: return 0;
  }
}
EMSCRIPTEN_KEEPALIVE void set_param(int key, float value) {
  if (!isfinite(value)) return;
  beca::SynthParams p;
  engine.getParams(p);
  switch (key) {
#define SET(index, field) case index: p.field = static_cast<decltype(p.field)>(value); break;
    PARAMS(SET)
#undef SET
    default: return;
  }
  engine.setParams(p);
}
EMSCRIPTEN_KEEPALIVE void midi(int status, int note, int velocity) {
  const int command = status & 0xf0;
  note = constrain(note, 0, 127);
  velocity = constrain(velocity, 0, 127);
  if (command == 0xb0 && (note == 120 || note == 123)) {
    engine.allNotesOff(); engine.allDrumsOff();
  } else if ((status & 15) == 9) {
    if (playMode != 3) return;
    const int notes[] = {36, 38, 42, 46, 45, 47, 51, 49};
    if (command == 0x90 && velocity) {
      for (int part = 0; part < 8; ++part) if (notes[part] == note) engine.drumHit(part, velocity);
    }
  } else if (command == 0x90 && velocity && playMode != 3) engine.noteOn(note, velocity);
  else if (command == 0x80 || (command == 0x90 && !velocity)) engine.noteOff(note);
}
EMSCRIPTEN_KEEPALIVE void sensor(int raw, int connected) {
  engine.setSensorFrequency(constrain(raw, 0, 4095), connected != 0);
}
}
