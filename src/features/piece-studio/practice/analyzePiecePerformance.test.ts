import { describe, expect, it } from "vitest";
import { expectedNotesFromScore } from "@/features/piece-studio/practice/pieceExpectedNotes";
import { analyzePiecePerformance } from "@/features/piece-studio/practice/analyzePiecePerformance";
import { parseMusicXmlToScore } from "@/features/piece-studio/score/parseMusicXml";
import { TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";
import { midiToHz } from "@/lib/intonation";

function tone(hz: number, sampleRate: number, seconds: number): Float32Array {
  const n = Math.floor(sampleRate * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = 0.35 * Math.sin((2 * Math.PI * hz * i) / sampleRate);
  }
  return out;
}

function concat(parts: Float32Array[]): Float32Array {
  const n = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

describe("piece practise analysis", () => {
  it("reads melody notes from a piece score and skips rests", () => {
    const score = parseMusicXmlToScore(TWINKLE_XML, "Twinkle");
    const notes = expectedNotesFromScore(score);
    expect(notes.map((n) => n.midi)).toEqual([
      72, 72, 79, 79, 81, 78, 72, 77, 77, 76, 76, 74, 74, 72,
    ]);
  });

  it("scores a take against the written notes", () => {
    const sampleRate = 44100;
    const midis = [72, 79];
    const mono = concat(
      midis.map((m) => tone(midiToHz(m), sampleRate, 0.45)),
    );
    const result = analyzePiecePerformance({
      mono,
      sampleRateHz: sampleRate,
      expectedMidis: midis,
    });
    expect(result.notesHeard).toBe(2);
    expect(result.notesMissing).toBe(0);
    expect(result.score0to100).toBeGreaterThan(80);
  });

  it("does not invent a score when nothing is heard", () => {
    const result = analyzePiecePerformance({
      mono: new Float32Array(44100),
      sampleRateHz: 44100,
      expectedMidis: [72, 74],
    });
    expect(result.notesHeard).toBe(0);
    expect(result.score0to100).toBeNull();
  });
});
