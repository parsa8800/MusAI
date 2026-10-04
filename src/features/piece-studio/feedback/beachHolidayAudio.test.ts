import { describe, expect, it } from "vitest";
import { synthesizeBeachTake } from "@/features/piece-studio/feedback/beachHolidayTakeAudio";
import { analyzePieceTake } from "@/features/piece-studio/practice/analyzePieceTake";
import { BEACH_HOLIDAY_XML } from "@/features/piece-studio/score/beachHolidayFixture";
import { expectedNotesFromScore } from "@/features/piece-studio/score/expectedNotes";
import { parseMusicXmlToScore } from "@/features/piece-studio/score/parseMusicXml";
import type { PieceFeedbackReportV1 } from "@/features/piece-studio/feedback/pieceFeedbackTypes";

const score = parseMusicXmlToScore(BEACH_HOLIDAY_XML, "Beach Holiday");
const notes = expectedNotesFromScore(score);
const BEAT = 0.7;

function play(
  input: Parameters<typeof synthesizeBeachTake>[0],
  scoreOverride = score,
) {
  const audio = synthesizeBeachTake({ notes, ...input });
  return analyzePieceTake({
    pieceId: "beach-holiday",
    attemptId: "synth",
    score: scoreOverride,
    mono: audio.mono,
    sampleRateHz: audio.sampleRateHz,
    durationSec: audio.durationSec,
  });
}

function rhythmOf(report: PieceFeedbackReportV1) {
  return report.events
    .filter((event) => event.category === "rhythm")
    .map((event) => [event.noteIndex, event.kind]);
}

function dynamicsOf(report: PieceFeedbackReportV1) {
  return report.events
    .filter((event) => event.category === "dynamics")
    .map((event) => [event.noteIndex, event.kind, event.explanation]);
}

/** One written step is 4 dB. These levels sit on that ladder. */
const P = 0.15;
const F = P * 10 ** (12 / 20);
const FF = P * 10 ** (16 / 20);

function amp(level: { p: number; f: number; ff: number }) {
  return (_note: (typeof notes)[number]) => {
    if (_note.writtenDynamic === "ff") return level.ff;
    if (_note.writtenDynamic === "f") return level.f;
    return level.p;
  };
}

describe("Beach Holiday fixture", () => {
  it("has the melody and the printed soft, loud, and very loud marks", () => {
    expect(notes).toHaveLength(54);
    expect(notes.slice(0, 4).map((note) => note.midi)).toEqual([67, 66, 64, 66]);
    expect(notes.slice(-4).map((note) => note.midi)).toEqual([67, 55, 55, 55]);
    expect(notes[0]?.writtenDynamic).toBe("p");
    expect(notes[15]?.writtenDynamic).toBe("p");
    expect(notes[16]?.writtenDynamic).toBe("f");
    expect(notes[49]?.writtenDynamic).toBe("f");
    expect(notes[50]?.writtenDynamic).toBe("ff");
  });
});

describe("Beach Holiday rhythm audio", () => {
  it("ignores a little wobble on an even take", () => {
    const { report } = play({ secPerQuarter: BEAT, wobbleSec: 0.02 });
    expect(rhythmOf(report)).toEqual([]);
  });

  it("marks the rushed join in bar 5 and one note held about twice as long", () => {
    const { report } = play({
      secPerQuarter: BEAT,
      gapEdits: [
        { afterNoteIndex: 0, extraSec: BEAT },
        { afterNoteIndex: 17, extraSec: -0.2 },
      ],
    });
    expect(rhythmOf(report)).toEqual([
      [0, "duration"],
      [17, "duration"],
      [18, "early"],
    ]);
  });

  it("marks one note that arrives a bit late", () => {
    const { report } = play({
      secPerQuarter: BEAT,
      gapEdits: [{ afterNoteIndex: 2, extraSec: 0.2 }],
    });
    expect(rhythmOf(report)).toEqual([[3, "late"]]);
  });

  it("marks one note cut much too short", () => {
    const { report } = play({
      secPerQuarter: BEAT,
      gapEdits: [{ afterNoteIndex: 2, extraSec: -0.32 }],
    });
    expect(rhythmOf(report)).toEqual([
      [2, "duration"],
      [3, "early"],
    ]);
  });

  it("does not mark a slower take that stays even", () => {
    const { report } = play({ secPerQuarter: 1.15 });
    expect(rhythmOf(report)).toEqual([]);
    expect(report.events.some((event) => event.category === "tempo")).toBe(
      false,
    );
  });

  it("tells the coach when the whole piece is slower than the written beat", () => {
    const { report } = play(
      { secPerQuarter: 1.15 },
      { ...score, tempoBpm: 86 },
    );
    expect(rhythmOf(report)).toEqual([]);
    const tempo = report.events.filter((event) => event.category === "tempo");
    expect(tempo.map((event) => [event.kind, event.noteIndex])).toEqual([
      ["slowing", null],
    ]);
    expect(tempo[0]?.explanation).toBe(
      "The beat was slower all the way through.",
    );
  });

  it("does not mark a missed note as a rhythm problem", () => {
    const { report } = play({ secPerQuarter: BEAT, omit: [2] });
    expect(rhythmOf(report).some((item) => item[0] === 2)).toBe(false);
    expect(rhythmOf(report)).toEqual([]);
    expect(report.pitchNotes?.[2]?.cents).toBeNull();
    expect(Math.abs(report.pitchNotes?.[3]?.cents ?? 99)).toBeLessThanOrEqual(25);
    expect(
      report.events.some(
        (event) =>
          (event.category === "rhythm" || event.category === "dynamics") &&
          event.noteIndex === 3,
      ),
    ).toBe(false);
  });
});

describe("Beach Holiday dynamics audio", () => {
  it("accepts loudness that follows the written marks", () => {
    const { report } = play({
      secPerQuarter: BEAT,
      amplitudeFor: amp({ p: P * 1.12, f: F, ff: FF * 0.9 }),
    });
    expect(report.skills.find((skill) => skill.category === "dynamics")?.status).toBe(
      "ready",
    );
    expect(dynamicsOf(report)).toEqual([]);
  });

  it("marks the soft mark when that part is as loud as the loud part", () => {
    const { report } = play({
      secPerQuarter: BEAT,
      amplitudeFor: amp({ p: F, f: F, ff: FF }),
    });
    expect(dynamicsOf(report)).toEqual([
      [0, "too_loud", "The soft mark was too loud."],
    ]);
  });

  it("marks the very loud mark when it is only as loud as the loud part", () => {
    const { report } = play({
      secPerQuarter: BEAT,
      amplitudeFor: amp({ p: P, f: F, ff: F }),
    });
    expect(dynamicsOf(report)).toEqual([
      [50, "too_soft", "The loud mark was too soft."],
    ]);
  });

  it("marks the loud mark when that part is as soft as the soft part", () => {
    const { report } = play({
      secPerQuarter: BEAT,
      amplitudeFor: amp({ p: P, f: P, ff: FF }),
    });
    expect(dynamicsOf(report)).toEqual([
      [16, "too_soft", "The loud mark was too soft."],
    ]);
  });
});
