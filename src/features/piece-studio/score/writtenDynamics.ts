import type { MusaiScoreV1, ScoreNote } from "@/features/piece-studio/score/musaiScore";

export type DynamicGlyph =
  | {
      regionIndex: number;
      type: "letter";
      mark: string;
      /** First melody note that plays under this letter. */
      noteIndex: number;
    }
  | {
      regionIndex: number;
      type: "hairpin";
      direction: "crescendo" | "decrescendo";
      noteIndex: number;
      /** Quarter notes from the start of the piece. */
      startQuarters: number;
      endQuarters: number;
    };

function measureAdvance(
  beats: number,
  beatType: number,
  maxEnd: number,
): number {
  const fromTime = beats * (4 / Math.max(1, beatType));
  return Math.max(fromTime, maxEnd, 0);
}

function noteMidi(note: ScoreNote): number {
  return note.pitch.midi;
}

/**
 * Letters and hairpins in the order they are engraved.
 * Region indexes match the tags written onto the score after each paint.
 */
export function dynamicGlyphsFromScore(
  score: MusaiScoreV1 | null | undefined,
): DynamicGlyph[] {
  const part = score?.parts[0];
  if (!part) return [];
  const glyphs: DynamicGlyph[] = [];
  let beats = 4;
  let beatType = 4;
  let quarter = 0;
  let noteIndex = 0;
  let previousLetter: string | null = null;
  let lastMidi: number | null = null;

  for (const measure of part.measures) {
    if (measure.time) {
      beats = measure.time.beats;
      beatType = measure.time.beatType;
    }
    let maxEnd = 0;
    for (const event of measure.events) {
      if (event.kind === "note" || event.kind === "rest") {
        maxEnd = Math.max(maxEnd, event.onsetQuarters + event.durationQuarters);
      }
      if (event.kind === "dynamic") {
        if (event.mark !== previousLetter) {
          glyphs.push({
            regionIndex: glyphs.length,
            type: "letter",
            mark: event.mark,
            noteIndex,
          });
          previousLetter = event.mark;
        }
        continue;
      }
      if (event.kind === "hairpin") {
        const startQuarters = quarter + event.onsetQuarters;
        const endQuarters =
          event.endAbsoluteQuarters != null &&
          event.endAbsoluteQuarters > startQuarters + 0.05
            ? event.endAbsoluteQuarters
            : startQuarters + 4;
        glyphs.push({
          regionIndex: glyphs.length,
          type: "hairpin",
          direction: event.direction,
          noteIndex,
          startQuarters,
          endQuarters,
        });
        continue;
      }
      if (event.kind !== "note" || event.chord) continue;
      if (event.tied && lastMidi === noteMidi(event)) continue;
      lastMidi = noteMidi(event);
      noteIndex += 1;
    }
    quarter += measureAdvance(beats, beatType, maxEnd);
  }
  return glyphs;
}
