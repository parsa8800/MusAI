import { midiToHz } from "@/lib/intonation";
import type { PieceExpectedNote } from "@/features/piece-studio/score/expectedNotes";

export const BEACH_TAKE_SAMPLE_RATE = 44100;

export type BeachGapEdit = {
  /** Extra seconds added to every note after this one. Negative pulls them earlier. */
  afterNoteIndex: number;
  extraSec: number;
};

/**
 * One tone per written Beach Holiday note.
 * Timing edits and loudness are the only differences between takes.
 */
export function synthesizeBeachTake(input: {
  notes: readonly PieceExpectedNote[];
  secPerQuarter: number;
  /** Notes left silent. Later notes stay on the written grid. */
  omit?: readonly number[];
  gapEdits?: readonly BeachGapEdit[];
  /** Small even wobble, kept inside the on-the-beat window. */
  wobbleSec?: number;
  amplitudeFor?: (note: PieceExpectedNote, index: number) => number;
}): { mono: Float32Array; durationSec: number; sampleRateHz: number } {
  const sampleRateHz = BEACH_TAKE_SAMPLE_RATE;
  const omit = new Set(input.omit ?? []);
  const edits = new Map(
    (input.gapEdits ?? []).map((edit) => [edit.afterNoteIndex, edit.extraSec]),
  );
  const leadSec = 0.08;
  let extra = 0;
  const times: Array<number | null> = [];
  for (let i = 0; i < input.notes.length; i++) {
    if (omit.has(i)) {
      times.push(null);
    } else {
      const wobble =
        input.wobbleSec && input.wobbleSec > 0
          ? i % 2 === 0
            ? input.wobbleSec
            : -input.wobbleSec
          : 0;
      times.push(
        leadSec +
          input.notes[i]!.absoluteOnsetQuarters * input.secPerQuarter +
          extra +
          wobble,
      );
    }
    extra += edits.get(i) ?? 0;
  }

  const heard = times.filter((time): time is number => time != null);
  const durationSec = (heard.length ? Math.max(...heard) : 0) + 0.7;
  const mono = new Float32Array(Math.ceil(durationSec * sampleRateHz));

  for (let i = 0; i < input.notes.length; i++) {
    const start = times[i];
    if (start == null) continue;
    let next = durationSec;
    for (let j = i + 1; j < times.length; j++) {
      if (times[j] != null) {
        next = times[j]!;
        break;
      }
    }
    const gap = Math.max(0.2, next - start);
    // Leave a clear rest after each tone so a repeated pitch is not heard early.
    const toneSec = Math.min(0.24, Math.max(0.18, gap - 0.25));
    const amplitude = input.amplitudeFor?.(input.notes[i]!, i) ?? 0.35;
    writeTone(
      mono,
      sampleRateHz,
      midiToHz(input.notes[i]!.midi),
      start,
      toneSec,
      amplitude,
    );
  }

  return { mono, durationSec, sampleRateHz };
}

function writeTone(
  mono: Float32Array,
  sampleRateHz: number,
  hz: number,
  startSec: number,
  toneSec: number,
  amplitude: number,
) {
  const start = Math.max(0, Math.floor(startSec * sampleRateHz));
  const count = Math.floor(toneSec * sampleRateHz);
  const fade = Math.min(Math.floor(0.008 * sampleRateHz), Math.floor(count / 4));
  for (let i = 0; i < count; i++) {
    const at = start + i;
    if (at >= mono.length) break;
    let env = 1;
    if (i < fade) env = i / fade;
    else if (i > count - fade) env = (count - i) / fade;
    mono[at] +=
      amplitude * env * Math.sin((2 * Math.PI * hz * i) / sampleRateHz);
  }
}
