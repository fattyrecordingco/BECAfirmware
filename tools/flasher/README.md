# beca-flasher

Firmware manifest + checksum + flash wrapper.

## Commands

```bash
beca-flasher detect
beca-flasher manifest --repo fattyrecordingco/BECAfirmware
beca-flasher flash --repo fattyrecordingco/BECAfirmware --port COM5 --firmware latest-stable
beca-flasher backup-nvs --port COM5 --output nvs.bin --tool-path ./esptool.exe
beca-flasher restore-nvs --port COM5 --backup nvs.bin --tool-path ./esptool.exe
```

## Manifest

At least one recent published release must include `firmware-manifest.json` with firmware URLs + SHA256 checksums.
