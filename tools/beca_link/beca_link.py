#!/usr/bin/env python3
"""
BECA Link: bridge BECA serial MIDI packets into a DAW-visible MIDI port.

Firmware packet format:
  @M <status_hex> <data1_hex> <data2_hex>
Example:
  @M 90 3C 64
"""

from __future__ import annotations

import argparse
import platform
import signal
import sys
import time
from typing import Optional

import mido
import serial
from serial.tools import list_ports


RUNNING = True


def _stop_handler(_sig, _frame) -> None:
    global RUNNING
    RUNNING = False


def log(msg: str) -> None:
    try:
        print(msg, flush=True)
    except OSError:
        # If stdout is not available (detached console), continue running.
        pass


def list_serial_ports() -> None:
    ports = list(list_ports.comports())
    if not ports:
        log("No serial ports found.")
        return
    log("Available serial ports:")
    for p in ports:
        log(f"  {p.device:12}  {p.description}")


def list_midi_ports() -> tuple[list[str], list[str]]:
    outs = mido.get_output_names()
    ins = mido.get_input_names()
    log(f"MIDI outputs: {outs if outs else '[]'}")
    log(f"MIDI inputs : {ins if ins else '[]'}")
    return outs, ins


def _find_existing_output_port(target_name: str) -> Optional[str]:
    available = mido.get_output_names()
    if not available:
        return None

    if target_name.strip().lower() == "auto":
        # Prefer loopback drivers, avoid MS wavetable synth.
        preferred_keys = ["beca serial midi", "loopmidi", "loopbe", "internal midi"]
        for key in preferred_keys:
            for item in available:
                if key in item.lower():
                    return item
        for item in available:
            if "microsoft gs wavetable" not in item.lower():
                return item
        return available[0]

    target_l = target_name.lower()

    for item in available:
        if item.lower() == target_l:
            return item
    for item in available:
        if target_l in item.lower():
            return item
    return None


def auto_pick_port() -> Optional[str]:
    ports = list(list_ports.comports())
    if not ports:
        return None

    scored = []
    for p in ports:
        s = f"{p.device} {p.description} {p.manufacturer or ''}".lower()
        score = 0
        if "beca" in s:
            score += 10
        if "usb" in s:
            score += 4
        if "serial" in s:
            score += 4
        if "cp210" in s or "ch340" in s or "ftdi" in s or "uart" in s:
            score += 3
        scored.append((score, p.device))

    scored.sort(reverse=True)
    if scored and scored[0][0] > 0:
        return scored[0][1]
    return ports[0].device


def parse_beca_midi(line: str) -> Optional[mido.Message]:
    if not line.startswith("@M "):
        return None
    parts = line.strip().split()
    if len(parts) != 4:
        return None
    try:
        status = int(parts[1], 16) & 0xFF
        d1 = int(parts[2], 16) & 0x7F
        d2 = int(parts[3], 16) & 0x7F
    except ValueError:
        return None

    msg_type = status & 0xF0
    channel = status & 0x0F

    if msg_type == 0x80:
        return mido.Message("note_off", channel=channel, note=d1, velocity=d2)
    if msg_type == 0x90:
        if d2 == 0:
            return mido.Message("note_off", channel=channel, note=d1, velocity=0)
        return mido.Message("note_on", channel=channel, note=d1, velocity=d2)
    if msg_type == 0xA0:
        return mido.Message("polytouch", channel=channel, note=d1, value=d2)
    if msg_type == 0xB0:
        return mido.Message("control_change", channel=channel, control=d1, value=d2)
    if msg_type == 0xC0:
        return mido.Message("program_change", channel=channel, program=d1)
    if msg_type == 0xD0:
        return mido.Message("aftertouch", channel=channel, value=d1)
    if msg_type == 0xE0:
        pitch = ((d2 << 7) | d1) - 8192
        return mido.Message("pitchwheel", channel=channel, pitch=pitch)
    return None


def open_midi_port(name: str) -> tuple[mido.ports.BaseOutput, bool]:
    is_windows = platform.system().lower().startswith("win")

    # On Windows WinMM backend, virtual MIDI ports are not supported.
    # So we must open an existing loopback MIDI output (loopMIDI/LoopBe/etc).
    if is_windows:
        existing = _find_existing_output_port(name)
        if existing:
            return mido.open_output(existing), False
        available = mido.get_output_names()
        raise RuntimeError(
            "MIDI output port not found.\n"
            f"Requested: '{name}'\n"
            f"Available outputs: {available}\n"
            "Create/enable a loopback output (for example loopMIDI port named "
            f"'{name}') and restart this bridge."
        )

    try:
        out = mido.open_output(name, virtual=True)
        return out, True
    except Exception:
        existing = _find_existing_output_port(name)
        if existing:
            return mido.open_output(existing), False
        available = mido.get_output_names()
        raise RuntimeError(
            "Could not create/find MIDI output port.\n"
            f"Requested: '{name}'\n"
            f"Available outputs: {available}"
        )


def run(args: argparse.Namespace) -> int:
    signal.signal(signal.SIGINT, _stop_handler)
    signal.signal(signal.SIGTERM, _stop_handler)

    try:
        midi_out, virtual_ok = open_midi_port(args.midi_port)
    except RuntimeError as exc:
        log(str(exc))
        log("Tip: run with --midi-list to see what Python can see right now.")
        return 2

    mode = "virtual" if virtual_ok else "existing"
    out_name = getattr(midi_out, "name", args.midi_port)
    log(f"MIDI output ready ({mode}): {out_name}")

    serial_port = args.port
    ser = None
    sent = 0
    last_report = time.time()
    open_fail_count = 0

    while RUNNING:
        if ser is None:
            pick = serial_port or auto_pick_port()
            if not pick:
                log("Waiting for BECA serial port...")
                time.sleep(args.retry_seconds)
                continue
            try:
                ser = serial.Serial(pick, args.baud, timeout=0.25)
                open_fail_count = 0
                log(f"Serial connected: {pick} @ {args.baud}")
                serial_port = pick
            except serial.SerialException as exc:
                open_fail_count += 1
                log(f"Serial open failed on {pick}: {exc}")
                if "Access is denied" in str(exc):
                    if open_fail_count in (1, 3, 6):
                        log("Hint: COM port is busy. Close Arduino/PlatformIO serial monitor, "
                            "other bridge windows, and any terminal app using this COM port.")
                time.sleep(args.retry_seconds)
                continue

        try:
            raw = ser.readline()
        except serial.SerialException as exc:
            log(f"Serial error: {exc}")
            try:
                ser.close()
            except Exception:
                pass
            ser = None
            time.sleep(args.retry_seconds)
            continue

        if not raw:
            continue

        line = raw.decode("ascii", errors="ignore").strip()
        if not line:
            continue

        if line.startswith("@I "):
            log(f"[BECA] {line[3:]}")
            continue

        msg = parse_beca_midi(line)
        if msg is None:
            continue

        midi_out.send(msg)
        sent += 1

        now = time.time()
        if now - last_report >= 5.0:
            log(f"Bridge running. Sent {sent} MIDI messages.")
            last_report = now

    log("Stopping BECA Link...")
    if ser is not None:
        try:
            ser.close()
        except Exception:
            pass
    midi_out.close()
    return 0


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="BECA serial-to-MIDI bridge")
    p.add_argument("--port", default="", help="Serial port (example: COM5 or /dev/ttyUSB0). Leave empty for auto.")
    p.add_argument("--baud", type=int, default=115200, help="Serial baud rate (default: 115200).")
    p.add_argument("--midi-port", default="auto", help="Virtual/existing MIDI port name or 'auto'.")
    p.add_argument("--retry-seconds", type=float, default=2.0, help="Reconnect retry interval.")
    p.add_argument("--list", action="store_true", help="List serial ports and exit.")
    p.add_argument("--midi-list", action="store_true", help="List MIDI input/output ports and exit.")
    return p


def main() -> int:
    parser = build_arg_parser()
    args = parser.parse_args()
    if args.list:
        list_serial_ports()
        return 0
    if args.midi_list:
        list_midi_ports()
        return 0
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
