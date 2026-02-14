#pragma once

#include <Arduino.h>
#include <driver/i2s.h>

#include "drum_engine.h"

namespace beca {

enum SynthFilterType : uint8_t {
  SYNTH_FILTER_LOWPASS = 0,
  SYNTH_FILTER_HIGHPASS = 1,
  SYNTH_FILTER_BANDPASS = 2,
};

struct SynthParams {
  uint8_t preset;
  uint8_t waveA;
  uint8_t waveB;
  float oscMix;
  uint8_t mono;
  uint8_t maxVoices;
  float attack;
  float decay;
  float sustain;
  float release;
  uint8_t filterType;
  float cutoffHz;
  float resonance;
  float reverb;
  float delayMs;
  float delayFeedback;
  float delayMix;
  float distDrive;
  float master;
  float detuneCents;
  float gainTrim;
  uint8_t drumKit;
};

class SynthEngine {
 public:
  static constexpr uint8_t kPresetCount = 13;

  SynthEngine();

  bool start(int pinBck, int pinWs, int pinData, uint32_t sampleRate = 44100, uint16_t blockSize = 64);
  void stop();
  bool running() const { return running_; }

  void fadeIn(uint16_t ms = 20);
  void fadeOut(uint16_t ms = 20);

  void noteOn(uint8_t note, uint8_t vel, uint16_t gateMs = 0);
  void noteOff(uint8_t note);
  void allNotesOff();

  void drumHit(uint8_t part, uint8_t vel);
  void allDrumsOff();

  void setParams(const SynthParams& params);
  void getParams(SynthParams& out) const;
  void loadPreset(uint8_t presetIndex);
  void resetPreset();

  bool triggerTestChord(uint32_t durationMs = 2000);
  void service(uint32_t nowMs);

  uint32_t consumeUnderruns();

  static const char* presetName(uint8_t index);
  static void presetDefaults(uint8_t index, SynthParams& out);

 private:
  struct Voice {
    bool active;
    uint8_t note;
    uint32_t age;
    float phaseA;
    float phaseB;
    float vel;
    dsp::ADSR env;
  };

  struct NoteOffSched {
    bool active;
    uint8_t note;
    uint32_t atMs;
  };

  enum EventType : uint8_t {
    EVT_NOTE_ON = 1,
    EVT_NOTE_OFF = 2,
    EVT_ALL_NOTES_OFF = 3,
    EVT_DRUM_HIT = 4,
    EVT_ALL_DRUMS_OFF = 5,
  };

  struct Event {
    uint8_t type;
    uint8_t a;
    uint8_t b;
  };

  static constexpr uint8_t kMaxVoices = 12;
  static constexpr uint8_t kEventQueueSize = 64;
  static constexpr uint8_t kOffSchedSize = 24;
  static constexpr uint16_t kBlockMax = 128;
  static constexpr uint32_t kMaxDelaySamples = 35280;

  static void taskTrampoline(void* arg);
  void audioTask();

  bool pushEvent(uint8_t type, uint8_t a, uint8_t b);
  bool popEvent(Event& out);

  void handleEvent(const Event& e, const SynthParams& p);
  void renderBlock(const SynthParams& p);
  float osc(uint8_t waveform, float phase) const;
  Voice* allocVoice(uint8_t note, bool monoMode);
  void applyFilterConfig(const SynthParams& p);
  void sanitizeParams(SynthParams& p) const;

  i2s_port_t i2sPort_;
  uint32_t sampleRate_;
  uint16_t blockSize_;

  TaskHandle_t audioTaskHandle_;
  volatile bool running_;
  volatile bool taskAlive_;

  mutable portMUX_TYPE paramMux_;
  SynthParams paramsSlots_[2];
  volatile uint8_t activeParamSlot_;

  portMUX_TYPE eventMux_;
  Event eventQueue_[kEventQueueSize];
  volatile uint8_t eventHead_;
  volatile uint8_t eventTail_;

  Voice voices_[kMaxVoices];
  uint32_t voiceAgeCounter_;
  NoteOffSched offSched_[kOffSchedSize];

  DrumEngine drum_;

  dsp::Biquad filterL_;
  dsp::Biquad filterR_;
  dsp::DCBlocker dcL_;
  dsp::DCBlocker dcR_;
  uint8_t lastFilterType_;
  float lastCutoffHz_;
  float lastResonance_;
  bool filterDirty_;

  int8_t delay_[kMaxDelaySamples];
  uint32_t delayPos_;
  float revMemL_;
  float revMemR_;

  int16_t i2sBlock_[kBlockMax * 2];

  volatile uint32_t underruns_;

  volatile float fadeTarget_;
  float fadeValue_;
  float fadeStep_;

  bool testToneActive_;
  uint32_t testToneEndMs_;
  uint8_t testNotes_[3];
};

}  // namespace beca
