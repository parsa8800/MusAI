import { describe, expect, it } from "vitest";
import { parseMusicXmlToScore } from "@/features/piece-studio/score/parseMusicXml";
import { TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";
import {
  buildPlaybackTimeline,
  clampPlaybackTime,
  formatPieceClock,
  loopBoundsSec,
  quarterAtSeconds,
  secondsAtQuarter,
  snapToMeasureStart,
} from "@/features/piece-studio/playback/playbackTimeline";

describe("buildPlaybackTimeline", () => {
  it("times Twinkle notes from score tempo, not a CSS duration", () => {
    const score = parseMusicXmlToScore(TWINKLE_XML, "Twinkle");
    const timeline = buildPlaybackTimeline(score);
    expect(timeline.baseBpm).toBe(100);
    expect(timeline.durationQuarters).toBe(16);
    expect(timeline.durationSec).toBeCloseTo(9.6, 5);
    expect(timeline.notes).toHaveLength(14);
    expect(timeline.measures.length).toBeGreaterThan(0);
    expect(timeline.measures[0]?.number).toBe(1);
    expect(timeline.measures[0]?.startSec).toBe(0);
    expect(timeline.beats.length).toBeGreaterThan(0);
    expect(timeline.beats[0]?.beatIndex).toBe(0);
    expect(timeline.notes.map((n) => n.startSec)).toEqual([
      0, 0.6, 1.2, 1.8, 2.4, 3.0, 4.2, 4.8, 5.4, 6.0, 6.6, 7.2, 7.8, 8.4,
    ]);
    expect(timeline.notes[5]?.midi).toBe(78);
    expect(timeline.notes[0]?.endSec).toBeCloseTo(0.6, 5);
  });

  it("converts quarters through a tempo map", () => {
    const spans = [
      { fromQuarter: 0, bpm: 120 },
      { fromQuarter: 4, bpm: 60 },
    ];
    expect(secondsAtQuarter(spans, 4)).toBeCloseTo(2, 5);
    expect(secondsAtQuarter(spans, 6)).toBeCloseTo(4, 5);
    expect(quarterAtSeconds(spans, 2)).toBeCloseTo(4, 5);
    expect(quarterAtSeconds(spans, 4)).toBeCloseTo(6, 5);
  });

  it("clamps seek and formats a compact clock", () => {
    expect(clampPlaybackTime(-1, 4.8)).toBe(0);
    expect(clampPlaybackTime(9, 4.8)).toBe(4.8);
    expect(formatPieceClock(65)).toBe("1:05");
  });

  it("snaps playback into measure starts for practice seeks", () => {
    const score = parseMusicXmlToScore(TWINKLE_XML, "Twinkle");
    const timeline = buildPlaybackTimeline(score);
    const midFirst = (timeline.measures[0]?.endSec ?? 1) * 0.5;
    expect(snapToMeasureStart(timeline.measures, midFirst)).toBe(0);
    if (timeline.measures.length > 1) {
      const second = timeline.measures[1]!;
      expect(snapToMeasureStart(timeline.measures, second.startSec + 0.05)).toBe(
        second.startSec,
      );
      const loop = loopBoundsSec(timeline.measures, 1, 1);
      expect(loop?.startSec).toBe(0);
      expect(loop?.endSec).toBe(timeline.measures[0]!.endSec);
    }
  });
});
