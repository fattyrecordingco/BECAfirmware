"""Check WAVs recorded by the local Live QA device, using only Python stdlib."""
from pathlib import Path
import array
import json
import math
import sys
import wave

root = Path(__file__).resolve().parents[3]
folder = root / '.beca-cache/instrument-audio'
report = []
for number in range(14):
    with wave.open(str(folder / f'preset-{number}.wav'), 'rb') as wav:
        assert wav.getnchannels() == 2 and wav.getsampwidth() == 2
        rate = wav.getframerate()
        samples = array.array('h', wav.readframes(wav.getnframes()))
        if sys.byteorder != 'little':
            samples.byteswap()
    left = [x / 32768 for x in samples[::2]]
    assert len(left) > rate * 2.5, f'Short recording: {number}'
    peak = max(abs(x) for x in samples) / 32768
    rms = math.sqrt(sum(x*x for x in left) / len(left))
    if number < 13:
        assert rms > 0.0001 and peak < .99, f'Silent/clipped preset {number}'
    else:
        assert peak < .0001, f'Raw mode without a sensor must be silent: {peak}'
    row = dict(preset=number, seconds=round(len(left)/rate, 3), peak=round(peak, 5), rms=round(rms, 5))
    if number == 12:
        body = left[int(rate*.4):int(rate*1.7)]
        frequency = sum(a <= 0 < b for a, b in zip(body, body[1:])) / (len(body)/rate)
        assert abs(frequency-440) < 2, f'Incorrect raw oscillator: {frequency}'
        row['frequency_hz'] = round(frequency, 2)
    report.append(row)
(folder/'results.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report, indent=2))
print('PASS: 12 pitched presets, 440 Hz raw sine, and disconnected raw silence')
