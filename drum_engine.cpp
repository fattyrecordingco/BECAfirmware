#include "drum_engine.h"

#include <math.h>

namespace beca {

DrumEngine::DrumEngine() : sampleRate_(44100.0f), kit_(0) {
  allOff();
}

void DrumEngine::init(float sampleRate) {
  sampleRate_ = sampleRate > 4000.0f ? sampleRate : 44100.0f;
  allOff();
}

void DrumEngine::setKit(uint8_t kit) {
  kit_ = kit > 2 ? 2 : kit;
}

void DrumEngine::allOff() {
  for (auto& v : voices_) {
    v.active = false;
    v.env = 0.0f;
    v.decay = 0.99f;
    v.phase = 0.0f;
    v.freq = 120.0f;
    v.pitchEnv = 0.0f;
    v.pitchDecay = 0.98f;
    v.toneMix = 0.5f;
    v.noiseMix = 0.5f;
    v.pan = 0.5f;
    v.drive = 0.0f;
    v.hpMem = 0.0f;
    v.lpMem = 0.0f;
  }
}

void DrumEngine::setupVoice(uint8_t part, float velNorm) {
  if (part >= kPartCount) return;
  Voice& v = voices_[part];

  const float kitDecayScale[3] = {1.0f, 1.15f, 0.92f};
  const float kitToneScale[3] = {1.0f, 0.9f, 1.08f};
  const float ks = kitDecayScale[kit_];
  const float ts = kitToneScale[kit_];

  v.active = true;
  v.env = dsp::clampf(velNorm, 0.15f, 1.0f);
  v.phase = 0.0f;
  v.pitchEnv = 0.0f;
  v.hpMem = 0.0f;
  v.lpMem = 0.0f;

  switch (part) {
    case 0:  // Kick
      v.freq = 55.0f * ts;
      v.pitchEnv = 1.8f;
      v.pitchDecay = 0.88f;
      v.decay = powf(0.0012f, 1.0f / (sampleRate_ * 0.42f * ks));
      v.toneMix = 0.98f;
      v.noiseMix = 0.05f;
      v.pan = 0.5f;
      v.drive = 0.16f;
      break;
    case 1:  // Snare
      v.freq = 185.0f * ts;
      v.pitchEnv = 0.3f;
      v.pitchDecay = 0.94f;
      v.decay = powf(0.0012f, 1.0f / (sampleRate_ * 0.23f * ks));
      v.toneMix = 0.35f;
      v.noiseMix = 0.82f;
      v.pan = 0.52f;
      v.drive = 0.12f;
      break;
    case 2:  // Closed HH
      v.freq = 460.0f;
      v.decay = powf(0.0012f, 1.0f / (sampleRate_ * 0.08f * ks));
      v.toneMix = 0.04f;
      v.noiseMix = 1.0f;
      v.pan = 0.42f;
      v.drive = 0.05f;
      // Closed hat chokes open hat.
      voices_[3].env *= 0.05f;
      break;
    case 3:  // Open HH
      v.freq = 500.0f;
      v.decay = powf(0.0012f, 1.0f / (sampleRate_ * 0.42f * ks));
      v.toneMix = 0.05f;
      v.noiseMix = 1.0f;
      v.pan = 0.58f;
      v.drive = 0.05f;
      break;
    case 4:  // Tom 1
      v.freq = 130.0f * ts;
      v.pitchEnv = 0.75f;
      v.pitchDecay = 0.92f;
      v.decay = powf(0.0012f, 1.0f / (sampleRate_ * 0.26f * ks));
      v.toneMix = 0.95f;
      v.noiseMix = 0.08f;
      v.pan = 0.38f;
      v.drive = 0.08f;
      break;
    case 5:  // Tom 2
      v.freq = 95.0f * ts;
      v.pitchEnv = 0.86f;
      v.pitchDecay = 0.92f;
      v.decay = powf(0.0012f, 1.0f / (sampleRate_ * 0.33f * ks));
      v.toneMix = 0.95f;
      v.noiseMix = 0.08f;
      v.pan = 0.64f;
      v.drive = 0.08f;
      break;
    case 6:  // Ride
      v.freq = 680.0f;
      v.decay = powf(0.0012f, 1.0f / (sampleRate_ * 0.62f * ks));
      v.toneMix = 0.32f;
      v.noiseMix = 0.86f;
      v.pan = 0.72f;
      v.drive = 0.06f;
      break;
    case 7:  // Crash
      v.freq = 510.0f;
      v.decay = powf(0.0012f, 1.0f / (sampleRate_ * 0.95f * ks));
      v.toneMix = 0.12f;
      v.noiseMix = 1.0f;
      v.pan = 0.66f;
      v.drive = 0.10f;
      break;
  }
}

void DrumEngine::trigger(uint8_t part, uint8_t velocity) {
  const float velNorm = dsp::clampf(static_cast<float>(velocity) / 127.0f, 0.0f, 1.0f);
  setupVoice(part, velNorm);
}

void DrumEngine::render(float& outL, float& outR) {
  outL = 0.0f;
  outR = 0.0f;

  const float partGain[8] = {0.40f, 0.25f, 0.14f, 0.16f, 0.20f, 0.20f, 0.16f, 0.18f};
  const float kitMaster[3] = {0.92f, 0.86f, 0.90f};

  for (uint8_t i = 0; i < kPartCount; ++i) {
    Voice& v = voices_[i];
    if (!v.active) continue;

    v.env *= v.decay;
    if (v.env < 0.00015f) {
      v.active = false;
      continue;
    }

    v.pitchEnv *= v.pitchDecay;
    const float freq = v.freq * (1.0f + v.pitchEnv);
    v.phase += 2.0f * dsp::kPi * freq / sampleRate_;
    if (v.phase >= 2.0f * dsp::kPi) v.phase -= 2.0f * dsp::kPi;

    const float metallic = sinf(v.phase) + 0.35f * sinf(v.phase * 1.97f) + 0.22f * sinf(v.phase * 2.93f);
    float sample = v.toneMix * metallic + v.noiseMix * noise_.next();

    // Gentle high-pass character for cymbals/hats.
    v.lpMem += 0.06f * (sample - v.lpMem);
    if (i >= 2) sample -= v.lpMem;

    sample = dsp::fastTanh(sample * (1.0f + v.drive * 4.5f));
    const float s = sample * v.env * partGain[i] * kitMaster[kit_];

    outL += s * (1.0f - v.pan);
    outR += s * v.pan;
  }
}

}  // namespace beca
