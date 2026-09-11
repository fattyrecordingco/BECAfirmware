use crate::parse_beca_midi_line;
use crate::routing::{validate_routes, MidiRoute, MidiRouter, RoutedPacket};
use anyhow::{anyhow, Context, Result};
use midir::{MidiOutput, MidiOutputConnection};
use serde::Serialize;
use serde_json::{json, Value};
use serialport::SerialPort;
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::io::{ErrorKind, Read, Write};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc, Mutex,
};
use std::thread;
use std::time::{Duration, Instant};

#[derive(Clone, Debug, Serialize)]
pub struct SessionStatus {
    pub running: bool,
    pub connected: bool,
    pub serial_port: String,
    pub routes: Vec<MidiRoute>,
    pub packets: u64,
    pub issue: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
pub struct SessionEvent {
    pub event: String,
    pub state: String,
    pub detail: String,
}
type Events = Arc<dyn Fn(SessionEvent) + Send + Sync>;
type Reply = mpsc::SyncSender<Result<Value>>;
enum Action {
    Serial(String, String),
    Routes(Vec<MidiRoute>),
    Panic,
    Stop,
}
struct Command {
    action: Action,
    deadline: Instant,
    reply: Reply,
}
struct Inner {
    tx: mpsc::SyncSender<Command>,
    status: Arc<Mutex<SessionStatus>>,
    running: Arc<AtomicBool>,
}
impl Drop for Inner {
    fn drop(&mut self) {
        self.running.store(false, Ordering::Release);
    }
}
#[derive(Clone)]
pub struct BridgeSession {
    inner: Arc<Inner>,
}

impl BridgeSession {
    pub fn start(
        serial_port: String,
        routes: Vec<MidiRoute>,
        on_event: impl Fn(SessionEvent) + Send + Sync + 'static,
    ) -> Result<Self> {
        validate_routes(&routes)?;
        let (tx, rx) = mpsc::sync_channel(32);
        let (started_tx, started_rx) = mpsc::sync_channel(1);
        let status = Arc::new(Mutex::new(SessionStatus {
            running: true,
            connected: false,
            serial_port: serial_port.clone(),
            routes: routes.clone(),
            packets: 0,
            issue: None,
        }));
        let running = Arc::new(AtomicBool::new(true));
        let (worker_status, worker_running) = (status.clone(), running.clone());
        let events: Events = Arc::new(on_event);
        thread::Builder::new()
            .name("beca-midi-control".into())
            .spawn(move || {
                let result = (|| -> Result<()> {
                    let mut outputs = Outputs::default();
                    outputs.prepare(&routes)?;
                    let port = connect_port(&serial_port)?;
                    let _ = started_tx.send(Ok(()));
                    worker(
                        port,
                        outputs,
                        routes,
                        &serial_port,
                        rx,
                        &worker_status,
                        &worker_running,
                        &events,
                    )
                })();
                if let Err(error) = &result {
                    let _ = started_tx.send(Err(error.to_string()));
                }
                worker_running.store(false, Ordering::Release);
                let mut s = worker_status.lock().unwrap();
                s.running = false;
                s.connected = false;
                s.issue = result.err().map(|e| e.to_string());
                let detail = s
                    .issue
                    .clone()
                    .unwrap_or_else(|| "Bridge stopped; owned notes released.".into());
                drop(s);
                emit(&events, "status", "stopped", &detail);
            })?;
        match started_rx.recv_timeout(Duration::from_secs(6)) {
            Ok(Ok(())) => Ok(Self {
                inner: Arc::new(Inner {
                    tx,
                    status,
                    running,
                }),
            }),
            other => {
                running.store(false, Ordering::Release);
                Err(anyhow!(match other {
                    Ok(Err(e)) => e,
                    _ => "Bridge startup timed out.".into(),
                }))
            }
        }
    }
    pub fn status(&self) -> SessionStatus {
        self.inner.status.lock().unwrap().clone()
    }
    fn call(&self, action: Action, timeout: Duration) -> Result<Value> {
        if !self.inner.running.load(Ordering::Acquire) {
            return Err(anyhow!("Bridge is stopped."));
        }
        let (tx, rx) = mpsc::sync_channel(1);
        self.inner
            .tx
            .try_send(Command {
                action,
                deadline: Instant::now() + timeout,
                reply: tx,
            })
            .map_err(|_| anyhow!("Bridge is busy or disconnected; this action was not queued."))?;
        rx.recv_timeout(timeout + Duration::from_millis(300))
            .map_err(|_| anyhow!("Bridge request expired; it will not be replayed."))?
    }
    pub fn serial(&self, port: &str, command: &str, tag: &str, timeout_ms: u64) -> Result<Value> {
        if !self.status().serial_port.eq_ignore_ascii_case(port) {
            return Err(anyhow!("The bridge belongs to another BECA serial port."));
        }
        validate_control_command(command, tag)?;
        self.call(
            Action::Serial(command.into(), tag.into()),
            Duration::from_millis(timeout_ms),
        )
    }
    pub fn update_routes(&self, routes: Vec<MidiRoute>) -> Result<Value> {
        validate_routes(&routes)?;
        self.call(Action::Routes(routes), Duration::from_secs(4))
    }
    pub fn panic(&self) -> Result<Value> {
        self.call(Action::Panic, Duration::from_secs(3))
    }
    pub fn stop(&self) -> Result<()> {
        if !self.inner.running.load(Ordering::Acquire) {
            return Ok(());
        }
        self.call(Action::Stop, Duration::from_secs(4))?;
        Ok(())
    }
}

fn validate_control_command(command: &str, tag: &str) -> Result<()> {
    if command.len() > 180
        || command.contains(['\r', '\n'])
        || !command.starts_with("@C ")
        || tag.is_empty()
        || tag.contains(char::is_whitespace)
    {
        return Err(anyhow!("Invalid bridge control command."));
    }
    let verb = command[3..].split_whitespace().next().unwrap_or("");
    if verb != tag
        || ![
            "PING",
            "WIFI_INFO",
            "LIVE",
            "STATE",
            "PLANT",
            "NOTES",
            "DRUM",
            "PARAMS",
            "SYNTH",
            "SYNTH_TEST",
            "SET",
            "PINS",
            "LEDS",
        ]
        .contains(&verb)
    {
        return Err(anyhow!(
            "This setup command requires stopping the bridge first."
        ));
    }
    Ok(())
}

#[derive(Default)]
pub struct LineFrames {
    bytes: Vec<u8>,
    discard: bool,
}
impl LineFrames {
    pub fn push(&mut self, bytes: &[u8]) -> Vec<String> {
        let mut lines = vec![];
        for b in bytes {
            if *b == b'\n' {
                if !self.discard {
                    lines.push(
                        String::from_utf8_lossy(&self.bytes)
                            .trim_end_matches('\r')
                            .to_string(),
                    );
                }
                self.bytes.clear();
                self.discard = false;
            } else if !self.discard {
                if self.bytes.len() == 8192 {
                    self.bytes.clear();
                    self.discard = true;
                } else {
                    self.bytes.push(*b);
                }
            }
        }
        lines
    }
}

#[derive(Default)]
struct Outputs {
    ports: BTreeMap<String, MidiOutputConnection>,
}
impl Outputs {
    // Open new destinations first; a failed edit leaves the existing outputs intact.
    fn prepare(&mut self, routes: &[MidiRoute]) -> Result<()> {
        let required: BTreeSet<_> = routes
            .iter()
            .filter(|r| r.enabled)
            .map(|r| r.port.clone())
            .collect();
        let mut additions = BTreeMap::new();
        for name in required
            .iter()
            .filter(|name| !self.ports.contains_key(*name))
        {
            let midi = MidiOutput::new("BECA")?;
            #[cfg(unix)]
            if name == crate::ports::APP_MIDI_PORT {
                use midir::os::unix::VirtualOutput;
                let connection = midi
                    .create_virtual("BECA")
                    .map_err(|e| anyhow!("Cannot create BECA MIDI port: {e}"))?;
                additions.insert(name.clone(), connection);
                continue;
            }
            let matches: Vec<_> = midi
                .ports()
                .into_iter()
                .filter(|port| midi.port_name(port).ok().as_deref() == Some(name))
                .collect();
            if matches.len() != 1 {
                return Err(anyhow!("MIDI output '{name}' is missing or ambiguous. Refresh outputs and choose a destination."));
            }
            let connection = midi
                .connect(&matches[0], "BECA split")
                .map_err(|e| anyhow!("Cannot open {name}: {e}"))?;
            additions.insert(name.clone(), connection);
        }
        self.ports.extend(additions);
        Ok(())
    }
    fn retain(&mut self, routes: &[MidiRoute]) {
        self.ports
            .retain(|port, _| routes.iter().any(|r| r.enabled && &r.port == port));
    }
    fn send(&mut self, packets: Vec<RoutedPacket>) -> Result<u64> {
        let mut count = 0;
        let mut error = None;
        for (name, packet) in packets {
            if let Some(output) = self.ports.get_mut(&name) {
                let bytes = packet.as_bytes();
                let len = if [0xC0, 0xD0].contains(&(packet.status & 0xF0)) {
                    2
                } else {
                    3
                };
                match output.send(&bytes[..len]) {
                    Ok(()) => count += 1,
                    Err(e) => error = Some(anyhow!("MIDI output {name} failed: {e}")),
                }
            }
        }
        error.map_or(Ok(count), Err)
    }
}

fn connect_port(name: &str) -> Result<Box<dyn SerialPort>> {
    let mut port = serialport::new(name, 115200)
        .timeout(Duration::from_millis(8))
        .dtr_on_open(false)
        .open()?;
    let _ = port.write_request_to_send(false);
    thread::sleep(Duration::from_millis(160));
    port.clear(serialport::ClearBuffer::Input)?;
    port.write_all(b"@C PING\n")?;
    let mut frames = LineFrames::default();
    let mut buf = [0u8; 1024];
    let end = Instant::now() + Duration::from_secs(2);
    while Instant::now() < end {
        match port.read(&mut buf) {
            Ok(n) => {
                for line in frames.push(&buf[..n]) {
                    if line.starts_with("@R PING ") {
                        return Ok(port);
                    }
                }
            }
            Err(e) if matches!(e.kind(), ErrorKind::TimedOut | ErrorKind::WouldBlock) => {}
            Err(e) => return Err(e.into()),
        }
    }
    Err(anyhow!("BECA did not answer the serial handshake."))
}

fn emit(events: &Events, event: &str, state: &str, detail: &str) {
    events(SessionEvent {
        event: event.into(),
        state: state.into(),
        detail: detail.into(),
    });
}
fn worker(
    initial_port: Box<dyn SerialPort>,
    mut outputs: Outputs,
    routes: Vec<MidiRoute>,
    serial_name: &str,
    rx: mpsc::Receiver<Command>,
    status: &Arc<Mutex<SessionStatus>>,
    running: &AtomicBool,
    events: &Events,
) -> Result<()> {
    let mut port = Some(initial_port);
    let mut router = MidiRouter::new(routes);
    let mut frames = LineFrames::default();
    let mut pending: Option<Command> = None;
    let mut waiting = VecDeque::<Command>::new();
    let mut next_heartbeat = Instant::now();
    let mut next_connect = Instant::now();
    let mut next_activity = Instant::now();
    let mut last_activity = 0;
    let mut stop_reply = None;
    status.lock().unwrap().connected = true;
    emit(
        events,
        "status",
        "connected",
        "USB MIDI and live controls share one connection.",
    );
    let result = (|| -> Result<()> {
        let mut buf = [0u8; 2048];
        while running.load(Ordering::Acquire) {
            while waiting.len() < 32 {
                match rx.try_recv() {
                    Ok(c) => waiting.push_back(c),
                    Err(_) => break,
                }
            }
            if let Some(index) = waiting
                .iter()
                .position(|c| matches!(c.action, Action::Stop | Action::Panic))
            {
                let c = waiting.remove(index).unwrap();
                let cleanup = outputs.send(router.panic()).map(|_| json!({"ok":true}));
                if matches!(c.action, Action::Stop) {
                    stop_reply = Some(c.reply);
                    break;
                }
                let _ = c.reply.send(cleanup);
            }
            if pending.is_none() {
                if let Some(c) = waiting.pop_front() {
                    if Instant::now() >= c.deadline {
                        let _ = c
                            .reply
                            .send(Err(anyhow!("Expired action was not applied.")));
                        continue;
                    }
                    match &c.action {
                        Action::Routes(routes) => {
                            let reply = outputs.prepare(routes).and_then(|_| {
                                outputs.send(router.panic())?;
                                outputs.retain(routes);
                                router.routes = routes.clone();
                                status.lock().unwrap().routes = routes.clone();
                                Ok(json!({"ok":true,"routes":routes}))
                            });
                            let _ = c.reply.send(reply);
                        }
                        Action::Serial(command, _) => {
                            if let Some(p) = port.as_mut() {
                                p.write_all(format!("{command}\n").as_bytes())
                                    .context("serial command write failed")?;
                                pending = Some(c);
                            } else {
                                let _ = c.reply.send(Err(anyhow!(
                                    "USB is reconnecting; command was not sent."
                                )));
                            }
                        }
                        _ => {}
                    }
                }
            }
            if port.is_none() {
                if Instant::now() >= next_connect {
                    if let Ok(p) = connect_port(serial_name) {
                        port = Some(p);
                        frames = LineFrames::default();
                        let mut s = status.lock().unwrap();
                        s.connected = true;
                        s.issue = None;
                        drop(s);
                        emit(
                            events,
                            "status",
                            "connected",
                            "USB MIDI and live controls reconnected.",
                        );
                    }
                    next_connect = Instant::now() + Duration::from_millis(1000);
                }
                thread::sleep(Duration::from_millis(10));
                continue;
            }
            let mut failure = None;
            if pending
                .as_ref()
                .is_some_and(|c| Instant::now() >= c.deadline)
            {
                failure =
                    Some("Device reply timed out; requests will not be replayed.".to_string());
            }
            if Instant::now() >= next_heartbeat {
                if let Err(e) = port.as_mut().unwrap().write_all(b"@C SERIAL_HOST\n") {
                    failure = Some(e.to_string());
                }
                next_heartbeat = Instant::now() + Duration::from_millis(750);
            }
            match port.as_mut().unwrap().read(&mut buf) {
                Ok(n) => {
                    for line in frames.push(&buf[..n]) {
                        if let Some(packet) = parse_beca_midi_line(&line) {
                            let sent = outputs.send(router.route(&packet))?;
                            status.lock().unwrap().packets += sent;
                        } else if let Some(c) = &pending {
                            if let Action::Serial(_, tag) = &c.action {
                                let prefix = format!("@R {tag} ");
                                if let Some(body) = line.strip_prefix(&prefix) {
                                    let reply = serde_json::from_str::<Value>(body)
                                        .map_err(anyhow::Error::from);
                                    let _ = pending.take().unwrap().reply.send(reply);
                                }
                            }
                        }
                    }
                }
                Err(e) if matches!(e.kind(), ErrorKind::TimedOut | ErrorKind::WouldBlock) => {}
                Err(e) => failure = Some(e.to_string()),
            }
            if let Some(issue) = failure {
                let _ = outputs.send(router.panic());
                port = None;
                if let Some(c) = pending.take() {
                    let _ = c.reply.send(Err(anyhow!(issue.clone())));
                }
                for c in waiting.drain(..) {
                    let _ = c
                        .reply
                        .send(Err(anyhow!("USB disconnected; queued action cancelled.")));
                }
                while let Ok(c) = rx.try_recv() {
                    let _ = c
                        .reply
                        .send(Err(anyhow!("USB disconnected; action cancelled.")));
                }
                let mut s = status.lock().unwrap();
                s.connected = false;
                s.issue = Some(issue.clone());
                drop(s);
                emit(events, "status", "reconnecting", &issue);
                next_connect = Instant::now() + Duration::from_millis(500);
            }
            if Instant::now() >= next_activity {
                let packets = status.lock().unwrap().packets;
                if packets != last_activity {
                    emit(
                        events,
                        "activity",
                        "running",
                        &format!("midi_packets={packets}"),
                    );
                    last_activity = packets;
                }
                next_activity = Instant::now() + Duration::from_millis(500);
            }
        }
        Ok(())
    })();
    let _ = outputs.send(router.panic());
    if let Some(c) = pending {
        let _ = c.reply.send(Err(anyhow!("Bridge stopped.")));
    }
    for c in waiting {
        let _ = c.reply.send(Err(anyhow!("Bridge stopped.")));
    }
    drop(port);
    drop(outputs);
    running.store(false, Ordering::Release);
    {
        let mut s = status.lock().unwrap();
        s.running = false;
        s.connected = false;
    }
    if let Some(reply) = stop_reply {
        let _ = reply.send(Ok(json!({"ok":true})));
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fragmented_midi_and_control_replies_survive_read_boundaries() {
        let mut frames = LineFrames::default();
        assert!(frames.push(b"@M 90 3").is_empty());
        assert_eq!(
            frames.push(b"C 64\n@R LIVE {\"ok\":1}\n"),
            vec!["@M 90 3C 64", "@R LIVE {\"ok\":1}"]
        );
        assert!(frames.push(&vec![b'x'; 9000]).is_empty());
        assert_eq!(frames.push(b"\n@M 80 3C 00\n"), vec!["@M 80 3C 00"]);
    }
    #[test]
    fn blocks_multiline_and_setup_commands() {
        assert!(validate_control_command("@C SET cutoff 900", "SET").is_ok());
        assert!(validate_control_command("@C SET cutoff 900\n@C WIFI_FORGET", "SET").is_err());
        assert!(validate_control_command("@C WIFI_FORGET", "WIFI_FORGET").is_err());
        assert!(validate_control_command("@C STATE", "SET").is_err());
    }
}
