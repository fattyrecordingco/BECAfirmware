"""Publish only the complete, version-matched installers and documented firmware."""
from pathlib import Path
import hashlib
import shutil

root = Path(__file__).resolve().parents[2]
output = root / 'dist/publish'
output.mkdir(parents=True, exist_ok=True)
expected = {
    'BECA_0.2.0_x64-setup.exe', 'BECA_0.2.0_x64_en-US.msi',
    'BECA_0.2.0_aarch64.dmg', 'BECA_0.2.0_x64.dmg',
    'BECA_0.2.0_amd64.AppImage', 'BECA_0.2.0_amd64.deb',
}
found = {}
for path in (root / 'dist/installers').rglob('*'):
    if path.is_file() and path.name in expected:
        if path.name in found:
            raise SystemExit(f'Duplicate installer: {path.name}')
        found[path.name] = path
if set(found) != expected:
    raise SystemExit(f'Missing installers: {expected - set(found)}')
for path in found.values():
    shutil.copy2(path, output / path.name)
for path in (root / 'dist/firmware-release').iterdir():
    if path.suffix in {'.bin', '.json'}:
        shutil.copy2(path, output / path.name)
for name in ['BECA_MANUAL.md', 'BECA_MANUAL.html']:
    shutil.copy2(root / 'docs/user' / name, output / name)
sums = [f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}' for p in sorted(output.iterdir()) if p.is_file() and p.name != 'SHA256SUMS']
(output / 'SHA256SUMS').write_text('\n'.join(sums) + '\n', encoding='utf-8')
print('\n'.join(sorted(found)))
