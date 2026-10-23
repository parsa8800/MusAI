import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzePieceTake } from "@/features/piece-studio/practice/analyzePieceTake";
import {
  recordingTimeToScoreTime,
  takePlayheadAnchors,
} from "@/features/piece-studio/practice/takePlayheadTime";
import {
  buildPlaybackTimeline,
  secondsAtQuarter,
} from "@/features/piece-studio/playback/playbackTimeline";
import { BEACH_HOLIDAY_XML } from "@/features/piece-studio/score/beachHolidayFixture";
import {
  expectedNotesFromScore,
  scorePlayheadMarksFromScore,
} from "@/features/piece-studio/score/expectedNotes";
import { parseMusicXmlToScore } from "@/features/piece-studio/score/parseMusicXml";

function readWavMono(filePath: string): { mono: Float32Array; sampleRate: number } {
  const buf = fs.readFileSync(filePath);
  const numChannels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);
  let dataOffset = 12;
  while (dataOffset < buf.length) {
    const id = buf.toString("ascii", dataOffset, dataOffset + 4);
    const size = buf.readUInt32LE(dataOffset + 4);
    if (id === "data") {
      dataOffset += 8;
      break;
    }
    dataOffset += 8 + size;
  }
  if (bitsPerSample !== 16) {
    throw new Error(`Unsupported bitsPerSample: ${bitsPerSample}`);
  }
  const sampleCount = Math.floor((buf.length - dataOffset) / 2 / numChannels);
  const mono = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    let sum = 0;
    for (let c = 0; c < numChannels; c++) {
      sum += buf.readInt16LE(dataOffset + (i * numChannels + c) * 2) / 32768;
    }
    mono[i] = sum / numChannels;
  }
  return { mono, sampleRate };
}

const wavPath = path.resolve(
  process.cwd(),
  "fixtures/piece-takes/beach-holiday-clean.wav",
);

/** The printed diminuendo runs through bars 7 and 8. */
function withDecrescendo(xml: string): string {
  return xml
    .replace(
      '<measure number="7">',
      '<measure number="7"><direction placement="below"><direction-type><wedge type="diminuendo" number="1"/></direction-type></direction>',
    )
    .replace(
      '<measure number="9">',
      '<measure number="9"><direction placement="below"><direction-type><wedge type="stop" number="1"/></direction-type></direction>',
    );
}

describe("Beach Holiday clean violin take", () => {
  it.skipIf(!fs.existsSync(wavPath))(
    "keeps rhythm quiet, hears bar 9, glides the playhead, and accepts the piano and decrescendo",
    () => {
      const { mono, sampleRate } = readWavMono(wavPath);
      const score = parseMusicXmlToScore(
        withDecrescendo(BEACH_HOLIDAY_XML),
        "Beach Holiday",
      );
      const notes = expectedNotesFromScore(score);
      const timeline = buildPlaybackTimeline(score);
      const durationSec = mono.length / sampleRate;
      const { report } = analyzePieceTake({
        pieceId: "beach-holiday",
        attemptId: "clean",
        score,
        mono,
        sampleRateHz: sampleRate,
        durationSec,
      });

      const rhythm = report.events.filter((event) => event.category === "rhythm");
      expect(rhythm.length).toBeLessThanOrEqual(3);

      const barTenQuavers = notes.filter(
        (note) => note.measure === "10" && note.durationQuarters <= 0.5,
      );
      expect(barTenQuavers).toHaveLength(4);
      for (const note of barTenQuavers) {
        const cents = report.pitchNotes?.[note.noteIndex]?.cents;
        expect(cents).not.toBeNull();
        expect(Math.abs(cents ?? 99)).toBeLessThanOrEqual(35);
      }

      const dynamics = report.events.filter((event) => event.category === "dynamics");
      expect(dynamics.some((event) => event.kind === "too_loud")).toBe(false);
      expect(
        dynamics.some((event) => /decrescendo/i.test(event.explanation)),
      ).toBe(false);

      const barNine = notes.filter((note) => note.measure === "9");
      const heardBarNine = barNine.filter((note) => {
        const pitch = report.pitchNotes?.[note.noteIndex];
        return pitch?.cents != null;
      });
      expect(heardBarNine.length).toBeGreaterThanOrEqual(3);
      const firstBarNine = heardBarNine[0]!;
      const firstHeard = report.pitchNotes?.[firstBarNine.noteIndex]?.heardSec;
      expect(firstHeard).toBeGreaterThan(22);

      const endingGs = notes.filter(
        (note) => note.measure === "12" && note.midi === 55,
      );
      expect(endingGs.length).toBe(3);
      for (const note of endingGs) {
        expect(report.pitchNotes?.[note.noteIndex]?.cents).not.toBeNull();
      }

      const anchors = takePlayheadAnchors(
        report.pitchNotes ?? [],
        notes,
        (quarters) => secondsAtQuarter(timeline.tempoSpans, quarters),
        scorePlayheadMarksFromScore(score),
      );
      expect(anchors.length).toBeGreaterThan(8);

      for (let i = 0; i < anchors.length - 1; i++) {
        const here = anchors[i]!;
        const next = anchors[i + 1]!;
        const span = next.audioSec - here.audioSec;
        if (span < 0.12) continue;
        const mid = here.audioSec + span * 0.4;
        const scoreSec = recordingTimeToScoreTime(
          mid,
          durationSec,
          timeline.durationSec,
          anchors,
        );
        if (next.scoreSec <= here.scoreSec + 0.02) {
          expect(scoreSec).toBeCloseTo(here.scoreSec, 1);
          continue;
        }
        expect(scoreSec).toBeGreaterThanOrEqual(here.scoreSec - 0.02);
        expect(scoreSec).toBeLessThan(next.scoreSec);
      }
    },
    30000,
  );
});
