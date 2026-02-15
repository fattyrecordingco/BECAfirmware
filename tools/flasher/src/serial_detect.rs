use serde::{Deserialize, Serialize};
use serialport::{available_ports, SerialPortInfo, SerialPortType};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BecaPort {
    pub port_name: String,
    pub description: String,
    pub manufacturer: String,
    pub vid: Option<u16>,
    pub pid: Option<u16>,
    pub score: u16,
    pub likely_beca: bool,
}

const KNOWN_USB_BRIDGES: &[(u16, u16)] = &[
    (0x1A86, 0x7523), // CH340
    (0x10C4, 0xEA60), // CP210x
    (0x0403, 0x6001), // FTDI
    (0x303A, 0x1001), // Espressif USB serial/JTAG
];

pub fn detect_beca_ports() -> Vec<BecaPort> {
    let ports = available_ports().unwrap_or_default();
    let mut mapped: Vec<BecaPort> = ports.into_iter().map(score_port).collect();
    mapped.sort_by(|a, b| b.score.cmp(&a.score));
    mapped
}

pub fn select_best_port(ports: &[BecaPort]) -> Option<BecaPort> {
    ports.iter().max_by(|a, b| a.score.cmp(&b.score)).cloned()
}

pub fn score_port(port: SerialPortInfo) -> BecaPort {
    let mut description = String::new();
    let mut manufacturer = String::new();
    let mut vid = None;
    let mut pid = None;

    if let SerialPortType::UsbPort(usb) = &port.port_type {
        description = usb.product.clone().unwrap_or_default();
        manufacturer = usb.manufacturer.clone().unwrap_or_default();
        vid = Some(usb.vid);
        pid = Some(usb.pid);
    }

    let mut score = 0u16;
    let hay = format!(
        "{} {} {}",
        port.port_name.to_ascii_lowercase(),
        description.to_ascii_lowercase(),
        manufacturer.to_ascii_lowercase()
    );

    if hay.contains("beca") {
        score += 40;
    }
    if hay.contains("usb") {
        score += 8;
    }
    if hay.contains("serial") || hay.contains("uart") {
        score += 10;
    }
    if hay.contains("cp210") || hay.contains("ch340") || hay.contains("ftdi") {
        score += 20;
    }

    if let (Some(v), Some(p)) = (vid, pid) {
        if KNOWN_USB_BRIDGES.contains(&(v, p)) {
            score += 30;
        }
    }

    BecaPort {
        port_name: port.port_name,
        description,
        manufacturer,
        vid,
        pid,
        score,
        likely_beca: score >= 30,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serialport::{SerialPortInfo, SerialPortType, UsbPortInfo};

    #[test]
    fn score_prefers_known_vid_pid() {
        let port = SerialPortInfo {
            port_name: "COM5".to_string(),
            port_type: SerialPortType::UsbPort(UsbPortInfo {
                vid: 0x10C4,
                pid: 0xEA60,
                serial_number: None,
                manufacturer: Some("Silicon Labs".to_string()),
                product: Some("CP2102 USB to UART".to_string()),
            }),
        };

        let scored = score_port(port);
        assert!(scored.score >= 40);
        assert!(scored.likely_beca);
    }

    #[test]
    fn score_handles_unknown_port() {
        let port = SerialPortInfo {
            port_name: "/dev/ttyS0".to_string(),
            port_type: SerialPortType::Unknown,
        };

        let scored = score_port(port);
        assert_eq!(scored.score, 0);
        assert!(!scored.likely_beca);
    }

    #[test]
    fn select_best_port_prefers_higher_score() {
        let ports = vec![
            BecaPort {
                port_name: "COM1".to_string(),
                description: String::new(),
                manufacturer: String::new(),
                vid: None,
                pid: None,
                score: 5,
                likely_beca: false,
            },
            BecaPort {
                port_name: "COM7".to_string(),
                description: "CP2102 USB to UART".to_string(),
                manufacturer: "Silicon Labs".to_string(),
                vid: Some(0x10C4),
                pid: Some(0xEA60),
                score: 50,
                likely_beca: true,
            },
        ];

        let selected = select_best_port(&ports).expect("expected selected port");
        assert_eq!(selected.port_name, "COM7");
    }
}
