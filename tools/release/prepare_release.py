"""Build a complete ESP32 image and stage the same firmware in every installer."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]


def prepare(version, tag, packages):
    build = ROOT / '.pio/build/esp32dev'
    output = ROOT / 'dist/firmware-release'
    output.mkdir(parents=True, exist_ok=True)
    boot_app = Path(packages) / 'framework-arduinoespressif32/tools/partitions/boot_app0.bin'
    if not boot_app.is_file():
        raise SystemExit(f'Missing pinned Arduino boot data: {boot_app}')
    image = output / f'beca-{version}-merged.bin'
    subprocess.run([sys.executable, '-m', 'esptool', '--chip', 'esp32', 'merge_bin',
                    '-o', str(image), '--flash_mode', 'dio', '--flash_freq', '40m', '--flash_size', '4MB',
                    '0x1000', str(build / 'bootloader.bin'), '0x8000', str(build / 'partitions.bin'),
                    '0xe000', str(boot_app), '0x10000', str(build / 'firmware.bin')], check=True)
    data = image.read_bytes()
    assert data[0x1000] == data[0x10000] == 0xe9, 'Missing bootloader/application'
    assert data[0xe000:0x10000] == boot_app.read_bytes(), 'Missing first-boot data'
    manifest = output / 'firmware-manifest.json'
    subprocess.run([sys.executable, str(ROOT / 'tools/release/generate_firmware_manifest.py'),
                    '--repo', 'fattyrecordingco/BECAfirmware', '--version', version, '--tag', tag,
                    '--channel', 'stable', '--hardware', 'ESP32-PICO-V3', '--asset-name', image.name,
                    '--sha256', hashlib.sha256(data).hexdigest(), '--output', str(manifest)], check=True)
    bundle = ROOT / 'apps/beca-setup/src-tauri/resources/firmware'
    bundle.mkdir(parents=True, exist_ok=True)
    shutil.copy2(image, bundle / 'beca-merged.bin')
    shutil.copy2(manifest, bundle / manifest.name)
    print(f'Staged firmware {version} ({len(data)} bytes) in installer resources.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--version', default='1.1.0')
    parser.add_argument('--tag', default='setup-v0.2.0')
    parser.add_argument('--packages', default=os.environ.get('PLATFORMIO_PACKAGES_DIR', str(Path.home() / '.platformio/packages')))
    args = parser.parse_args()
    prepare(args.version, args.tag, args.packages)
