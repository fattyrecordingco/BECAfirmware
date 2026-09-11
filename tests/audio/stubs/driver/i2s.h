#pragma once
#include <cstddef>
using i2s_port_t = int;
using i2s_mode_t = int;
using esp_err_t = int;
constexpr int I2S_NUM_0 = 0, I2S_MODE_MASTER = 1, I2S_MODE_TX = 2;
constexpr int I2S_BITS_PER_SAMPLE_16BIT = 16, I2S_CHANNEL_FMT_RIGHT_LEFT = 0;
constexpr int I2S_COMM_FORMAT_STAND_I2S = 0, ESP_INTR_FLAG_LEVEL1 = 0;
constexpr int I2S_PIN_NO_CHANGE = -1, ESP_OK = 0;
struct i2s_config_t {
  int mode, sample_rate, bits_per_sample, channel_format, communication_format;
  int intr_alloc_flags, dma_buf_count, dma_buf_len;
  bool use_apll, tx_desc_auto_clear;
  int fixed_mclk;
};
struct i2s_pin_config_t { int bck_io_num, ws_io_num, data_out_num, data_in_num; };
inline int i2s_driver_install(int, const i2s_config_t*, int, void*) { return 0; }
inline int i2s_set_pin(int, const i2s_pin_config_t*) { return 0; }
inline void i2s_driver_uninstall(int) {}
inline void i2s_zero_dma_buffer(int) {}
inline void i2s_stop(int) {}
inline int i2s_write(int, const void*, size_t count, size_t* written, int) { *written = count; return 0; }
