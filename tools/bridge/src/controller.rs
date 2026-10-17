//! Independent controller input; never forwards messages to instrument outputs.
use anyhow::{anyhow, Result};
use midir::{Ignore, MidiInput, MidiInputConnection};
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

const CAPACITY: usize = 256;

#[derive(Default, Serialize)]
pub struct ControllerBatch {
    pub messages: Vec<[u8; 3]>,
    pub overflow: bool,
}

#[derive(Default)]
struct Inbox {
    messages: VecDeque<[u8; 3]>,
    overflow: bool,
}

impl Inbox {
    fn push(&mut self, bytes: &[u8]) {
        if bytes.len() != 3
            || !matches!(bytes[0] & 0xf0, 0x80 | 0x90 | 0xb0 | 0xe0)
            || bytes[1] > 127
            || bytes[2] > 127
        {
            return;
        }
        if self.messages.len() == CAPACITY {
            self.messages.clear();
            self.overflow = true;
        }
        self.messages.push_back([bytes[0], bytes[1], bytes[2]]);
    }
}

pub fn list_controller_inputs() -> Result<Vec<String>> {
    let input = MidiInput::new("BECA controller discovery")?;
    input
        .ports()
        .iter()
        .map(|port| input.port_name(port).map_err(Into::into))
        .collect()
}

pub struct ControllerInput {
    _connection: MidiInputConnection<()>,
    inbox: Arc<Mutex<Inbox>>,
}

impl ControllerInput {
    pub fn open(name: &str) -> Result<Self> {
        let mut input = MidiInput::new("BECA controller")?;
        input.ignore(Ignore::Sysex | Ignore::Time | Ignore::ActiveSense);
        let matches: Vec<_> = input
            .ports()
            .into_iter()
            .filter(|port| input.port_name(port).ok().as_deref() == Some(name))
            .collect();
        if matches.len() != 1 {
            return Err(anyhow!(
                "Select one uniquely named MIDI input. Reconnect or rename duplicate ports."
            ));
        }
        let inbox = Arc::new(Mutex::new(Inbox::default()));
        let callback_inbox = Arc::clone(&inbox);
        let connection = input
            .connect(
                &matches[0],
                "BECA controller",
                move |_, bytes, _| {
                    if let Ok(mut queue) = callback_inbox.lock() {
                        queue.push(bytes);
                    }
                },
                (),
            )
            .map_err(|error| anyhow!(error.to_string()))?;
        Ok(Self {
            _connection: connection,
            inbox,
        })
    }

    pub fn drain(&self) -> ControllerBatch {
        match self.inbox.lock() {
            Ok(mut inbox) => ControllerBatch {
                messages: inbox.messages.drain(..).collect(),
                overflow: std::mem::take(&mut inbox.overflow),
            },
            Err(_) => ControllerBatch {
                messages: vec![],
                overflow: true,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_non_control_and_malformed_messages() {
        let mut inbox = Inbox::default();
        for bytes in [
            &[0xf8][..],
            &[0xf0, 1, 2],
            &[0xc0, 4],
            &[0xb0, 128, 2],
            &[0x90, 60, 100],
        ] {
            inbox.push(bytes);
        }
        assert_eq!(
            inbox.messages.into_iter().collect::<Vec<_>>(),
            vec![[0x90, 60, 100]]
        );
    }

    #[test]
    fn overflow_discards_partial_gestures_and_stays_bounded() {
        let mut inbox = Inbox::default();
        for _ in 0..=CAPACITY {
            inbox.push(&[0xb0, 1, 64]);
        }
        assert!(inbox.overflow);
        assert_eq!(inbox.messages.len(), 1);
    }
}
