/**
 * Note-level rhythm against the take’s own beat.
 * A steady slower or faster performance stays even, so it is not flagged here.
 */

/** About a fifth of a beat. Smaller wobble still counts as on the beat. */
export const RHYTHM_ONSET_BEAT_FRACTION = 0.22;
/** Never tighter than this, even when the beat itself is very fast. */
export const RHYTHM_ONSET_MIN_SEC = 0.09;
/** Gaps outside this band are the wrong length, not a small early or late start. */
export const RHYTHM_DURATION_SHORT = 0.65;
export const RHYTHM_DURATION_LONG = 1.5;

export type RhythmClockNote = {
  noteIndex: number;
  /** Onset from the start of the piece, in quarter notes. */
  absoluteOnsetQuarters: number;
  /** When this note was heard. Null when it was missed or had no attack of its own. */
  heardSec: number | null;
  midi?: number;
};

export type RhythmFinding = {
  noteIndex: number;
  kind: "early" | "late" | "duration";
  /** Too long or too short. Only set for duration. */
  length: "long" | "short" | null;
  /** How far past the lenient window, used to rank the event. */
  overshoot: number;
};

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Compare heard attacks with the written rhythm.
 * Null when fewer than two notes were heard — there is no beat to judge.
 * An empty list means the heard notes sat on that beat.
 *
 * One finding per gap, so a long hold is not also “the next note is late”:
 * a very long or very short gap is length; a smaller miss is early or late.
 */
export function findRhythmFindings(
  notes: readonly RhythmClockNote[],
): RhythmFinding[] | null {
  const heard = notes.filter(
    (note): note is RhythmClockNote & { heardSec: number } =>
      typeof note.heardSec === "number" &&
      Number.isFinite(note.heardSec) &&
      note.heardSec >= 0,
  );
  if (heard.length < 2) return null;

  const gaps: Array<{
    earlierIndex: number;
    laterIndex: number;
    writtenQuarters: number;
    playedSec: number;
  }> = [];
  for (let i = 1; i < heard.length; i++) {
    const prev = heard[i - 1]!;
    const next = heard[i]!;
    const writtenQuarters =
      next.absoluteOnsetQuarters - prev.absoluteOnsetQuarters;
    const playedSec = next.heardSec - prev.heardSec;
    if (!(writtenQuarters > 0) || !(playedSec > 0)) continue;
    gaps.push({
      earlierIndex: prev.noteIndex,
      laterIndex: next.noteIndex,
      writtenQuarters,
      playedSec,
    });
  }
  if (gaps.length === 0) return null;

  const secPerQuarter = median(
    gaps.map((gap) => gap.playedSec / gap.writtenQuarters),
  );
  if (!(secPerQuarter > 0)) return null;
  const onsetWindow = Math.max(
    RHYTHM_ONSET_BEAT_FRACTION * secPerQuarter,
    RHYTHM_ONSET_MIN_SEC,
  );

  const findings: RhythmFinding[] = [];
  for (const gap of gaps) {
    const expectedSec = gap.writtenQuarters * secPerQuarter;
    const ratio = gap.playedSec / expectedSec;
    const errorSec = gap.playedSec - expectedSec;
    if (ratio > RHYTHM_DURATION_LONG) {
      findings.push({
        noteIndex: gap.earlierIndex,
        kind: "duration",
        length: "long",
        overshoot: ratio - RHYTHM_DURATION_LONG,
      });
      continue;
    }
    if (ratio < RHYTHM_DURATION_SHORT) {
      findings.push({
        noteIndex: gap.earlierIndex,
        kind: "duration",
        length: "short",
        overshoot: RHYTHM_DURATION_SHORT - ratio,
      });
      // The next note did arrive early. A short hold is only the note left behind.
      findings.push({
        noteIndex: gap.laterIndex,
        kind: "early",
        length: null,
        overshoot: (-errorSec - onsetWindow) / secPerQuarter,
      });
      continue;
    }
    if (errorSec > onsetWindow) {
      findings.push({
        noteIndex: gap.laterIndex,
        kind: "late",
        length: null,
        overshoot: (errorSec - onsetWindow) / secPerQuarter,
      });
      continue;
    }
    if (errorSec < -onsetWindow) {
      // A smaller rush is the same join: the note left early was short,
      // and the note that arrives came in early. Not a short hold on the arrival.
      findings.push({
        noteIndex: gap.earlierIndex,
        kind: "duration",
        length: "short",
        overshoot: 1 - ratio,
      });
      findings.push({
        noteIndex: gap.laterIndex,
        kind: "early",
        length: null,
        overshoot: (-errorSec - onsetWindow) / secPerQuarter,
      });
    }
  }
  return findings;
}
