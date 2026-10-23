/**
 * Note-level rhythm against the take’s own beat.
 * A steady slower or faster performance stays even, so it is not flagged here.
 */

/** About a third of a beat. Smaller wobble still counts as on the beat. */
export const RHYTHM_ONSET_BEAT_FRACTION = 0.32;
/** Never tighter than this, even when the beat itself is very fast. */
export const RHYTHM_ONSET_MIN_SEC = 0.14;
/** Gaps outside this band are the wrong length, not a small early or late start. */
export const RHYTHM_DURATION_SHORT = 0.52;
export const RHYTHM_DURATION_LONG = 1.75;

export type RhythmClockNote = {
  noteIndex: number;
  /** Onset from the start of the piece, in quarter notes. */
  absoluteOnsetQuarters: number;
  /** When this note was heard. Null when it was missed or had no attack of its own. */
  heardSec: number | null;
  durationQuarters?: number;
  midi?: number;
  measure?: string;
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
 * One finding per gap: a long or short hold, or a late start.
 * Rests and a breath before the next phrase stay unmarked unless they are extreme.
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

  const durationByIndex = new Map(
    heard.map((note) => [note.noteIndex, note.durationQuarters ?? 1]),
  );
  const findings: RhythmFinding[] = [];
  for (const gap of gaps) {
    const expectedSec = gap.writtenQuarters * secPerQuarter;
    const ratio = gap.playedSec / expectedSec;
    const errorSec = gap.playedSec - expectedSec;
    const earlierDur = durationByIndex.get(gap.earlierIndex) ?? 1;
    const restLike = gap.writtenQuarters > earlierDur + 0.6;
    if (restLike && ratio >= 0.32 && ratio <= 2.5) continue;
    if (ratio > RHYTHM_DURATION_LONG && errorSec > 1.2) continue;
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
      findings.push({
        noteIndex: gap.earlierIndex,
        kind: "duration",
        length: "short",
        overshoot: 1 - ratio,
      });
    }
  }
  return dropOnsetThatSitsWithItsBar(findings, heard, secPerQuarter, onsetWindow);
}

function barKey(note: RhythmClockNote): string {
  if (note.measure && note.measure !== "?") return note.measure;
  return String(Math.floor(note.absoluteOnsetQuarters / 4));
}

/**
 * A late start after a cut-short or stretched note is often just the player
 * getting back on the written bar. If that note already sits with the rest
 * of its bar, leave it unmarked.
 */
function dropOnsetThatSitsWithItsBar(
  findings: RhythmFinding[],
  heard: readonly (RhythmClockNote & { heardSec: number })[],
  secPerQuarter: number,
  onsetWindow: number,
): RhythmFinding[] {
  const byIndex = new Map(heard.map((note) => [note.noteIndex, note]));
  return findings.filter((finding) => {
    if (finding.kind !== "late" && finding.kind !== "early") return true;
    const note = byIndex.get(finding.noteIndex);
    if (!note) return true;
    const others = heard.filter(
      (other) => other.noteIndex !== note.noteIndex && barKey(other) === barKey(note),
    );
    if (others.length === 0) return true;
    const errors = others.map((other) => {
      const written = note.absoluteOnsetQuarters - other.absoluteOnsetQuarters;
      const expected = other.heardSec + written * secPerQuarter;
      return note.heardSec - expected;
    });
    const signed = median(errors);
    return Math.abs(signed) > onsetWindow;
  });
}
