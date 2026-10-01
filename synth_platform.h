#pragma once

#ifdef BECA_WEB_AUDIO
#include <stdint.h>
#include <stddef.h>
#include <algorithm>
using std::min;
using std::max;
template <typename T, typename L, typename H> T constrain(T value, L low, H high) {
  return value < low ? low : value > high ? high : value;
}
using TaskHandle_t = void*;
using portMUX_TYPE = int;
using i2s_port_t = int;
static constexpr int I2S_NUM_0 = 0;
#define portMUX_INITIALIZER_UNLOCKED 0
#define portENTER_CRITICAL(lock) ((void)0)
#define portEXIT_CRITICAL(lock) ((void)0)
extern uint32_t becaWebMillis;
inline uint32_t millis() { return becaWebMillis; }
#else
#include <Arduino.h>
#endif
