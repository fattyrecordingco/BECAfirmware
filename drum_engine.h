#pragma once

#include <Arduino.h>

#include "dsp_blocks.h"

namespace beca {

class DrumEngine {
 public:
  static constexpr uint8_t kPartCount = 8;

  DrumEngine();
  void init(float sampleRate);
  void setKit(uint8_t kit);
  void trigger(uint8_t part, uint8_t velocity);
  void allOff();
  void render(float& outL, float& outR);

 private:
  struct Voice {
    bool active;
    float env;
    float decay;
    float phase;
    float freq;
    float pitchEnv;
    float pitchDecay;
    float toneMix;
    float noiseMix;
    float pan;
    float drive;
    float hpMem;
    float lpMem;
  };

  void setupVoice(uint8_t part, float velNorm);

  float sampleRate_;
  uint8_t kit_;
  Voice voices_[kPartCount];
  dsp::Noise noise_;
};

}  // namespace beca
