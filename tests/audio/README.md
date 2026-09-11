# Audio regression checks

These compile the real synth, drum and DSP sources against minimal host-only Arduino/I2S stubs. They verify raw-sine PCM at several frequencies and an immediate pitch change, silence/disconnect, live sustain, polyphony reduction and repeatable parameter sanitization. They do not emulate ESP32 scheduling, I2S timing, BLE or analog hardware.

From the repository root, with a C++ compiler:

```sh
g++ -std=c++17 -Itests/audio/stubs -I. tests/audio/audio_test.cpp drum_engine.cpp dsp_blocks.cpp -o audio_test
./audio_test
```

On Windows use the x64 Native Tools command prompt:

```bat
cl /nologo /EHsc /std:c++17 /Itests/audio/stubs /I. tests/audio/audio_test.cpp drum_engine.cpp dsp_blocks.cpp /Fe:audio_test.exe
audio_test.exe
```

Repeat with `-DBECA_EXTENDED_SOUNDS=0` (MSVC: `/DBECA_EXTENDED_SOUNDS=0`) to check the six-preset fallback. Keep generated binaries/objects in `.beca-cache/audio-tests`, not in source control.
