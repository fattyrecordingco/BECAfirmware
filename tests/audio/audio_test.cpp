#include <Arduino.h>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#define private public
#include "synth_engine.h"
#include "../../synth_engine.cpp"
#undef private
#include "timing_utils.h"
#include <limits>
#include "output_modes.h"
static_assert(outputHasSerial(OUTPUT_SERIAL) && !outputHasAux(OUTPUT_SERIAL), "Serial routing");
static_assert(outputHasAux(OUTPUT_AUX) && !outputHasSerial(OUTPUT_AUX), "Aux routing");
static_assert(!outputHasAux(OUTPUT_BLE) && !outputHasSerial(OUTPUT_BLE), "BLE routing");
static_assert(outputHasAux(OUTPUT_SERIAL_AUX) == bool(BECA_DUAL_OUTPUT), "Combined Aux capability");
static_assert(outputHasSerial(OUTPUT_SERIAL_AUX) == bool(BECA_DUAL_OUTPUT), "Combined MIDI capability");

static void check(bool ok, const char* message) {
  if (!ok) { std::fprintf(stderr, "FAIL: %s\n", message); std::exit(1); }
}

int main() {
  for (uint32_t base : {10u, 31u, 125u, 500u, 1000u}) {
    for (uint8_t swing = 0; swing <= 60; ++swing) {
      check(beca::swungStepMs(base, swing, true) + beca::swungStepMs(base, swing, false) == 2 * base,
            "swing pairs must preserve tempo");
    }
  }
  check(std::isfinite(beca::dsp::clampf(std::numeric_limits<float>::quiet_NaN(), 0, 1)), "NaN must not reach audio DSP");
  for (uint8_t kit = 0; kit < 3; ++kit) {
    beca::DrumEngine drums;
    drums.init(44100); drums.setKit(kit);
    for (uint8_t part = 0; part < 8; ++part) {
      drums.trigger(part, 100);
      float l = 0, r = 0;
      for (int i = 0; i < 44100 * 5; ++i) drums.render(l, r);
      check(!drums.voices_[part].active && l == 0 && r == 0, "every drum hit must finish decay");
    }
  }
  static beca::SynthEngine synth;
  beca::SynthParams p, q;
  synth.setDrumsEnabled(false);
  synth.blockSize_ = 128;
  synth.fadeValue_ = synth.fadeTarget_ = 1.0f;

  beca::SynthEngine::presetDefaults(0, p);
  p.master = 0.7f; p.distDrive = 0.9f;
  for (int i = 0; i < 100; ++i) { synth.setParams(p); synth.getParams(p); }
  check(std::fabs(p.master - 0.7f) < 1e-6f, "high-drive edits must not compound master attenuation");

  for (float level : {0.0f, 0.17f, 1.0f}) {
    for (uint8_t preset = 0; preset < beca::SynthEngine::kPresetCount; ++preset) {
      p.master = level; synth.setParams(p);
      synth.loadPreset(preset, true); synth.getParams(q);
      check(q.preset == preset && q.master == level, "live preset must preserve master in the parameter snapshot");
    }
  }
  synth.loadPreset(0); synth.getParams(q);
  beca::SynthEngine::presetDefaults(0, p);
  check(q.master == p.master, "legacy preset loading retains its default gain");

  p.mono = 0; p.maxVoices = 8; p.attack = 0.001f; p.decay = 0.001f; p.sustain = 0.7f;
  for (int n = 60; n < 68; ++n) synth.handleEvent({1, static_cast<uint8_t>(n), 100}, p);
  for (int i = 0; i < 12; ++i) synth.renderBlock(p);
  p.sustain = 0.2f;
  synth.renderBlock(p);
  check(std::fabs(synth.voices_[0].env.process() - 0.2f) < 1e-5f, "sustain edits must reach held voices");
  p.maxVoices = 2;
  synth.renderBlock(p);
  int active = 0;
  for (auto& v : synth.voices_) active += v.active;
  check(active == 2, "lowering polyphony must retire excess voices");
  p.maxVoices = 8;
  synth.renderBlock(p);
  active = 0;
  for (auto& v : synth.voices_) active += v.active;
  check(active == 2, "raising polyphony must not resurrect frozen voices");
  p.maxVoices = 2;
  synth.handleEvent({1, 72, 100}, p);
  synth.renderBlock(p);
  check((synth.voices_[0].active && synth.voices_[0].note == 72) ||
        (synth.voices_[1].active && synth.voices_[1].note == 72),
        "new notes must steal within the selected voice limit");
  p.mono = 1;
  synth.renderBlock(p);
  active = 0;
  for (auto& v : synth.voices_) active += v.active;
  check(active == 1, "mono edits must retire held polyphonic voices immediately");

#if BECA_EXTENDED_SOUNDS
  beca::SynthEngine::presetDefaults(beca::SynthEngine::kRawSinePreset, p);
  synth.setSensorFrequency(440, true);
  for (int i = 0; i < 10; ++i) synth.renderBlock(p);
  check(synth.sensorHz_ == 440.0f, "raw 440 must map to 440 Hz");
  // Match the actual PCM against a sine reference, including after a pitch jump.
  for (uint16_t hz : {uint16_t(440), uint16_t(1234), uint16_t(4095)}) {
    synth.setSensorFrequency(hz, true);
    double phase = synth.sensorPhase_;
    synth.renderBlock(p);
    for (int i = 0; i < 128; ++i) {
      phase += double(hz) / 44100.0;
      if (phase >= 1) phase -= 1;
      const double expected = std::sin(2 * 3.141592653589793 * phase) * p.master * 0.25 * 32767;
      check(std::fabs(synth.i2sBlock_[2*i] - expected) < 1.5, "PCM must follow a phase-continuous pure sine at raw Hz");
      check(synth.i2sBlock_[2*i] == synth.i2sBlock_[2*i+1], "raw stereo channels must match");
    }
  }
  p.distDrive = 1; p.delayMix = 1; p.reverb = 1; p.cutoffHz = 20; p.detuneCents = 8;
  synth.renderBlock(p);
  check(std::fabs(synth.sensorGain_ - p.master * 0.25f) < 1e-6f, "raw sine must bypass effects and gain trim");
  synth.setSensorFrequency(0, true);
  for (int i = 0; i < 10; ++i) synth.renderBlock(p);
  for (int16_t sample : synth.i2sBlock_) check(sample == 0, "zero Hz must settle to silence");
  synth.setSensorFrequency(65535, true);
  check(synth.sensorHz_ == 4095, "sensor input must stay within ADC range");
  synth.setSensorFrequency(2000, false);
  check(synth.sensorHz_ == 0, "disconnected sensor must silence");
#endif

  for (uint8_t preset = 0; preset < beca::SynthEngine::kPresetCount; ++preset) {
    beca::SynthEngine::presetDefaults(preset, p);
    synth.setParams(p); synth.getParams(q);
    check(q.preset == preset, "preset identity must survive sanitization");
    check(q.master >= 0 && q.master <= 1 && q.maxVoices <= 8, "preset bounds");
    synth.handleEvent({1, 64, 100}, q);
    for (int b = 0; b < 30; ++b) synth.renderBlock(q);
  }
  std::puts("PASS: PCM raw Hz/phase/silence, live envelopes, polyphony, idempotent gain and all presets");
}
