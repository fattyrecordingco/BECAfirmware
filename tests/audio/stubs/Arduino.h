#pragma once
#include <cstdint>
#include <cstddef>
#include <algorithm>
using TaskHandle_t = void*;
using BaseType_t = int;
using portMUX_TYPE = int;
#define portMUX_INITIALIZER_UNLOCKED 0
#define portENTER_CRITICAL(x) ((void)0)
#define portEXIT_CRITICAL(x) ((void)0)
#define pdPASS 1
#define portTICK_PERIOD_MS 1
#define constrain(v, lo, hi) ((v) < (lo) ? (lo) : ((v) > (hi) ? (hi) : (v)))
inline uint32_t millis() { return 0; }
inline void delay(unsigned) {}
inline int xTaskCreatePinnedToCore(void (*)(void*), const char*, int, void*, int, void**, int) { return 0; }
inline void vTaskDelete(void*) {}
inline void taskYIELD() {}
