use anyhow::{anyhow, Context, Result};
use beca_bridge::{
    list_midi_outputs, list_serial_ports, routing::MidiRoute, session::BridgeSession,
};
use clap::{Parser, Subcommand};
use midir::{MidiOutput, MidiOutputConnection};
use serde::Serialize;
use std::io::Write;
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
        secondary_midi_port: Option<String>,
        #[arg(long)]
        microfreak_mode: bool,
        #[arg(long)]
        secondary_microfreak_mode: bool,
        #[arg(long, default_value_t = 115200)]
        baud: u32,
        #[arg(
            long,
            default_value_t = 1500,
            help = "Legacy option; shared session retries after a verified USB handshake"
        )]
        reconnect_ms: u64,
    },
    TestNote {
        #[arg(long)]
        midi_port: String,
        #[arg(long)]
        secondary_midi_port: Option<String>,
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
            secondary_midi_port,
            microfreak_mode,
            secondary_microfreak_mode,
            baud,
            reconnect_ms,
        } => {
            run_bridge(
                &serial_port,
                &midi_port,
                secondary_midi_port.as_deref(),
                microfreak_mode,
                secondary_microfreak_mode,
                baud,
                reconnect_ms,
            )?;
        }
        Commands::TestNote {
            midi_port,
            secondary_midi_port,
        } => {
            let mut routes =
                open_output_routes(&midi_port, false, secondary_midi_port.as_deref(), false)?;
            send_test_note(&mut routes)?;
            println!("{}", r#"{"status":"ok","detail":"test note sent"}"#);
        }
    }

    Ok(())
}

fn run_bridge(
    serial_port_name: &str,
    midi_port_name: &str,
    secondary_midi_port_name: Option<&str>,
    microfreak_mode: bool,
    secondary_microfreak_mode: bool,
    baud: u32,
    _reconnect_ms: u64,
) -> Result<()> {
    if baud != 115200 {
        return Err(anyhow!(
            "BECA's control and MIDI protocol uses 115200 baud."
        ));
    }
    let running = Arc::new(AtomicBool::new(true));
    let signal = running.clone();
    ctrlc::set_handler(move || {
        signal.store(false, Ordering::SeqCst);
    })
    .context("failed to install signal handler")?;
    let mut routes = vec![MidiRoute::full(
        "primary",
        &resolve_output_name(midi_port_name)?,
        microfreak_mode,
    )];
    if let Some(name) = secondary_midi_port_name.filter(|s| !s.trim().is_empty()) {
        routes.push(MidiRoute::full(
            "mirror",
            &resolve_output_name(name)?,
            secondary_microfreak_mode,
        ));
    }
    let session = BridgeSession::start(serial_port_name.into(), routes, |e| {
        emit_status(&e.event, &e.state, &e.detail)
    })?;
    while running.load(Ordering::SeqCst) && session.status().running {
        thread::sleep(Duration::from_millis(50));
    }
    let issue = session.status().issue;
    session.stop()?;
    if let Some(issue) = issue {
        return Err(anyhow!(issue));
    }
    Ok(())
}

fn resolve_output_name(target: &str) -> Result<String> {
    #[cfg(unix)]
    if target.eq_ignore_ascii_case("auto") || target == beca_bridge::ports::APP_MIDI_PORT {
        return Ok(beca_bridge::ports::APP_MIDI_PORT.into());
    }
    let midi = MidiOutput::new("BECA outputs")?;
    let ports = midi.ports();
    if ports.is_empty() {
        return Err(anyhow!("No MIDI outputs detected."));
    }
    if target.eq_ignore_ascii_case("auto") {
        return Ok(midi.port_name(&ports[best_midi_port_index(&midi, &ports)?])?);
    }
    let names: Vec<_> = ports
        .iter()
        .filter_map(|p| midi.port_name(p).ok())
        .collect();
    if let Some(name) = names.iter().find(|name| name.eq_ignore_ascii_case(target)) {
        return Ok(name.clone());
    }
    let matches: Vec<_> = names
        .into_iter()
        .filter(|name| name.to_lowercase().contains(&target.to_lowercase()))
        .collect();
    if matches.len() == 1 {
        return Ok(matches[0].clone());
    }
    Err(anyhow!(
        "Output '{target}' is missing or ambiguous. Use list-midi and choose its full name."
    ))
}

struct OutputRoute {
    connection: MidiOutputConnection,
}

fn open_output_routes(
    primary_name: &str,
    _primary_microfreak_mode: bool,
    secondary_name: Option<&str>,
    _secondary_microfreak_mode: bool,
) -> Result<Vec<OutputRoute>> {
    if let Some(secondary_name) = secondary_name {
        if primary_name.eq_ignore_ascii_case(secondary_name) {
            return Err(anyhow!(
                "Primary and mirrored MIDI outputs must be different devices."
            ));
        }
    }

    let mut routes = vec![OutputRoute {
        connection: open_midi_output(primary_name)?,
    }];

    if let Some(secondary_name) = secondary_name.filter(|name| !name.trim().is_empty()) {
        routes.push(OutputRoute {
            connection: open_midi_output(secondary_name)?,
        });
    }

    Ok(routes)
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
            .map_err(|err| anyhow!("failed to open MIDI output {selected_name}: {err}"));
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
                .map_err(|err| anyhow!("failed to open MIDI output {name}: {err}"));
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

fn send_test_note(routes: &mut [OutputRoute]) -> Result<()> {
    let notes = [60u8, 64u8, 67u8];
    for note in notes {
        for route in routes.iter_mut() {
            route.connection.send(&[0x90, note, 96])?;
        }
        thread::sleep(Duration::from_millis(60));
        for route in routes.iter_mut() {
            route.connection.send(&[0x80, note, 0])?;
        }
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
