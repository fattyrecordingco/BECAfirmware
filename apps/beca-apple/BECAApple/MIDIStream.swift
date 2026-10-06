import Foundation

// CoreMIDI delivers MIDI bytes, with running status and arbitrary packet boundaries.
struct MIDIStream {
    private var status: UInt8 = 0
    private var data = [UInt8]()
    private var sysex = false

    mutating func reset() { status = 0; data.removeAll(); sysex = false }

    mutating func feed(_ bytes: [UInt8]) -> [[UInt8]] {
        var messages = [[UInt8]]()
        for byte in bytes {
            if byte >= 0xF8 { continue }
            if byte & 0x80 != 0 {
                data.removeAll()
                if byte == 0xF0 { sysex = true; status = 0; continue }
                if byte == 0xF7 { sysex = false; status = 0; continue }
                sysex = false
                status = byte < 0xF0 ? byte : 0
                continue
            }
            if sysex || status == 0 { continue }
            data.append(byte)
            let count = (status & 0xF0 == 0xC0 || status & 0xF0 == 0xD0) ? 1 : 2
            if data.count == count {
                // The shared web engine consumes notes and CC (including panic).
                if [UInt8(0x80), 0x90, 0xB0].contains(status & 0xF0) {
                    messages.append([status] + data)
                }
                data.removeAll(keepingCapacity: true)
            }
        }
        return messages
    }
}
