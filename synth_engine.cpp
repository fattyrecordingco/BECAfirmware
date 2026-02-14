#include "synth_engine.h"

#include <math.h>
#include <string.h>

namespace beca {

namespace {

const char* kPresetNames[SynthEngine::kPresetCount] = {
    "Fatty Neon Lead", "Glass Reed Lead", "Verdant Pad", "Forest Choir", "Jivari Strings",
    "Pulse Arp 1",     "Pulse Arp 2",      "Rhythm Gate", "Thick Mono Bass", "Rubber Bass",
};

}  // namespace

SynthEngine::SynthEngine()
    : i2sPort_(I2S_NUM_0),
      sampleRate_(44100),
      blockSize_(64),
      audioTaskHandle_(nullptr),
      running_(false),
      taskAlive_(false),
      paramMux_(portMUX_INITIALIZER_UNLOCKED),
      activeParamSlot_(0),
      eventMux_(portMUX_INITIALIZER_UNLOCKED),
      eventHead_(0),
      eventTail_(0),
      voiceAgeCounter_(0),
      delayPos_(0),
      revMemL_(0.0f),
      revMemR_(0.0f),
      lastFilterType_(SYNTH_FILTER_LOWPASS),
      lastCutoffHz_(0.0f),
      lastResonance_(0.0f),
      filterDirty_(true),
      underruns_(0),
      fadeTarget_(1.0f),
      fadeValue_(1.0f),
      fadeStep_(0.001f),
      testToneActive_(false),
      testToneEndMs_(0),
      drumsEnabled_(true) {
  memset(voices_, 0, sizeof(voices_));
  memset(offSched_, 0, sizeof(offSched_));
  memset(eventQueue_, 0, sizeof(eventQueue_));
  memset(delay_, 0, sizeof(delay_));

  SynthParams p;
  presetDefaults(0, p);
  paramsSlots_[0] = p;
  paramsSlots_[1] = p;
}

const char* SynthEngine::presetName(uint8_t index) {
  if (index >= kPresetCount) return kPresetNames[0];
  return kPresetNames[index];
}

void SynthEngine::presetDefaults(uint8_t index, SynthParams& out) {
  const uint8_t idx = index >= kPresetCount ? 0 : index;
  out.preset = idx;
  out.waveA = 0;
  out.waveB = 3;
  out.oscMix = 0.42f;
  out.mono = 0;
  out.maxVoices = 8;
  out.attack = 0.012f;
  out.decay = 0.24f;
  out.sustain = 0.55f;
  out.release = 0.42f;
  out.filterType = SYNTH_FILTER_LOWPASS;
  out.cutoffHz = 4200.0f;
  out.resonance = 0.9f;
  out.reverb = 0.18f;
  out.delayMs = 140.0f;
  out.delayFeedback = 0.26f;
  out.delayMix = 0.15f;
  out.distDrive = 0.16f;
  out.master = 0.62f;
  out.detuneCents = 3.5f;
  out.gainTrim = 0.95f;
  out.drumKit = 0;

  switch (idx) {
    case 0:  // Fatty Neon Lead
      out.waveA = 0;
      out.waveB = 1;
      out.oscMix = 0.45f;
      out.mono = 1;
      out.maxVoices = 1;
      out.attack = 0.006f;
      out.decay = 0.20f;
      out.sustain = 0.66f;
      out.release = 0.24f;
      out.cutoffHz = 5200.0f;
      out.resonance = 1.7f;
      out.reverb = 0.12f;
      out.delayMs = 115.0f;
      out.delayFeedback = 0.22f;
      out.delayMix = 0.12f;
      out.distDrive = 0.22f;
      out.master = 0.60f;
      out.detuneCents = 4.0f;
      break;
    case 1:  // Glass Reed Lead
      out.waveA = 2;
      out.waveB = 3;
      out.oscMix = 0.28f;
      out.mono = 1;
      out.maxVoices = 1;
      out.attack = 0.018f;
      out.decay = 0.44f;
      out.sustain = 0.52f;
      out.release = 0.42f;
      out.cutoffHz = 4200.0f;
      out.resonance = 1.05f;
      out.reverb = 0.16f;
      out.delayMs = 150.0f;
      out.delayFeedback = 0.18f;
      out.delayMix = 0.10f;
      out.distDrive = 0.04f;
      out.master = 0.54f;
      out.detuneCents = 1.2f;
      out.gainTrim = 0.88f;
      break;
    case 2:  // Verdant Pad
      out.waveA = 2;
      out.waveB = 0;
      out.oscMix = 0.52f;
      out.mono = 0;
      out.maxVoices = 8;
      out.attack = 0.48f;
      out.decay = 1.10f;
      out.sustain = 0.70f;
      out.release = 1.80f;
      out.cutoffHz = 2400.0f;
      out.resonance = 0.7f;
      out.reverb = 0.34f;
      out.delayMs = 330.0f;
      out.delayFeedback = 0.33f;
      out.delayMix = 0.20f;
      out.distDrive = 0.03f;
      out.master = 0.57f;
      out.detuneCents = 5.0f;
      break;
    case 3:  // Forest Choir
      out.waveA = 3;
      out.waveB = 2;
      out.oscMix = 0.52f;
      out.attack = 0.74f;
      out.decay = 1.08f;
      out.sustain = 0.66f;
      out.release = 1.85f;
      out.cutoffHz = 2200.0f;
      out.resonance = 0.72f;
      out.reverb = 0.34f;
      out.delayMs = 300.0f;
      out.delayFeedback = 0.20f;
      out.delayMix = 0.12f;
      out.master = 0.50f;
      out.detuneCents = 1.5f;
      out.gainTrim = 0.82f;
      break;
    case 4:  // Jivari Strings
      out.waveA = 2;
      out.waveB = 1;
      out.oscMix = 0.35f;
      out.attack = 0.34f;
      out.decay = 0.96f;
      out.sustain = 0.62f;
      out.release = 1.32f;
      out.filterType = SYNTH_FILTER_BANDPASS;
      out.cutoffHz = 108.0f;
      out.resonance = 4.59f;
      out.reverb = 0.22f;
      out.delayMs = 170.0f;
      out.delayFeedback = 0.12f;
      out.delayMix = 0.08f;
      out.master = 0.48f;
      out.detuneCents = 0.9f;
      out.gainTrim = 0.74f;
      break;
    case 5:  // Pulse Arp 1
      out.waveA = 1;
      out.waveB = 0;
      out.oscMix = 0.22f;
      out.mono = 1;
      out.maxVoices = 2;
      out.attack = 0.003f;
      out.decay = 0.12f;
      out.sustain = 0.34f;
      out.release = 0.18f;
      out.filterType = SYNTH_FILTER_BANDPASS;
      out.cutoffHz = 2100.0f;
      out.resonance = 1.8f;
      out.reverb = 0.10f;
      out.delayMs = 90.0f;
      out.delayFeedback = 0.21f;
      out.delayMix = 0.12f;
      out.distDrive = 0.16f;
      out.master = 0.59f;
      out.detuneCents = 2.0f;
      break;
    case 6:  // Pulse Arp 2
      out.waveA = 0;
      out.waveB = 1;
      out.oscMix = 0.58f;
      out.mono = 1;
      out.maxVoices = 2;
      out.attack = 0.002f;
      out.decay = 0.09f;
      out.sustain = 0.30f;
      out.release = 0.14f;
      out.filterType = SYNTH_FILTER_HIGHPASS;
      out.cutoffHz = 900.0f;
      out.resonance = 1.3f;
      out.reverb = 0.05f;
      out.delayMs = 75.0f;
      out.delayFeedback = 0.18f;
      out.delayMix = 0.10f;
      out.distDrive = 0.22f;
      out.master = 0.58f;
      out.detuneCents = 1.5f;
      break;
    case 7:  // Rhythm Gate
      out.waveA = 1;
      out.waveB = 2;
      out.oscMix = 0.35f;
      out.mono = 0;
      out.maxVoices = 6;
      out.attack = 0.0015f;
      out.decay = 0.07f;
      out.sustain = 0.22f;
      out.release = 0.11f;
      out.filterType = SYNTH_FILTER_BANDPASS;
      out.cutoffHz = 1600.0f;
      out.resonance = 2.2f;
      out.reverb = 0.08f;
      out.delayMs = 130.0f;
      out.delayFeedback = 0.24f;
      out.delayMix = 0.14f;
      out.distDrive = 0.20f;
      out.master = 0.57f;
      out.detuneCents = 1.2f;
      break;
    case 8:  // Thick Mono Bass
      out.waveA = 0;
      out.waveB = 1;
      out.oscMix = 0.64f;
      out.mono = 1;
      out.maxVoices = 1;
      out.attack = 0.004f;
      out.decay = 0.18f;
      out.sustain = 0.58f;
      out.release = 0.20f;
      out.filterType = SYNTH_FILTER_LOWPASS;
      out.cutoffHz = 980.0f;
      out.resonance = 1.4f;
      out.reverb = 0.04f;
      out.delayMs = 60.0f;
      out.delayFeedback = 0.12f;
      out.delayMix = 0.06f;
      out.distDrive = 0.28f;
      out.master = 0.56f;
      out.detuneCents = 2.0f;
      out.gainTrim = 0.88f;
      break;
    case 9:  // Rubber Bass
      out.waveA = 2;
      out.waveB = 1;
      out.oscMix = 0.41f;
      out.mono = 1;
      out.maxVoices = 1;
      out.attack = 0.007f;
      out.decay = 0.22f;
      out.sustain = 0.48f;
      out.release = 0.24f;
      out.filterType = SYNTH_FILTER_LOWPASS;
      out.cutoffHz = 1300.0f;
      out.resonance = 1.9f;
      out.reverb = 0.03f;
      out.delayMs = 45.0f;
      out.delayFeedback = 0.08f;
      out.delayMix = 0.04f;
      out.distDrive = 0.30f;
      out.master = 0.54f;
      out.detuneCents = 1.1f;
      out.gainTrim = 0.84f;
      break;
  }
}

void SynthEngine::sanitizeParams(SynthParams& p) const {
  p.preset = p.preset >= kPresetCount ? 0 : p.preset;
  p.waveA = p.waveA > 3 ? 3 : p.waveA;
  p.waveB = p.waveB > 3 ? 3 : p.waveB;
  p.oscMix = dsp::clampf(p.oscMix, 0.0f, 1.0f);
  p.mono = p.mono ? 1 : 0;
  p.maxVoices = static_cast<uint8_t>(constrain(static_cast<int>(p.maxVoices), 1, kMaxVoices));
  p.attack = dsp::clampf(p.attack, 0.0f, 5.0f);
  p.decay = dsp::clampf(p.decay, 0.0f, 5.0f);
  p.sustain = dsp::clampf(p.sustain, 0.0f, 1.0f);
  p.release = dsp::clampf(p.release, 0.01f, 10.0f);
  p.filterType = p.filterType > SYNTH_FILTER_BANDPASS ? SYNTH_FILTER_BANDPASS : p.filterType;
  p.cutoffHz = dsp::clampf(p.cutoffHz, 20.0f, 18000.0f);
  p.resonance = dsp::clampf(p.resonance, 0.1f, 10.0f);
  p.reverb = dsp::clampf(p.reverb, 0.0f, 1.0f);
  p.delayMs = dsp::clampf(p.delayMs, 0.0f, 800.0f);
  p.delayFeedback = dsp::clampf(p.delayFeedback, 0.0f, 0.95f);
  p.delayMix = dsp::clampf(p.delayMix, 0.0f, 1.0f);
  p.distDrive = dsp::clampf(p.distDrive, 0.0f, 1.0f);
  p.master = dsp::clampf(p.master, 0.0f, 1.0f);
  p.detuneCents = dsp::clampf(p.detuneCents, 0.0f, 8.0f);
  p.gainTrim = dsp::clampf(p.gainTrim, 0.45f, 1.0f);
  p.drumKit = p.drumKit > 2 ? 2 : p.drumKit;

  if (p.delayFeedback > 0.92f && p.delayMix > 0.75f) {
    p.delayFeedback = 0.92f;
  }
  if (p.distDrive > 0.8f) p.master *= 0.92f;
}

bool SynthEngine::start(int pinBck, int pinWs, int pinData, uint32_t sampleRate, uint16_t blockSize) {
  if (running_) return true;

  sampleRate_ = sampleRate < 22050 ? 22050 : sampleRate;
  blockSize_ = static_cast<uint16_t>(constrain(static_cast<int>(blockSize), 32, static_cast<int>(kBlockMax)));

  i2s_config_t cfg = {};
  cfg.mode = static_cast<i2s_mode_t>(I2S_MODE_MASTER | I2S_MODE_TX);
  cfg.sample_rate = static_cast<int>(sampleRate_);
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT;
  cfg.channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT;
  cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
  cfg.dma_buf_count = 6;
  cfg.dma_buf_len = blockSize_;
  cfg.use_apll = false;
  cfg.tx_desc_auto_clear = true;
  cfg.fixed_mclk = 0;

  i2s_pin_config_t pinCfg = {};
  pinCfg.bck_io_num = pinBck;
  pinCfg.ws_io_num = pinWs;
  pinCfg.data_out_num = pinData;
  pinCfg.data_in_num = I2S_PIN_NO_CHANGE;

  if (i2s_driver_install(i2sPort_, &cfg, 0, nullptr) != ESP_OK) return false;
  if (i2s_set_pin(i2sPort_, &pinCfg) != ESP_OK) {
    i2s_driver_uninstall(i2sPort_);
    return false;
  }
  i2s_zero_dma_buffer(i2sPort_);

  memset(delay_, 0, sizeof(delay_));
  delayPos_ = 0;
  revMemL_ = 0.0f;
  revMemR_ = 0.0f;
  dcL_.reset();
  dcR_.reset();
  filterL_.reset();
  filterR_.reset();
  filterDirty_ = true;

  for (auto& v : voices_) {
    v.active = false;
    v.age = 0;
    v.phaseA = 0.0f;
    v.phaseB = 0.0f;
    v.vel = 0.0f;
    v.env.setSampleRate(static_cast<float>(sampleRate_));
    v.env.reset();
  }
  memset(offSched_, 0, sizeof(offSched_));
  drum_.init(static_cast<float>(sampleRate_));

  fadeValue_ = 0.0f;
  fadeTarget_ = 1.0f;
  fadeStep_ = 1.0f / static_cast<float>((sampleRate_ * 20) / 1000);

  running_ = true;
  taskAlive_ = true;
  // Keep audio task at same priority as loop task so web/Wi-Fi servicing is not starved.
  BaseType_t ok = xTaskCreatePinnedToCore(taskTrampoline, "beca_audio", 6144, this, 1, &audioTaskHandle_, 1);
  if (ok != pdPASS) {
    running_ = false;
    taskAlive_ = false;
    i2s_driver_uninstall(i2sPort_);
    audioTaskHandle_ = nullptr;
    return false;
  }

  return true;
}

void SynthEngine::stop() {
  if (!running_) return;
  fadeOut(20);
  delay(24);

  running_ = false;
  uint32_t t0 = millis();
  while (taskAlive_ && (millis() - t0) < 500) {
    delay(2);
  }

  i2s_zero_dma_buffer(i2sPort_);
  i2s_stop(i2sPort_);
  i2s_driver_uninstall(i2sPort_);

  audioTaskHandle_ = nullptr;
  memset(offSched_, 0, sizeof(offSched_));
  allNotesOff();
  allDrumsOff();
}

void SynthEngine::fadeIn(uint16_t ms) {
  const uint16_t m = ms == 0 ? 1 : ms;
  fadeTarget_ = 1.0f;
  fadeStep_ = 1.0f / static_cast<float>((sampleRate_ * m) / 1000);
}

void SynthEngine::fadeOut(uint16_t ms) {
  const uint16_t m = ms == 0 ? 1 : ms;
  fadeTarget_ = 0.0f;
  fadeStep_ = 1.0f / static_cast<float>((sampleRate_ * m) / 1000);
}

void SynthEngine::setParams(const SynthParams& params) {
  SynthParams p = params;
  sanitizeParams(p);

  portENTER_CRITICAL(&paramMux_);
  const uint8_t next = activeParamSlot_ ^ 1u;
  paramsSlots_[next] = p;
  activeParamSlot_ = next;
  portEXIT_CRITICAL(&paramMux_);

  filterDirty_ = true;
  drum_.setKit(p.drumKit);
}

void SynthEngine::getParams(SynthParams& out) const {
  portENTER_CRITICAL(&paramMux_);
  out = paramsSlots_[activeParamSlot_];
  portEXIT_CRITICAL(&paramMux_);
}

void SynthEngine::loadPreset(uint8_t presetIndex) {
  SynthParams p;
  presetDefaults(presetIndex, p);
  setParams(p);
}

void SynthEngine::resetPreset() {
  SynthParams p;
  getParams(p);
  presetDefaults(p.preset, p);
  setParams(p);
}

bool SynthEngine::triggerTestChord(uint32_t durationMs) {
  if (!running_) return false;
  testNotes_[0] = 60;
  testNotes_[1] = 64;
  testNotes_[2] = 67;
  noteOn(testNotes_[0], 92, 0);
  noteOn(testNotes_[1], 86, 0);
  noteOn(testNotes_[2], 88, 0);
  testToneActive_ = true;
  testToneEndMs_ = millis() + durationMs;
  return true;
}

void SynthEngine::service(uint32_t nowMs) {
  for (auto& s : offSched_) {
    if (!s.active) continue;
    if ((int32_t)(nowMs - s.atMs) >= 0) {
      noteOff(s.note);
      s.active = false;
    }
  }

  if (testToneActive_ && (int32_t)(nowMs - testToneEndMs_) >= 0) {
    noteOff(testNotes_[0]);
    noteOff(testNotes_[1]);
    noteOff(testNotes_[2]);
    testToneActive_ = false;
  }
}

uint32_t SynthEngine::consumeUnderruns() {
  portENTER_CRITICAL(&eventMux_);
  uint32_t v = underruns_;
  underruns_ = 0;
  portEXIT_CRITICAL(&eventMux_);
  return v;
}

void SynthEngine::noteOn(uint8_t note, uint8_t vel, uint16_t gateMs) {
  pushEvent(EVT_NOTE_ON, note, vel);

  if (gateMs == 0) return;
  uint32_t at = millis() + gateMs;
  for (auto& s : offSched_) {
    if (s.active && s.note == note) {
      s.atMs = at;
      return;
    }
  }
  for (auto& s : offSched_) {
    if (!s.active) {
      s.active = true;
      s.note = note;
      s.atMs = at;
      return;
    }
  }
  offSched_[0].active = true;
  offSched_[0].note = note;
  offSched_[0].atMs = at;
}

void SynthEngine::noteOff(uint8_t note) {
  pushEvent(EVT_NOTE_OFF, note, 0);
}

void SynthEngine::allNotesOff() {
  memset(offSched_, 0, sizeof(offSched_));
  pushEvent(EVT_ALL_NOTES_OFF, 0, 0);
}

void SynthEngine::drumHit(uint8_t part, uint8_t vel) {
  if (!drumsEnabled_) return;
  pushEvent(EVT_DRUM_HIT, part, vel);
}

void SynthEngine::allDrumsOff() {
  pushEvent(EVT_ALL_DRUMS_OFF, 0, 0);
}

void SynthEngine::setDrumsEnabled(bool enabled) {
  drumsEnabled_ = enabled;
  if (!enabled) allDrumsOff();
}

bool SynthEngine::pushEvent(uint8_t type, uint8_t a, uint8_t b) {
  bool ok = false;
  portENTER_CRITICAL(&eventMux_);
  const uint8_t next = static_cast<uint8_t>((eventHead_ + 1u) % kEventQueueSize);
  if (next != eventTail_) {
    eventQueue_[eventHead_].type = type;
    eventQueue_[eventHead_].a = a;
    eventQueue_[eventHead_].b = b;
    eventHead_ = next;
    ok = true;
  }
  portEXIT_CRITICAL(&eventMux_);
  return ok;
}

bool SynthEngine::popEvent(Event& out) {
  bool ok = false;
  portENTER_CRITICAL(&eventMux_);
  if (eventTail_ != eventHead_) {
    out = eventQueue_[eventTail_];
    eventTail_ = static_cast<uint8_t>((eventTail_ + 1u) % kEventQueueSize);
    ok = true;
  }
  portEXIT_CRITICAL(&eventMux_);
  return ok;
}

void SynthEngine::taskTrampoline(void* arg) {
  SynthEngine* self = static_cast<SynthEngine*>(arg);
  if (self) self->audioTask();
  vTaskDelete(nullptr);
}

SynthEngine::Voice* SynthEngine::allocVoice(uint8_t note, bool monoMode) {
  if (monoMode) {
    Voice& v = voices_[0];
    v.active = true;
    v.note = note;
    v.age = ++voiceAgeCounter_;
    v.phaseA = 0.0f;
    v.phaseB = 0.0f;
    return &v;
  }

  for (auto& v : voices_) {
    if (!v.active) {
      v.active = true;
      v.note = note;
      v.age = ++voiceAgeCounter_;
      v.phaseA = 0.0f;
      v.phaseB = 0.0f;
      return &v;
    }
  }

  Voice* oldest = &voices_[0];
  for (auto& v : voices_) {
    if (v.age < oldest->age) oldest = &v;
  }
  oldest->active = true;
  oldest->note = note;
  oldest->age = ++voiceAgeCounter_;
  oldest->phaseA = 0.0f;
  oldest->phaseB = 0.0f;
  return oldest;
}

float SynthEngine::osc(uint8_t waveform, float phase) const {
  switch (waveform) {
    case 0:  // saw
      return 2.0f * phase - 1.0f;
    case 1:  // square
      return phase < 0.5f ? 1.0f : -1.0f;
    case 2: {  // triangle
      float t = fabsf(2.0f * phase - 1.0f);
      return 1.0f - 2.0f * t;
    }
    case 3:
    default:
      return sinf(2.0f * dsp::kPi * phase);
  }
}

void SynthEngine::handleEvent(const Event& e, const SynthParams& p) {
  switch (e.type) {
    case EVT_NOTE_ON: {
      Voice* v = allocVoice(e.a, p.mono != 0);
      if (!v) break;
      v->vel = dsp::clampf(static_cast<float>(e.b) / 127.0f, 0.05f, 1.0f);
      v->env.setSampleRate(static_cast<float>(sampleRate_));
      v->env.set(p.attack, p.decay, p.sustain, p.release);
      v->env.noteOn();
      if (p.mono) {
        for (uint8_t i = 1; i < kMaxVoices; ++i) voices_[i].active = false;
      }
    } break;
    case EVT_NOTE_OFF:
      for (auto& v : voices_) {
        if (v.active && v.note == e.a) v.env.noteOff();
      }
      break;
    case EVT_ALL_NOTES_OFF:
      for (auto& v : voices_) {
        if (v.active) v.env.noteOff();
      }
      break;
    case EVT_DRUM_HIT:
      if (drumsEnabled_) drum_.trigger(e.a, e.b);
      break;
    case EVT_ALL_DRUMS_OFF:
      drum_.allOff();
      break;
    default:
      break;
  }
}

void SynthEngine::applyFilterConfig(const SynthParams& p) {
  if (!filterDirty_ &&
      lastFilterType_ == p.filterType &&
      fabsf(lastCutoffHz_ - p.cutoffHz) < 0.5f &&
      fabsf(lastResonance_ - p.resonance) < 0.01f) {
    return;
  }

  switch (p.filterType) {
    case SYNTH_FILTER_LOWPASS:
      filterL_.setLowpass(static_cast<float>(sampleRate_), p.cutoffHz, p.resonance);
      filterR_.setLowpass(static_cast<float>(sampleRate_), p.cutoffHz, p.resonance);
      break;
    case SYNTH_FILTER_HIGHPASS:
      filterL_.setHighpass(static_cast<float>(sampleRate_), p.cutoffHz, p.resonance);
      filterR_.setHighpass(static_cast<float>(sampleRate_), p.cutoffHz, p.resonance);
      break;
    case SYNTH_FILTER_BANDPASS:
    default:
      filterL_.setBandpass(static_cast<float>(sampleRate_), p.cutoffHz, p.resonance);
      filterR_.setBandpass(static_cast<float>(sampleRate_), p.cutoffHz, p.resonance);
      break;
  }
  lastFilterType_ = p.filterType;
  lastCutoffHz_ = p.cutoffHz;
  lastResonance_ = p.resonance;
  filterDirty_ = false;
}

void SynthEngine::renderBlock(const SynthParams& p) {
  applyFilterConfig(p);

  const uint32_t delaySamples = static_cast<uint32_t>(
      constrain(static_cast<int>((p.delayMs * static_cast<float>(sampleRate_)) / 1000.0f), 1, static_cast<int>(kMaxDelaySamples - 1)));

  Voice* activeList[kMaxVoices];
  float incA[kMaxVoices];
  float incB[kMaxVoices];
  uint8_t activeTarget = 0;
  for (uint8_t vIdx = 0; vIdx < kMaxVoices; ++vIdx) {
    Voice& v = voices_[vIdx];
    if (!v.active) continue;
    if (activeTarget >= p.maxVoices) {
      v.env.noteOff();
      continue;
    }

    const float noteHz = dsp::midiToHz(v.note);
    const float lowNoteScale = dsp::clampf((static_cast<float>(v.note) - 24.0f) / 60.0f, 0.35f, 1.0f);
    const float detune = p.detuneCents * lowNoteScale;
    const float detuneRatio = powf(2.0f, detune / 1200.0f);

    activeList[activeTarget] = &v;
    incA[activeTarget] = noteHz / static_cast<float>(sampleRate_);
    incB[activeTarget] = (noteHz * detuneRatio) / static_cast<float>(sampleRate_);
    activeTarget++;
  }

  for (uint16_t i = 0; i < blockSize_; ++i) {
    float synthSum = 0.0f;
    uint8_t activeVoicesNow = 0;

    for (uint8_t vi = 0; vi < activeTarget; ++vi) {
      Voice& v = *activeList[vi];
      if (!v.active) continue;
      const float env = v.env.process();
      if (!v.env.active() && env <= 0.00001f) {
        v.active = false;
        continue;
      }
      activeVoicesNow++;

      v.phaseA += incA[vi];
      if (v.phaseA >= 1.0f) v.phaseA -= 1.0f;
      v.phaseB += incB[vi];
      if (v.phaseB >= 1.0f) v.phaseB -= 1.0f;

      const float a = osc(p.waveA, v.phaseA);
      const float b = osc(p.waveB, v.phaseB);
      const float s = ((1.0f - p.oscMix) * a + p.oscMix * b) * env * v.vel;
      synthSum += s;
    }

    const float polyGain = activeVoicesNow > 0 ? (0.25f / sqrtf(static_cast<float>(activeVoicesNow))) : 0.0f;
    float mono = synthSum * polyGain * p.gainTrim;

    const float driveGain = 1.0f + p.distDrive * 5.5f;
    mono = dsp::fastTanh(mono * driveGain) / driveGain;

    float synthL = filterL_.process(mono);
    float synthR = filterR_.process(mono);

    float drumL = 0.0f;
    float drumR = 0.0f;
    if (drumsEnabled_) drum_.render(drumL, drumR);

    float mixL = synthL + drumL;
    float mixR = synthR + drumR;

    const uint32_t readPos = (delayPos_ + kMaxDelaySamples - delaySamples) % kMaxDelaySamples;
    const float d = static_cast<float>(delay_[readPos]) / 127.0f;

    const float writeL = dsp::clampf(mixL + d * p.delayFeedback, -1.0f, 1.0f);
    const float writeR = dsp::clampf(mixR + d * p.delayFeedback, -1.0f, 1.0f);
    const float writeMono = 0.5f * (writeL + writeR);
    delay_[delayPos_] = static_cast<int8_t>(writeMono * 127.0f);

    mixL = mixL * (1.0f - p.delayMix) + d * p.delayMix;
    mixR = mixR * (1.0f - p.delayMix) + d * p.delayMix;

    delayPos_++;
    if (delayPos_ >= kMaxDelaySamples) delayPos_ = 0;

    revMemL_ = revMemL_ * 0.974f + mixL * 0.026f;
    revMemR_ = revMemR_ * 0.972f + mixR * 0.028f;
    const float revL = revMemL_ * 0.62f + revMemR_ * 0.15f;
    const float revR = revMemR_ * 0.62f + revMemL_ * 0.15f;

    mixL += revL * p.reverb;
    mixR += revR * p.reverb;

    mixL *= p.master;
    mixR *= p.master;

    mixL = dcL_.process(mixL);
    mixR = dcR_.process(mixR);

    mixL = dsp::fastTanh(mixL * 1.6f) / 1.6f;
    mixR = dsp::fastTanh(mixR * 1.6f) / 1.6f;

    if (fadeValue_ < fadeTarget_) {
      fadeValue_ += fadeStep_;
      if (fadeValue_ > fadeTarget_) fadeValue_ = fadeTarget_;
    } else if (fadeValue_ > fadeTarget_) {
      fadeValue_ -= fadeStep_;
      if (fadeValue_ < fadeTarget_) fadeValue_ = fadeTarget_;
    }

    mixL *= fadeValue_;
    mixR *= fadeValue_;

    const float outL = dsp::clampf(mixL, -1.0f, 1.0f);
    const float outR = dsp::clampf(mixR, -1.0f, 1.0f);

    i2sBlock_[i * 2] = static_cast<int16_t>(outL * 32767.0f);
    i2sBlock_[i * 2 + 1] = static_cast<int16_t>(outR * 32767.0f);
  }
}

void SynthEngine::audioTask() {
  while (running_) {
    SynthParams p;
    portENTER_CRITICAL(&paramMux_);
    p = paramsSlots_[activeParamSlot_];
    portEXIT_CRITICAL(&paramMux_);

    Event e;
    while (popEvent(e)) handleEvent(e, p);

    renderBlock(p);

    size_t bytesWritten = 0;
    const size_t bytes = static_cast<size_t>(blockSize_) * 2u * sizeof(int16_t);
    const esp_err_t err = i2s_write(i2sPort_, i2sBlock_, bytes, &bytesWritten, 20 / portTICK_PERIOD_MS);
    if (err != ESP_OK || bytesWritten != bytes) {
      portENTER_CRITICAL(&eventMux_);
      underruns_++;
      portEXIT_CRITICAL(&eventMux_);
    }
    taskYIELD();
  }

  taskAlive_ = false;
}

}  // namespace beca
