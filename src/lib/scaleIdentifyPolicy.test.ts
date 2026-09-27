import { describe, expect, it } from "vitest";
import { midiToHz } from "@/lib/intonation";
import { detectScaleFromAudio, type ScaleCandidate } from "@/lib/detectScale";
import { SCALE_IDENTIFY } from "@/lib/scaleIdentifyConfig";
import {
  decideScaleIdentify,
  isConvincingRival,
  nextRivalStreak,
  resolveShownScaleTake,
  suggestedConfirmIndex,
  uniqueConfirmChoices,
  type ScaleIdentityHint,
} from "@/lib/scaleIdentifyPolicy";
import { buildExerciseScaleMidis } from "@/lib/scales";

const C_MAJOR: ScaleIdentityHint = {
  tonicPitchClass: 0,
  scaleKind: "major",
  octaveSpan: 1,
};

function candidate(
  partial: Partial<ScaleCandidate> &
    Pick<ScaleCandidate, "tonicPitchClass" | "scaleKind" | "scaleLabel">,
): ScaleCandidate {
  const expectedMidis =
    partial.expectedMidis ?? [60, 62, 64, 65, 67, 69, 71, 72];
  const analyzed = partial.analysis?.summary.notesAnalyzed ?? 8;
  return {
    rootMidi: 60,
    octaveSpan: 1,
    pattern: "round_trip",
    expectedMidis,
    rankScore: 70,
    analysis: {
      notes: [],
      frames: [],
      summary: {
        overallScore0to100: 80,
        averageAbsCents: 8,
        inTunePercent: 80,
        weakestNoteIndices: [],
        trend: "balanced",
        meanSignedCents: 0,
        notesAnalyzed: analyzed,
        notesMissing: Math.max(0, expectedMidis.length - analyzed),
      },
    },
    ...partial,
  };
}

function okDetect(input: {
  best: ScaleCandidate;
  alternatives?: ScaleCandidate[];
  hinted?: ScaleCandidate | null;
  ambiguous?: boolean;
}) {
  return {
    ok: true as const,
    best: input.best,
    alternatives: input.alternatives ?? [input.best],
    ambiguous: input.ambiguous ?? false,
    hinted: input.hinted ?? null,
  };
}

describe("confirm choices", () => {
  it("keeps one card per scale and octave", () => {
    const cRound = candidate({
      tonicPitchClass: 0,
      scaleKind: "major",
      scaleLabel: "C major",
      pattern: "round_trip",
      rankScore: 74,
    });
    const cAsc = candidate({
      tonicPitchClass: 0,
      scaleKind: "major",
      scaleLabel: "C major",
      pattern: "ascending",
      rankScore: 70,
    });
    const aMin = candidate({
      tonicPitchClass: 9,
      scaleKind: "natural_minor",
      scaleLabel: "A minor",
      rankScore: 68,
    });
    const choices = uniqueConfirmChoices([cRound, cAsc, aMin]);
    expect(choices).toHaveLength(2);
    expect(choices[0]?.pattern).toBe("round_trip");
  });

  it("marks a suggestion only when the leader is clearly ahead", () => {
    const lead = candidate({
      tonicPitchClass: 0,
      scaleKind: "major",
      scaleLabel: "C major",
      rankScore: 74,
    });
    const close = candidate({
      tonicPitchClass: 9,
      scaleKind: "natural_minor",
      scaleLabel: "A minor",
      rankScore: 68,
    });
    const tied = candidate({
      tonicPitchClass: 9,
      scaleKind: "natural_minor",
      scaleLabel: "A minor",
      rankScore: 73,
    });
    expect(suggestedConfirmIndex([lead, close])).toBe(0);
    expect(suggestedConfirmIndex([lead, tied])).toBe(-1);
  });
});

describe("decideScaleIdentify — first take", () => {
  it("auto-selects when confidence is high", () => {
    const best = candidate({
      tonicPitchClass: 0,
      scaleKind: "major",
      scaleLabel: "C major",
      rankScore: 80,
    });
    const decision = decideScaleIdentify(
      okDetect({ best, ambiguous: false }),
      { active: null, established: false, rivalStreak: null },
    );
    expect(decision.kind).toBe("auto");
    if (decision.kind === "auto") {
      expect(decision.candidate.scaleLabel).toBe("C major");
    }
  });

  it("asks only when two strong scales are genuinely close", () => {
    const cMaj = candidate({
      tonicPitchClass: 0,
      scaleKind: "major",
      scaleLabel: "C major",
      rankScore: 72,
    });
    const aMin = candidate({
      tonicPitchClass: 9,
      scaleKind: "natural_minor",
      scaleLabel: "A minor",
      rankScore: 68,
    });
    const decision = decideScaleIdentify(
      okDetect({
        best: cMaj,
        alternatives: [cMaj, aMin],
        ambiguous: true,
      }),
      { active: null, established: false, rivalStreak: null },
    );
    expect(decision.kind).toBe("confirm");
    if (decision.kind === "confirm") {
      expect(decision.alternatives).toHaveLength(2);
    }
  });

  it("does not ask when detection fails", () => {
    expect(
      decideScaleIdentify(
        { ok: false, reason: "no_match" },
        { active: null, established: false, rivalStreak: null },
      ),
    ).toEqual({ kind: "fail", reason: "no_match" });
  });
});

describe("decideScaleIdentify — established practice", () => {
  const cMaj = candidate({
    tonicPitchClass: 0,
    scaleKind: "major",
    scaleLabel: "C major",
    rankScore: 64,
  });
  const aMinClose = candidate({
    tonicPitchClass: 9,
    scaleKind: "natural_minor",
    scaleLabel: "A minor",
    rankScore: 66,
  });
  const gMajStrong = candidate({
    tonicPitchClass: 7,
    scaleKind: "major",
    scaleLabel: "G major",
    rankScore: 78,
    rootMidi: 67,
    analysis: {
      notes: [],
      frames: [],
      summary: {
        overallScore0to100: 92,
        averageAbsCents: 4,
        inTunePercent: 95,
        weakestNoteIndices: [],
        trend: "balanced",
        meanSignedCents: 0,
        notesAnalyzed: 14,
        notesMissing: 1,
      },
    },
  });
  const cMajPoor = candidate({
    tonicPitchClass: 0,
    scaleKind: "major",
    scaleLabel: "C major",
    rankScore: 8,
    analysis: {
      notes: [],
      frames: [],
      summary: {
        overallScore0to100: 20,
        averageAbsCents: 40,
        inTunePercent: 10,
        weakestNoteIndices: [],
        trend: "sharp",
        meanSignedCents: 12,
        notesAnalyzed: 3,
        notesMissing: 12,
      },
    },
  });

  it("keeps the locked scale when it still matches", () => {
    const decision = decideScaleIdentify(
      okDetect({ best: cMaj, hinted: cMaj }),
      { active: C_MAJOR, established: true, rivalStreak: null },
    );
    expect(decision).toEqual({ kind: "keep_active", rivalVote: null });
  });

  it("does not interrupt for a close relative minor / messy take", () => {
    const decision = decideScaleIdentify(
      okDetect({ best: aMinClose, hinted: cMaj }),
      { active: C_MAJOR, established: true, rivalStreak: null },
    );
    expect(decision.kind).toBe("keep_active");
    if (decision.kind === "keep_active") {
      expect(decision.rivalVote).toBeNull();
    }
    expect(isConvincingRival(okDetect({ best: aMinClose, hinted: cMaj }), C_MAJOR)).toBe(
      false,
    );
  });

  it("does not treat poor tuning on the locked scale as a switch", () => {
    const poorlyTunedC = candidate({
      tonicPitchClass: 0,
      scaleKind: "major",
      scaleLabel: "C major",
      rankScore: 52,
    });
    const slightlyBetterA = candidate({
      tonicPitchClass: 9,
      scaleKind: "natural_minor",
      scaleLabel: "A minor",
      rankScore: 55,
    });
    const decision = decideScaleIdentify(
      okDetect({ best: slightlyBetterA, hinted: poorlyTunedC }),
      { active: C_MAJOR, established: true, rivalStreak: null },
    );
    expect(decision).toEqual({ kind: "keep_active", rivalVote: null });
  });

  it("ignores a short fragment that happens to fit another scale", () => {
    const fragmentG = candidate({
      tonicPitchClass: 7,
      scaleKind: "major",
      scaleLabel: "G major",
      rankScore: 80,
      analysis: {
        notes: [],
        frames: [],
        summary: {
          overallScore0to100: 90,
          averageAbsCents: 4,
          inTunePercent: 100,
          weakestNoteIndices: [],
          trend: "balanced",
          meanSignedCents: 0,
          notesAnalyzed: 3,
          notesMissing: 12,
        },
      },
    });
    expect(
      decideScaleIdentify(okDetect({ best: fragmentG, hinted: cMajPoor }), {
        active: C_MAJOR,
        established: true,
        rivalStreak: null,
      }),
    ).toEqual({ kind: "keep_active", rivalVote: null });
  });

  it("scores an established scale in place when the audio is a different scale", () => {
    const decision = decideScaleIdentify(
      okDetect({ best: gMajStrong, hinted: cMajPoor, ambiguous: true, alternatives: [gMajStrong, cMajPoor] }),
      { active: C_MAJOR, established: true, rivalStreak: null },
    );
    const take = resolveShownScaleTake(decision);
    expect(take.action).toBe("score_active");
    expect(C_MAJOR).toEqual({
      tonicPitchClass: 0,
      scaleKind: "major",
      octaveSpan: 1,
    });
  });

  it("still does not retarget after a second convincing rival", () => {
    const first = decideScaleIdentify(
      okDetect({ best: gMajStrong, hinted: cMajPoor }),
      { active: C_MAJOR, established: true, rivalStreak: null },
    );
    expect(first.kind).toBe("keep_active");
    if (first.kind !== "keep_active" || !first.rivalVote) return;
    const second = decideScaleIdentify(
      okDetect({ best: gMajStrong, hinted: cMajPoor }),
      {
        active: C_MAJOR,
        established: true,
        rivalStreak: { hint: first.rivalVote, count: 1 },
      },
    );
    expect(second.kind).toBe("suggest");
    expect(resolveShownScaleTake(second).action).toBe("score_active");
  });

  it("needs two convincing rival takes before suggesting a switch", () => {
    const first = decideScaleIdentify(
      okDetect({ best: gMajStrong, hinted: cMajPoor }),
      { active: C_MAJOR, established: true, rivalStreak: null },
    );
    expect(first.kind).toBe("keep_active");
    if (first.kind !== "keep_active") return;
    expect(first.rivalVote).toEqual({
      tonicPitchClass: 7,
      scaleKind: "major",
      octaveSpan: 1,
    });

    const second = decideScaleIdentify(
      okDetect({ best: gMajStrong, hinted: cMajPoor }),
      {
        active: C_MAJOR,
        established: true,
        rivalStreak: { hint: first.rivalVote!, count: 1 },
      },
    );
    expect(second.kind).toBe("suggest");
    if (second.kind === "suggest") {
      expect(second.candidate.scaleLabel).toBe("G major");
    }
  });

  it("resets the rival streak when the locked scale fits again", () => {
    const streak = nextRivalStreak(null, {
      tonicPitchClass: 7,
      scaleKind: "major",
      octaveSpan: 1,
    });
    const decision = decideScaleIdentify(okDetect({ best: cMaj, hinted: cMaj }), {
      active: C_MAJOR,
      established: true,
      rivalStreak: streak,
    });
    expect(decision).toEqual({ kind: "keep_active", rivalVote: null });
    expect(nextRivalStreak(streak, null)).toBeNull();
  });

  it("does not switch octave on one take of the same tonic", () => {
    const cMaj2 = candidate({
      tonicPitchClass: 0,
      scaleKind: "major",
      scaleLabel: "C major",
      octaveSpan: 2,
      rankScore: 90,
    });
    expect(
      decideScaleIdentify(okDetect({ best: cMaj2, hinted: cMaj }), {
        active: C_MAJOR,
        established: true,
        rivalStreak: null,
      }),
    ).toEqual({ kind: "keep_active", rivalVote: null });
  });

  it("keeps practising after a silent / unmatched take", () => {
    expect(
      decideScaleIdentify(
        { ok: false, reason: "no_pitch" },
        { active: C_MAJOR, established: true, rivalStreak: null },
      ),
    ).toEqual({ kind: "keep_active", rivalVote: null });
  });
});

function synthScaleMono(
  midis: readonly number[],
  opts?: { sampleRate?: number; secondsPerNote?: number },
): { mono: Float32Array; sampleRateHz: number } {
  const sampleRate = opts?.sampleRate ?? 44100;
  const secondsPerNote = opts?.secondsPerNote ?? 0.35;
  const nPer = Math.floor(sampleRate * secondsPerNote);
  const mono = new Float32Array(nPer * midis.length);
  for (let i = 0; i < midis.length; i++) {
    const hz = midiToHz(midis[i]!);
    const start = i * nPer;
    for (let s = 0; s < nPer; s++) {
      mono[start + s] = Math.sin((2 * Math.PI * hz * s) / sampleRate) * 0.85;
    }
  }
  return { mono, sampleRateHz: sampleRate };
}

describe("identify policy against synthesised takes", () => {
  it("auto-selects a clear first C major take without asking", () => {
    const { mono, sampleRateHz } = synthScaleMono(
      buildExerciseScaleMidis(60, "major", 1),
    );
    const first = detectScaleFromAudio(mono, sampleRateHz);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.ambiguous).toBe(false);
    const opened = decideScaleIdentify(first, {
      active: null,
      established: false,
      rivalStreak: null,
    });
    expect(opened.kind).toBe("auto");
    if (opened.kind === "auto") {
      expect(opened.candidate.tonicPitchClass).toBe(0);
      expect(opened.candidate.scaleKind).toBe("major");
    }
    expect(resolveShownScaleTake(opened).action).toBe("open");
  });

  it("keeps C major on the first G major take, then suggests after a second", () => {
    const g = synthScaleMono(buildExerciseScaleMidis(67, "major", 1));
    const detected = detectScaleFromAudio(g.mono, g.sampleRateHz, undefined, {
      hint: C_MAJOR,
    });
    expect(detected.ok).toBe(true);
    if (!detected.ok) return;
    expect(detected.best.tonicPitchClass).toBe(7);
    expect(detected.hinted == null || detected.hinted.tonicPitchClass === 0).toBe(
      true,
    );

    const first = decideScaleIdentify(detected, {
      active: C_MAJOR,
      established: true,
      rivalStreak: null,
    });
    expect(first.kind).toBe("keep_active");

    const second = decideScaleIdentify(detected, {
      active: C_MAJOR,
      established: true,
      rivalStreak:
        first.kind === "keep_active" && first.rivalVote
          ? { hint: first.rivalVote, count: 1 }
          : { hint: { tonicPitchClass: 7, scaleKind: "major", octaveSpan: 1 }, count: 1 },
    });
    if (detected.best.rankScore >= SCALE_IDENTIFY.rivalStrongRank) {
      expect(second.kind).toBe("suggest");
    } else {
      expect(second.kind).toBe("keep_active");
    }
  });
});
