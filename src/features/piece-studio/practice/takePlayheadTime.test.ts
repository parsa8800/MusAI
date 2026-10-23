import { describe, expect, it } from "vitest";
import {
  buildPlaybackTimeline,
  secondsAtQuarter,
} from "@/features/piece-studio/playback/playbackTimeline";
import {
  recordingTimeToScoreTime,
  scoreTimeToRecordingTime,
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
    expect(recordingTimeToScoreTime(3.2, 4, 3, anchors)).toBeGreaterThan(2);
    expect(recordingTimeToScoreTime(3.2, 4, 3, anchors)).toBeLessThan(3);
    expect(recordingTimeToScoreTime(4, 4, 3, anchors)).toBeCloseTo(3);
  });

  it("glides across the staff between attacks, including through a rest", () => {
    const mid = recordingTimeToScoreTime(1.0, 4, 3, anchors);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    const restMarks = [0, 0.5, 1, 2];
    const withRest = takePlayheadAnchors(
      [
        { noteIndex: 0, heardSec: 0.5 },
        { noteIndex: 1, heardSec: 1.5 },
      ],
      [
        { noteIndex: 0, absoluteOnsetQuarters: 0 },
        { noteIndex: 1, absoluteOnsetQuarters: 2 },
      ],
      (quarters) => quarters,
      restMarks.map((absoluteOnsetQuarters) => ({ absoluteOnsetQuarters })),
    );
    expect(withRest.some((anchor) => Math.abs(anchor.scoreSec - 0.5) < 1e-6)).toBe(
      true,
    );
    expect(recordingTimeToScoreTime(0.75, 4, 3, withRest)).toBeCloseTo(0.5);
  });

  it("seeks the recording to the note the playhead is moved onto", () => {
    expect(scoreTimeToRecordingTime(6, 8, 12, [])).toBeCloseTo(4);
    expect(scoreTimeToRecordingTime(0, 4, 3, anchors)).toBeCloseTo(0.5);
    expect(scoreTimeToRecordingTime(0.4, 4, 3, anchors)).toBeCloseTo(0.9);
    expect(scoreTimeToRecordingTime(1, 4, 3, anchors)).toBeCloseTo(1.5);
    expect(scoreTimeToRecordingTime(2, 4, 3, anchors)).toBeCloseTo(2.5);
    for (const score of [0, 0.4, 1, 1.6, 2, 2.5, 3]) {
      const audio = scoreTimeToRecordingTime(score, 4, 3, anchors);
      expect(recordingTimeToScoreTime(audio, 4, 3, anchors)).toBeCloseTo(score);
    }
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

  it("glides across a held note and still meets the next attack", () => {
    const held = takePlayheadAnchors(
      [
        { noteIndex: 0, heardSec: 1, heardEndSec: 3 },
        { noteIndex: 2, heardSec: 3.2 },
      ],
      [
        { noteIndex: 0, absoluteOnsetQuarters: 0 },
        { noteIndex: 1, absoluteOnsetQuarters: 1 },
        { noteIndex: 2, absoluteOnsetQuarters: 2 },
      ],
      (quarters) => quarters,
      [0, 1, 2].map((absoluteOnsetQuarters) => ({ absoluteOnsetQuarters })),
    );
    expect(recordingTimeToScoreTime(1, 6, 4, held)).toBeCloseTo(0);
    const mid = recordingTimeToScoreTime(2, 6, 4, held);
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(1.6);
    expect(recordingTimeToScoreTime(3.2, 6, 4, held)).toBeCloseTo(2);
    const before = recordingTimeToScoreTime(3.0, 6, 4, held);
    const after = recordingTimeToScoreTime(3.1, 6, 4, held);
    expect(after).toBeGreaterThan(before);
    expect(after - before).toBeLessThan(0.35);
  });
});
