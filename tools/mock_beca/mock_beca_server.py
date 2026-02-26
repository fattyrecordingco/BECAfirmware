#!/usr/bin/env python3
"""Tiny mock BECA HTTP server for M4L development."""

from __future__ import annotations

import json
import math
import random
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HOST = "127.0.0.1"
PORT = 18080

_state = {
    "ver": 1,
    "ble": 1,
    "midimode": 0,
    "outputmode": 0,
    "outputname": "BLE",
    "io_muted": 0,
    "daw_sync": 0,
    "daw_lock": 0,
    "clock": 1,
    "mode": 0,
    "scale": 0,
    "root": 0,
    "bpm": 120,
    "swing": 10,
    "bright": 154,
    "sens": 0.25,
    "lo": 3,
    "hi": 6,
    "fx": 0,
    "fxname": "Pulse",
    "pal": 0,
    "palname": "Default",
    "vs": 180,
    "vi": 220,
    "rest": 0.12,
    "nr": 1,
    "aux_ready": 1,
    "aux_wait_ms": 0,
    "ts": "4/4",
    "last": "60",
    "vel": 90,
    "drumsel": 255,
}

_notes = {
    "held": 0,
    "vel": 90,
    "count": 0,
    "notes": [],
    "last": 60,
    "last_vel": 90,
    "ts": 0,
}

_synth = {
    "preset": 0,
    "preset_name": "Fatty Neon Lead",
    "wave_a": 0,
    "wave_b": 1,
    "osc_mix": 0.45,
    "mono": 1,
    "voices": 1,
    "attack": 0.06,
    "decay": 0.20,
    "sustain": 0.66,
    "release": 0.24,
    "filter": 0,
    "cutoff": 5200.0,
    "resonance": 1.7,
    "reverb": 0.12,
    "delay_ms": 115.0,
    "delay_feedback": 0.22,
    "delay_mix": 0.12,
    "drive": 0.22,
    "master": 0.60,
    "detune": 4.0,
    "gain_trim": 0.95,
    "drumkit": 0,
}

_LOCK = threading.Lock()
_START = time.time()


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _tick():
    while True:
        t = time.time() - _START
        plant = 0.5 + 0.45 * math.sin(t * 1.7)
        raw = int(900 + plant * 2500)

        with _LOCK:
            _state["ver"] += 1
            _state["vel"] = int(60 + plant * 60)
            _state["last"] = str(_notes["last"])
            _state["sens"] = round(float(_state["sens"]), 2)
            _notes["ts"] = int(time.time() * 1000)

            if random.random() < 0.12:
                note = random.randint(48, 72)
                _notes["notes"] = [note]
                _notes["count"] = 1
                _notes["held"] = 1
                _notes["vel"] = random.randint(70, 120)
                _notes["last"] = note
                _notes["last_vel"] = _notes["vel"]
            elif random.random() < 0.15:
                _notes["notes"] = []
                _notes["count"] = 0
                _notes["held"] = 0

            _state["last"] = str(_notes["last"])
            _state["vel"] = _notes["last_vel"]

            _state["_plant"] = {
                "value": round(plant, 4),
                "raw": raw,
                "raw2": raw + 25,
                "ts": int(time.time() * 1000),
            }

        time.sleep(0.04)


class Handler(BaseHTTPRequestHandler):
    server_version = "MockBECA/0.1"

    def _json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _form(self):
        length = int(self.headers.get("Content-Length", "0"))
        data = self.rfile.read(length).decode("utf-8") if length else ""
        return parse_qs(data, keep_blank_values=True)

    def do_GET(self):
        path = urlparse(self.path).path
        with _LOCK:
            if path == "/api/state":
                payload = {k: v for k, v in _state.items() if not str(k).startswith("_")}
                self._json(payload)
                return
            if path == "/api/plant":
                self._json(dict(_state.get("_plant", {})))
                return
            if path == "/api/notes":
                self._json(dict(_notes))
                return
            if path == "/api/params":
                self._json(
                    {
                        "modes": ["Notes", "Arpeggiator", "Chords", "Drum Machine"],
                        "scales": [
                            "Major",
                            "Minor",
                            "Dorian",
                            "Lydian",
                            "Mixolydian",
                            "Pent Minor",
                            "Pent Major",
                            "Harm Minor",
                            "Phrygian",
                            "Whole Tone",
                            "Maj7",
                            "Min7",
                            "Dom7",
                            "Sus2",
                            "Sus4",
                        ],
                        "time_signatures": ["4-4", "3-4", "5-4", "6-8"],
                        "synth_presets": [
                            "Fatty Neon Lead",
                            "Prism Poly Lead",
                            "Verdant Pad",
                            "Forest Choir Pad",
                            "Thick Mono Bass",
                            "Rubber Bass",
                        ],
                    }
                )
                return
            if path == "/api/synth":
                self._json(dict(_synth))
                return

        self._json({"ok": 0, "err": "not found"}, status=404)

    def do_POST(self):
        path = urlparse(self.path).path
        form = self._form()

        with _LOCK:
            if path == "/api/set":
                key = form.get("key", [""])[0]
                value = form.get("value", [""])[0]
                if not key:
                    self._json({"ok": 0, "err": "key required"}, status=400)
                    return

                if key in {"bpm", "swing", "scale", "root", "mode", "lo", "hi", "preset"}:
                    n = int(float(value))
                    if key == "bpm":
                        _state["bpm"] = _clamp(n, 20, 240)
                    elif key == "swing":
                        _state["swing"] = _clamp(n, 0, 60)
                    elif key == "scale":
                        _state["scale"] = _clamp(n, 0, 14)
                    elif key == "root":
                        _state["root"] = _clamp(n, 0, 11)
                    elif key == "mode":
                        _state["mode"] = _clamp(n, 0, 3)
                    elif key == "lo":
                        _state["lo"] = _clamp(n, 1, 9)
                    elif key == "hi":
                        _state["hi"] = _clamp(n, 1, 9)
                    elif key == "preset":
                        _synth["preset"] = _clamp(n, 0, 5)
                elif key in {"sens", "master"}:
                    f = float(value)
                    if key == "sens":
                        _state["sens"] = round(_clamp(f, 0.0, 0.5), 2)
                    elif key == "master":
                        _synth["master"] = round(_clamp(f, 0.0, 1.0), 3)
                elif key in {"mute", "io_muted"}:
                    _state["io_muted"] = 1 if str(value) in {"1", "true", "on"} else 0
                elif key in {"sync", "daw_sync"}:
                    _state["daw_sync"] = 1 if str(value) in {"1", "true", "on"} else 0
                else:
                    self._json({"ok": 0, "err": f"unknown key: {key}"}, status=400)
                    return

                self._state_snapshot_response()
                return

            if path == "/api/synth":
                for k, vals in form.items():
                    v = vals[0]
                    if k in _synth:
                        try:
                            _synth[k] = float(v) if "." in v else int(v)
                        except ValueError:
                            _synth[k] = v
                self._json(dict(_synth))
                return

        self._json({"ok": 0, "err": "not found"}, status=404)

    def _state_snapshot_response(self):
        payload = {k: v for k, v in _state.items() if not str(k).startswith("_")}
        self._json(payload)

    def log_message(self, fmt, *args):
        print("[mock-beca]", fmt % args)


def main():
    threading.Thread(target=_tick, daemon=True).start()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Mock BECA server listening on http://{HOST}:{PORT}")
    print("Endpoints: /api/state /api/plant /api/notes /api/params /api/set /api/synth")
    server.serve_forever()


if __name__ == "__main__":
    main()
