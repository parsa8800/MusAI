import type { MusaiScoreV1, ScoreNote } from "@/features/piece-studio/score/musaiScore";

export type PieceExpectedNote = {
  midi: number;
  label: string;
  /** Beat within the measure. */
  onsetQuarters: number;
  /** Onset from the start of the piece, in quarter notes. */
  absoluteOnsetQuarters: number;
  durationQuarters: number;
  measure: string;
  beat: number;
  noteIndex: number;
  writtenDynamic: string | null;
};

function measureLengthQuarters(
  beats: number,
  beatType: number,
  maxEventEnd: number,
): number {
  const fromTime = beats * (4 / Math.max(1, beatType));
  return Math.max(fromTime, maxEventEnd, 0);
}

function noteLabel(note: ScoreNote): string {
  const acc =
    note.pitch.alter > 0
      ? "#".repeat(Math.round(note.pitch.alter))
      : note.pitch.alter < 0
        ? "b".repeat(Math.round(-note.pitch.alter))
        : "";
  return `${note.pitch.step}${acc}${note.pitch.octave}`;
}

function beatInMeasure(onsetQuarters: number, beatType: number): number {
  const beatLength = 4 / Math.max(1, beatType);
  return 1 + onsetQuarters / beatLength;
}

/**
 * Melody notes the student is asked to play: first part, skip rests,
 * skip extra chord tones, collapse ties into one pitch.
 */
export function expectedNotesFromScore(
  score: MusaiScoreV1 | null | undefined,
): PieceExpectedNote[] {
  const part = score?.parts[0];
  if (!part) return [];
  const out: PieceExpectedNote[] = [];
  let last: PieceExpectedNote | null = null;
  let beats = 4;
  let beatType = 4;
  let quarter = 0;
  let writtenDynamic: string | null = null;
  for (const measure of part.measures) {
    if (measure.time) {
      beats = measure.time.beats;
      beatType = measure.time.beatType;
    }
    let maxEnd = 0;
    for (const event of measure.events) {
      if (event.kind === "dynamic") {
        writtenDynamic = event.mark;
        continue;
      }
      if (event.kind === "note" || event.kind === "rest") {
        maxEnd = Math.max(maxEnd, event.onsetQuarters + event.durationQuarters);
      }
      if (event.kind !== "note") continue;
      if (event.chord) continue;
      const next: PieceExpectedNote = {
        midi: event.pitch.midi,
        label: noteLabel(event),
        onsetQuarters: event.onsetQuarters,
        absoluteOnsetQuarters: quarter + event.onsetQuarters,
        durationQuarters: event.durationQuarters,
        measure: measure.number,
        beat: Math.round(beatInMeasure(event.onsetQuarters, beatType) * 100) / 100,
        noteIndex: out.length,
        writtenDynamic,
      };
      if (event.tied && last && last.midi === next.midi) continue;
      out.push(next);
      last = next;
    }
    quarter += measureLengthQuarters(beats, beatType, maxEnd);
  }
  return out;
}

export function expectedMidisFromScore(
  score: MusaiScoreV1 | null | undefined,
): number[] {
  return expectedNotesFromScore(score).map((n) => n.midi);
}
