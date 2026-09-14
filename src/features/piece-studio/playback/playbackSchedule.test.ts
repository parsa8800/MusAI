import { describe, expect, it } from "vitest";
import { planScheduledNotes } from "@/features/piece-studio/playback/playbackSchedule";
import type { PlaybackNote } from "@/features/piece-studio/playback/playbackTimeline";

function note(
  startSec: number,
  endSec: number,
  midi: number,
): PlaybackNote {
  return {
    startSec,
    endSec,
    startQuarter: startSec,
    midi,
    velocity: 0.7,
  };
}

/** Twinkle-like run: equal quarters, repeating pitch (same MIDI must all schedule). */
const SEQUENCE: PlaybackNote[] = [
  note(0, 0.5, 60),
  note(0.5, 1.0, 60),
  note(1.0, 1.5, 67),
  note(1.5, 2.0, 67),
  note(2.0, 2.5, 69),
  note(2.5, 3.0, 69),
  note(3.0, 4.0, 67),
];

describe("planScheduledNotes", () => {
  it("schedules the full remaining sequence after a mid-piece seek", () => {
    const fromSec = 1.0;
    const planned = planScheduledNotes({
      notes: SEQUENCE,
      fromSec,
      untilSec: fromSec + 5,
      rate: 1,
      audioNow: 10,
      started: new Set(),
    });

    expect(planned.map((p) => p.index)).toEqual([2, 3, 4, 5, 6]);
    expect(planned.map((p) => p.midi)).toEqual([67, 67, 69, 69, 67]);
    // First remaining note starts immediately at the seek audio time.
    expect(planned[0]!.when).toBeCloseTo(10, 5);
    // Later notes keep relative score spacing in audio time.
    expect(planned[1]!.when).toBeCloseTo(10.5, 5);
    expect(planned[4]!.when).toBeCloseTo(12.0, 5);
    // Every attack carries a positive hold duration (no StopFn noteOff needed).
    for (const attack of planned) {
      expect(attack.durationSec).toBeGreaterThan(0.04);
    }
  });

  it("schedules from several different seek points until the end", () => {
    const seeks = [0, 0.5, 1.5, 2.5, 3.0];
    for (const fromSec of seeks) {
      const planned = planScheduledNotes({
        notes: SEQUENCE,
        fromSec,
        untilSec: 99,
        rate: 1,
        audioNow: 0,
        started: new Set(),
      });
      const expected = SEQUENCE.map((_, i) => i).filter(
        (i) => SEQUENCE[i]!.endSec > fromSec + 0.01,
      );
      expect(planned.map((p) => p.index)).toEqual(expected);
      expect(planned.length).toBeGreaterThan(0);
    }
  });

  it("respects lookahead untilSec without dropping earlier remaining notes", () => {
    const fromSec = 0;
    const planned = planScheduledNotes({
      notes: SEQUENCE,
      fromSec,
      untilSec: 1.2,
      rate: 1,
      audioNow: 0,
      started: new Set(),
    });
    expect(planned.map((p) => p.index)).toEqual([0, 1, 2]);
  });

  it("skips notes already marked started and notes past a loop end", () => {
    const planned = planScheduledNotes({
      notes: SEQUENCE,
      fromSec: 0,
      untilSec: 99,
      rate: 1,
      audioNow: 0,
      started: new Set([0, 1]),
      loopEndSec: 2.0,
    });
    expect(planned.map((p) => p.index)).toEqual([2, 3]);
  });

  it("scales timing by playback rate without changing pitch midi", () => {
    const planned = planScheduledNotes({
      notes: SEQUENCE,
      fromSec: 1.0,
      untilSec: 99,
      rate: 0.5,
      audioNow: 5,
      started: new Set(),
    });
    expect(planned[0]!.midi).toBe(67);
    // At half speed, 0.5 score-sec → 1.0 audio-sec.
    expect(planned[1]!.when).toBeCloseTo(6.0, 5);
  });
});
