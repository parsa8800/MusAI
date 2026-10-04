import type { CursorPose } from "@/features/piece-studio/score/cursorTrack";

/** One OSMD cursor stop — musical time still in engraver units (unknown). */
export type CursorWalkSample = {
  /** OSMD iterator RealValue (whole notes or quarters — inferred later). */
  realValue: number;
  x: number;
  y: number;
  height: number;
  width?: number;
};

export type PlaybackNoteTime = {
  startSec: number;
  endSec: number;
};

/**
 * One playhead stop per attack. Chords (same startSec, several MIDI notes)
 * collapse to a single time so DOM noteheads (also one pose per attack) zip
 * 1:1 — otherwise the bar maps many events onto early heads and lags the audio.
 */
export function collapsePlaybackNoteAttacks(
  notes: readonly PlaybackNoteTime[],
): PlaybackNoteTime[] {
  if (notes.length === 0) return [];
  /** @type {PlaybackNoteTime[]} */
  const out: PlaybackNoteTime[] = [];
  for (const note of notes) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.startSec - note.startSec) < 1e-4) {
      prev.endSec = Math.max(prev.endSec, note.endSec);
      continue;
    }
    out.push({ startSec: note.startSec, endSec: note.endSec });
  }
  return out;
}

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
 * Use for OSMD cursor walks — not for DOM noteheads.
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

/**
 * Drop trailing extras so remaining samples keep the start of the piece.
 * Use for DOM noteheads (already note-only; extras are usually ornaments /
 * double-engravings later in the score — never drop the opening heads).
 */
export function trimTrailingCursorSamples(
  samples: readonly CursorWalkSample[],
  noteCount: number,
): CursorWalkSample[] {
  if (samples.length <= noteCount || noteCount <= 0) {
    return [...samples];
  }
  return samples.slice(0, noteCount);
}

function poseFromSample(
  sample: CursorWalkSample,
  note: PlaybackNoteTime,
): CursorPose {
  return {
    tSec: note.startSec,
    endSec: note.endSec,
    x: sample.x,
    y: sample.y,
    height: sample.height,
    width: sample.width,
  };
}

function zipOrSpreadSamples(
  samples: readonly CursorWalkSample[],
  notes: readonly PlaybackNoteTime[],
): CursorPose[] {
  if (samples.length === 0 || notes.length === 0) return [];

  if (samples.length === notes.length) {
    return notes.map((note, i) => poseFromSample(samples[i]!, note));
  }

  // Count mismatch: snap each attack onto a real engraved head. Never
  // invent an x between heads — that parked the playhead in empty gaps.
  if (samples.length === 1) {
    const only = samples[0]!;
    return notes.map((note) => poseFromSample(only, note));
  }

  // Fewer heads than attacks: keep the opening notes locked to the heads
  // we have. Stretching them across the short list parked the bar behind
  // the note that was sounding.
  if (samples.length < notes.length) {
    return notes.map((note, i) =>
      poseFromSample(samples[Math.min(i, samples.length - 1)]!, note),
    );
  }

  return notes.map((note, i) => {
    const u = i / Math.max(1, notes.length - 1);
    const idx = Math.round(u * (samples.length - 1));
    return poseFromSample(samples[idx]!, note);
  });
}

/**
 * Map OSMD cursor-walk positions onto MusaiScore note times.
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

  const attacks = collapsePlaybackNoteAttacks(notes);
  const trimmed = trimLeadingCursorSamples(samples, attacks.length);
  return zipOrSpreadSamples(trimmed, attacks);
}

/**
 * Map engraved DOM noteheads onto MusaiScore note times.
 *
 * Chord attacks are collapsed first. Equal head/attack counts zip 1:1.
 * When counts differ (OMR grace heads, double engraving), snap each attack
 * onto a real head so the pointer never sits in empty space.
 */
export function alignNoteheadPosesToNotes(
  samples: readonly CursorWalkSample[],
  notes: readonly PlaybackNoteTime[],
): CursorPose[] {
  if (samples.length === 0 || notes.length === 0) return [];
  const attacks = collapsePlaybackNoteAttacks(notes);
  const heads = trimExtraHeads(
    dropCueHeads(samples, attacks.length),
    attacks.length,
  );
  return zipOrSpreadSamples(heads, attacks);
}

/**
 * Grace / cue heads are smaller than principals and are not in the playback
 * attack list. Drop the smallest extras so remaining heads zip 1:1.
 */
export function dropCueHeads(
  samples: readonly CursorWalkSample[],
  attackCount: number,
): CursorWalkSample[] {
  if (samples.length <= attackCount || attackCount <= 0) {
    return [...samples];
  }
  const areas = samples.map((s) => (s.width ?? s.height) * s.height);
  const sorted = [...areas].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  if (!(median > 0)) return [...samples];
  const principals = samples.filter(
    (_, i) => (areas[i] ?? 0) >= median * 0.62,
  );
  if (
    principals.length >= attackCount &&
    principals.length < samples.length
  ) {
    return principals;
  }
  return [...samples];
}

/**
 * Extra heads that sit immediately left of a principal (same-size OMR
 * acciaccaturas) are not in the sounding attack list. Drop the most
 * grace-like extras until counts match.
 */
export function trimExtraHeads(
  samples: readonly CursorWalkSample[],
  attackCount: number,
): CursorWalkSample[] {
  if (samples.length <= attackCount || attackCount <= 0) {
    return [...samples];
  }
  const extras = samples.length - attackCount;
  const areas = samples.map((s) => (s.width ?? s.height) * s.height);
  const scored: Array<{ i: number; score: number }> = [];
  for (let i = 0; i < samples.length; i += 1) {
    const next = samples[i + 1];
    const dx = next ? next.x - samples[i]!.x : 80;
    const dy = next ? Math.abs(next.y - samples[i]!.y) : 0;
    const tucked = Boolean(next && dx > 2 && dx < 20 && dy < 48);
    const small = (areas[i] ?? 0) < (areas[i + 1] ?? areas[i] ?? 1) * 0.9;
    if (!tucked && !small) continue;
    scored.push({
      i,
      score: (tucked ? dx : 40) + (small ? 0 : 12),
    });
  }
  const denseRun = scored.length > Math.max(extras * 2, samples.length * 0.45);
  if (!denseRun && scored.length >= extras) {
    scored.sort((a, b) => a.score - b.score || a.i - b.i);
    const drop = new Set(scored.slice(0, extras).map((s) => s.i));
    const kept = samples.filter((_, i) => !drop.has(i));
    if (kept.length === attackCount) return kept;
    if (kept.length > attackCount) {
      return trimTrailingCursorSamples(kept, attackCount);
    }
  }
  if (extras <= 2) return trimTrailingCursorSamples(samples, attackCount);
  return [...samples];
}
