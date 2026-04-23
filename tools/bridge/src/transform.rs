use crate::MidiPacket;

const STATUS_KIND_MASK: u8 = 0xF0;
const CHANNEL_1_STATUS: u8 = 0x00;
const DRUM_CHANNEL: u8 = 10;
const ALL_NOTES_OFF_CC: u8 = 123;

pub fn transform_bridge_packet(packet: &MidiPacket, microfreak_mode: bool) -> Option<MidiPacket> {
    if !microfreak_mode {
        return Some(packet.clone());
    }

    let status_kind = packet.status & STATUS_KIND_MASK;
    let channel = (packet.status & 0x0F) + 1;

    match status_kind {
        0x80 | 0x90 => {
            if channel == DRUM_CHANNEL {
                return None;
            }

            Some(MidiPacket {
                status: status_kind | CHANNEL_1_STATUS,
                data1: packet.data1,
                data2: packet.data2,
            })
        }
        0xB0 if packet.data1 == ALL_NOTES_OFF_CC => Some(MidiPacket {
            status: 0xB0 | CHANNEL_1_STATUS,
            data1: packet.data1,
            data2: packet.data2,
        }),
        0x80..=0xE0 => None,
        _ => Some(packet.clone()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    fn packet(status: u8, data1: u8, data2: u8) -> MidiPacket {
        MidiPacket {
            status,
            data1,
            data2,
        }
    }

    #[test]
    fn generic_mode_preserves_packets() {
        let original = packet(0x93, 64, 99);
        assert_eq!(
            transform_bridge_packet(&original, false),
            Some(original.clone())
        );
    }

    #[test]
    fn microfreak_mode_rewrites_note_on_to_channel_one() {
        let rewritten = transform_bridge_packet(&packet(0x93, 64, 99), true);
        assert_eq!(rewritten, Some(packet(0x90, 64, 99)));
    }

    #[test]
    fn microfreak_mode_rewrites_note_off_to_channel_one() {
        let rewritten = transform_bridge_packet(&packet(0x85, 64, 0), true);
        assert_eq!(rewritten, Some(packet(0x80, 64, 0)));
    }

    #[test]
    fn microfreak_mode_drops_drum_channel_notes() {
        assert_eq!(transform_bridge_packet(&packet(0x99, 36, 110), true), None);
        assert_eq!(transform_bridge_packet(&packet(0x89, 36, 0), true), None);
    }

    #[test]
    fn microfreak_mode_rewrites_all_notes_off_to_channel_one() {
        let rewritten = transform_bridge_packet(&packet(0xB4, 123, 0), true);
        assert_eq!(rewritten, Some(packet(0xB0, 123, 0)));
    }

    #[test]
    fn microfreak_mode_drops_other_channel_voice_messages() {
        assert_eq!(transform_bridge_packet(&packet(0xB4, 1, 64), true), None);
        assert_eq!(transform_bridge_packet(&packet(0xE2, 0, 64), true), None);
    }
}
