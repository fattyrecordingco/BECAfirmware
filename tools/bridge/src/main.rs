use anyhow::{anyhow, Context, Result};
use beca_bridge::{
    list_midi_outputs, list_serial_ports, parse_beca_midi_line, transform_bridge_packet,
};
use clap::{Parser, Subcommand};
use midir::{MidiOutput, MidiOutputConnection};
use serde::Serialize;
use serialport::SerialPort;
use std::io::Write;
use std::io::{BufRead, BufReader, ErrorKind};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::thread;
use std::time::Duration;

#[derive(Debug, Parser)]
#[command(name = "beca-bridge")]
#[command(about = "BECA serial to MIDI bridge")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
enum Commands {
    ListSerial,
    ListMidi,
    Run {
        #[arg(long)]
        serial_port: String,
        #[arg(long)]
        midi_port: String,
        #[arg(long)]
        microfreak_mode: bool,
        #[arg(long, default_value_t = 115200)]
        baud: u32,
        #[arg(long, default_value_t = 1500)]
        reconnect_ms: u64,
    },
    TestNote {
        #[arg(long)]
        midi_port: String,
    },
}

#[derive(Debug, Serialize)]
struct StatusEvent {
    event: String,
    state: String,
    detail: String,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Commands::ListSerial => {
            println!("{}", serde_json::to_string_pretty(&list_serial_ports())?);
        }
        Commands::ListMidi => {
            println!("{}", serde_json::to_string_pretty(&list_midi_outputs()?)?);
        }
        Commands::Run {
            serial_port,
            midi_port,
            microfreak_mode,
            baud,
            reconnect_ms,
        } => {
            run_bridge(
                &serial_port,
                &midi_port,
                microfreak_mode,
                baud,
                reconnect_ms,
            )?;
        }
        Commands::TestNote { midi_port } => {
            let mut out = open_midi_output(&midi_port)?;
            send_test_note(&mut out)?;
            println!("{}", r#"{"status":"ok","detail":"test note sent"}"#);
        }
    }

    Ok(())
}

fn run_bridge(
    serial_port_name: &str,
    midi_port_name: &str,
    microfreak_mode: bool,
    baud: u32,
    reconnect_ms: u64,
) -> Result<()> {
    let running = Arc::new(AtomicBool::new(true));
    let running_for_handler = running.clone();
    ctrlc::set_handler(move || {
        running_for_handler.store(false, Ordering::SeqCst);
    })
    .context("failed to install signal handler")?;

    let mut midi_out = open_midi_output(midi_port_name)?;
    emit_status(
        "status",
        "connected",
        &format!("MIDI output ready: {midi_port_name}"),
    );

    while running.load(Ordering::SeqCst) {
        match serialport::new(serial_port_name, baud)
            .timeout(Duration::from_millis(300))
            .open()
        {
            Ok(port) => {
                emit_status(
                    "status",
                    "connected",
                    &format!("Serial connected: {serial_port_name} @ {baud}"),
                );
                let mut sent = 0usize;
                if let Err(err) =
                    run_bridge_session(port, &mut midi_out, &running, microfreak_mode, &mut sent)
                {
                    emit_status(
                        "status",
                        "reconnecting",
                        &format!("Serial disconnected: {err}"),
                    );
                }
            }
            Err(err) => {
                emit_status(
                    "status",
                    "reconnecting",
                    &format!("Waiting for serial port {serial_port_name}: {err}"),
                );
            }
        }

        if running.load(Ordering::SeqCst) {
            thread::sleep(Duration::from_millis(reconnect_ms));
        }
    }

    emit_status("status", "stopped", "Bridge stopped");
    Ok(())
}

fn run_bridge_session(
    port: Box<dyn SerialPort>,
    midi_out: &mut MidiOutputConnection,
    running: &AtomicBool,
    microfreak_mode: bool,
    sent_count: &mut usize,
) -> Result<()> {
    let mut reader = BufReader::new(port);
    let mut line = String::new();

    while running.load(Ordering::SeqCst) {
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) => continue,
            Ok(_) => {
                if line.starts_with("@I ") {
                    emit_status("info", "device", line.trim_start_matches("@I ").trim());
                    continue;
                }
                if let Some(packet) = parse_beca_midi_line(&line) {
                    if let Some(packet) = transform_bridge_packet(&packet, microfreak_mode) {
                        midi_out
                            .send(&packet.as_bytes())
                            .context("failed to send midi packet")?;
                        *sent_count += 1;
                        if *sent_count % 16 == 0 {
                            emit_status(
                                "activity",
                                "running",
                                &format!("midi_packets={sent_count}"),
                            );
                        }
                    }
                }
            }
            Err(err) => {
                if matches!(err.kind(), ErrorKind::TimedOut | ErrorKind::WouldBlock) {
                    continue;
                }
                return Err(anyhow!(err.to_string()));
            }
        }
    }

    Ok(())
}

fn open_midi_output(target_name: &str) -> Result<MidiOutputConnection> {
    let midi_out = MidiOutput::new("BECA Bridge")?;
    let ports = midi_out.ports();
    if ports.is_empty() {
        #[cfg(target_os = "windows")]
        {
            return Err(anyhow!(
                "No MIDI outputs detected. Install or start loopMIDI (https://www.tobias-erichsen.de/software/loopmidi.html), then retry."
            ));
        }
        #[cfg(not(target_os = "windows"))]
        {
            return Err(anyhow!(
                "No MIDI outputs detected. Install/enable a MIDI destination, then retry."
            ));
        }
    }

    if target_name.eq_ignore_ascii_case("auto") {
        let idx = best_midi_port_index(&midi_out, &ports)?;
        let selected_name = midi_out.port_name(&ports[idx])?;
        return midi_out
            .connect(&ports[idx], "BECA Bridge")
            .with_context(|| format!("failed to open MIDI output {selected_name}"));
    }

    for port in &ports {
        let name = midi_out.port_name(port)?;
        if name.eq_ignore_ascii_case(target_name)
            || name
                .to_ascii_lowercase()
                .contains(&target_name.to_ascii_lowercase())
        {
            return midi_out
                .connect(port, "BECA Bridge")
                .with_context(|| format!("failed to open MIDI output {name}"));
        }
    }

    Err(anyhow!(
        "MIDI output '{target_name}' was not found. Run `beca-bridge list-midi` to inspect available ports."
    ))
}

fn best_midi_port_index(midi_out: &MidiOutput, ports: &[midir::MidiOutputPort]) -> Result<usize> {
    let preferred = ["beca", "loopmidi", "loopbe", "internal midi"];
    for key in preferred {
        for (idx, port) in ports.iter().enumerate() {
            let name = midi_out.port_name(port)?.to_ascii_lowercase();
            if name.contains(key) {
                return Ok(idx);
            }
        }
    }

    for (idx, port) in ports.iter().enumerate() {
        let name = midi_out.port_name(port)?.to_ascii_lowercase();
        if !name.contains("microsoft gs wavetable") {
            return Ok(idx);
        }
    }

    Ok(0)
}

fn send_test_note(midi_out: &mut MidiOutputConnection) -> Result<()> {
    let notes = [60u8, 64u8, 67u8];
    for note in notes {
        midi_out.send(&[0x90, note, 96])?;
        thread::sleep(Duration::from_millis(60));
        midi_out.send(&[0x80, note, 0])?;
    }
    Ok(())
}

fn emit_status(event: &str, state: &str, detail: &str) {
    let payload = StatusEvent {
        event: event.to_string(),
        state: state.to_string(),
        detail: detail.to_string(),
    };
    if let Ok(json) = serde_json::to_string(&payload) {
        let mut out = std::io::stdout();
        let _ = writeln!(out, "{json}");
        let _ = out.flush();
    }
}
