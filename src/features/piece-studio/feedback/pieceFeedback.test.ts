import { describe, expect, it } from "vitest";
import { analyzePieceTake } from "@/features/piece-studio/practice/analyzePieceTake";
import { PitchAnalyzer } from "@/features/piece-studio/feedback/analyzers/PitchAnalyzer";
import { RhythmAnalyzer } from "@/features/piece-studio/feedback/analyzers/RhythmAnalyzer";
import { buildPieceCoachContext } from "@/features/piece-studio/feedback/pieceCoachContext";
import { runPieceFeedback } from "@/features/piece-studio/feedback/pieceFeedbackOrchestrator";
import type { PieceFeedbackAnalyzer } from "@/features/piece-studio/feedback/analyzers/PieceFeedbackAnalyzer";
import {
  PIECE_FEEDBACK_CATEGORIES,
  PIECE_FEEDBACK_SCHEMA_VERSION,
  type PieceFeedbackEventV1,
} from "@/features/piece-studio/feedback/pieceFeedbackTypes";
import { createFeedbackEvent } from "@/features/piece-studio/feedback/createFeedbackEvent";
import { expectedNotesFromScore } from "@/features/piece-studio/score/expectedNotes";
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

describe("piece feedback architecture", () => {
  it("keeps expected notes addressable by measure, beat, and written dynamic", () => {
    const score = parseMusicXmlToScore(TWINKLE_XML, "Twinkle");
    const notes = expectedNotesFromScore(score);
    expect(notes[0]).toMatchObject({
      midi: 72,
      measure: "1",
      beat: 1,
      noteIndex: 0,
      durationQuarters: 1,
      writtenDynamic: "p",
    });
    expect(notes[4]).toMatchObject({
      measure: "2",
      beat: 1,
      noteIndex: 4,
    });
  });

  it("runs PitchAnalyzer independently of deferred rhythm analysis", () => {
    expect(PitchAnalyzer.category).toBe("pitch");
    expect(RhythmAnalyzer.analyze({
      pieceId: "p",
      attemptId: "a",
      score: null,
      expectedNotes: [],
    })).toEqual({ category: "rhythm", status: "not_ready", events: [] });
  });

  it("emits pitch events with location, severity, time, and student copy", () => {
    const score = parseMusicXmlToScore(TWINKLE_XML, "Twinkle");
    const sampleRate = 44100;
    const sharpHz = midiToHz(72) * 2 ** (50 / 1200);
    const mono = concat([
      tone(sharpHz, sampleRate, 0.45),
      tone(midiToHz(79), sampleRate, 0.45),
    ]);
    const { performance, report } = analyzePieceTake({
      pieceId: "twinkle",
      attemptId: "take-1",
      score,
      mono,
      sampleRateHz: sampleRate,
      durationSec: mono.length / sampleRate,
    });
    expect(performance?.notesHeard).toBeGreaterThan(0);

    const pitch = report.skills.find((s) => s.category === "pitch");
    expect(pitch?.status).toBe("ready");
    expect(report.events.every((e) => e.category === "pitch")).toBe(true);
    expect(report.events.some((e) => e.kind === "unstable")).toBe(false);

    const sharp = report.events.find((e) => e.kind === "sharp");
    expect(sharp).toMatchObject({
      schemaVersion: PIECE_FEEDBACK_SCHEMA_VERSION,
      category: "pitch",
      measure: "1",
      beat: 1,
      noteIndex: 0,
      severity: "focus",
    });
    expect(sharp?.recordingTimeSec).toBeTypeOf("number");
    expect(sharp?.confidence).toBeGreaterThan(0);
    expect(sharp?.importance).toBeGreaterThan(0);
    expect(sharp?.explanation).toMatch(/bar 1/i);
    expect(sharp?.explanation).not.toMatch(/cent/i);
  });

  it("marks missed notes without inventing a recording timestamp", () => {
    const score = parseMusicXmlToScore(TWINKLE_XML, "Twinkle");
    const { report } = analyzePieceTake({
      pieceId: "twinkle",
      attemptId: "silent",
      score,
      mono: new Float32Array(44100),
      sampleRateHz: 44100,
      durationSec: 1,
    });
    const missed = report.events.filter((e) => e.kind === "missed");
    expect(missed.length).toBeGreaterThan(0);
    expect(missed.every((e) => e.recordingTimeSec == null)).toBe(true);
    expect(missed[0]?.measure).toBe("1");
    expect(missed[0]?.severity).toBe("focus");
  });

  it("does not invent rhythm, tempo, dynamics, or consistency", () => {
    const score = parseMusicXmlToScore(TWINKLE_XML, "Twinkle");
    const sampleRate = 44100;
    const mono = concat([
      tone(midiToHz(72), sampleRate, 0.45),
      tone(midiToHz(79), sampleRate, 0.45),
    ]);
    const { report } = analyzePieceTake({
      pieceId: "twinkle",
      attemptId: "take-2",
      score,
      mono,
      sampleRateHz: sampleRate,
      durationSec: mono.length / sampleRate,
    });
    const unimplemented = PIECE_FEEDBACK_CATEGORIES.filter((c) => c !== "pitch");
    for (const category of unimplemented) {
      const skill = report.skills.find((s) => s.category === category);
      expect(skill).toEqual({ category, status: "not_ready", events: [] });
      expect(report.events.some((e) => e.category === category)).toBe(false);
    }
  });

  it("drops events from a skill that is not ready", () => {
    const invented = createFeedbackEvent({
      eventId: "fake-rhythm",
      category: "rhythm",
      kind: "early",
      measure: "1",
      beat: 1,
      noteIndex: 0,
      onsetQuarters: 0,
      recordingTimeSec: 0.2,
      confidence: 0.9,
      importance: 0.9,
      explanation: "This should never ship.",
    });
    const fake: PieceFeedbackAnalyzer = {
      category: "rhythm",
      analyze: () => ({
        category: "rhythm",
        status: "not_ready",
        events: [invented],
      }),
    };
    const report = runPieceFeedback(
      {
        pieceId: "p",
        attemptId: "a",
        score: null,
        expectedNotes: [],
      },
      [fake],
    );
    expect(report.events).toEqual([]);
    expect(report.skills[0]?.events).toEqual([]);
  });

  it("builds Coach Parsa context from the report only", () => {
    const score = parseMusicXmlToScore(TWINKLE_XML, "Twinkle");
    const { report } = analyzePieceTake({
      pieceId: "twinkle",
      attemptId: "coach-1",
      score,
      mono: new Float32Array(22050),
      sampleRateHz: 22050,
      durationSec: 1,
    });
    const ctx = buildPieceCoachContext(report);
    expect(ctx.pieceId).toBe("twinkle");
    expect(ctx.attemptId).toBe("coach-1");
    expect(ctx.skillsReady).toEqual(["pitch"]);
    expect(ctx.skillsNotReady).toEqual([
      "rhythm",
      "tempo",
      "dynamics",
      "consistency",
    ]);
    expect(ctx.events).toEqual(report.events.map((e) => ({
      ...e,
      severity: e.severity,
    })));
    expect(ctx.focus[0]).toMatchObject({
      eventId: report.events[0]?.eventId,
      category: "pitch",
      measure: report.events[0]?.measure,
      explanation: report.events[0]?.explanation,
      where: expect.stringMatching(/bar/i),
      what: "Some written notes weren’t heard clearly",
      practise: expect.stringMatching(/air-bow|missing/i),
    });
    expect(Object.keys(ctx).sort()).toEqual([
      "attemptId",
      "events",
      "focus",
      "pieceId",
      "schemaVersion",
      "skillsNotReady",
      "skillsReady",
    ]);
    expect(JSON.stringify(ctx)).not.toMatch(/Float32Array|sampleRate|mono/);
  });

  it("createFeedbackEvent fills severity from importance", () => {
    const event: PieceFeedbackEventV1 = createFeedbackEvent({
      eventId: "e1",
      category: "pitch",
      kind: "flat",
      measure: "2",
      beat: 1,
      noteIndex: 3,
      onsetQuarters: 4,
      recordingTimeSec: 1.2,
      confidence: 0.7,
      importance: 0.5,
      explanation: "Bar 2 sat a little low.",
    });
    expect(event.severity).toBe("notice");
    expect(event.schemaVersion).toBe(PIECE_FEEDBACK_SCHEMA_VERSION);
  });
});
