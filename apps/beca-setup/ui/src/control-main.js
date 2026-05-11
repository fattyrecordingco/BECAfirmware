import { invoke } from "@tauri-apps/api/core";

const POLL_INTERVAL_MS = {
  network: 900,
  serial: 900,
  fallback: 900,
  nativeStream: 10000,
  stale: 1200,
  render: 33,
  error: 1800
};
const SCOPE_DELTA_EPSILON = 0.0012;
const SCOPE_FRAME_HEARTBEAT_MS = 84;
const SCOPE_BLEND_LIVE = 0.42;
const SCOPE_BLEND_STALE = 0.22;

function splitPathAndQuery(rawUrl) {
  const [path, search = ""] = rawUrl.split("?");
  const query = Object.fromEntries(new URLSearchParams(search).entries());
  return { path, query };
}

function isLocalControlRoute(rawUrl) {
  return typeof rawUrl === "string" && rawUrl.startsWith("/");
}

function bodyToFormMap(body) {
  if (!body) return {};
  if (typeof body === "string") {
    return Object.fromEntries(new URLSearchParams(body).entries());
  }
  const tag = Object.prototype.toString.call(body);
  if (tag === "[object URLSearchParams]" || tag === "[object FormData]") {
    return Object.fromEntries(body.entries());
  }
  return {};
}

function snapshotStatePayload(snapshot) {
  return JSON.stringify(snapshot.state || {});
}

function snapshotNotePayload(snapshot) {
  const notes = snapshot?.notes || {};
  const held = Number(notes.held || 0);
  const vel = Number(notes.vel || 0);
  const noteList = Array.isArray(notes.notes) ? notes.notes : [];
  return `${held}|${vel}|${noteList.length}|${noteList.join(",")}`;
}

function snapshotDrumPayload(snapshot) {
  const drum = snapshot?.drum || {};
  return `${Number(drum.hit || 0)}|${Number(drum.sel || 0)}`;
}

function createTransportFetch(targetWindow) {
  const nativeFetch = targetWindow.fetch.bind(targetWindow);
  return async function transportFetch(input, init = {}) {
    if (typeof invoke !== "function") {
      return nativeFetch(input, init);
    }

    const url = typeof input === "string" ? input : String(input?.url || "");
    if (!isLocalControlRoute(url)) {
      return nativeFetch(input, init);
    }

    const { path, query } = splitPathAndQuery(url);
    const method = (init.method || "GET").toUpperCase();
    const form = bodyToFormMap(init.body);
    const response = await invoke("control_request", {
      method,
      path,
      query,
      form
    });

    return new targetWindow.Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type": response.content_type || "text/plain"
      }
    });
  };
}

function createAppEventSource(targetWindow, NativeEventSource) {
  return class AppEventSource {
    constructor(url) {
      this.url = url;
      this.listeners = new Map();
      this.closed = false;
      this.lastError = false;
      this.nativeStream = null;
      this.nativeStreaming = false;
      this.scopeTimer = null;
      this.previous = {
        state: "",
        note: "",
        drum: "",
        scope: Number.NaN,
        issue: ""
      };
      this.latestSnapshot = null;
      this.targetScope = 0;
      this.animatedScope = 0;
      this.lastScopeEmitAt = 0;

      queueMicrotask(() => this.emitMessage("hello", "{}"));
      this.startScopeLoop();
      this.startNativeStream();
      this.poll();
    }

    addEventListener(type, handler) {
      if (!this.listeners.has(type)) {
        this.listeners.set(type, new Set());
      }
      this.listeners.get(type).add(handler);
    }

    removeEventListener(type, handler) {
      this.listeners.get(type)?.delete(handler);
    }

    close() {
      this.closed = true;
      if (this.nativeStream) {
        this.nativeStream.close();
        this.nativeStream = null;
      }
      if (this.scopeTimer != null) {
        targetWindow.clearTimeout(this.scopeTimer);
        this.scopeTimer = null;
      }
    }

    emitMessage(type, data) {
      const event = new targetWindow.MessageEvent(type, { data });
      this.listeners.get(type)?.forEach((handler) => handler(event));
    }

    emitError(err) {
      if (typeof this.onerror === "function") {
        this.onerror(err);
      }
    }

    async startNativeStream() {
      if (!NativeEventSource || typeof invoke !== "function") return;

      try {
        const status = await invoke("current_control_target");
        const networkUrl = status?.target?.network_url;
        if (status?.transport !== "network" || !networkUrl) return;

        const streamUrl = `${String(networkUrl).replace(/\/$/, "")}/events`;
        const stream = new NativeEventSource(streamUrl);
        this.nativeStream = stream;

        stream.addEventListener("hello", (event) => {
          if (this.closed) return;
          this.nativeStreaming = true;
          this.lastError = false;
          this.emitMessage("hello", event.data || "{}");
        });

        stream.addEventListener("state", (event) => this.forwardNativeMessage("state", event.data));
        stream.addEventListener("note", (event) => this.forwardNativeMessage("note", event.data));
        stream.addEventListener("drum", (event) => this.forwardNativeMessage("drum", event.data));
        stream.addEventListener("scope", (event) => {
          if (this.closed) return;
          const next = Math.max(0, Math.min(1, Number(event.data || 0)));
          this.nativeStreaming = true;
          this.latestSnapshot = this.latestSnapshot || { stale: false };
          this.targetScope = next;
        });

        stream.onerror = () => {
          this.nativeStreaming = false;
          if (this.closed) return;
          this.nativeStream?.close();
          this.nativeStream = null;
        };
      } catch {
        this.nativeStreaming = false;
      }
    }

    forwardNativeMessage(type, data) {
      if (this.closed) return;
      this.nativeStreaming = true;
      this.lastError = false;
      const payload = String(data || "");
      if (payload === this.previous[type]) return;
      this.previous[type] = payload;
      this.emitMessage(type, payload);
    }

    startScopeLoop() {
      const tick = () => {
        if (this.closed) return;
        this.emitScopeFrame();
        this.scopeTimer = targetWindow.setTimeout(tick, POLL_INTERVAL_MS.render);
      };
      tick();
    }

    emitScopeFrame() {
      if (!this.latestSnapshot) return;

      const blend = this.latestSnapshot?.stale ? SCOPE_BLEND_STALE : SCOPE_BLEND_LIVE;
      this.animatedScope += (this.targetScope - this.animatedScope) * blend;
      if (!Number.isFinite(this.animatedScope)) {
        this.animatedScope = this.targetScope;
      }

      const now = targetWindow.performance?.now?.() || Date.now();
      const shouldEmit =
        !Number.isFinite(this.previous.scope) ||
        Math.abs(this.animatedScope - this.previous.scope) >= SCOPE_DELTA_EPSILON ||
        (now - this.lastScopeEmitAt) >= SCOPE_FRAME_HEARTBEAT_MS;

      if (!shouldEmit) return;

      this.previous.scope = this.animatedScope;
      this.lastScopeEmitAt = now;
      this.emitMessage("scope", this.animatedScope.toFixed(3));
    }

    async poll() {
      while (!this.closed) {
        let nextDelay = this.nativeStreaming
          ? POLL_INTERVAL_MS.nativeStream
          : POLL_INTERVAL_MS.fallback;
        try {
          const snapshot = await invoke("control_snapshot");
          const isStale = Boolean(snapshot?.stale);
          const issue = String(snapshot?.issue || "").trim();
          this.lastError = false;
          this.latestSnapshot = snapshot;
          this.targetScope = Math.max(0, Math.min(1, Number(snapshot?.plant?.value || 0)));
          if (!Number.isFinite(this.animatedScope)) {
            this.animatedScope = this.targetScope;
          }
          if (!Number.isFinite(this.previous.scope)) {
            this.previous.scope = this.targetScope;
            this.animatedScope = this.targetScope;
          }
          nextDelay = this.nativeStreaming
            ? POLL_INTERVAL_MS.nativeStream
            : isStale
            ? POLL_INTERVAL_MS.stale
            : (POLL_INTERVAL_MS[snapshot.transport] || POLL_INTERVAL_MS.fallback);

          if (!this.nativeStreaming) {
            const statePayload = snapshotStatePayload(snapshot);
            if (statePayload !== this.previous.state) {
              this.previous.state = statePayload;
              this.emitMessage("state", statePayload);
            }

            const notePayload = snapshotNotePayload(snapshot);
            if (notePayload !== this.previous.note) {
              this.previous.note = notePayload;
              this.emitMessage("note", notePayload);
            }

            const drumPayload = snapshotDrumPayload(snapshot);
            if (drumPayload !== this.previous.drum) {
              this.previous.drum = drumPayload;
              this.emitMessage("drum", drumPayload);
            }
          }

          if (issue && issue !== this.previous.issue) {
            this.previous.issue = issue;
            if (isStale) {
              this.emitError(new Error(issue));
            }
          } else if (!issue) {
            this.previous.issue = "";
          }
        } catch (err) {
          if (!this.lastError) {
            this.lastError = true;
            this.emitError(err);
          }
          nextDelay = POLL_INTERVAL_MS.error;
        }

        await new Promise((resolve) => targetWindow.setTimeout(resolve, nextDelay));
      }
    }
  };
}

export function installControlTransport(targetWindow = window) {
  if (!targetWindow || targetWindow.__becaControlTransportInstalled) return;
  const NativeEventSource = targetWindow.EventSource;
  targetWindow.fetch = createTransportFetch(targetWindow);
  targetWindow.EventSource = createAppEventSource(targetWindow, NativeEventSource);
  targetWindow.__becaControlTransportInstalled = true;
}
