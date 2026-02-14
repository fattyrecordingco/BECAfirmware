#pragma once

#include <Arduino.h>
#include <math.h>

namespace beca {
namespace dsp {

static constexpr float kPi = 3.14159265358979323846f;

float clampf(float x, float lo, float hi);
float midiToHz(uint8_t midiNote);
float fastTanh(float x);
float mapCutoffLog(float norm);

class ADSR {
 public:
  ADSR();
  void setSampleRate(float sr);
  void set(float attackSec, float decaySec, float sustainLvl, float releaseSec);
  void noteOn();
  void noteOff();
  void reset();
  float process();
  bool active() const { return state_ != 0; }

 private:
  enum State : uint8_t { Off = 0, Attack = 1, Decay = 2, Sustain = 3, Release = 4 };
  State state_;
  float sr_;
  float level_;
  float attackInc_;
  float decayInc_;
  float sustain_;
  float releaseInc_;
};

class Biquad {
 public:
  Biquad();
  void reset();
  void setLowpass(float sampleRate, float cutoffHz, float q);
  void setHighpass(float sampleRate, float cutoffHz, float q);
  void setBandpass(float sampleRate, float cutoffHz, float q);
  float process(float x);

 private:
  void setCoeffs(float b0, float b1, float b2, float a1, float a2);

  float b0_;
  float b1_;
  float b2_;
  float a1_;
  float a2_;
  float z1_;
  float z2_;
};

class DCBlocker {
 public:
  DCBlocker();
  void reset();
  float process(float x);

 private:
  float x1_;
  float y1_;
};

class Noise {
 public:
  Noise();
  float next();

 private:
  uint32_t state_;
};

}  // namespace dsp
}  // namespace beca
