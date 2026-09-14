#pragma once
#include "output_modes.h"

#if BECA_WIFI_MIDI
#include <WiFiUdp.h>
#include <new>
#define ONE_PARTICIPANT
#include <AppleMIDI.h>

namespace beca {
constexpr uint16_t WIFI_MIDI_PORT = 5004;

// One computer/clock source per BECA; a computer can open many BECA sessions.
struct NetworkMidiSettings : public APPLEMIDI_NAMESPACE::DefaultSettings {
  static const size_t MaxMidiOutSize = 256;
};
using NetworkSession = APPLEMIDI_NAMESPACE::AppleMIDISession<WiFiUDP, NetworkMidiSettings>;
using NetworkInterface = midi::MidiInterface<NetworkSession, APPLEMIDI_NAMESPACE::AppleMIDISettings>;

struct NetworkMidi {
  NetworkSession session;
  NetworkInterface midi;
  NetworkMidi() : session("BECA", WIFI_MIDI_PORT), midi(session) {}

  void reset() {
    session.end();
    // AppleMIDI end/begin retain buffered notes and parser state. Start clean.
    this->~NetworkMidi();
    new (this) NetworkMidi();
  }
};
} // namespace beca
#endif
