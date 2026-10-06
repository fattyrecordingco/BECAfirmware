import Foundation

var parser = MIDIStream()
assert(parser.feed([0x90, 60]) == [])
assert(parser.feed([100, 61, 101]) == [[0x90, 60, 100], [0x90, 61, 101]])
assert(parser.feed([0xF8, 0x80, 60, 0]) == [[0x80, 60, 0]])
assert(parser.feed([0x99, 36, 90, 0xB0, 123, 0]) == [[0x99, 36, 90], [0xB0, 123, 0]])
assert(parser.feed([0xF0, 1, 2, 0xF8, 3, 0xF7, 60, 100]) == [])
assert(parser.feed([0xC0, 4, 5, 0x90, 60, 0]) == [[0x90, 60, 0]])
assert(parser.feed([0x90, 60, 0xFA, 100]) == [[0x90, 60, 100]])
parser.reset()
assert(parser.feed([60, 100]) == [])
print("PASS: CoreMIDI stream fragmentation, running status, drum channel, panic, SysEx and real-time interleaving")
