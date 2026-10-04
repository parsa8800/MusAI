import { describe, expect, it } from "vitest";
import { analyzePieceTake } from "@/features/piece-studio/practice/analyzePieceTake";
import {
  isGeneratedPieceSampleRecording,
  synthesizePieceSampleTake,
} from "@/features/piece-studio/practice/synthesizePieceSampleTake";
import { pitchPaintKindFromCents } from "@/features/piece-studio/feedback/visual/piecePitchScoreMap";
import { expectedNotesFromScore } from "@/features/piece-studio/score/expectedNotes";
import { parseMusicXmlToScore } from "@/features/piece-studio/score/parseMusicXml";
import { TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";

describe("synthesizePieceSampleTake", () => {
  it("paints Twinkle with in-tune, sharp, flat, and missed notes", () => {
    const score = parseMusicXmlToScore(TWINKLE_XML, "Twinkle");
    const notes = expectedNotesFromScore(score);
    const sample = synthesizePieceSampleTake(notes);
    const { report } = analyzePieceTake({
      pieceId: "twinkle",
      attemptId: "sample",
      score,
      mono: sample.mono,
      sampleRateHz: sample.sampleRateHz,
      durationSec: sample.mono.length / sample.sampleRateHz,
    });

    expect(report.pitchNotes).toHaveLength(notes.length);
    const kinds = new Set(
      (report.pitchNotes ?? []).map((note) => pitchPaintKindFromCents(note.cents)),
    );
    expect(kinds.has("in_tune")).toBe(true);
    expect(kinds.has("sharp") || kinds.has("sharp-strong")).toBe(true);
    expect(kinds.has("flat") || kinds.has("flat-strong")).toBe(true);
    expect(kinds.has("missed")).toBe(true);
    expect(sample.wav.type).toContain("musai-sample");
    expect(isGeneratedPieceSampleRecording(sample.wav)).toBe(true);
    expect(
      isGeneratedPieceSampleRecording(new Blob(["x"], { type: "audio/wav" })),
    ).toBe(false);
    expect(
      isGeneratedPieceSampleRecording(new Blob(["x"], { type: "audio/webm" })),
    ).toBe(false);
    expect(sample.wav.size).toBeGreaterThan(44);
  });
});