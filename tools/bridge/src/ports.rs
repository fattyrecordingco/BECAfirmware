use anyhow::Result;
use midir::MidiOutput;
use serde::{Deserialize, Serialize};
use serialport::{available_ports, SerialPortType};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerialPortSummary {
    pub port_name: String,
    pub description: String,
    pub manufacturer: String,
    pub vid: Option<u16>,
    pub pid: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiOutPort {
    pub id: usize,
    pub name: String,
}

pub fn list_serial_ports() -> Vec<SerialPortSummary> {
    let mut ports = vec![];
    for p in available_ports().unwrap_or_default() {
        match p.port_type {
            SerialPortType::UsbPort(usb) => {
                ports.push(SerialPortSummary {
                    port_name: p.port_name,
                    description: usb.product.unwrap_or_default(),
                    manufacturer: usb.manufacturer.unwrap_or_default(),
                    vid: Some(usb.vid),
                    pid: Some(usb.pid),
                });
            }
            _ => {
                ports.push(SerialPortSummary {
                    port_name: p.port_name,
                    description: String::new(),
                    manufacturer: String::new(),
                    vid: None,
                    pid: None,
                });
            }
        }
    }
    ports
}

pub fn list_midi_outputs() -> Result<Vec<MidiOutPort>> {
    let midi_out = MidiOutput::new("BECA")?;
    let ports = midi_out
        .ports()
        .into_iter()
        .enumerate()
        .map(|(idx, port)| MidiOutPort {
            id: idx,
            name: midi_out
                .port_name(&port)
                .unwrap_or_else(|_| format!("MIDI Port {idx}")),
        })
        .collect();
    Ok(ports)
}
