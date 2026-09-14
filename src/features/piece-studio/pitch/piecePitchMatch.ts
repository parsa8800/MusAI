import {
  collectPitchFrames,
  collectStablePitchRuns,
  matchDetectedRunsToExpected,
  preferFundamentalNearTargetHz,
  type StablePitchRun,
} from "@/lib/analyzePitch";
import { midiToHz } from "@/lib/intonation";

/**
 * Shared pitch match for a piece take.
 * Used by numeric performance scoring and PitchAnalyzer so we only run
 * collectPitchFrames / matching once per recording.
 */
export type PiecePitchMatch = {
  slots: Array<number | null>;
  timesSec: Array<number | null>;
  durationSec: number;
};

function timesFromMatchedSlots(
  runs: StablePitchRun[],
  expectedMidis: readonly number[],
  slots: Array<number | null>,
): Array<number | null> {
  const used = new Array(runs.length).fill(false);
  return slots.map((hz, i) => {
    if (hz == null) return null;
    const target = midiToHz(expectedMidis[i]!);
    for (let r = 0; r < runs.length; r++) {
      if (used[r]) continue;
      if (preferFundamentalNearTargetHz(runs[r]!.medianHz, target) === hz) {
        used[r] = true;
        return runs[r]!.timeStartSec;
      }
    }
    return null;
  });
}

export function matchPiecePitch(input: {
  mono: Float32Array;
  sampleRateHz: number;
  expectedMidis: readonly number[];
}): PiecePitchMatch {
  const durationSec =
    input.mono.length > 0 ? input.mono.length / input.sampleRateHz : 0;
  if (input.expectedMidis.length === 0) {
    return { slots: [], timesSec: [], durationSec };
  }
  const frames = collectPitchFrames(input.mono, input.sampleRateHz, {
    mode: "piece",
  });
  const runs = collectStablePitchRuns(frames);
  const slots = matchDetectedRunsToExpected(runs, input.expectedMidis);
  const timesSec = timesFromMatchedSlots(runs, input.expectedMidis, slots);
  return { slots, timesSec, durationSec };
}
