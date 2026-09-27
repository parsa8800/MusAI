import type { PieceExpectedNote } from "@/features/piece-studio/score/expectedNotes";
import { midiToHz } from "@/lib/intonation";

const SAMPLE_RATE = 44100;
/** Long enough for a stable pitch run, with a gap so repeated notes stay separate. */
const TONE_SEC = 0.42;
const GAP_SEC = 0.16;

/**
 * Cents offset for each expected note, then it repeats.
 * Null is silence — that note should come back as missed.
 * The other steps sit in Scale Studio’s in-tune, slight, and clear-miss bands.
 */
const CENTS_PATTERN: Array<number | null> = [0, 38, -34, 62, null, 0, -58, 16];

function tone(hz: number, seconds: number): Float32Array {
  const n = Math.floor(SAMPLE_RATE * seconds);
  const out = new Float32Array(n);
  const attack = Math.floor(SAMPLE_RATE * 0.02);
  for (let i = 0; i < n; i++) {
    const env = i < attack ? i / attack : 1;
    out[i] = env * 0.35 * Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE);
  }
  return out;
}

function silence(seconds: number): Float32Array {
  return new Float32Array(Math.floor(SAMPLE_RATE * seconds));
}

function concat(parts: Float32Array[]): Float32Array {
  const n = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Float32Array(n);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function wavBlob(mono: Float32Array): Blob {
  const bytes = new ArrayBuffer(44 + mono.length * 2);
  const view = new DataView(bytes);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + mono.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, mono.length * 2, true);
  let o = 44;
  for (let i = 0; i < mono.length; i++) {
    const sample = Math.max(-1, Math.min(1, mono[i]!));
    view.setInt16(o, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    o += 2;
  }
  return new Blob([bytes], { type: "audio/wav" });
}

export type PieceSampleTake = {
  mono: Float32Array;
  sampleRateHz: number;
  wav: Blob;
};

/**
 * A played-through take of the written notes, with a known mix of
 * in-tune, sharp, flat, and missed notes so the score can show pitch colour.
 */
export function synthesizePieceSampleTake(
  notes: readonly PieceExpectedNote[],
): PieceSampleTake {
  const parts: Float32Array[] = [];
  notes.forEach((note, i) => {
    const cents = CENTS_PATTERN[i % CENTS_PATTERN.length] ?? 0;
    if (cents == null) {
      parts.push(silence(TONE_SEC));
    } else {
      const hz = midiToHz(note.midi) * 2 ** (cents / 1200);
      parts.push(tone(hz, TONE_SEC));
    }
    parts.push(silence(GAP_SEC));
  });
  const mono = parts.length > 0 ? concat(parts) : new Float32Array(0);
  return { mono, sampleRateHz: SAMPLE_RATE, wav: wavBlob(mono) };
}
