#include "dsp_blocks.h"

namespace beca {
namespace dsp {

float clampf(float x, float lo, float hi) {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

float midiToHz(uint8_t midiNote) {
  return 440.0f * powf(2.0f, (static_cast<float>(midiNote) - 69.0f) / 12.0f);
}

float fastTanh(float x) {
  const float x2 = x * x;
  return x * (27.0f + x2) / (27.0f + 9.0f * x2);
}

float mapCutoffLog(float norm) {
  const float n = clampf(norm, 0.0f, 1.0f);
  return 20.0f * powf(900.0f, n);
}

ADSR::ADSR()
    : state_(Off),
      sr_(44100.0f),
      level_(0.0f),
      attackInc_(0.001f),
      decayInc_(0.001f),
      sustain_(0.7f),
      releaseInc_(0.001f) {}

void ADSR::setSampleRate(float sr) {
  sr_ = sr > 1000.0f ? sr : 44100.0f;
}

void ADSR::set(float attackSec, float decaySec, float sustainLvl, float releaseSec) {
  attackSec = clampf(attackSec, 0.001f, 5.0f);
  decaySec = clampf(decaySec, 0.001f, 5.0f);
  sustain_ = clampf(sustainLvl, 0.0f, 1.0f);
  releaseSec = clampf(releaseSec, 0.001f, 10.0f);

  attackInc_ = 1.0f / (attackSec * sr_);
  decayInc_ = (1.0f - sustain_) / (decaySec * sr_);
  releaseInc_ = 1.0f / (releaseSec * sr_);
}

void ADSR::noteOn() {
  state_ = Attack;
}

void ADSR::noteOff() {
  if (state_ != Off) state_ = Release;
}

void ADSR::reset() {
  state_ = Off;
  level_ = 0.0f;
}

float ADSR::process() {
  switch (state_) {
    case Off:
      level_ = 0.0f;
      break;
    case Attack:
      level_ += attackInc_;
      if (level_ >= 1.0f) {
        level_ = 1.0f;
        state_ = Decay;
      }
      break;
    case Decay:
      level_ -= decayInc_;
      if (level_ <= sustain_) {
        level_ = sustain_;
        state_ = Sustain;
      }
      break;
    case Sustain:
      level_ = sustain_;
      break;
    case Release:
      level_ -= releaseInc_;
      if (level_ <= 0.0f) {
        level_ = 0.0f;
        state_ = Off;
      }
      break;
  }
  return level_;
}

Biquad::Biquad()
    : b0_(1.0f), b1_(0.0f), b2_(0.0f), a1_(0.0f), a2_(0.0f), z1_(0.0f), z2_(0.0f) {}

void Biquad::reset() {
  z1_ = 0.0f;
  z2_ = 0.0f;
}

void Biquad::setCoeffs(float b0, float b1, float b2, float a1, float a2) {
  b0_ = b0;
  b1_ = b1;
  b2_ = b2;
  a1_ = a1;
  a2_ = a2;
}

void Biquad::setLowpass(float sampleRate, float cutoffHz, float q) {
  const float fc = clampf(cutoffHz, 20.0f, 18000.0f);
  const float qq = clampf(q, 0.1f, 10.0f);
  const float w0 = 2.0f * kPi * fc / sampleRate;
  const float c = cosf(w0);
  const float s = sinf(w0);
  const float alpha = s / (2.0f * qq);
  const float a0 = 1.0f + alpha;

  const float b0 = (1.0f - c) * 0.5f / a0;
  const float b1 = (1.0f - c) / a0;
  const float b2 = b0;
  const float a1 = -2.0f * c / a0;
  const float a2 = (1.0f - alpha) / a0;
  setCoeffs(b0, b1, b2, a1, a2);
}

void Biquad::setHighpass(float sampleRate, float cutoffHz, float q) {
  const float fc = clampf(cutoffHz, 20.0f, 18000.0f);
  const float qq = clampf(q, 0.1f, 10.0f);
  const float w0 = 2.0f * kPi * fc / sampleRate;
  const float c = cosf(w0);
  const float s = sinf(w0);
  const float alpha = s / (2.0f * qq);
  const float a0 = 1.0f + alpha;

  const float b0 = (1.0f + c) * 0.5f / a0;
  const float b1 = -(1.0f + c) / a0;
  const float b2 = b0;
  const float a1 = -2.0f * c / a0;
  const float a2 = (1.0f - alpha) / a0;
  setCoeffs(b0, b1, b2, a1, a2);
}

void Biquad::setBandpass(float sampleRate, float cutoffHz, float q) {
  const float fc = clampf(cutoffHz, 20.0f, 18000.0f);
  const float qq = clampf(q, 0.1f, 10.0f);
  const float w0 = 2.0f * kPi * fc / sampleRate;
  const float c = cosf(w0);
  const float s = sinf(w0);
  const float alpha = s / (2.0f * qq);
  const float a0 = 1.0f + alpha;

  const float b0 = alpha / a0;
  const float b1 = 0.0f;
  const float b2 = -alpha / a0;
  const float a1 = -2.0f * c / a0;
  const float a2 = (1.0f - alpha) / a0;
  setCoeffs(b0, b1, b2, a1, a2);
}

float Biquad::process(float x) {
  const float y = b0_ * x + z1_;
  z1_ = b1_ * x - a1_ * y + z2_;
  z2_ = b2_ * x - a2_ * y;
  return y;
}

DCBlocker::DCBlocker() : x1_(0.0f), y1_(0.0f) {}

void DCBlocker::reset() {
  x1_ = 0.0f;
  y1_ = 0.0f;
}

float DCBlocker::process(float x) {
  const float r = 0.995f;
  const float y = x - x1_ + r * y1_;
  x1_ = x;
  y1_ = y;
  return y;
}

Noise::Noise() : state_(0x1f123bb5u) {}

float Noise::next() {
  state_ ^= state_ << 13;
  state_ ^= state_ >> 17;
  state_ ^= state_ << 5;
  const float v = static_cast<float>(state_ & 0x00FFFFFFu) / static_cast<float>(0x00FFFFFFu);
  return v * 2.0f - 1.0f;
}

}  // namespace dsp
}  // namespace beca
