#pragma once
#include <stdint.h>
#ifndef BECA_DUAL_OUTPUT
#define BECA_DUAL_OUTPUT 1
#endif
#ifndef BECA_WIFI_MIDI
#define BECA_WIFI_MIDI 1
#endif
enum OutputMode : uint8_t { OUTPUT_BLE = 0, OUTPUT_SERIAL = 1, OUTPUT_AUX = 2, OUTPUT_SERIAL_AUX = 3, OUTPUT_WIFI = 4 };
constexpr uint8_t OUTPUT_MODE_MAX = BECA_WIFI_MIDI ? OUTPUT_WIFI : (BECA_DUAL_OUTPUT ? OUTPUT_SERIAL_AUX : OUTPUT_AUX);
constexpr bool outputModeValid(uint8_t mode) { return mode <= OUTPUT_MODE_MAX && (BECA_DUAL_OUTPUT || mode != OUTPUT_SERIAL_AUX); }
constexpr bool outputHasAux(uint8_t mode) { return mode == OUTPUT_AUX || (BECA_DUAL_OUTPUT && mode == OUTPUT_SERIAL_AUX); }
constexpr bool outputHasSerial(uint8_t mode) { return mode == OUTPUT_SERIAL || (BECA_DUAL_OUTPUT && mode == OUTPUT_SERIAL_AUX); }
