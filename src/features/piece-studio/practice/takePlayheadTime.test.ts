import { describe, expect, it } from "vitest";
import {
  buildPlaybackTimeline,
  secondsAtQuarter,
} from "@/features/piece-studio/playback/playbackTimeline";
import {
  recordingTimeToScoreTime,
  takePlayheadAnchors,
  type ScoreTimeAnchor,
} from "@/features/piece-studio/practice/takePlayheadTime";
import { expectedNotesFromScore } from "@/features/piece-studio/score/expectedNotes";
import { TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";
import { parseMusicXmlToScore } from "@/features/piece-studio/score/parseMusicXml";

const anchors: ScoreTimeAnchor[] = [
  { audioSec: 0.5, scoreSec: 0 },
  { audioSec: 1.5, scoreSec: 1 },
  { audioSec: 2.5, scoreSec: 2 },
];

describe("recordingTimeToScoreTime", () => {
  it("stretches a take with no heard times across the written piece", () => {
    expect(recordingTimeToScoreTime(4, 8, 12, [])).toBeCloseTo(6);
    expect(recordingTimeToScoreTime(8, 8, 12, [])).toBeCloseTo(12);
    expect(recordingTimeToScoreTime(2, 0, 12, [])).toBe(2);
  });

  it("arrives on each written note when that note was heard", () => {
    expect(recordingTimeToScoreTime(0.5, 4, 3, anchors)).toBeCloseTo(0);
    expect(recordingTimeToScoreTime(1.5, 4, 3, anchors)).toBeCloseTo(1);
    expect(recordingTimeToScoreTime(2.5, 4, 3, anchors)).toBeCloseTo(2);
    expect(recordingTimeToScoreTime(3.2, 4, 3, anchors)).toBeCloseTo(2);
  });

  it("stays on the sounding note until the next attack is heard", () => {
    const mid = recordingTimeToScoreTime(1.0, 4, 3, anchors);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it("approaches the first note during the opening silence", () => {
    const lateFirst: ScoreTimeAnchor[] = [
      { audioSec: 1, scoreSec: 2 },
      { audioSec: 2, scoreSec: 3 },
    ];
    expect(recordingTimeToScoreTime(0.5, 4, 4, lateFirst)).toBeCloseTo(1);
  });
});

describe("takePlayheadAnchors", () => {
  it("keeps each measure on the piece timeline", () => {
    const score = parseMusicXmlToScore(TWINKLE_XML, "Twinkle");
    const notes = expectedNotesFromScore(score);
    const timeline = buildPlaybackTimeline(score);
    const secondBar = notes.find((note) => note.measure === "2");
    expect(secondBar?.absoluteOnsetQuarters).toBeGreaterThan(3);
    expect(
      secondsAtQuarter(
        timeline.tempoSpans,
        secondBar?.absoluteOnsetQuarters ?? 0,
      ),
    ).toBeCloseTo(timeline.measures[1]?.startSec ?? -1);
  });

  it("pairs heard times with written onsets and skips missed notes", () => {
    const points = takePlayheadAnchors(
      [
        { noteIndex: 0, heardSec: 0.2 },
        { noteIndex: 1, heardSec: null },
        { noteIndex: 2, heardSec: 1.4 },
      ],
      [
        { noteIndex: 0, absoluteOnsetQuarters: 0 },
        { noteIndex: 1, absoluteOnsetQuarters: 1 },
        { noteIndex: 2, absoluteOnsetQuarters: 2 },
      ],
      (quarters) => quarters * 0.5,
    );
    expect(points).toEqual([
      { audioSec: 0.2, scoreSec: 0 },
      { audioSec: 1.4, scoreSec: 1 },
    ]);
  });
});
