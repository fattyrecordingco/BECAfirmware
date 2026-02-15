pub mod dependency;
pub mod parser;
pub mod ports;

pub use dependency::{resolve_bridge_runtime, BridgeRuntimeDecision, BridgeRuntimeInput};
pub use parser::{parse_beca_midi_line, MidiPacket};
pub use ports::{list_midi_outputs, list_serial_ports, MidiOutPort, SerialPortSummary};
