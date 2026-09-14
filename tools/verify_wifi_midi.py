"""BECA serial checks; --host also exercises a real local RTP-MIDI session.

Usage: py tools/verify_wifi_midi.py COM4 [--host 192.168.1.20]
Close other apps using the serial port and disconnect existing network MIDI sessions.
Network checks temporarily select Wi-Fi MIDI, enable sync and unmute; output,
sync and manual mute are restored even on failure. A connected plant is needed
for note generation. Add --require-notes to fail if no Note On arrives.
Uses Python standard library and pyserial. No Wi-Fi credentials are changed.
Protocol: Apple's MIDI Network Driver Protocol and local AppleMIDI 3.5.0 sources.
"""

import argparse
from collections import Counter, deque
import json
import re
import secrets
import select
import socket
import struct
import sys
import time

import serial


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


class Control:
    def __init__(self, name):
        self.port = serial.Serial()
        self.port.port, self.port.baudrate, self.port.timeout = name, 115200, 0.01
        self.port.write_timeout = 2
        self.port.dtr = self.port.rts = False
        self.port.open()
        self.buffer = bytearray()
        self.errors = []
        self.pump = lambda: None

    def lines(self):
        self.buffer.extend(self.port.read(min(4096, max(1, self.port.in_waiting))))
        while b"\n" in self.buffer:
            line, _, self.buffer = self.buffer.partition(b"\n")
            text = line.decode("utf-8", "replace").strip()
            if text.startswith("@E") or "Guru Meditation" in text:
                self.errors.append(text)
            yield text
        if len(self.buffer) > 8192:
            self.buffer.clear()

    def command(self, value, timeout=4):
        tag = value.split()[0]
        self.port.write(("@C " + value + "\n").encode("ascii"))
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            self.pump()
            for line in self.lines():
                if line.startswith("@R " + tag + " "):
                    result = json.loads(line.split(" ", 2)[2])
                    require(result.get("ok", 1) not in (0, False), f"{tag}: {result}")
                    return result
        raise TimeoutError(f"No {tag} response within {timeout}s")

    def idle(self, seconds):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            self.pump()
            for _ in self.lines():
                pass


def midi_messages(packet):
    """Decode BECA's complete channel messages; ignore the recovery journal."""
    require(len(packet) >= 13 and packet[0] >> 6 == 2, "Invalid RTP header")
    offset = 12 + (packet[0] & 15) * 4
    if packet[0] & 16:
        require(len(packet) >= offset + 4, "Truncated RTP extension")
        offset += 4 + struct.unpack_from("!H", packet, offset + 2)[0] * 4
    require(offset < len(packet), "Missing MIDI command header")
    flags = packet[offset]
    offset += 1
    length = flags & 15
    if flags & 128:
        require(offset < len(packet), "Truncated long MIDI header")
        length = (length << 8) | packet[offset]
        offset += 1
    require(offset + length <= len(packet), "Truncated MIDI command section")
    data, index, running, first = packet[offset:offset + length], 0, None, True
    while index < len(data):
        if not first or flags & 32:
            for _ in range(4):
                require(index < len(data), "Truncated MIDI delta time")
                value = data[index]
                index += 1
                if value < 128:
                    break
            else:
                raise RuntimeError("Invalid MIDI delta time")
        first = False
        require(index < len(data), "Missing MIDI command")
        status = data[index]
        if status & 128:
            index += 1
            if status < 240:
                running = status
        else:
            require(running is not None, "Missing running status")
            status = running
        if status >= 248:
            count = 0
        elif status < 240:
            count = 1 if status & 240 in (192, 208) else 2
        else:
            raise RuntimeError(f"Unexpected BECA system message 0x{status:02x}")
        require(index + count <= len(data), "Truncated MIDI message")
        values = data[index:index + count]
        require(all(value < 128 for value in values), "Invalid MIDI data byte")
        index += count
        yield (status, *values)


class Peer:
    def __init__(self, host, remote_port):
        self.host, self.remote_port = socket.gethostbyname(host), remote_port
        self.control = self.data = None
        for _ in range(100):
            control, data = socket.socket(socket.AF_INET, socket.SOCK_DGRAM), socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            try:
                local_port = 40000 + secrets.randbelow(20000)
                control.bind(("", local_port))
                data.bind(("", local_port + 1))
                self.control, self.data = control, data
                break
            except OSError:
                control.close()
                data.close()
        require(self.control is not None, "Could not bind a local UDP port pair")
        self.ssrc, self.token = secrets.randbits(32) or 1, secrets.randbits(32)
        self.remote_ssrc = None
        self.accepted = set()
        self.synced = False
        self.sequence = secrets.randbits(16)
        self.clock = False
        self.next_clock = 0
        self.counts, self.samples = Counter(), deque(maxlen=12)
        self.peer_name = ""
        self.ended = False

    @staticmethod
    def timestamp():
        return time.monotonic_ns() // 100000

    def send_session(self, command, sock):
        port = self.remote_port + (sock is self.data)
        packet = b"\xff\xff" + command + struct.pack("!III", 2, self.token, self.ssrc)
        if command == b"IN":
            packet += b"BECA verify\0"
        sock.sendto(packet, (self.host, port))

    def send_sync(self, count=0, first=None, second=0):
        now = self.timestamp()
        stamps = (now if first is None else first, second, now if count == 2 else 0)
        packet = b"\xff\xffCK" + struct.pack("!IB3xQQQ", self.ssrc, count, *stamps)
        self.data.sendto(packet, (self.host, self.remote_port + 1))

    def send_midi(self, message):
        require(0 < len(message) <= 15, "Test MIDI message too large")
        self.sequence = (self.sequence + 1) & 65535
        header = struct.pack("!BBHII", 0x80, 97, self.sequence, self.timestamp() & 0xFFFFFFFF, self.ssrc)
        self.data.sendto(header + bytes([len(message)]) + message, (self.host, self.remote_port + 1))

    def pump(self):
        now = time.monotonic()
        if self.clock and now >= self.next_clock:
            self.send_midi(b"\xf8")
            self.next_clock = max(self.next_clock + 1 / 48, now)
        readable, _, _ = select.select([self.control, self.data], [], [], 0)
        for sock in readable:
            packet, address = sock.recvfrom(4096)
            expected_port = self.remote_port + (sock is self.data)
            if address != (self.host, expected_port):
                continue
            if packet.startswith(b"\xff\xff"):
                command = packet[2:4]
                if command in (b"OK", b"NO") and len(packet) >= 16:
                    version, token, ssrc = struct.unpack_from("!III", packet, 4)
                    if version != 2 or token != self.token:
                        continue
                    require(command != b"NO", "BECA rejected session; disconnect any other network MIDI client")
                    require(self.remote_ssrc in (None, ssrc), "BECA session SSRC changed during invitation")
                    self.remote_ssrc = ssrc
                    self.peer_name = packet[16:].split(b"\0", 1)[0].decode("utf-8", "replace")
                    self.accepted.add(sock)
                elif command == b"CK" and len(packet) == 36:
                    ssrc, count, first, second, _ = struct.unpack_from("!IB3xQQQ", packet, 4)
                    if ssrc == self.remote_ssrc and count == 1:
                        self.send_sync(2, first, second)
                        self.synced = True
                elif command == b"BY":
                    self.ended = True
            elif sock is self.data and len(packet) >= 13:
                if struct.unpack_from("!I", packet, 8)[0] != self.remote_ssrc:
                    continue
                self.counts["rtp_packets"] += 1
                for message in midi_messages(packet):
                    kind = message[0] & 240
                    if kind == 144 and message[2] > 0:
                        self.counts["note_on"] += 1
                        self.samples.append(message)
                    elif kind == 128 or kind == 144 and message[2] == 0:
                        self.counts["note_off"] += 1
                    elif kind == 176:
                        self.counts["control_change"] += 1

    def connect(self, ctrl, timeout):
        for sock in (self.control, self.data):
            deadline, next_invite = time.monotonic() + timeout, 0
            while sock not in self.accepted and time.monotonic() < deadline:
                if time.monotonic() >= next_invite:
                    self.send_session(b"IN", sock)
                    next_invite = time.monotonic() + 1
                ctrl.idle(0.03)
            require(sock in self.accepted, "RTP-MIDI invitation timed out; check host IP and UDP/firewall access")
        deadline, next_sync = time.monotonic() + timeout, 0
        while not self.synced and time.monotonic() < deadline:
            if time.monotonic() >= next_sync:
                self.send_sync()
                next_sync = time.monotonic() + 1
            ctrl.idle(0.03)
        require(self.synced, "AppleMIDI timestamp synchronization timed out")

    def close(self):
        self.clock = False
        try:
            if self.accepted:
                self.send_session(b"BY", self.control)
        finally:
            self.control.close()
            self.data.close()


def wait_field(ctrl, command, key, value, timeout=4):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if ctrl.command(command).get(key) == value:
            return
        ctrl.idle(0.1)
    raise TimeoutError(f"{command}.{key} did not become {value}")


def verify_network(ctrl, args, info, saved):
    require(info.get("wifi_connected"), "BECA must join Wi-Fi before the network checks")
    require(socket.gethostbyname(args.host) == info["ip"], "--host must match the serial device's station IP")
    require(not info.get("wifi_midi_connected"), "Disconnect the current network MIDI session before testing")
    manual_mute = info["manual_muted"]
    peer = None
    try:
        ctrl.command("SET mute 1")
        ctrl.command("SET outputmode 4")
        ctrl.command("SET sync 1")
        wait_field(ctrl, "WIFI_INFO", "wifi_midi_listening", True)
        for round_number in (1, 2):
            peer = Peer(args.host, info["wifi_midi_port"])
            ctrl.pump = peer.pump
            peer.connect(ctrl, args.timeout)
            wait_field(ctrl, "WIFI_INFO", "wifi_midi_connected", True)
            require(peer.peer_name == info["wifi_midi_name"], "Advertised session name differs from invitation response")
            peer.send_midi(b"\xfa")
            peer.clock, peer.next_clock = True, time.monotonic()
            wait_field(ctrl, "STATE", "daw_lock", 1)
            ctrl.command("SET mute 0")
            ctrl.idle(args.notes_seconds if round_number == 1 else 1)
            require(not peer.ended, "BECA unexpectedly ended the network session")
            peer.send_midi(b"\xfc")
            peer.clock = False
            wait_field(ctrl, "STATE", "daw_lock", 0)
            peer.send_midi(b"\xfb")
            peer.clock, peer.next_clock = True, time.monotonic()
            wait_field(ctrl, "STATE", "daw_lock", 1)
            ctrl.command("SET mute 1")
            ctrl.idle(0.15)
            require(peer.counts["control_change"] >= 16, "Missing connection/mute all-notes-off MIDI messages")
            print(json.dumps({"session": round_number, "name": peer.peer_name, "messages": dict(peer.counts),
                              "note_samples": list(peer.samples), "clock_start_stop_continue": "pass"}))
            if args.require_notes:
                require(peer.counts["note_on"] > 0, "No plant Note On received; check plant connection and activity")
            elif not peer.counts["note_on"]:
                print("SKIP: plant Note On observation (no notes generated during capture)")
            peer.close()
            peer, ctrl.pump = None, lambda: None
            wait_field(ctrl, "WIFI_INFO", "wifi_midi_connected", False)
            wait_field(ctrl, "STATE", "daw_lock", 0)
        print("PASS: invitations, timestamp sync, MIDI panic, transport clock, and session reconnect")
    finally:
        ctrl.pump = lambda: None
        if peer is not None:
            peer.close()
        restore_errors = []
        for command in ("SET mute 1", f"SET sync {saved['daw_sync']}",
                        f"SET outputmode {saved['outputmode']}", f"SET mute {manual_mute}"):
            try:
                ctrl.command(command)
            except Exception as error:
                restore_errors.append(f"{command}: {error}")
        require(not restore_errors, "Settings restoration failed: " + "; ".join(restore_errors))
        print("Restored original output, sync and manual mute settings")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("port", help="Serial port, e.g. COM4 or /dev/ttyUSB0")
    parser.add_argument("--host", help="BECA station IP; enables real RTP-MIDI network tests")
    parser.add_argument("--timeout", type=float, default=8, help="Timeout for each network handshake phase (1–20s)")
    parser.add_argument("--notes-seconds", type=float, default=5, help="Initial note capture duration (1–20s)")
    parser.add_argument("--require-notes", action="store_true", help="Fail if the plant does not emit Note On messages")
    args = parser.parse_args()
    if not 1 <= args.timeout <= 20 or not 1 <= args.notes_seconds <= 20:
        parser.error("Timeout and capture duration must each be between 1 and 20 seconds")
    if args.require_notes and not args.host:
        parser.error("--require-notes needs --host")
    ctrl = Control(args.port)
    try:
        ctrl.command("PING")
        params, info, saved = ctrl.command("PARAMS"), ctrl.command("WIFI_INFO"), ctrl.command("STATE")
        for key in ("sta_mac", "ap_mac"):
            require(re.fullmatch(r"(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}", info.get(key, "")), f"Missing/invalid {key}")
            require(info[key] != "00:00:00:00:00:00", f"Zero {key}")
        require(info.get("wifi_midi") is True, "Firmware has no Wi-Fi MIDI capability")
        require(len(params.get("output_modes", [])) > 4 and params["output_modes"][4] == "Wi-Fi MIDI", "Missing mode 4 capability")
        require(info.get("wifi_midi_port") == 5004, "Unexpected network MIDI port")
        print(json.dumps({key: info[key] for key in ("sta_mac", "ap_mac", "wifi_connected", "ip", "wifi_midi_name",
                          "wifi_midi_port", "wifi_midi_listening", "wifi_midi_connected")}))
        if args.host:
            verify_network(ctrl, args, info, saved)
        else:
            print("SKIP: network transport checks (supply --host with the station IP)")
        require(not ctrl.errors, "Captured firmware errors: " + "; ".join(ctrl.errors))
        print("PASS: serial capability, MAC and readiness checks")
    finally:
        ctrl.port.close()


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, TimeoutError, OSError, ValueError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        sys.exit(1)
