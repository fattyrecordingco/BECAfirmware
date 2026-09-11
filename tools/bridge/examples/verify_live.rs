//! Hardware regression: pass BECA's COM port and an installed MIDI loopback name.
//! Temporarily edits musical/light settings, then restores them, even on failure.
use anyhow::{anyhow, ensure, Result};
use beca_bridge::{routing::MidiRoute, session::BridgeSession};
use midir::MidiInput;
use serde_json::{json, Value};
use std::{
    collections::BTreeSet,
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

fn main() -> Result<()> {
    let args: Vec<_> = std::env::args().collect();
    let serial = args
        .get(1)
        .ok_or_else(|| anyhow!("Provide a BECA serial port"))?;
    let midi_name = args
        .get(2)
        .ok_or_else(|| anyhow!("Provide a MIDI loopback port"))?;
    let input = MidiInput::new("BECA verification")?;
    let port = input
        .ports()
        .into_iter()
        .find(|p| input.port_name(p).ok().as_ref() == Some(midi_name))
        .ok_or_else(|| anyhow!("Loopback input not found"))?;
    let received = Arc::new(Mutex::new(Vec::<Vec<u8>>::new()));
    let capture = received.clone();
    let _input = input
        .connect(
            &port,
            "BECA verification",
            move |_, bytes, _| {
                let mut packets = capture.lock().unwrap();
                if packets.len() < 100_000 {
                    packets.push(bytes.to_vec());
                }
            },
            (),
        )
        .map_err(|e| anyhow!(e.to_string()))?;
    let mut first = MidiRoute::full("low", midi_name, false);
    first.output_channel = 3;
    first.note_max = 115;
    let mut second = first.clone();
    second.id = "high".into();
    second.output_channel = 4;
    second.transpose = 12;
    let bridge = BridgeSession::start(
        serial.clone(),
        vec![first.clone(), second.clone()],
        |event| {
            if event.event == "status" {
                println!("{}: {}", event.state, event.detail);
            }
        },
    )?;
    let command = |text: &str| -> Result<Value> {
        let tag = text.split_whitespace().next().unwrap();
        let reply = bridge.serial(serial, &format!("@C {text}"), tag, 3000)?;
        ensure!(
            reply["ok"] != false && reply["ok"] != 0,
            "{tag} rejected: {}",
            reply["err"]
        );
        Ok(reply)
    };
    let saved = command("STATE")?;
    let sound = command("SYNTH")?;
    let run = (|| -> Result<()> {
        let params = command("PARAMS")?;
        ensure!(
            params["output_modes"]
                .as_array()
                .is_some_and(|p| p.len() == 4),
            "Combined output missing"
        );
        command("SET mute 1")?;
        command("SET master 0.025")?;
        command("SET outputmode 3")?;
        command("SET mode 0")?;
        command("SET daw_sync 0")?;
        command("SET clock 0")?;
        command("SET rest 0")?;
        command("SET bpm 180")?;
        command("SET bright 110")?;
        command("SET vs 180")?;
        command("SET vi 170")?;
        command("SET mute 0")?;
        command("SYNTH_TEST")?;
        let mut led_checks = vec![];
        let mut worst_ms = 0u128;
        for effect in 0..10 {
            command(&format!("SET fx {effect}"))?;
            let mut frames = BTreeSet::new();
            let mut nonzero = false;
            for sample in 0..8 {
                thread::sleep(Duration::from_millis(95));
                let start = Instant::now();
                let reply = command("LEDS")?;
                worst_ms = worst_ms.max(start.elapsed().as_millis());
                ensure!(
                    reply["display"] == 4 && reply["effect"] == effect,
                    "Selected LED effect is not rendered: {reply}"
                );
                let rgb = reply["rgb"]
                    .as_array()
                    .ok_or_else(|| anyhow!("LED frame missing"))?;
                ensure!(rgb.len() == 8, "Wrong LED count");
                nonzero |= rgb.iter().any(|p| {
                    p.as_array()
                        .unwrap()
                        .iter()
                        .any(|c| c.as_u64().unwrap_or(0) > 0)
                });
                frames.insert(reply["rgb"].to_string());
                command(&format!("SET cutoff {}", 900 + effect * 200 + sample * 10))?;
            }
            ensure!(
                nonzero && frames.len() > 1,
                "LED effect {effect} is dark or static"
            );
            led_checks.push(json!({"effect":effect,"distinct_frames":frames.len()}));
        }
        ensure!(
            command("STATE")?["outputmode"] == 3,
            "Combined output changed during live edits"
        );
        command("SYNTH_TEST")?;
        let before = received.lock().unwrap().clone();
        let notes: Vec<_> = before
            .iter()
            .filter(|p| p.len() == 3 && p[0] & 0xF0 == 0x90 && p[2] > 0)
            .collect();
        ensure!(
            notes.iter().any(|p| p[0] == 0x92),
            "No plant notes reached split 1"
        );
        ensure!(
            notes.iter().any(|p| p[0] == 0x93),
            "No plant notes reached split 2"
        );
        for p in notes.iter().filter(|p| p[0] == 0x92) {
            ensure!(
                notes.iter().any(|q| q[0] == 0x93 && q[1] == p[1] + 12),
                "Transposed layer missing"
            );
        }
        let mut unavailable = first.clone();
        unavailable.port = "Missing BECA verification destination".into();
        ensure!(
            bridge.update_routes(vec![unavailable]).is_err(),
            "Missing output was accepted"
        );
        ensure!(
            bridge.status().routes.len() == 2,
            "Failed edit replaced live routes"
        );
        let mut drums = MidiRoute::full("drums", midi_name, false);
        drums.input_channel = 10;
        bridge.update_routes(vec![drums])?;
        command("SET mode 3")?;
        command("SET drumsel 255")?;
        let drum_start = received.lock().unwrap().len();
        for _ in 0..30 {
            thread::sleep(Duration::from_millis(80));
            command("LIVE")?;
        }
        ensure!(
            received.lock().unwrap()[drum_start..]
                .iter()
                .any(|p| p.len() == 3 && p[0] == 0x99 && p[2] > 0),
            "MIDI drum mode did not reach channel 10"
        );
        command("SET drumsel 0")?;
        thread::sleep(Duration::from_millis(200));
        let disabled_start = received.lock().unwrap().len();
        for _ in 0..8 {
            thread::sleep(Duration::from_millis(80));
            command("LIVE")?;
        }
        ensure!(
            !received.lock().unwrap()[disabled_start..]
                .iter()
                .any(|p| p.len() == 3 && p[0] == 0x99 && p[2] > 0),
            "Disabled drum parts still emitted notes"
        );
        command("SET mode 0")?;
        second.output_channel = 5;
        bridge.update_routes(vec![second.clone()])?;
        let after_edit = received.lock().unwrap().len();
        for _ in 0..30 {
            thread::sleep(Duration::from_millis(80));
            command("LIVE")?;
        }
        ensure!(
            received.lock().unwrap()[after_edit..]
                .iter()
                .any(|p| p.len() == 3 && p[0] == 0x94 && p[2] > 0),
            "Edited split did not receive notes"
        );
        command("SET mute 1")?;
        bridge.panic()?;
        thread::sleep(Duration::from_millis(100));
        let all = received.lock().unwrap();
        let mut held = BTreeSet::new();
        for p in all.iter().filter(|p| p.len() == 3) {
            if p[0] & 0xF0 == 0x90 && p[2] > 0 {
                held.insert((p[0] & 15, p[1]));
            }
            if p[0] & 0xF0 == 0x80 || (p[0] & 0xF0 == 0x90 && p[2] == 0) {
                held.remove(&(p[0] & 15, p[1]));
            }
        }
        ensure!(held.is_empty(), "Routed notes were left held: {held:?}");
        println!(
            "{}",
            json!({"led_effects":led_checks,"control_response_ms_max":worst_ms,"loopback_packets":all.len(),"plant_note_ons":notes.len(),"held_notes_after_panic":held.len(),"combined_aux_test":true,"midi_drums":true})
        );
        Ok(())
    })();
    let restore = (|| -> Result<()> {
        command("SET mute 1")?;
        for key in ["master", "cutoff"] {
            command(&format!("SET {key} {}", sound[key]))?;
        }
        for key in [
            "mode",
            "daw_sync",
            "clock",
            "rest",
            "bpm",
            "bright",
            "vs",
            "vi",
            "pal",
            "fx",
            "drumsel",
            "outputmode",
        ] {
            command(&format!("SET {key} {}", saved[key]))?;
        }
        command(&format!("SET mute {}", saved["io_muted"]))?;
        Ok(())
    })();
    bridge.stop()?;
    restore?;
    run?;
    println!("PASS: real device, shared serial control, LED frames, MIDI loopback splits and cleanup. Settings restored.");
    Ok(())
}
