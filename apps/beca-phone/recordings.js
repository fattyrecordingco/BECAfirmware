import { WavSamples, WAV_RATE, wavFile, midiFile, zipFiles } from "./recording-formats.js";

const MAX_DURATION = 30 * 60 * 1000;
const MAX_MIDI_EVENTS = 100000;
const MAX_PENDING_WRITES = 16;

class RecordingStore {
  open() {
    if (!this.database) this.database = new Promise((resolve, reject) => {
      const request = indexedDB.open("beca-recordings", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("takes", { keyPath: "id" });
        const chunks = request.result.createObjectStore("chunks", { keyPath: ["take", "sequence"] });
        chunks.createIndex("take", "take");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch((error) => { this.database = undefined; throw error; });
    return this.database;
  }

  async transaction(names, mode, run) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(names, mode);
      const request = run(transaction);
      transaction.oncomplete = () => resolve(request?.result);
      transaction.onabort = () => reject(transaction.error ?? new Error("Recording storage unavailable."));
    });
  }

  create(take) {
    return this.transaction(["takes"], "readwrite", (tx) => tx.objectStore("takes").add(take));
  }

  update(take, chunk) {
    return this.transaction(["takes", "chunks"], "readwrite", (tx) => {
      const takes = tx.objectStore("takes");
      const existing = takes.getKey(take.id);
      existing.onsuccess = () => {
        if (existing.result === undefined) { tx.abort(); return; }
        if (chunk) tx.objectStore("chunks").add(chunk);
        takes.put(take);
      };
    });
  }

  async list() {
    const takes = await this.transaction(["takes"], "readonly", (tx) => tx.objectStore("takes").getAll());
    return takes.filter((take) => take.frames || take.events).sort((a, b) => b.date - a.date);
  }

  read(id) {
    return this.transaction(["chunks"], "readonly", (tx) => tx.objectStore("chunks").index("take").getAll(id));
  }

  remove(id) {
    return this.transaction(["takes", "chunks"], "readwrite", (tx) => {
      tx.objectStore("takes").delete(id);
      const chunks = tx.objectStore("chunks");
      const request = chunks.index("take").openKeyCursor(id);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) { chunks.delete(cursor.primaryKey); cursor.continue(); }
      };
    });
  }
}

function newTake(mode) {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const date = Date.now();
  const stamp = new Date(date).toISOString().slice(0, 19).replace("T", "_").replaceAll(":", "-");
  return { id, date, name: `BECA-${stamp}-${id.slice(0, 6)}`, mode, frames: 0, events: 0, duration: 0, complete: false };
}

export class Recordings extends EventTarget {
  constructor(audio, startAudio) {
    super();
    this.audio = audio;
    this.startAudio = startAudio;
    this.store = new RecordingStore();
  }

  notify(message = "") {
    this.dispatchEvent(new CustomEvent("change", { detail: message }));
  }

  async start(mode) {
    if (this.active) return;
    const take = { info: newTake(mode), midi: [], sequence: 0, writes: Promise.resolve(), pending: 0 };
    this.active = take;
    this.notify("Starting recording…");
    navigator.storage?.persist?.().catch(() => {});
    // Start audio in the button gesture, before waiting for the database.
    try {
      const starting = mode !== "midi" && !this.audio.enabled ? this.startAudio() : undefined;
      const ready = await Promise.allSettled([starting, this.store.create(take.info)]);
      take.created = ready[1].status === "fulfilled";
      if (take.stopping) return;
      if (!take.created) throw new Error("Recording storage is unavailable. Free up space and try again.");
      if (ready[0].status === "rejected") throw new Error("Audio could not start. Tap Listen and try again.");
      const encoder = mode !== "midi" ? new WavSamples(this.audio.context?.sampleRate) : null;
      take.start = performance.now();
      if (encoder) take.audioStart = this.audio.context.currentTime;
      if (encoder) take.stopAudio = this.audio.capture((samples) => {
        if (take.failed || take.limitReached) return;
        const bytes = encoder.encode(samples);
        if (!bytes.length) return;
        const audio = new Blob([bytes]);
        take.info.frames += bytes.length / 6;
        this.write(take, { audio, midi: take.midi.splice(0) });
      }, () => this.stop("interrupted"));
      take.tick = setInterval(() => {
        if (performance.now() - take.start >= MAX_DURATION) this.stop("limit");
        else if (take.midi.length) this.write(take, { midi: take.midi.splice(0) });
      }, 500);
      this.notify();
    } catch (error) {
      if (take.created) this.store.remove(take.info.id).catch(() => {});
      if (this.active === take) this.active = null;
      this.notify(error.message);
    } finally {
      if (take.stopping && take.start === undefined && take.created) this.store.remove(take.info.id).catch(() => {});
    }
  }

  midi(status, note, velocity) {
    const take = this.active;
    if (take?.start === undefined || take.stopping || take.info.mode === "audio" || take.failed) return;
    const command = status & 0xf0;
    if (![0x80, 0x90, 0xb0].includes(command) || note > 127 || velocity > 127) return;
    const elapsed = take.audioStart === undefined
      ? performance.now() - take.start : (this.audio.context.currentTime - take.audioStart) * 1000;
    take.midi.push([Math.max(0, elapsed), status, note, velocity]);
    take.info.events++;
    if (take.info.events >= MAX_MIDI_EVENTS) this.stop("limit");
  }

  write(take, chunk) {
    if (take.failed) return;
    if (take.pending >= MAX_PENDING_WRITES) {
      take.failed = true;
      this.stop("storage");
      return;
    }
    const duration = take.info.frames ? take.info.frames / WAV_RATE * 1000
      : Math.min(MAX_DURATION, (take.end ?? performance.now()) - take.start);
    const info = { ...take.info, duration };
    take.pending++;
    take.writes = take.writes.then(async () => {
      try {
        if (take.failed) return;
        await this.store.update(info, { ...chunk, take: info.id, sequence: take.sequence++ });
      }
      catch {
        take.failed = true;
        this.stop("storage");
      } finally { take.pending--; }
    });
  }

  stop(reason = "") {
    const take = this.active;
    if (!take) return Promise.resolve();
    if (take.stopping) return take.stopping;
    take.end = performance.now();
    take.limitReached = reason === "limit";
    clearInterval(take.tick);
    // Defer so the stopping state is set before any callbacks can reenter.
    take.stopping = Promise.resolve().then(async () => {
      try {
        if (take.start === undefined) { this.notify("Recording cancelled."); return; }
        this.notify("Saving recording…");
        try { await take.stopAudio?.(); }
        catch { reason = "interrupted"; }
        if (take.midi.length) this.write(take, { midi: take.midi.splice(0) });
        await take.writes;
        if (take.failed) {
          this.notify("Storage is full or busy. Check Recordings for the saved part.");
        } else if (!take.info.frames && !take.info.events) {
          await this.store.remove(take.info.id);
          this.notify(take.info.mode === "midi" ? "No MIDI captured." : "No audio captured.");
        } else {
          const duration = take.info.frames ? 1000 * take.info.frames / WAV_RATE : take.end - take.start;
          await this.store.update({ ...take.info, duration, complete: reason !== "interrupted" });
          this.notify(reason === "limit" ? "Recording limit reached. Take saved."
            : reason === "interrupted" ? "Recording interrupted. Take saved." : "Take saved.");
        }
      } catch {
        this.notify("Could not finish saving. Check Recordings for the saved part.");
      } finally {
        if (this.active === take) this.active = null;
        this.notify();
      }
    });
    return take.stopping;
  }

  async export(take, format) {
    const chunks = await this.store.read(take.id);
    const audio = chunks.flatMap((chunk) => chunk.audio ? [chunk.audio] : []);
    const midi = chunks.flatMap((chunk) => chunk.midi?.length ? [chunk.midi] : []);
    const duration = Math.max(take.duration, audio.reduce((sum, chunk) => sum + chunk.size, 0) / (6 * WAV_RATE) * 1000);
    const wav = () => wavFile(audio);
    const mid = () => midiFile(midi, duration);
    if (format === "wav") return wav();
    if (format === "mid") return mid();
    return zipFiles([{ name: take.name + ".wav", blob: wav() }, { name: take.name + ".mid", blob: mid() }]);
  }
}
