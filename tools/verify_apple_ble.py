"""Optional cross-platform BLE smoke check (pyserial + bleak).

Usage: py tools/verify_apple_ble.py COM6
Temporarily selects BLE MIDI, checks advertisement/GATT/notifications and two
connections, then restores the output. This does not certify Apple CoreMIDI.
Close other BLE MIDI central apps before running. No bonding request is made.
"""
import argparse
import asyncio
from importlib.metadata import version
import json
from bleak import BleakScanner, BleakClient
from verify_wifi_midi import Control, require

SERVICE = "03b80e5a-ede8-4b33-a751-6ce34ec4c700"
CHARACTERISTIC = "7772e5db-3868-4112-a1a9-f2669d106bf3"


async def check(ctrl):
    total = 0
    for cycle in range(2):
        devices = await BleakScanner.discover(timeout=6, return_adv=True)
        matches = [(device, adv) for device, adv in devices.values()
                   if adv.local_name == "BECA BLE-MIDI" and SERVICE in adv.service_uuids]
        require(len(matches) == 1, f"Expected one advertising BECA BLE-MIDI, found {len(matches)}")
        device, _ = matches[0]
        packets = []
        async with BleakClient(device, timeout=8, pair=False) as client:
            require(client.is_connected, "BLE connection failed")
            service = client.services.get_service(SERVICE)
            char = client.services.get_characteristic(CHARACTERISTIC)
            require(service is not None and char is not None, "Missing standard BLE-MIDI service/characteristic")
            require({"read", "notify", "write-without-response"} <= set(char.properties), f"Unexpected GATT properties: {char.properties}")
            await client.start_notify(char, lambda _, data: packets.append(bytes(data)))
            await asyncio.sleep(2)
            require(ctrl.command("STATE")["ble"] == 1, "Firmware did not report BLE connection")
            await client.stop_notify(char)
        # WinRT may release the physical connection after its client is closed.
        for _ in range(80):
            if ctrl.command("STATE")["ble"] == 0:
                break
            await asyncio.sleep(.1)
        require(ctrl.command("STATE")["ble"] == 0, "Firmware did not clear BLE connection")
        total += len(packets)
        require(all(len(packet) >= 2 and packet[0] & 0x80 and packet[1] & 0x80 for packet in packets), "Invalid BLE-MIDI timestamp header")
        print(json.dumps({"cycle": cycle + 1, "name": "BECA BLE-MIDI", "standard_gatt": "pass", "notification_subscription": "pass", "packets_observed": len(packets), "disconnect": "pass"}))
    if not total:
        print("SKIP: live plant MIDI packets (no plant events observed; subscription verified)")
    print(f"PASS: BLE advertisement, GATT, subscribe, disconnect/reconnect; bleak {version('bleak')}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("port")
    args = parser.parse_args()
    ctrl = Control(args.port)
    ctrl.command("PING", timeout=30)
    saved = ctrl.command("STATE")
    try:
        ctrl.command("SET outputmode 0")
        asyncio.run(asyncio.wait_for(check(ctrl), timeout=60))
        require(not ctrl.errors, "Firmware errors captured: " + "; ".join(ctrl.errors))
    finally:
        ctrl.command(f"SET outputmode {saved['outputmode']}")
        ctrl.port.close()
        print("Restored original output mode")


if __name__ == "__main__":
    main()
