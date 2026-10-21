import { describe, expect, it } from "vitest";
import {
  buildAttemptProgress,
  buildLoopAttemptMeta,
  buildLoopMastery,
  countInTuneNotes,
  findPreviousComparableTake,
  isGreatAccuracyTake,
  MASTERY_HIGH_REGRESS_RATE,
  MASTERY_IMPROVE_RATE,
  MASTERY_FIRST_TAKE_CAP,
  MASTERY_NEAR_TOP_MIN_GAIN,
  MASTERY_REGRESS_RATE,
  masteryRemainingEase,
  practiceStageFromMastery,
  practiceStageFromSummary,
  scoreScaleAttempt,
  updateScaleMastery,
} from "@/lib/scalePracticeProgress";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";

function session(
  partial: Partial<ScalePracticeSessionV1> & {
    sessionId: string;
    inTunePercent: number;
    inTuneCount: number;
    total?: number;
    notesAnalyzed?: number;
    overallScore0to100?: number;
  },
): ScalePracticeSessionV1 {
  const total = partial.total ?? 8;
  const analyzed = Math.max(
    0,
    Math.min(total, partial.notesAnalyzed ?? total),
  );
  const notes = Array.from({ length: total }, (_, i) => {
    const missing = i >= analyzed;
    const inTune = !missing && i < partial.inTuneCount;
    return {
      noteIndex: i,
      expectedMidi: 60 + i,
      expectedNoteLabel: "C4",
      detectedMidi: missing ? 0 : 60 + i,
      detectedNoteLabel: missing ? "—" : "C4",
      detectedHz: missing ? 0 : 261,
      centsDifference: missing ? 0 : inTune ? 0 : 40,
      intonationBucket: missing
        ? ("unknown" as const)
        : inTune
          ? ("in_tune" as const)
          : ("sharp" as const),
      missingData: missing,
    };
  });
  return {
    schemaVersion: 1,
    sessionId: partial.sessionId,
    exerciseType: "scale_practice",
    recordedAt: "2026-01-01T00:00:00.000Z",
    scaleId: partial.scaleId ?? "pc0-major",
    scaleLabel: "C major",
    scaleKind: "major",
    tonicPitchClass: 0,
    octaveSpan: 1,
    octaveRangeLabel: "C4 → C5",
    rootMidi: 60,
    expectedNotesMidi: notes.map((n) => n.expectedMidi),
    audioSourceType: "recorded",
    sampleRateHz: 48000,
    notes,
    summary: {
      overallScore0to100: partial.overallScore0to100 ?? partial.inTunePercent,
      averageAbsCents: 20,
      inTunePercent: partial.inTunePercent,
      weakestNoteIndices: [],
      trend: "balanced",
      meanSignedCents: 0,
      notesAnalyzed: analyzed,
      notesMissing: total - analyzed,
    },
  };
}

function foldScores(scores: number[], start: number | null = null): number {
  let mastery = start;
  for (const score of scores) {
    mastery = updateScaleMastery(mastery, score);
  }
  return mastery ?? 0;
}

describe("practiceStageFromSummary", () => {
  it("maps low accuracy to Getting started, not Needs work", () => {
    expect(
      practiceStageFromSummary({
        overallScore0to100: 17,
        averageAbsCents: 40,
        inTunePercent: 17,
        weakestNoteIndices: [],
        trend: "sharp",
        meanSignedCents: 10,
        notesAnalyzed: 8,
        notesMissing: 0,
      }).label,
    ).toBe("Getting started");
  });

  it("maps high accuracy to Excellent", () => {
    expect(
      practiceStageFromSummary({
        overallScore0to100: 95,
        averageAbsCents: 4,
        inTunePercent: 95,
        weakestNoteIndices: [],
        trend: "balanced",
        meanSignedCents: 0,
        notesAnalyzed: 8,
        notesMissing: 0,
      }).label,
    ).toBe("Excellent");
  });
});

describe("buildAttemptProgress", () => {
  it("celebrates more in-tune notes vs previous", () => {
    const prev = session({ sessionId: "a", inTunePercent: 25, inTuneCount: 2 });
    const cur = session({ sessionId: "b", inTunePercent: 50, inTuneCount: 5 });
    const p = buildAttemptProgress(cur, prev);
    expect(p.kind).toBe("up");
    expect(p.line).toMatch(/3 more notes in tune/i);
  });

  it("is constructive on a tougher take", () => {
    const prev = session({ sessionId: "a", inTunePercent: 70, inTuneCount: 6 });
    const cur = session({ sessionId: "b", inTunePercent: 30, inTuneCount: 2 });
    const p = buildAttemptProgress(cur, prev);
    expect(p.kind).toBe("down");
    expect(p.line).toMatch(/Next/i);
  });

  it("handles first take", () => {
    const cur = session({ sessionId: "b", inTunePercent: 20, inTuneCount: 1 });
    expect(buildAttemptProgress(cur, null).kind).toBe("first");
  });
});

describe("findPreviousComparableTake", () => {
  it("prefers same scaleId", () => {
    const cur = session({ sessionId: "now", inTunePercent: 40, inTuneCount: 3 });
    const hist = [
      cur,
      session({
        sessionId: "other",
        scaleId: "pc7-major",
        inTunePercent: 80,
        inTuneCount: 7,
      }),
      session({
        sessionId: "same",
        scaleId: "pc0-major",
        inTunePercent: 30,
        inTuneCount: 2,
      }),
    ];
    expect(findPreviousComparableTake(cur, hist)?.sessionId).toBe("same");
  });

  it("does not fall back to a different octave of the same scale", () => {
    const cur = session({ sessionId: "now", inTunePercent: 40, inTuneCount: 3 });
    const otherOctave = session({
      sessionId: "oct2",
      scaleId: "pc0-major",
      inTunePercent: 80,
      inTuneCount: 7,
    });
    otherOctave.octaveSpan = 2;
    expect(findPreviousComparableTake(cur, [cur, otherOctave])).toBeNull();
  });
});

describe("countInTuneNotes", () => {
  it("counts only clear in-tune rows", () => {
    const s = session({ sessionId: "x", inTunePercent: 50, inTuneCount: 4 });
    expect(countInTuneNotes(s.notes)).toBe(4);
  });
});

describe("scoreScaleAttempt", () => {
  it("scores silence as zero", () => {
    const silent = session({
      sessionId: "s",
      inTunePercent: 0,
      inTuneCount: 0,
      notesAnalyzed: 0,
    });
    expect(scoreScaleAttempt(silent)).toEqual({
      completionScore: 0,
      performanceScore: 0,
      attemptScore: 0,
    });
  });

  it("keeps 1–2 notes of a full scale far below mastery", () => {
    const twoNotes = session({
      sessionId: "two",
      inTunePercent: 100,
      inTuneCount: 2,
      notesAnalyzed: 2,
      overallScore0to100: 100,
    });
    const scored = scoreScaleAttempt(twoNotes);
    expect(scored.completionScore).toBeCloseTo(25, 0);
    expect(scored.attemptScore).toBeLessThan(30);
    expect(isGreatAccuracyTake(twoNotes)).toBe(false);
  });

  it("scores a complete poor take well below a complete excellent take", () => {
    const poor = session({
      sessionId: "poor",
      inTunePercent: 25,
      inTuneCount: 2,
      overallScore0to100: 30,
    });
    const excellent = session({
      sessionId: "ex",
      inTunePercent: 100,
      inTuneCount: 8,
      overallScore0to100: 96,
    });
    const poorScore = scoreScaleAttempt(poor).attemptScore;
    const excellentScore = scoreScaleAttempt(excellent).attemptScore;
    expect(poorScore).toBeGreaterThan(40);
    expect(poorScore).toBeLessThan(70);
    expect(excellentScore).toBeGreaterThan(90);
    expect(excellentScore).toBeLessThanOrEqual(100);
  });

  it("does not treat a complete out-of-tune scale as 100", () => {
    const completePoor = session({
      sessionId: "full-poor",
      inTunePercent: 20,
      inTuneCount: 1,
      overallScore0to100: 22,
    });
    expect(scoreScaleAttempt(completePoor).attemptScore).toBeLessThan(55);
    expect(isGreatAccuracyTake(completePoor)).toBe(false);
  });
});

describe("updateScaleMastery", () => {
  it("seeds the first attempt at the attempt score", () => {
    expect(updateScaleMastery(null, 62)).toBe(62);
  });

  it("does not fill the bar on a high first take without full correctness", () => {
    expect(updateScaleMastery(null, 100)).toBe(MASTERY_FIRST_TAKE_CAP);
  });

  it("fills the bar immediately when the take is fully correct", () => {
    expect(updateScaleMastery(null, 96, { fullyCorrect: true })).toBe(100);
    expect(updateScaleMastery(40, 96, { fullyCorrect: true })).toBe(100);
    expect(updateScaleMastery(90, 100, { fullyCorrect: true })).toBe(100);
  });

  it("climbs steadily through 60 → 70 → 80 → 90 without copying the latest score", () => {
    const mastery = foldScores([60, 70, 80, 90]);
    expect(mastery).toBeGreaterThan(68);
    expect(mastery).toBeLessThan(82);
    expect(mastery).toBeLessThan(90);
  });

  it("barely moves on a single crash 90 → 50", () => {
    const next = updateScaleMastery(90, 50);
    expect(next).toBeGreaterThan(87);
    expect(next).toBeLessThan(90);
    expect(next).toBeCloseTo(90 + (50 - 90) * MASTERY_HIGH_REGRESS_RATE, 5);
  });

  it("eases down gradually across 90 → 50 → 48 → 45 → 42", () => {
    const oneMiss = updateScaleMastery(90, 50);
    const mastery = foldScores([50, 48, 45, 42], 90);
    expect(mastery).toBeLessThan(oneMiss);
    expect(mastery).toBeGreaterThan(70);
    expect(mastery).toBeLessThan(90);
    expect(90 - mastery).toBeLessThan(20);
  });

  it("rewards a large jump 40 → 85 without snapping to 85", () => {
    const next = updateScaleMastery(40, 85);
    const ease = masteryRemainingEase(40);
    expect(next).toBeGreaterThan(48);
    expect(next).toBeLessThan(60);
    expect(next).toBeCloseTo(40 + (85 - 40) * MASTERY_IMPROVE_RATE * ease, 5);
  });

  it("nudges 95 → 96 → 98 → 99 toward but not onto 100 in one step", () => {
    const after96 = updateScaleMastery(95, 96);
    const after98 = updateScaleMastery(after96, 98);
    const after99 = updateScaleMastery(after98, 99);
    expect(after96).toBeGreaterThan(95);
    expect(after96).toBeLessThan(97);
    expect(after99).toBeGreaterThan(after96);
    expect(after99).toBeLessThan(100);
  });

  it("does not move when a mid-range score is repeated", () => {
    expect(foldScores([72, 72, 72], 72)).toBe(72);
  });

  it("clamps to 0–100", () => {
    expect(updateScaleMastery(-10, 200)).toBeGreaterThan(0);
    expect(updateScaleMastery(-10, 200)).toBeLessThan(100);
    expect(updateScaleMastery(null, 140)).toBe(MASTERY_FIRST_TAKE_CAP);
    expect(updateScaleMastery(null, Number.NaN)).toBe(0);
  });

  it("uses a stronger up-rate than down-rate", () => {
    const up = updateScaleMastery(70, 85) - 70;
    const down = 70 - updateScaleMastery(70, 55);
    expect(up).toBeGreaterThan(down);
    expect(70 + (55 - 70) * MASTERY_REGRESS_RATE).toBeCloseTo(
      updateScaleMastery(70, 55),
      5,
    );
  });
});

describe("updateScaleMastery high region", () => {
  it("gives smaller gains as mastery approaches 100", () => {
    const from80 = updateScaleMastery(80, 96) - 80;
    const from90 = updateScaleMastery(90, 96) - 90;
    const from95 = updateScaleMastery(95, 96) - 95;
    const from98 = updateScaleMastery(98, 99) - 98;
    expect(from80).toBeGreaterThan(from90);
    expect(from90).toBeGreaterThan(from95);
    expect(from95).toBeGreaterThan(0);
    expect(from98).toBeGreaterThan(0);
    expect(from98).toBeLessThanOrEqual(MASTERY_NEAR_TOP_MIN_GAIN + 1e-9);
    expect(from80).toBeGreaterThan(from98 * 2);
  });

  it("shrinks gains across repeated strong attempts from 80", () => {
    const first = updateScaleMastery(80, 96);
    const second = updateScaleMastery(first, 96);
    expect(first - 80).toBeGreaterThan(second - first);
    expect(second).toBeLessThan(94);
  });

  it("shrinks gains across repeated strong attempts from 90", () => {
    const first = updateScaleMastery(90, 96);
    const second = updateScaleMastery(first, 96);
    expect(first - 90).toBeGreaterThan(second - first);
    expect(first).toBeLessThan(94);
    expect(second).toBeLessThan(96);
  });

  it("only inches forward from 95 with repeated strong attempts", () => {
    const after = foldScores([96, 96, 96], 95);
    expect(after).toBeGreaterThan(95);
    expect(after).toBeLessThan(98);
  });

  it("only inches forward from 98 with repeated excellent attempts", () => {
    const after = foldScores([99, 99, 99], 98);
    expect(after).toBeGreaterThan(98);
    expect(after).toBeLessThan(100);
  });

  it("can reach 100 from 99 with repeated excellent attempts", () => {
    const after = foldScores([99, 99, 99], 99);
    expect(after).toBe(100);
  });

  it("does not jump 90 to 100 on one excellent attempt", () => {
    expect(updateScaleMastery(90, 100)).toBeLessThan(95);
  });

  it("lets repeated excellent attempts approach 100 without a streak unlock", () => {
    let mastery = 80;
    let steps = 0;
    const firstGain = updateScaleMastery(80, 98) - 80;
    while (mastery < 100 && steps < 40) {
      mastery = updateScaleMastery(mastery, 98);
      steps += 1;
    }
    expect(firstGain).toBeGreaterThan(2);
    expect(steps).toBeGreaterThan(8);
    expect(mastery).toBe(100);
  });

  it("drops only a little from 100 after one weak attempt", () => {
    const next = updateScaleMastery(100, 70);
    expect(next).toBeGreaterThan(97);
    expect(next).toBeLessThan(100);
    expect(next).toBeCloseTo(100 + (70 - 100) * MASTERY_HIGH_REGRESS_RATE, 5);
  });

  it("lets several weak attempts from 100 ease down without a reset", () => {
    const after = foldScores([70, 68, 65, 62], 100);
    expect(after).toBeLessThan(updateScaleMastery(100, 70));
    expect(after).toBeGreaterThan(90);
  });

  it("barely moves 95 after one very poor attempt", () => {
    const next = updateScaleMastery(95, 30);
    expect(next).toBeGreaterThan(91);
    expect(next).toBeLessThan(95);
  });
});

describe("buildLoopMastery", () => {
  it("awards 100 on a single fully correct great take", () => {
    const a = session({
      sessionId: "a",
      inTunePercent: 100,
      inTuneCount: 8,
      total: 8,
      overallScore0to100: 96,
    });
    const mastery = buildLoopMastery([a]);
    expect(isGreatAccuracyTake(a)).toBe(true);
    expect(mastery.percent).toBe(100);
    expect(mastery.greatStreak).toBe(1);
    expect(mastery.attemptScore).toBeGreaterThan(90);
    expect(practiceStageFromMastery(mastery.percent).label).toBe("Excellent");
  });

  it("keeps a high but incomplete first take below 100", () => {
    const partial = session({
      sessionId: "partial-strong",
      inTunePercent: 100,
      inTuneCount: 6,
      notesAnalyzed: 6,
      total: 8,
      overallScore0to100: 100,
    });
    expect(isGreatAccuracyTake(partial)).toBe(false);
    expect(buildLoopMastery([partial]).percent).toBeLessThan(100);
  });

  it("stays at 100 across repeated great complete takes", () => {
    const takes = [1, 2, 3].map((n) =>
      session({
        sessionId: `c${n}`,
        inTunePercent: 100,
        inTuneCount: 8,
        total: 8,
        overallScore0to100: 96,
      }),
    );
    expect(buildLoopMastery(takes.slice(0, 1)).percent).toBe(100);
    expect(buildLoopMastery(takes).percent).toBe(100);
    expect(practiceStageFromMastery(100).label).toBe("Excellent");
  });

  it("only eases slightly after one weak take on a strong run", () => {
    const great = session({
      sessionId: "g",
      inTunePercent: 100,
      inTuneCount: 8,
      total: 8,
      overallScore0to100: 96,
    });
    const miss = session({
      sessionId: "m",
      inTunePercent: 40,
      inTuneCount: 3,
      total: 8,
      overallScore0to100: 40,
    });
    const afterTwo = buildLoopMastery([great, great]);
    const afterMiss = buildLoopMastery([great, great, miss]);
    expect(afterTwo.percent).toBe(100);
    expect(afterMiss.greatStreak).toBe(0);
    expect(afterMiss.percent).toBeLessThan(afterTwo.percent);
    expect(afterMiss.percent).toBeGreaterThan(afterTwo.percent - 5);
    expect(afterMiss.percent).toBeGreaterThan(70);
  });

  it("does not yank 100% down to a later mistake", () => {
    const great = (id: string) =>
      session({
        sessionId: id,
        inTunePercent: 100,
        inTuneCount: 8,
        overallScore0to100: 96,
      });
    const miss = session({
      sessionId: "later-miss",
      inTunePercent: 45,
      inTuneCount: 3,
      overallScore0to100: 45,
    });
    const full = buildLoopMastery([great("g0")]);
    const after = buildLoopMastery([great("g0"), miss]);
    expect(full.percent).toBe(100);
    expect(after.percent).toBeGreaterThanOrEqual(97);
    expect(after.percent).toBeLessThan(100);
  });

  it("lets several weak takes in a row pull mastery down a little", () => {
    const strong = session({
      sessionId: "strong",
      inTunePercent: 80,
      inTuneCount: 6,
      overallScore0to100: 80,
    });
    const weak = (id: string) =>
      session({
        sessionId: id,
        inTunePercent: 35,
        inTuneCount: 3,
        overallScore0to100: 35,
      });
    const start = buildLoopMastery([strong]).percent;
    const afterMany = buildLoopMastery([
      strong,
      weak("w1"),
      weak("w2"),
      weak("w3"),
      weak("w4"),
    ]).percent;
    expect(afterMany).toBeLessThan(start);
    expect(afterMany).toBeGreaterThan(start - 20);
  });

  it("ignores a silent take so a mic miss does not erase progress", () => {
    const played = session({
      sessionId: "played",
      inTunePercent: 70,
      inTuneCount: 5,
      overallScore0to100: 70,
    });
    const silent = session({
      sessionId: "silent",
      inTunePercent: 0,
      inTuneCount: 0,
      notesAnalyzed: 0,
    });
    expect(buildLoopMastery([played, silent]).percent).toBe(
      buildLoopMastery([played]).percent,
    );
    expect(buildLoopMastery([played, silent]).attemptScore).toBe(0);
  });

  it("starts near zero when only a couple of notes were heard", () => {
    const partial = session({
      sessionId: "partial",
      inTunePercent: 100,
      inTuneCount: 2,
      notesAnalyzed: 2,
      overallScore0to100: 100,
    });
    const mastery = buildLoopMastery([partial]);
    expect(mastery.percent).toBeLessThan(30);
    expect(mastery.attemptScore).toBe(mastery.percent);
  });
});

describe("buildLoopAttemptMeta", () => {
  it("marks first take and tracks best", () => {
    const a = session({ sessionId: "a", inTunePercent: 40, inTuneCount: 3 });
    const meta = buildLoopAttemptMeta([a]);
    expect(meta.attemptNumber).toBe(1);
    expect(meta.isFirst).toBe(true);
    expect(meta.deltaPct).toBeNull();
    expect(meta.isNewBest).toBe(false);
    expect(meta.bestAccuracy).toBe(40);
  });

  it("shows positive delta and new best on improvement", () => {
    const a = session({ sessionId: "a", inTunePercent: 40, inTuneCount: 3 });
    const b = session({ sessionId: "b", inTunePercent: 47, inTuneCount: 4 });
    const meta = buildLoopAttemptMeta([a, b]);
    expect(meta.attemptNumber).toBe(2);
    expect(meta.deltaPct).toBe(7);
    expect(meta.isNewBest).toBe(true);
    expect(meta.bestAccuracy).toBe(47);
  });

  it("does not mark new best when accuracy drops", () => {
    const a = session({ sessionId: "a", inTunePercent: 60, inTuneCount: 5 });
    const b = session({ sessionId: "b", inTunePercent: 50, inTuneCount: 4 });
    const meta = buildLoopAttemptMeta([a, b]);
    expect(meta.deltaPct).toBe(-10);
    expect(meta.isNewBest).toBe(false);
    expect(meta.bestAccuracy).toBe(60);
  });
});
