use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MidiPacket {
    pub status: u8,
    pub data1: u8,
    pub data2: u8,
}

impl MidiPacket {
    pub fn as_bytes(&self) -> [u8; 3] {
        [self.status, self.data1, self.data2]
    }
}

pub fn parse_beca_midi_line(line: &str) -> Option<MidiPacket> {
    let trimmed = line.trim();
    if !trimmed.starts_with("@M ") {
        return None;
    }

    let parts: Vec<&str> = trimmed.split_ascii_whitespace().collect();
    if parts.len() != 4 {
        return None;
    }

    let status = u8::from_str_radix(parts[1], 16).ok()?;
    let data1 = u8::from_str_radix(parts[2], 16).ok()? & 0x7F;
    let data2 = u8::from_str_radix(parts[3], 16).ok()? & 0x7F;

    Some(MidiPacket {
        status,
        data1,
        data2,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_valid_packet() {
        let parsed = parse_beca_midi_line("@M 90 3C 64").expect("should parse");
        assert_eq!(parsed.status, 0x90);
        assert_eq!(parsed.data1, 0x3C);
        assert_eq!(parsed.data2, 0x64);
    }

    #[test]
    fn ignores_malformed_packets() {
        assert_eq!(parse_beca_midi_line("garbage"), None);
        assert_eq!(parse_beca_midi_line("@M ZZ 3C 64"), None);
        assert_eq!(parse_beca_midi_line("@M 90 3C"), None);
    }
}
