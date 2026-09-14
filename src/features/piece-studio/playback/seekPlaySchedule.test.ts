import { describe, expect, it, vi } from "vitest";
import { planScheduledNotes } from "@/features/piece-studio/playback/playbackSchedule";
import type { PlaybackNote } from "@/features/piece-studio/playback/playbackTimeline";

/**
 * Integration-style check: after a seek, the planner + duration contract
 * must arm every remaining note in the lookahead — not just the first.
 */
describe("seek-then-play scheduling contract", () => {
  const notes: PlaybackNote[] = Array.from({ length: 12 }, (_, i) => ({
    startSec: i * 0.4,
    endSec: i * 0.4 + 0.35,
    startQuarter: i * 0.4,
    midi: 60 + (i % 5),
    velocity: 0.7,
  }));

  it("arms a multi-note sequence from several start positions", () => {
    const noteOn = vi.fn();
    const seeks = [0, 0.8, 1.6, 2.4, 3.6];
    for (const fromSec of seeks) {
      noteOn.mockClear();
      const planned = planScheduledNotes({
        notes,
        fromSec,
        untilSec: fromSec + 1.25,
        rate: 1,
        audioNow: 100,
        started: new Set(),
      });
      expect(planned.length).toBeGreaterThan(1);
      for (const attack of planned) {
        noteOn(attack.midi, attack.when, 0.7, attack.durationSec);
      }
      expect(noteOn.mock.calls.length).toBe(planned.length);
      for (const call of noteOn.mock.calls) {
        expect(call[3]).toBeGreaterThan(0.04);
      }
      // Later attacks are strictly after the first — sequence continues.
      const whens = planned.map((p) => p.when);
      for (let i = 1; i < whens.length; i++) {
        expect(whens[i]!).toBeGreaterThan(whens[i - 1]!);
      }
    }
  });
});
