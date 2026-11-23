export const WAV_RATE = 44100;
const FRAME_BYTES = 6;
const text = new TextEncoder();

export class WavSamples {
  constructor(rate) {
    this.rate = rate;
    this.frames = 0;
    this.next = 0;
    this.previous = [0, 0];
  }

  encode(samples) {
    const end = this.frames + samples.length / 2;
    const bytes = new Uint8Array(Math.ceil((end - this.frames + 1) * WAV_RATE / this.rate) * FRAME_BYTES);
    let size = 0;
    // Keep the resampling position across chunks when the audio device uses another rate.
    while (this.next <= (end - 1) * WAV_RATE) {
      const source = Math.floor(this.next / WAV_RATE);
      const fraction = (this.next % WAV_RATE) / WAV_RATE;
      const index = (source - this.frames) * 2;
      for (let channel = 0; channel < 2; channel++) {
        const first = index < 0 ? this.previous[channel] : samples[index + channel];
        const second = fraction ? samples[index + 2 + channel] : first;
        const value = Math.round(Math.max(-8388608, Math.min(8388607, (first + (second - first) * fraction) * 8388608)));
        bytes[size++] = value;
        bytes[size++] = value >> 8;
        bytes[size++] = value >> 16;
      }
      this.next += this.rate;
    }
    this.frames = end;
    this.previous[0] = samples[samples.length - 2];
    this.previous[1] = samples[samples.length - 1];
    return bytes.subarray(0, size);
  }
}

export function wavFile(chunks) {
  const size = chunks.reduce((total, chunk) => total + chunk.size, 0);
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  header.set(text.encode("RIFF"), 0);
  view.setUint32(4, size + 36, true);
  header.set(text.encode("WAVEfmt "), 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, WAV_RATE, true);
  view.setUint32(28, WAV_RATE * FRAME_BYTES, true);
  view.setUint16(32, FRAME_BYTES, true);
  view.setUint16(34, 24, true);
  header.set(text.encode("data"), 36);
  view.setUint32(40, size, true);
  return new Blob([header, ...chunks], { type: "audio/wav" });
}

function delta(bytes, value) {
  const digits = [value & 127];
  for (value >>= 7; value; value >>= 7) digits.unshift((value & 127) | 128);
  bytes.push(...digits);
}

export function midiFile(chunks, duration) {
  const chunksBytes = [];
  let previous = 0;
  const held = new Map();
  const pedal = new Set();
  const write = (out, time, status, note, velocity) => {
    const tick = Math.max(previous, Math.round(time));
    delta(out, tick - previous);
    out.push(status, note, velocity);
    previous = tick;
  };
  // At 120 BPM and 500 ticks per beat, one tick is one millisecond.
  const tempo = [0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20];
  for (const events of chunks) {
    const bytes = [];
    for (const [time, status, note, velocity] of events) {
      const channel = status & 15;
      const key = channel * 128 + note;
      const command = status & 0xf0;
      write(bytes, time, status, note, velocity);
      if (command === 0x90 && velocity) held.set(key, (held.get(key) ?? 0) + 1);
      else if (command === 0x80 || command === 0x90) {
        if (held.get(key) > 1) held.set(key, held.get(key) - 1);
        else held.delete(key);
      } else if ([120, 123].includes(note)) {
        for (const key of held.keys()) if (key >> 7 === channel) held.delete(key);
      } else if (note === 64 && velocity >= 64) pedal.add(channel);
      else if (note === 64 || note === 121) pedal.delete(channel);
    }
    chunksBytes.push(Uint8Array.from(bytes));
  }
  const end = [];
  for (const [key, count] of held) {
    for (let i = 0; i < count; i++) write(end, duration, 0x80 | (key >> 7), key & 127, 0);
  }
  for (const channel of pedal) write(end, duration, 0xb0 | channel, 64, 0);
  delta(end, Math.max(0, Math.round(duration) - previous));
  end.push(0xff, 0x2f, 0);

  const header = new Uint8Array(22);
  header.set([77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, 1, 244, 77, 84, 114, 107]);
  new DataView(header.buffer).setUint32(18, chunksBytes.reduce((sum, bytes) => sum + bytes.length, tempo.length + end.length));
  return new Blob([header, Uint8Array.from(tempo), ...chunksBytes, Uint8Array.from(end)], { type: "audio/midi" });
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value;
});

async function crc32(blob) {
  let crc = 0xffffffff;
  for (let offset = 0; offset < blob.size; offset += 1024 * 1024) {
    const bytes = new Uint8Array(await blob.slice(offset, offset + 1024 * 1024).arrayBuffer());
    for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  }
  return crc ^ 0xffffffff;
}

export async function zipFiles(files) {
  const local = [];
  const central = [];
  let offset = 0;
  let centralSize = 0;
  for (const { name, blob } of files) {
    const filename = text.encode(name);
    const crc = await crc32(blob);
    const entry = new Uint8Array(30 + filename.length);
    const view = new DataView(entry.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(12, 0x21, true); // DOS date, 1980-01-01
    view.setUint32(14, crc, true);
    view.setUint32(18, blob.size, true);
    view.setUint32(22, blob.size, true);
    view.setUint16(26, filename.length, true);
    entry.set(filename, 30);

    const directory = new Uint8Array(46 + filename.length);
    const info = new DataView(directory.buffer);
    info.setUint32(0, 0x02014b50, true);
    info.setUint16(4, 20, true);
    directory.set(entry.subarray(4, 30), 6);
    info.setUint32(42, offset, true);
    directory.set(filename, 46);
    local.push(entry, blob);
    central.push(directory);
    offset += entry.length + blob.size;
    centralSize += directory.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...local, ...central, end.buffer], { type: "application/zip" });
}
