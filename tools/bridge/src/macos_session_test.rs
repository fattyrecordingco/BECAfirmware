use super::*;
use crate::ports::APP_MIDI_PORT;
use midir::MidiInput;
use serialport::TTYPort;
use std::{env, fs, os::unix::fs::symlink, path::Path};

fn emulate_device(
    path: &Path,
) -> Result<(mpsc::Sender<&'static [u8]>, thread::JoinHandle<Result<()>>)> {
    let (mut peer, slave) = TTYPort::pair()?;
    let _ = fs::remove_file(path);
    symlink(slave.name().context("missing PTY path")?, path)?;
    peer.set_timeout(Duration::from_millis(25))?;
    let (send, receive) = mpsc::channel::<&'static [u8]>();
    let worker = thread::spawn(move || -> Result<()> {
        let _slave = slave;
        let mut frames = LineFrames::default();
        let mut buffer = [0u8; 512];
        loop {
            match receive.try_recv() {
                Ok(bytes) => peer.write_all(bytes)?,
                Err(mpsc::TryRecvError::Disconnected) => return Ok(()),
                Err(mpsc::TryRecvError::Empty) => {}
            }
            match peer.read(&mut buffer) {
                Ok(n) => {
                    for line in frames.push(&buffer[..n]) {
                        match line.as_str() {
                            "@C PING" => peer.write_all(b"@R PING {\"ok\":1}\n")?,
                            "@C STATE" => peer.write_all(b"@R STATE {\"outputmode\":1}\n")?,
                            "@C SERIAL_HOST" => {}
                            _ => {}
                        }
                    }
                }
                Err(e) if matches!(e.kind(), ErrorKind::TimedOut | ErrorKind::WouldBlock) => {}
                Err(e) => return Err(e.into()),
            }
        }
    });
    Ok((send, worker))
}

fn expect_status(events: &mpsc::Receiver<String>, expected: &str) -> Result<()> {
    let deadline = Instant::now() + Duration::from_secs(8);
    loop {
        let state = events.recv_timeout(deadline.saturating_duration_since(Instant::now()))?;
        if state == expected {
            return Ok(());
        }
    }
}

fn expect_note(midi: &mpsc::Receiver<Vec<u8>>, expected: [u8; 3]) -> Result<()> {
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let packet = midi.recv_timeout(deadline.saturating_duration_since(Instant::now()))?;
        if packet == expected {
            return Ok(());
        }
        if packet
            .first()
            .is_some_and(|status| matches!(status & 0xf0, 0x80 | 0x90))
        {
            anyhow::bail!("Expected {expected:?}, received {packet:?}");
        }
    }
}

#[test]
fn macos_serial_packets_reach_native_coremidi() -> Result<()> {
    let path = env::temp_dir().join(format!("beca-mac-pty-{}", std::process::id()));
    let path_name = path.to_string_lossy().into_owned();
    let (device, device_worker) = emulate_device(&path)?;
    let (status_tx, status_rx) = mpsc::channel();
    let route = MidiRoute::full("coremidi", APP_MIDI_PORT, false);
    let bridge = BridgeSession::start(path_name.clone(), vec![route], move |event| {
        if event.event == "status" {
            println!("{}: {}", event.state, event.detail);
            let _ = status_tx.send(event.state);
        }
    })?;
    expect_status(&status_rx, "connected")?;

    let input = MidiInput::new("BECA CoreMIDI verification")?;
    let endpoint = input
        .ports()
        .into_iter()
        .find(|port| input.port_name(port).ok().as_deref() == Some("BECA"))
        .context("Native CoreMIDI source BECA was not found")?;
    let (midi_tx, midi_rx) = mpsc::channel();
    let _listener = input
        .connect(
            &endpoint,
            "BECA test listener",
            move |_, bytes, _| {
                let _ = midi_tx.send(bytes.to_vec());
            },
            (),
        )
        .map_err(|e| anyhow!(e.to_string()))?;
    let check_state = || -> Result<()> {
        let state = bridge.serial(&path_name, "@C STATE", "STATE", 2500)?;
        anyhow::ensure!(state["outputmode"] == 1, "Invalid control reply: {state}");
        Ok(())
    };
    check_state()?;
    device.send(b"@M 90 3C ")?;
    device.send(b"64\n@M 80 3C 00\n@M 99 24 50\n@M 89 24 00\n")?;
    for note in [
        [0x90, 60, 100],
        [0x80, 60, 0],
        [0x99, 36, 80],
        [0x89, 36, 0],
    ] {
        expect_note(&midi_rx, note)?;
    }
    device.send(b"@M 90 40 40\n")?;
    expect_note(&midi_rx, [0x90, 64, 64])?;
    drop(device);
    device_worker.join().expect("PTY fixture panicked")?;
    expect_status(&status_rx, "reconnecting")?;
    expect_note(&midi_rx, [0x80, 64, 0])?;

    let (device, device_worker) = emulate_device(&path)?;
    expect_status(&status_rx, "connected")?;
    check_state()?;
    device.send(b"@M 91 43 50\n")?;
    expect_note(&midi_rx, [0x91, 67, 80])?;
    bridge.panic()?;
    expect_note(&midi_rx, [0x81, 67, 0])?;
    bridge.stop()?;
    drop(device);
    device_worker.join().expect("PTY fixture panicked")?;
    fs::remove_file(path)?;
    println!("PASS: macOS virtual serial, shared commands, CoreMIDI note-on/off and channel 10, disconnect cleanup, reconnect and panic");
    Ok(())
}
