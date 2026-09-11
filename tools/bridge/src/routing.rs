use crate::{transform_bridge_packet, MidiPacket};
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MidiRoute {
    pub id: String,
    pub name: String,
    pub port: String,
    pub enabled: bool,
    pub input_channel: u8,
    pub output_channel: u8,
    pub note_min: u8,
    pub note_max: u8,
    pub transpose: i8,
    pub microfreak: bool,
}
impl MidiRoute {
    pub fn full(id: &str, port: &str, microfreak: bool) -> Self {
        Self {
            id: id.into(),
            name: "Full range".into(),
            port: port.into(),
            enabled: true,
            input_channel: 0,
            output_channel: 0,
            note_min: 0,
            note_max: 127,
            transpose: 0,
            microfreak,
        }
    }
}
pub fn validate_routes(routes: &[MidiRoute]) -> Result<()> {
    if routes.len() > 8 {
        return Err(anyhow!("Use at most eight MIDI splits."));
    }
    let mut ids = BTreeSet::new();
    for r in routes {
        if r.id.is_empty()
            || r.id.len() > 48
            || !ids.insert(&r.id)
            || r.name.len() > 64
            || r.port.len() > 256
        {
            return Err(anyhow!("Each split needs a unique ID and a short name."));
        }
        if r.enabled && r.port.trim().is_empty() {
            return Err(anyhow!("Choose an output for {}.", r.name));
        }
        if r.input_channel > 16
            || r.output_channel > 16
            || r.note_min > r.note_max
            || r.note_max > 127
            || !(-48..=48).contains(&r.transpose)
        {
            return Err(anyhow!(
                "Invalid channel, note range or transpose in {}.",
                r.name
            ));
        }
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct Destination {
    port: String,
    channel: u8,
    note: u8,
}
pub type RoutedPacket = (String, MidiPacket);

#[derive(Default)]
pub struct MidiRouter {
    pub routes: Vec<MidiRoute>,
    held: BTreeMap<(u8, u8), BTreeSet<Destination>>,
    counts: BTreeMap<Destination, usize>,
    channels: BTreeSet<(String, u8)>,
}
impl MidiRouter {
    pub fn new(routes: Vec<MidiRoute>) -> Self {
        Self {
            routes,
            ..Self::default()
        }
    }
    fn release(&mut self, source: (u8, u8)) -> Vec<RoutedPacket> {
        let mut out = vec![];
        if let Some(destinations) = self.held.remove(&source) {
            for d in destinations {
                if let Some(count) = self.counts.get_mut(&d) {
                    *count -= 1;
                    if *count == 0 {
                        self.counts.remove(&d);
                        out.push((
                            d.port,
                            MidiPacket {
                                status: 0x80 | d.channel,
                                data1: d.note,
                                data2: 0,
                            },
                        ));
                    }
                }
            }
        }
        out
    }
    pub fn panic(&mut self) -> Vec<RoutedPacket> {
        let sources: Vec<_> = self.held.keys().copied().collect();
        let mut out = vec![];
        for source in sources {
            out.extend(self.release(source));
        }
        for (port, channel) in std::mem::take(&mut self.channels) {
            for cc in [64, 123] {
                out.push((
                    port.clone(),
                    MidiPacket {
                        status: 0xB0 | channel,
                        data1: cc,
                        data2: 0,
                    },
                ));
            }
        }
        out
    }
    pub fn route(&mut self, packet: &MidiPacket) -> Vec<RoutedPacket> {
        let kind = packet.status & 0xF0;
        let channel = packet.status & 0x0F;
        if !(0x80..=0xE0).contains(&kind) {
            return vec![];
        }
        let source = (channel, packet.data1);
        if kind == 0x80 || (kind == 0x90 && packet.data2 == 0) {
            return self.release(source);
        }
        if kind == 0xB0 && [120, 123].contains(&packet.data1) {
            let sources: Vec<_> = self
                .held
                .keys()
                .filter(|(ch, _)| *ch == channel)
                .copied()
                .collect();
            return sources
                .into_iter()
                .flat_map(|source| self.release(source))
                .collect();
        }
        let mut out = if kind == 0x90 {
            self.release(source)
        } else {
            vec![]
        };
        let mut destinations = BTreeSet::new();
        let mut duplicates = BTreeSet::new();
        for rule in &self.routes {
            if !rule.enabled || (rule.input_channel != 0 && rule.input_channel != channel + 1) {
                continue;
            }
            let mut p = packet.clone();
            if kind == 0x90 || kind == 0xA0 {
                if !(rule.note_min..=rule.note_max).contains(&p.data1) {
                    continue;
                }
                let note = i16::from(p.data1) + i16::from(rule.transpose);
                if !(0..=127).contains(&note) {
                    continue;
                }
                p.data1 = note as u8;
            }
            let Some(mut p) = transform_bridge_packet(&p, rule.microfreak) else {
                continue;
            };
            if rule.output_channel > 0 {
                p.status = kind | (rule.output_channel - 1);
            }
            if !duplicates.insert((rule.port.clone(), p.status, p.data1, p.data2)) {
                continue;
            }
            self.channels.insert((rule.port.clone(), p.status & 0x0F));
            if kind == 0x90 {
                let dest = Destination {
                    port: rule.port.clone(),
                    channel: p.status & 0x0F,
                    note: p.data1,
                };
                let count = self.counts.entry(dest.clone()).or_default();
                *count += 1;
                destinations.insert(dest);
                if *count > 1 {
                    continue;
                }
            }
            out.push((rule.port.clone(), p));
        }
        if kind == 0x90 && !destinations.is_empty() {
            self.held.insert(source, destinations);
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn p(s: u8, n: u8, v: u8) -> MidiPacket {
        MidiPacket {
            status: s,
            data1: n,
            data2: v,
        }
    }
    #[test]
    fn splits_and_transpose_keep_the_note_off_destination() {
        let mut low = MidiRoute::full("low", "Bass", false);
        low.note_max = 59;
        low.transpose = -12;
        low.output_channel = 3;
        let mut high = MidiRoute::full("high", "Pad", false);
        high.note_min = 60;
        let mut router = MidiRouter {
            routes: vec![low, high],
            ..Default::default()
        };
        assert_eq!(
            router.route(&p(0x90, 50, 100)),
            vec![("Bass".into(), p(0x92, 38, 100))]
        );
        assert_eq!(
            router.route(&p(0x90, 70, 100)),
            vec![("Pad".into(), p(0x90, 70, 100))]
        );
        router.routes.clear();
        assert_eq!(
            router.route(&p(0x90, 50, 0)),
            vec![("Bass".into(), p(0x82, 38, 0))]
        );
        assert!(router.panic().contains(&("Pad".into(), p(0x80, 70, 0))));
        assert!(router.panic().is_empty());
    }
    #[test]
    fn shared_destination_holds_until_both_source_notes_release() {
        let a = MidiRoute::full("a", "Port", false);
        let mut b = a.clone();
        b.id = "b".into();
        b.transpose = -12;
        let mut router = MidiRouter {
            routes: vec![a, b],
            ..Default::default()
        };
        router.route(&p(0x90, 60, 100));
        router.route(&p(0x90, 72, 100));
        assert!(!router
            .route(&p(0x80, 60, 0))
            .contains(&("Port".into(), p(0x80, 60, 0))));
        assert!(router
            .route(&p(0x80, 72, 0))
            .contains(&("Port".into(), p(0x80, 60, 0))));
    }
    #[test]
    fn filters_percussion_and_deduplicates_layers() {
        let a = MidiRoute::full("a", "Port", true);
        let mut b = a.clone();
        b.id = "b".into();
        let mut router = MidiRouter {
            routes: vec![a, b],
            ..Default::default()
        };
        assert!(router.route(&p(0x99, 36, 100)).is_empty());
        assert_eq!(router.route(&p(0x94, 60, 100)).len(), 1);
        assert_eq!(
            router.route(&p(0xB4, 123, 0)),
            vec![("Port".into(), p(0x80, 60, 0))]
        );
    }
    #[test]
    fn rejects_bad_ranges_and_channels() {
        let mut route = MidiRoute::full("a", "Port", false);
        route.note_min = 80;
        route.note_max = 40;
        assert!(validate_routes(&[route.clone()]).is_err());
        route.note_min = 0;
        route.output_channel = 17;
        assert!(validate_routes(&[route]).is_err());
    }
}
