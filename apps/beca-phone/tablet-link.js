import { parseSerialLine, normalizeCommand, WriteQueue } from "./protocol.js";

export class BecaConnection extends EventTarget {
  constructor(usb) {
    super();
    this.usb = usb;
    this.remote = false;
    this.queue = new WriteQueue(async (command) => {
      if (!this.channel || this.channel.readyState !== "open") throw new Error("Tablet link is closed.");
      if (this.channel.bufferedAmount > 65536) throw new Error("Tablet link is congested. Reconnect.");
      this.channel.send(command);
    });
    for (const type of ["connect", "disconnect", "line", "sent", "transporterror"]) {
      usb.addEventListener(type, (event) => {
        if (type === "line" && this.channel?.readyState === "open" && !this.remote) {
          if (this.channel.bufferedAmount < 65536) this.channel.send(event.detail.raw);
          else this.closeLink();
        }
        if (type === "disconnect") this.closeLink();
        this.dispatchEvent(new CustomEvent(type, { detail: event.detail }));
      });
    }
  }
  get supported() { return this.usb.supported; }
  get port() { return this.usb.port; }
  get connected() { return this.remote ? this.channel?.readyState === "open" : this.usb.connected; }
  connect() { this.closeLink(); return this.usb.connect(); }
  async send(command) {
    if (!this.remote) return this.usb.send(command);
    const normalized = normalizeCommand(command);
    await this.queue.enqueue(normalized);
    this.dispatchEvent(new CustomEvent("sent", { detail: normalized }));
  }
  async disconnect() {
    if (this.remote) this.closeLink();
    else { this.closeLink(); await this.usb.disconnect(); }
  }
  closeLink() {
    const wasRemote = this.remote;
    this.remote = false;
    clearInterval(this.watchdog);
    this.queue.clear();
    const peer = this.peer;
    this.peer = null;
    if (this.channel) this.channel.onclose = null;
    this.channel?.close();
    this.channel = null;
    peer?.close();
    if (wasRemote) this.dispatchEvent(new Event("disconnect"));
    this.dispatchEvent(new Event("linkstate"));
  }
  setupPeer(remote) {
    if (typeof globalThis.RTCPeerConnection !== "function" || !globalThis.isSecureContext) {
      throw new Error("The computer link needs WebRTC on HTTPS. Update your browser and open the published app.");
    }
    this.closeLink();
    this.remote = remote;
    this.peer = new RTCPeerConnection({ iceServers: [] });
    this.peer.onconnectionstatechange = () => {
      if (this.peer && ["failed", "closed", "disconnected"].includes(this.peer.connectionState)) this.closeLink();
    };
    return this.peer;
  }
  bindChannel(channel) {
    this.channel = channel;
    let received = Date.now();
    let windowStart = Date.now();
    let requests = 0;
    channel.onmessage = ({ data }) => {
      received = Date.now();
      if (typeof data !== "string" || data.length > 8192) return;
      if (this.remote) this.dispatchEvent(new CustomEvent("line", { detail: parseSerialLine(data) }));
      else {
        if (Date.now() - windowStart >= 1000) { requests = 0; windowStart = Date.now(); }
        if (++requests > 24 || !/^@C (?:PING|PARAMS|STATE|SYNTH|PLANT|NOTES|PINS|TELEMETRY [01]|SET [a-z_]+ [-\w./]+|SYNTH_TEST|RANDOMIZE)$/.test(data)) return;
        this.usb.send(data).catch((error) => this.dispatchEvent(new CustomEvent("transporterror", { detail: error })));
      }
    };
    channel.onopen = () => {
      received = Date.now();
      this.dispatchEvent(new Event("linkstate"));
      if (this.remote) this.dispatchEvent(new Event("remoteconnect"));
      this.watchdog = setInterval(() => {
        if (this.remote && Date.now() - received > 7000) this.closeLink();
      }, 1000);
    };
    channel.onclose = () => this.closeLink();
  }
  async code() {
    const peer = this.peer;
    if (peer.iceGatheringState !== "complete") await new Promise((resolve, reject) => {
      const finish = () => { clearTimeout(timer); peer.removeEventListener("icegatheringstatechange", changed); resolve(); };
      const changed = () => { if (peer.iceGatheringState === "complete") finish(); };
      const timer = setTimeout(() => {
        peer.removeEventListener("icegatheringstatechange", changed);
        reject(new Error("Local connection discovery timed out. Check Wi-Fi and try again."));
      }, 10000);
      peer.addEventListener("icegatheringstatechange", changed);
    });
    return btoa(JSON.stringify(peer.localDescription));
  }
  decode(code, type) {
    if (code.length > 32768) throw new Error("Link code is too long.");
    try {
      const data = JSON.parse(atob(code.trim()));
      if (data.type !== type || typeof data.sdp !== "string") throw new Error();
      return data;
    } catch { throw new Error(`Paste the ${type === "offer" ? "computer" : "tablet"} code from the other device.`); }
  }
  async offer() {
    if (!this.usb.connected) throw new Error("Connect BECA to this computer by USB first.");
    const peer = this.setupPeer(false);
    this.bindChannel(peer.createDataChannel("beca"));
    await peer.setLocalDescription(await peer.createOffer());
    return this.code();
  }
  async answer(code) {
    if (this.usb.connected) throw new Error("Disconnect local USB before joining a computer.");
    const description = this.decode(code, "offer");
    const peer = this.setupPeer(true);
    peer.ondatachannel = ({ channel }) => this.bindChannel(channel);
    await peer.setRemoteDescription(description);
    await peer.setLocalDescription(await peer.createAnswer());
    return this.code();
  }
  async finish(code) {
    if (!this.peer || this.remote) throw new Error("Create a computer code first.");
    await this.peer.setRemoteDescription(this.decode(code, "answer"));
  }
}
