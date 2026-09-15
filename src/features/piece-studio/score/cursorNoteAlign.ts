import type { CursorPose } from "@/features/piece-studio/score/cursorTrack";

/** One OSMD cursor stop — musical time still in engraver units (unknown). */
export type CursorWalkSample = {
  /** OSMD iterator RealValue (whole notes or quarters — inferred later). */
  realValue: number;
  x: number;
  y: number;
  height: number;
};

export type PlaybackNoteTime = {
  startSec: number;
  endSec: number;
};

/**
 * Infer whether OSMD RealValue is whole notes or quarter notes by how the
 * walk’s last stamp compares to the piece duration.
 */
export function inferOsmdRealValueUnit(
  realValues: readonly number[],
  durationSec: number,
  realValueToSecAssumingWhole: (realValue: number) => number,
): "whole" | "quarter" {
  if (realValues.length === 0 || durationSec <= 0) return "whole";
  const maxRv = Math.max(...realValues);
  const asWhole = realValueToSecAssumingWhole(maxRv);
  const asQuarter = realValueToSecAssumingWhole(maxRv / 4);
  const errWhole = Math.abs(asWhole - durationSec);
  const errQuarter = Math.abs(asQuarter - durationSec);
  return errQuarter < errWhole * 0.85 ? "quarter" : "whole";
}

/**
 * Drop leading clef / time-signature stops so remaining samples can zip 1:1
 * with sounding notes (extras are almost always a prefix, not a suffix).
 */
export function trimLeadingCursorSamples(
  samples: readonly CursorWalkSample[],
  noteCount: number,
): CursorWalkSample[] {
  if (samples.length <= noteCount || noteCount <= 0) {
    return [...samples];
  }
  return samples.slice(samples.length - noteCount);
}

function lerpPose(
  a: CursorWalkSample,
  b: CursorWalkSample,
  t: number,
): Pick<CursorWalkSample, "x" | "y" | "height"> {
  const u = Math.max(0, Math.min(1, t));
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    height: a.height + (b.height - a.height) * u,
  };
}

/**
 * Map OSMD walk positions onto MusaiScore note times.
 *
 * Audio / Listen clock comes only from `notes` (startSec). OSMD supplies x/y.
 * - More samples than notes → drop leading (clef / meter).
 * - Equal count → zip in order.
 * - Fewer samples → spread poses across notes (never freeze on the last sample).
 */
export function alignCursorSamplesToNotes(
  samples: readonly CursorWalkSample[],
  notes: readonly PlaybackNoteTime[],
  _realValueToSecAssumingWhole: (realValue: number) => number,
): CursorPose[] {
  void _realValueToSecAssumingWhole;
  if (samples.length === 0 || notes.length === 0) return [];

  const trimmed = trimLeadingCursorSamples(samples, notes.length);

  if (trimmed.length >= notes.length) {
    return notes.map((note, i) => {
      const s = trimmed[i]!;
      return {
        tSec: note.startSec,
        x: s.x,
        y: s.y,
        height: s.height,
      };
    });
  }

  // Incomplete OSMD walk: keep the playhead moving through every note.
  if (trimmed.length === 1) {
    const only = trimmed[0]!;
    return notes.map((note) => ({
      tSec: note.startSec,
      x: only.x,
      y: only.y,
      height: only.height,
    }));
  }

  return notes.map((note, i) => {
    const u = i / Math.max(1, notes.length - 1);
    const f = u * (trimmed.length - 1);
    const i0 = Math.floor(f);
    const i1 = Math.min(trimmed.length - 1, i0 + 1);
    const pose = lerpPose(trimmed[i0]!, trimmed[i1]!, f - i0);
    return {
      tSec: note.startSec,
      x: pose.x,
      y: pose.y,
      height: pose.height,
    };
  });
}
