import { describe, expect, it } from "vitest";
import {
  buildScaleCoachingFeedback,
  ensureBulletFeedback,
  noteRowHint,
  sanitizeCoachFeedback,
  trendSentence,
  weakestIntro,
} from "@/lib/scalePracticeCopy";
import type {
  ScalePracticeNoteRow,
  ScalePracticeSessionV1,
} from "@/lib/scalePracticeTypes";
import { midiToHz } from "@/lib/intonation";

function row(
  partial: Partial<ScalePracticeNoteRow> &
    Pick<ScalePracticeNoteRow, "noteIndex" | "intonationBucket" | "missingData">,
): ScalePracticeNoteRow {
  const midi = partial.expectedMidi ?? 60 + partial.noteIndex;
  return {
    expectedMidi: midi,
    expectedNoteLabel: partial.expectedNoteLabel ?? `N${partial.noteIndex}`,
    detectedMidi: midi,
    detectedNoteLabel: partial.missingData ? "—" : `N${partial.noteIndex}`,
    detectedHz: partial.missingData ? 0 : midiToHz(midi),
    centsDifference: partial.centsDifference ?? 0,
    ...partial,
  };
}

function session(
  notes: ScalePracticeNoteRow[],
  summary: Partial<ScalePracticeSessionV1["summary"]> &
    Pick<
      ScalePracticeSessionV1["summary"],
      "overallScore0to100" | "inTunePercent" | "trend" | "weakestNoteIndices"
    >,
): Pick<ScalePracticeSessionV1, "notes" | "summary" | "scaleLabel"> {
  const analyzed = notes.filter((n) => !n.missingData).length;
  const missing = notes.length - analyzed;
  return {
    scaleLabel: "C major",
    notes,
    summary: {
      averageAbsCents: 12,
      meanSignedCents: 0,
      notesAnalyzed: analyzed,
      notesMissing: missing,
      ...summary,
    },
  };
}

describe("scalePracticeCopy (short template coaching)", () => {
  it("sanitizeCoachFeedback strips every kind of dash", () => {
    expect(sanitizeCoachFeedback("Nice take — keep going.")).toBe(
      "Nice take keep going.",
    );
    expect(sanitizeCoachFeedback("A – B - C — D")).not.toMatch(/[-—–―]/);
    expect(sanitizeCoachFeedback("Work A4 — lighten.")).toBe("Work A4 lighten.");
  });

  it("ensureBulletFeedback always returns short bullet lines", () => {
    const bullets = ensureBulletFeedback(
      "Trending sharp. Relax into the pitch.",
    );
    expect(bullets).toMatch(/^• /);
    expect(bullets.split("\n").every((l) => l.startsWith("• "))).toBe(true);
    expect(bullets).not.toMatch(/[-—–―]/);
    expect(bullets.split("\n").every((l) => !/\.\s*$/.test(l))).toBe(true);
  });

  it("trend and tip copy never contain dashes", () => {
    for (const trend of ["sharp", "flat", "balanced"] as const) {
      expect(trendSentence(trend)).not.toMatch(/[-—–―]/);
      expect(trendSentence(trend).split("\n").every((l) => l.startsWith("• "))).toBe(
        true,
      );
    }
  });

  it("trendSentence covers all trends", () => {
    expect(trendSentence("sharp")).toMatch(/high/i);
    expect(trendSentence("flat")).toMatch(/low/i);
    expect(trendSentence("balanced")).toMatch(/about right/i);
  });

  it("noteRowHint stays short", () => {
    expect(
      noteRowHint(
        row({ noteIndex: 0, intonationBucket: "sharp", missingData: false }),
      ),
    ).toMatch(/high/i);
    expect(weakestIntro()).toMatch(/focus/i);
  });

  it("buildScaleCoachingFeedback returns a short tip for a strong take", () => {
    const notes = [
      row({
        noteIndex: 0,
        expectedNoteLabel: "C4",
        intonationBucket: "in_tune",
        missingData: false,
      }),
      row({
        noteIndex: 1,
        expectedNoteLabel: "D4",
        intonationBucket: "in_tune",
        missingData: false,
      }),
      row({
        noteIndex: 2,
        expectedNoteLabel: "E4",
        intonationBucket: "in_tune",
        missingData: false,
      }),
    ];
    const feedback = buildScaleCoachingFeedback(
      session(notes, {
        overallScore0to100: 96,
        inTunePercent: 100,
        trend: "balanced",
        weakestNoteIndices: [],
      }),
    );
    expect(feedback.headline).toMatch(/excellent/i);
    expect(feedback.tip.split("\n")).toHaveLength(1);
    expect(feedback.tip.split("\n").every((l) => l.startsWith("• "))).toBe(true);
    expect(feedback.tip).toMatch(/right on/i);
    expect(feedback.tip).not.toMatch(/tape|3 notes|mostly right|Work on|great practice/i);
    expect(feedback.trendLine).toBe("");
    expect(feedback.tip).not.toMatch(/[-—–―]/);
    expect(feedback.focusNotes).toHaveLength(0);
  });

  it("buildScaleCoachingFeedback names weak notes in one tip only", () => {
    const notes = [
      row({
        noteIndex: 0,
        expectedMidi: 60,
        expectedNoteLabel: "C4",
        intonationBucket: "in_tune",
        missingData: false,
      }),
      row({
        noteIndex: 1,
        expectedMidi: 62,
        expectedNoteLabel: "D4",
        intonationBucket: "sharp",
        missingData: false,
        centsDifference: 42,
      }),
      row({
        noteIndex: 2,
        expectedMidi: 69,
        expectedNoteLabel: "A4",
        intonationBucket: "sharp",
        missingData: false,
        centsDifference: 38,
      }),
    ];
    const feedback = buildScaleCoachingFeedback(
      session(notes, {
        overallScore0to100: 80,
        inTunePercent: 33,
        trend: "sharp",
        weakestNoteIndices: [1, 2],
        meanSignedCents: 20,
      }),
    );
    // D4 → D0, A4 → A0 (different strings, so not a whole-string miss)
    expect(feedback.tip.split("\n")).toHaveLength(1);
    expect(feedback.tip).toMatch(/D0 and A0 were a bit high/i);
    expect(feedback.tip).not.toMatch(/tape|Try |Went well|Work on/i);
    expect(feedback.tip).not.toMatch(/[-—–―]/);
    expect(feedback.trendLine).toBe("");
    expect(feedback.focusNotes.map((n) => n.label)).toEqual(
      expect.arrayContaining(["D0", "A0"]),
    );
  });

  it("uses two bullets only for a major whole-take miss", () => {
    const notes = [
      row({
        noteIndex: 0,
        expectedMidi: 60,
        intonationBucket: "sharp",
        missingData: false,
        centsDifference: 180,
      }),
      row({
        noteIndex: 1,
        expectedMidi: 62,
        intonationBucket: "sharp",
        missingData: false,
        centsDifference: 170,
      }),
      row({
        noteIndex: 2,
        expectedMidi: 64,
        intonationBucket: "sharp",
        missingData: false,
        centsDifference: 160,
      }),
    ];
    const feedback = buildScaleCoachingFeedback(
      session(notes, {
        overallScore0to100: 12,
        inTunePercent: 0,
        averageAbsCents: 170,
        trend: "sharp",
        weakestNoteIndices: [0, 1, 2],
      }),
    );
    expect(feedback.tip.split("\n")).toHaveLength(2);
    expect(feedback.tip).toMatch(/off/i);
    expect(feedback.tip).toMatch(/right note/i);
    expect(feedback.tip).not.toMatch(/tape|Work on/i);
  });

  it("names a whole string when every note on it is off", () => {
    const notes = [
      row({
        noteIndex: 0,
        expectedMidi: 62,
        expectedNoteLabel: "D4",
        intonationBucket: "in_tune",
        missingData: false,
        centsDifference: 4,
      }),
      row({
        noteIndex: 1,
        expectedMidi: 69,
        expectedNoteLabel: "A4",
        intonationBucket: "sharp",
        missingData: false,
        centsDifference: 48,
      }),
      row({
        noteIndex: 2,
        expectedMidi: 71,
        expectedNoteLabel: "B4",
        intonationBucket: "sharp",
        missingData: false,
        centsDifference: 40,
      }),
    ];
    const feedback = buildScaleCoachingFeedback(
      session(notes, {
        overallScore0to100: 55,
        inTunePercent: 33,
        averageAbsCents: 30,
        trend: "sharp",
        weakestNoteIndices: [1, 2],
      }),
    );
    expect(feedback.tip.split("\n")).toHaveLength(2);
    expect(feedback.tip).toMatch(/Every note on A was off/i);
    expect(feedback.tip).toMatch(/Check that string/i);
    expect(feedback.tip).not.toMatch(/tape|Work on/i);
  });
});
