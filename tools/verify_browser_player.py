"""Verify the real embedded browser assets, MIDI stream and legacy SSE over Wi-Fi.

Run on the laptop: python tools/verify_browser_player.py COM5 --host DEVICE_IP.
--portal temporarily opens BECA setup Wi-Fi and switches a Windows laptop to it,
then restores the original laptop network and restarts BECA onto its saved network.
Saved device Wi-Fi credentials are never changed. Close apps owning USB first.
"""
import argparse
import collections
import gzip
import json
from pathlib import Path
import subprocess
import socket
import time
import urllib.request
from xml.sax.saxutils import escape

from verify_wifi_midi import Control, require

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('port')
parser.add_argument('--host')
parser.add_argument('--portal', action='store_true')
parser.add_argument('--network-profile', help='Original Windows Wi-Fi profile; required with --portal')
parser.add_argument('--browser-node', help='Node executable to run real browser audio verification')
parser.add_argument('--seconds', type=float, default=5)
parser.add_argument('--report', type=Path, default=ROOT / '.beca-cache/browser-device-tests/http-report.json')
args = parser.parse_args()
require(not args.portal or args.network_profile, '--portal requires the original --network-profile')
ctrl = Control(args.port)
http = urllib.request.build_opener(urllib.request.ProxyHandler({}))
netsh = r'C:\Windows\System32\netsh.exe'
profile_name = 'BECA-browser-verification'
report = {}
portal_started = False
saved = None

def wlan(*parts):
    result = subprocess.run([netsh, 'wlan', *parts], capture_output=True, text=True)
    require(result.returncode == 0, 'Wi-Fi command failed: ' + result.stdout + result.stderr)
    return result.stdout

def get(path, timeout=4):
    with http.open(f'http://{args.host}{path}', timeout=timeout) as response:
        data = response.read()
        if response.headers.get('Content-Encoding') == 'gzip': data = gzip.decompress(data)
        return data, response

def json_get(path):
    data, response = get(path)
    require(response.status == 200, f'{path}: HTTP {response.status}')
    return json.loads(data)

try:
    ctrl.command('PING', timeout=30)
    saved = ctrl.command('STATE')
    report['initial_mode_mute'] = [saved['mode'], saved['io_muted']]
    info = ctrl.command('WIFI_INFO')
    require(info.get('browser_midi') is True, 'Browser MIDI capability missing')
    if args.portal:
        portal_started = True
        ctrl.command('WIFI_PORTAL', timeout=15)
        args.host = '192.168.4.1'
        ssid = 'BECA-' + info['sta_mac'].replace(':', '')[-4:]
        args.report.parent.mkdir(parents=True, exist_ok=True)
        profile_file = args.report.parent / 'test-wifi-profile.xml'
        profile_file.write_text(f'''<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1"><name>{profile_name}</name>
<SSIDConfig><SSID><name>{escape(ssid)}</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>manual</connectionMode>
<MSM><security><authEncryption><authentication>open</authentication><encryption>none</encryption><useOneX>false</useOneX></authEncryption></security></MSM></WLANProfile>''')
        wlan('add', 'profile', f'filename={profile_file}')
        wlan('connect', f'name={profile_name}')
        deadline = time.monotonic() + 45
        while True:
            try:
                live_info = json_get('/api/info')
                require(live_info['sta_mac'] == info['sta_mac'], 'Wrong device on test Wi-Fi')
                break
            except Exception:
                if time.monotonic() >= deadline: raise
                time.sleep(.5)
    require(args.host, 'Supply --host or --portal')
    ctrl.command('SET mute 0')
    if args.browser_node:
        result = subprocess.run([args.browser_node, str(ROOT / 'apps/beca-phone/scripts/verify-device.mjs'), f'http://{args.host}/play/', str(args.report.parent)], capture_output=True, text=True, timeout=90)
        require(result.returncode == 0, 'Real browser verification failed: ' + result.stdout + result.stderr)
        report['browser'] = json.loads((args.report.parent / 'browser-report.json').read_text())
    player, response = get('/play/')
    require(b'wifi-provider.js' in get('/play/app.js')[0], 'Device player lacks Wi-Fi transport')
    require(b'Listen on this device' in player, 'Missing browser playback control')
    matched = []
    report['embedded_assets'] = matched
    for source in sorted((ROOT / 'apps/beca-phone/dist').rglob('*')):
        if source.is_file() and not source.name.startswith('.'):
            relative = source.relative_to(ROOT / 'apps/beca-phone/dist').as_posix()
            print('Checking embedded asset ' + relative, flush=True)
            data, response = get('/play/' + relative, timeout=8)
            require(data == source.read_bytes(), f'Stale/corrupted embedded asset: {relative}')
            matched.append(relative)
    require(b'device-wifi-mac' in get('/control')[0], 'Legacy controller missing')
    require(b'ssidManual' in get('/setup')[0], 'Wi-Fi recovery page missing')
    report['embedded_assets'] = matched
    report['legacy_pages'] = 'pass'
    idle_before = json_get('/api/info').get('http_idle_closed', 0)
    with socket.create_connection((args.host, 80), timeout=4) as idle:
        time.sleep(.04)
        tick = time.monotonic()
        ready = json_get('/api/info')
        delay = time.monotonic() - tick
        require(delay < 1.2, 'An empty TCP preconnection blocked the note/control API')
        require(ready.get('http_idle_closed', 0) > idle_before, 'Idle connection guard did not run')
        report['idle_preconnection_api_seconds'] = round(delay, 3)
    report['host'] = args.host
    report['sta_mac'] = info['sta_mac']

    # Read source events rather than synthesizing test notes from UI snapshots.
    ctrl.command('SET outputmode 0')
    ctrl.command('SET sync 0')
    ctrl.command('SET clock 0')
    ctrl.command('SET drumsel 255')
    ctrl.command('SET mute 0')
    modes = []
    for mode in range(4):
        ctrl.command(f'SET mode {mode}')
        start = time.monotonic()
        seq = None
        events = []
        polls = 0
        while time.monotonic() - start < args.seconds:
            tick = time.monotonic()
            batch = json_get('/api/midi' + ('' if seq is None else f'?after={seq}'))
            require(not batch['lost'], 'MIDI event loss during normal polling')
            require(len(batch['events']) <= 64, 'Unbounded MIDI batch')
            for event in batch['events']:
                require(len(event) == 5, 'Missing source MIDI timestamp')
                number, status, data1, data2, timestamp = event
                if seq is not None: require(number == ((seq + 1) & 0xffffffff), 'MIDI sequence gap')
                require(128 <= status <= 239 and 0 <= data1 <= 127 and 0 <= data2 <= 127, 'Invalid MIDI bytes')
                require(0 <= timestamp <= 0xffffffff, 'Invalid MIDI timestamp')
                events.append(event)
                seq = number
            seq = batch['next']
            polls += 1
            time.sleep(max(0, .04 - (time.monotonic() - tick)))
        on = [e for e in events if e[1] & 0xf0 == 0x90 and e[3]]
        off = [e for e in events if e[1] & 0xf0 == 0x80 or e[1] & 0xf0 == 0x90 and not e[3]]
        require(on and off, f'No real note-on/off in mode {mode}; check the plant/input/clock')
        require(all((e[1] & 15) == (9 if mode == 3 else 0) for e in on), 'Wrong mode MIDI channel')
        modes.append({'mode': mode, 'polls': polls, 'note_on': len(on), 'note_off': len(off), 'events': len(events)})
    report['midi_modes'] = modes
    # Existing single-client SSE still carries bounded live scope/state updates.
    counter = collections.Counter()
    with http.open(f'http://{args.host}/events', timeout=4) as response:
        until = time.monotonic() + 4
        while time.monotonic() < until:
            line = response.readline().decode('utf8', 'replace').strip()
            if line.startswith('event:'): counter[line.split(':', 1)[1].strip()] += 1
    require(counter['scope'] > 2, 'SSE scope stopped')
    require(counter['scope'] <= 140, 'SSE event flooding')
    report['sse_events_4s'] = dict(counter)
    require(not ctrl.errors, 'Captured firmware errors: ' + '; '.join(ctrl.errors))
    report['result'] = 'pass'
except Exception as exc:
    report['failure'] = str(exc)
    try: report['device_at_failure'] = ctrl.command('WIFI_INFO')
    except Exception: pass
    if args.portal:
        try: report['laptop_network_at_failure'] = wlan('show', 'interfaces')
        except Exception: pass
        try: report['laptop_ip_at_failure'] = subprocess.check_output([r'C:\Windows\System32\ipconfig.exe'], text=True)
        except Exception: pass
    raise
finally:
    if saved:
        for key, value in [('mute', 1), ('mode', saved['mode']), ('drumsel', saved['drumsel']), ('clock', saved['clock']), ('sync', saved['daw_sync']), ('outputmode', saved['outputmode']), ('mute', saved['io_muted'])]:
            try: ctrl.command(f'SET {key} {value}')
            except Exception as exc: report.setdefault('restore_errors', []).append(str(exc))
        # Let the existing settings debounce persist the restored user state before restarting.
        time.sleep(8)
    if portal_started:
        try: ctrl.command('REBOOT')
        except Exception as exc: report.setdefault('restore_errors', []).append(str(exc))
        try: wlan('connect', f'name={args.network_profile}')
        except Exception as exc: report.setdefault('restore_errors', []).append(str(exc))
        try: wlan('delete', 'profile', f'name={profile_name}')
        except Exception as exc: report.setdefault('restore_errors', []).append(str(exc))
    ctrl.port.close()
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2))
    print(json.dumps(report))
    require(not report.get('restore_errors'), 'Settings/network restoration failed')
