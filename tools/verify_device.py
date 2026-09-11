"""Serial smoke checks. --exercise-audio temporarily changes AUX settings and restores them."""
import argparse
import json
import time
import serial

parser = argparse.ArgumentParser()
parser.add_argument("port")
parser.add_argument("--exercise-audio", action="store_true")
parser.add_argument("--exercise-live-presets", action="store_true")
args = parser.parse_args()
port = serial.Serial()
port.port, port.baudrate, port.timeout = args.port, 115200, 0.1
port.dtr = port.rts = False
port.open()
errors = []

def command(value, timeout=4):
    tag = value.split(" ")[0]
    port.write(("@C " + value + "\n").encode())
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        line = port.readline().decode("utf-8", "replace").strip()
        if line.startswith("@E") or "Guru Meditation" in line:
            errors.append(line)
        if line.startswith("@R " + tag + " "):
            result = json.loads(line.split(" ", 2)[2])
            if result.get("ok") in (0, False):
                raise RuntimeError(f"{tag}: {result.get('err', result.get('msg', 'rejected'))}")
            return result
    raise TimeoutError(f"No {tag} response")

try:
    command("PING")
    params, saved, state = command("PARAMS"), command("SYNTH"), command("STATE")
    assert len(params["synth_presets"]) == 13
    readings = []
    times = []
    for _ in range(40):
        start = time.monotonic()
        p = command("PLANT")
        times.append((time.monotonic() - start) * 1000)
        assert 0 <= p["value"] <= 1 and 0 <= p["raw"] <= 4095 and 0 <= p["raw2"] <= 4095
        readings.append(p)
        time.sleep(0.05)
    assert readings[-1]["ts"] > readings[0]["ts"]
    print(json.dumps({"presets": len(params["synth_presets"]), "plant_samples": len(readings),
      "raw_range": [min(p["raw"] for p in readings), max(p["raw"] for p in readings)],
      "energy_range": [min(p["value"] for p in readings), max(p["value"] for p in readings)],
      "serial_response_ms_max": round(max(times), 1)}))
    if args.exercise_audio or args.exercise_live_presets:
        try:
            command("SET mute 1")
            if args.exercise_live_presets:
                assert params.get("live_preset") is True
                for level in [0, 0.17, 1]:
                    command(f"SET master {level}")
                    for preset in range(13):
                        command(f"SET preset_live {preset}")
                        current = command("SYNTH")
                        assert current["preset"] == preset and abs(current["master"] - level) < 0.001
                print("PASS: live preset command preserves zero/0.17/full master across all 13 presets (outputs muted)")
            if args.exercise_audio:
                command("SET outputmode 2")
                for preset in range(6, 13):
                    command(f"SET preset {preset}")
                    command("SET master 0.04")
                    command("SET mute 0")
                    assert command("SYNTH")["preset"] == preset
                    command("SYNTH_TEST")
                    time.sleep(2.2)
                    command("PING")
                    command("SET mute 1")
                print("PASS: all seven added presets selected; AUX test/start/mute responded")
        finally:
            command("SET mute 1")
            command(f"SET preset {saved['preset']}")
            for key, value in saved.items():
                if key not in {"preset", "preset_name", "note_length_idx", "note_length"}:
                    command(f"SET {key} {value}")
            command(f"SET mode {state['mode']}")
            command(f"SET outputmode {state['outputmode']}")
            command(f"SET mute {state['io_muted']}")
            print("Restored original synth, playing mode, output and mute settings")
    assert not errors, errors
    print("PASS: serial protocol and bounded live plant readings; no captured firmware errors")
finally:
    port.close()
