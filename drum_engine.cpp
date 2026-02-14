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
    v.envTarget = 0.0f;
    v.attackInc = 1.0f;
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
    v.noiseHp = 0.0f;
  }
}

void DrumEngine::setupVoice(uint8_t part, float velNorm) {
  if (part >= kPartCount) return;
  Voice& v = voices_[part];

  const float kitDecayScale[3] = {1.0f, 1.15f, 0.88f};
  const float kitToneScale[3] = {1.0f, 0.92f, 1.05f};
  const float kitNoiseScale[3] = {1.0f, 0.90f, 0.78f};
  const float kitAtkScale[3] = {1.0f, 1.2f, 0.9f};
  const float ks = kitDecayScale[kit_];
  const float ts = kitToneScale[kit_];
  const float ns = kitNoiseScale[kit_];
  const float as = kitAtkScale[kit_];

  v.active = true;
  v.env = 0.0f;
  v.envTarget = dsp::clampf(velNorm, 0.12f, 1.0f);
  v.phase = 0.0f;
  v.pitchEnv = 0.0f;
  v.hpMem = 0.0f;
  v.lpMem = 0.0f;
  v.noiseHp = 0.0f;
  v.attackInc = 1.0f / (sampleRate_ * 0.0018f * as);

  switch (part) {
    case 0:  // Kick
      v.freq = 52.0f * ts;
      v.pitchEnv = 2.0f;
      v.pitchDecay = 0.90f;
      v.attackInc = 1.0f / (sampleRate_ * 0.0014f * as);
      v.decay = powf(0.0008f, 1.0f / (sampleRate_ * 0.50f * ks));
      v.toneMix = 1.0f;
      v.noiseMix = 0.04f * ns;
      v.pan = 0.5f;
      v.drive = 0.12f;
      break;
    case 1:  // Snare
      v.freq = 196.0f * ts;
      v.pitchEnv = 0.45f;
      v.pitchDecay = 0.93f;
      v.attackInc = 1.0f / (sampleRate_ * 0.0012f * as);
      v.decay = powf(0.0010f, 1.0f / (sampleRate_ * 0.29f * ks));
      v.toneMix = 0.42f;
      v.noiseMix = 0.70f * ns;
      v.pan = 0.52f;
      v.drive = 0.08f;
      break;
    case 2:  // Closed HH
      v.freq = 430.0f;
      v.attackInc = 1.0f / (sampleRate_ * 0.0009f * as);
      v.decay = powf(0.0009f, 1.0f / (sampleRate_ * 0.075f * ks));
      v.toneMix = 0.03f;
      v.noiseMix = 0.98f * ns;
      v.pan = 0.42f;
      v.drive = 0.03f;
      // Closed hat chokes open hat.
      voices_[3].env *= 0.05f;
      break;
    case 3:  // Open HH
      v.freq = 520.0f;
      v.attackInc = 1.0f / (sampleRate_ * 0.0012f * as);
      v.decay = powf(0.0009f, 1.0f / (sampleRate_ * 0.34f * ks));
      v.toneMix = 0.05f;
      v.noiseMix = 0.95f * ns;
      v.pan = 0.58f;
      v.drive = 0.03f;
      break;
    case 4:  // Tom 1
      v.freq = 148.0f * ts;
      v.pitchEnv = 0.85f;
      v.pitchDecay = 0.915f;
      v.attackInc = 1.0f / (sampleRate_ * 0.0015f * as);
      v.decay = powf(0.0010f, 1.0f / (sampleRate_ * 0.34f * ks));
      v.toneMix = 0.92f;
      v.noiseMix = 0.05f * ns;
      v.pan = 0.38f;
      v.drive = 0.06f;
      break;
    case 5:  // Tom 2
      v.freq = 108.0f * ts;
      v.pitchEnv = 0.95f;
      v.pitchDecay = 0.915f;
      v.attackInc = 1.0f / (sampleRate_ * 0.0015f * as);
      v.decay = powf(0.0010f, 1.0f / (sampleRate_ * 0.42f * ks));
      v.toneMix = 0.92f;
      v.noiseMix = 0.05f * ns;
      v.pan = 0.64f;
      v.drive = 0.06f;
      break;
    case 6:  // Ride
      v.freq = 640.0f;
      v.attackInc = 1.0f / (sampleRate_ * 0.0011f * as);
      v.decay = powf(0.0009f, 1.0f / (sampleRate_ * 0.70f * ks));
      v.toneMix = 0.24f;
      v.noiseMix = 0.78f * ns;
      v.pan = 0.72f;
      v.drive = 0.03f;
      break;
    case 7:  // Crash
      v.freq = 520.0f;
      v.attackInc = 1.0f / (sampleRate_ * 0.0010f * as);
      v.decay = powf(0.00085f, 1.0f / (sampleRate_ * 0.92f * ks));
      v.toneMix = 0.10f;
      v.noiseMix = 0.92f * ns;
      v.pan = 0.66f;
      v.drive = 0.05f;
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

  const float partGain[8] = {0.52f, 0.30f, 0.12f, 0.14f, 0.24f, 0.24f, 0.14f, 0.16f};
  const float kitMaster[3] = {0.74f, 0.70f, 0.68f};

  for (uint8_t i = 0; i < kPartCount; ++i) {
    Voice& v = voices_[i];
    if (!v.active) continue;

    if (v.env < v.envTarget) {
      v.env += v.attackInc;
      if (v.env > v.envTarget) v.env = v.envTarget;
    } else {
      v.env *= v.decay;
    }
    if (v.env < 0.00015f) {
      v.active = false;
      continue;
    }

    v.pitchEnv *= v.pitchDecay;
    const float freq = v.freq * (1.0f + v.pitchEnv);
    v.phase += 2.0f * dsp::kPi * freq / sampleRate_;
    if (v.phase >= 2.0f * dsp::kPi) v.phase -= 2.0f * dsp::kPi;

    const float metallic = sinf(v.phase) + 0.34f * sinf(v.phase * 1.97f) + 0.18f * sinf(v.phase * 2.93f);
    float noise = noise_.next();
    v.noiseHp += 0.18f * (noise - v.noiseHp);
    noise = noise - v.noiseHp;

    float sample = v.toneMix * metallic + v.noiseMix * noise;

    // Remove low rumble from cymbals/hats and tame DC for all parts.
    v.lpMem += 0.06f * (sample - v.lpMem);
    if (i >= 2) sample -= v.lpMem;
    v.hpMem += 0.004f * (sample - v.hpMem);
    sample -= v.hpMem;

    sample = dsp::fastTanh(sample * (1.0f + v.drive * 3.2f));
    const float s = sample * v.env * partGain[i] * kitMaster[kit_];

    outL += s * (1.0f - v.pan);
    outR += s * v.pan;
  }
}

}  // namespace beca
