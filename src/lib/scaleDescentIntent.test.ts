import { describe, expect, it } from "vitest";
import {
  countDescendingMatchesAfterPeak,
  DESCENT_INTENT_MIN_NOTES,
  detectScaleDescentIntent,
  findPeakRunIndex,
  resolveScaleExerciseMidis,
} from "@/lib/scaleDescentIntent";
import {
  buildAscendingScaleMidis,
  buildExerciseScaleMidis,
} from "@/lib/scales";

function runsFromMidis(midis: readonly number[]) {
  return midis.map((midiCenter) => ({ midiCenter }));
}

describe("detectScaleDescentIntent", () => {
  const ascending1 = buildAscendingScaleMidis(60, "major", 1);
  const roundTrip1 = buildExerciseScaleMidis(60, "major", 1);
  const ascending2 = buildAscendingScaleMidis(60, "major", 2);

  it("does not trigger on ascending-only playing", () => {
    expect(
      detectScaleDescentIntent(runsFromMidis(ascending1), ascending1),
    ).toBe(false);
  });

  it("does not trigger from one random lower pitch after the peak", () => {
    const played = [...ascending1, 59]; // one stray below
    expect(detectScaleDescentIntent(runsFromMidis(played), ascending1)).toBe(
      false,
    );
  });

  it("does not trigger from a single correct descent degree", () => {
    const played = [...ascending1, 71]; // only B after peak C
    expect(detectScaleDescentIntent(runsFromMidis(played), ascending1)).toBe(
      false,
    );
  });

  it("detects clear 1-octave ascending then descending intent", () => {
    // Full up, then a few descending notes (not necessarily all)
    const played = [...ascending1, 71, 69, 67, 65];
    expect(detectScaleDescentIntent(runsFromMidis(played), ascending1)).toBe(
      true,
    );
    expect(
      countDescendingMatchesAfterPeak(
        runsFromMidis(played),
        ascending1,
        findPeakRunIndex(runsFromMidis(played), ascending1),
      ),
    ).toBeGreaterThanOrEqual(DESCENT_INTENT_MIN_NOTES);
  });

  it("detects descent even when some descending notes are missed", () => {
    // Peak C, then B, skip A, G, F — still sequential evidence of descent
    const played = [...ascending1, 71, 67, 65];
    expect(detectScaleDescentIntent(runsFromMidis(played), ascending1)).toBe(
      true,
    );
  });

  it("requires reaching the peak before counting descent", () => {
    // Notes that look like descent but never hit the upper tonic
    const played = [60, 62, 64, 65, 67, 69, 71, 69, 67, 65];
    expect(detectScaleDescentIntent(runsFromMidis(played), ascending1)).toBe(
      false,
    );
  });

  it("detects 2-octave turnaround the same way", () => {
    const peak = ascending2[ascending2.length - 1]!;
    expect(peak).toBe(84); // C6
    const played = [
      ...ascending2,
      83, // B
      81, // A
      79, // G
      77, // F
    ];
    expect(detectScaleDescentIntent(runsFromMidis(played), ascending2)).toBe(
      true,
    );
  });

  it("does not flip a 2-octave ascent on one lower blip", () => {
    const played = [...ascending2, 72];
    expect(detectScaleDescentIntent(runsFromMidis(played), ascending2)).toBe(
      false,
    );
  });
});

describe("resolveScaleExerciseMidis", () => {
  const ascending1 = buildAscendingScaleMidis(60, "major", 1);
  const roundTrip1 = buildExerciseScaleMidis(60, "major", 1);

  it("keeps ascending when preferred and no descent intent", () => {
    const resolved = resolveScaleExerciseMidis({
      rootMidi: 60,
      scaleKind: "major",
      octaveSpan: 1,
      runs: runsFromMidis(ascending1),
      preferredMotion: "ascending",
    });
    expect(resolved.motion).toBe("ascending");
    expect(resolved.expectedMidis).toEqual(ascending1);
    expect(resolved.upgradedToRoundTrip).toBe(false);
  });

  it("upgrades ascending preference once descent intent is clear", () => {
    const played = [...ascending1, 71, 69, 67];
    const resolved = resolveScaleExerciseMidis({
      rootMidi: 60,
      scaleKind: "major",
      octaveSpan: 1,
      runs: runsFromMidis(played),
      preferredMotion: "ascending",
    });
    expect(resolved.motion).toBe("up_down");
    expect(resolved.expectedMidis).toEqual(roundTrip1);
    expect(resolved.upgradedToRoundTrip).toBe(true);
  });

  it("respects an explicit up_down preference without needing upgrade", () => {
    const resolved = resolveScaleExerciseMidis({
      rootMidi: 60,
      scaleKind: "major",
      octaveSpan: 1,
      runs: runsFromMidis(ascending1),
      preferredMotion: "up_down",
    });
    expect(resolved.motion).toBe("up_down");
    expect(resolved.expectedMidis).toEqual(roundTrip1);
    expect(resolved.upgradedToRoundTrip).toBe(false);
  });
});
