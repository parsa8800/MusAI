import type { PieceFeedbackAnalyzer } from "@/features/piece-studio/feedback/analyzers/PieceFeedbackAnalyzer";
import {
  findDynamicFindings,
  findHairpinFindings,
  type DynamicFinding,
  type HairpinFinding,
} from "@/features/piece-studio/feedback/analyzers/dynamicsTiming";
import { createFeedbackEvent } from "@/features/piece-studio/feedback/createFeedbackEvent";
import type { PieceExpectedNote } from "@/features/piece-studio/score/expectedNotes";
import {
  dynamicGlyphsFromScore,
  type DynamicGlyph,
} from "@/features/piece-studio/score/writtenDynamics";

function heardAttackSec(
  match: { attackSec?: Array<number | null>; timesSec: Array<number | null> } | undefined,
  index: number,
): number | null {
  if (!match) return null;
  const attack = match.attackSec?.[index];
  if (typeof attack === "number" && Number.isFinite(attack)) return attack;
  const time = match.timesSec[index];
  return typeof time === "number" && Number.isFinite(time) ? time : null;
}

function letterLines(mark: string, kind: DynamicFinding["kind"]): string {
  const how =
    kind === "too_loud"
      ? `This ${mark} was louder than the rest of your playing`
      : `This ${mark} was quieter than the rest of your playing`;
  return `${how}\nFollow the marked ${mark}`;
}

function hairpinLines(finding: HairpinFinding): string {
  const name =
    finding.direction === "crescendo" ? "crescendo" : "decrescendo";
  const how =
    finding.kind === "unchanged"
      ? `The ${name} stayed at one volume`
      : finding.direction === "crescendo"
        ? "The crescendo got quieter"
        : "The decrescendo got louder";
  const fix = finding.direction === "crescendo" ? "Let it grow" : "Let it fade";
  return `${how}\n${fix}`;
}

function importanceFor(overshootDb: number): number {
  return Math.max(0.5, Math.min(0.84, 0.55 + overshootDb / 20));
}

/**
 * Dynamics only. A softer letter has to be softer than the louder music.
 * Notes after a hairpin starts are the shape, not that letter.
 * A hairpin is wrong when the volume stays level or moves the other way.
 * One written level cannot be judged, because mic gain has no comparison.
 */
export const DynamicsAnalyzer: PieceFeedbackAnalyzer = {
  category: "dynamics",
  analyze(input) {
    const expected = input.expectedNotes;
    if (!input.audio || !input.pitchMatch || expected.length === 0) {
      return { category: "dynamics", status: "not_ready", events: [] };
    }
    const clock = expected.map((note, i) => ({
      noteIndex: note.noteIndex,
      writtenDynamic: note.writtenDynamic,
      heardSec: heardAttackSec(input.pitchMatch, i),
      absoluteOnsetQuarters: note.absoluteOnsetQuarters,
    }));
    const hairpinGlyphs = dynamicGlyphsFromScore(input.score).filter(
      (glyph): glyph is Extract<DynamicGlyph, { type: "hairpin" }> =>
        glyph.type === "hairpin",
    );
    const letters = findDynamicFindings({
      notes: clock,
      mono: input.audio.mono,
      sampleRateHz: input.audio.sampleRateHz,
      hairpins: hairpinGlyphs,
    });
    const hairpins = findHairpinFindings({
      hairpins: hairpinGlyphs,
      notes: clock,
      mono: input.audio.mono,
      sampleRateHz: input.audio.sampleRateHz,
    });
    if (!letters && hairpinGlyphs.length === 0) {
      return { category: "dynamics", status: "not_ready", events: [] };
    }

    const byIndex = new Map<number, PieceExpectedNote>(
      expected.map((note) => [note.noteIndex, note]),
    );
    const events = [
      ...(letters ?? []).map((finding) => {
        const note = byIndex.get(finding.noteIndex);
        return createFeedbackEvent({
          eventId: `dynamics-${finding.noteIndex}-${finding.kind}`,
          category: "dynamics",
          kind: finding.kind,
          measure: note?.measure ?? null,
          beat: note?.beat ?? null,
          noteIndex: finding.noteIndex,
          onsetQuarters: note?.onsetQuarters ?? null,
          recordingTimeSec: input.pitchMatch?.timesSec[finding.noteIndex] ?? null,
          confidence: 0.7,
          importance: importanceFor(finding.overshootDb),
          explanation: letterLines(finding.mark, finding.kind),
        });
      }),
      ...hairpins.map((finding) => {
        const note = byIndex.get(finding.noteIndex);
        return createFeedbackEvent({
          eventId: `dynamics-hairpin-${finding.noteIndex}-${finding.kind}`,
          category: "dynamics",
          kind: finding.kind,
          measure: note?.measure ?? null,
          beat: note?.beat ?? null,
          noteIndex: finding.noteIndex,
          onsetQuarters: note?.onsetQuarters ?? null,
          recordingTimeSec: input.pitchMatch?.timesSec[finding.noteIndex] ?? null,
          confidence: 0.7,
          importance: finding.kind === "reversed" ? 0.74 : 0.62,
          explanation: hairpinLines(finding),
        });
      }),
    ];
    return { category: "dynamics", status: "ready", events };
  },
};
