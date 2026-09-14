import type { MusaiScoreV1, ScoreNote } from "@/features/piece-studio/score/musaiScore";

export type PieceExpectedNote = {
  midi: number;
  label: string;
  onsetQuarters: number;
  durationQuarters: number;
  measure: string;
  beat: number;
  noteIndex: number;
  writtenDynamic: string | null;
};

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
  let beatType = 4;
  let writtenDynamic: string | null = null;
  for (const measure of part.measures) {
    if (measure.time) beatType = measure.time.beatType;
    for (const event of measure.events) {
      if (event.kind === "dynamic") {
        writtenDynamic = event.mark;
        continue;
      }
      if (event.kind !== "note") continue;
      if (event.chord) continue;
      const next: PieceExpectedNote = {
        midi: event.pitch.midi,
        label: noteLabel(event),
        onsetQuarters: event.onsetQuarters,
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
  }
  return out;
}

export function expectedMidisFromScore(
  score: MusaiScoreV1 | null | undefined,
): number[] {
  return expectedNotesFromScore(score).map((n) => n.midi);
}
