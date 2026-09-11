#pragma once
#include <stdint.h>
namespace beca {
inline uint32_t swungStepMs(uint32_t base, uint8_t percent, bool longStep) {
  const uint32_t offset = (base * (percent > 60 ? 60 : percent)) / 100u;
  return longStep ? base + offset : base - offset;
}
}
