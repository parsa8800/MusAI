import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MOCK_PIECE_FEEDBACK_SOURCE,
  mockPieceFeedbackIssues,
} from "@/features/piece-studio/feedback/visual/mockPieceFeedbackPreview";
import { overlayNoteUnderlinesForRange, overlayRectsForRange, shapePassageUnderlay } from "@/features/piece-studio/score/scoreOverlayGeometry";
import { parseMusicXmlToScore } from "@/features/piece-studio/score/parseMusicXml";
import { CANON_XML, TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";

describe("mock piece feedback preview", () => {
  it("marks every sample issue as mock and never as a real report", () => {
    const score = parseMusicXmlToScore(TWINKLE_XML, "Twinkle");
    const issues = mockPieceFeedbackIssues(score);
    expect(issues.length).toBeGreaterThan(3);
    expect(issues.every((issue) => issue.mock && issue.source === MOCK_PIECE_FEEDBACK_SOURCE)).toBe(
      true,
    );
    const tones = issues.map((issue) => issue.visualTone);
    expect(tones.filter((tone) => tone === "pitch").length).toBeGreaterThan(1);
    expect(tones).toEqual(
      expect.arrayContaining(["pitch", "rhythm", "rushing", "dragging", "dynamics"]),
    );
    expect(issues.map((issue) => issue.kind)).toEqual(
      expect.arrayContaining(["sharp", "late", "rushing", "slowing", "too_loud"]),
    );
    expect(issues[0]?.id).toBe("mock-pitch");
    expect(issues[0]?.visualStyle).toBe("note");
    expect(
      (issues[0]?.endWholeNotes ?? 0) - (issues[0]?.startWholeNotes ?? 0),
    ).toBeLessThan(1);
    expect(issues[0]?.measure).toBe("1");
    expect(issues[0]?.where).toMatch(/opening phrase/i);
    expect(issues.find((issue) => issue.id === "mock-dragging")?.label).toBe(
      "Tempo",
    );
    expect(issues.find((issue) => issue.id === "mock-rushing")?.what).toMatch(
      /ahead of the beat/i,
    );
    expect(issues.find((issue) => issue.id === "mock-dragging")?.what).toMatch(
      /behind the beat/i,
    );
  });

  it("still previews tempo and dynamics when the score has no melody notes", () => {
    const score = parseMusicXmlToScore(CANON_XML, "Canon");
    const issues = mockPieceFeedbackIssues(score);
    expect(issues.some((issue) => issue.category === "pitch")).toBe(false);
    expect(issues.map((issue) => issue.visualTone)).toEqual([
      "rushing",
      "dragging",
      "dynamics",
    ]);
  });

  it("is not imported by real analyzers or coach context", () => {
    const files = [
      "src/features/piece-studio/practice/analyzePieceTake.ts",
      "src/features/piece-studio/feedback/analyzers/PitchAnalyzer.ts",
      "src/features/piece-studio/feedback/analyzers/RhythmAnalyzer.ts",
      "src/features/piece-studio/feedback/analyzers/TempoAnalyzer.ts",
      "src/features/piece-studio/feedback/analyzers/DynamicsAnalyzer.ts",
      "src/features/piece-studio/feedback/analyzers/ConsistencyAnalyzer.ts",
      "src/features/piece-studio/feedback/analyzers/defaultAnalyzers.ts",
      "src/features/piece-studio/feedback/pieceFeedbackOrchestrator.ts",
      "src/features/piece-studio/feedback/pieceCoachContext.ts",
    ];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/mockPieceFeedbackPreview|feedback\/visual/);
    }
  });
});

describe("score highlight geometry", () => {
  it("hugs first and last notehead edges tightly", () => {
    const rects = overlayRectsForRange(
      [
        { tSec: 0, x: 100, y: 40, height: 12, width: 12 },
        { tSec: 0.5, x: 140, y: 40, height: 12, width: 12 },
        { tSec: 1, x: 180, y: 40, height: 12, width: 12 },
      ],
      0,
      1.1,
      [{ y: 30, height: 40, x: 0, width: 400 }],
    );
    expect(rects).toHaveLength(1);
    const rect = rects[0]!;
    // Centres ± half width (6) ± small edge pad — not a 14–28px bar pad.
    expect(rect.x).toBeGreaterThanOrEqual(100 - 6 - 6);
    expect(rect.x).toBeLessThanOrEqual(100 - 6);
    expect(rect.x + rect.width).toBeGreaterThanOrEqual(180 + 6);
    expect(rect.x + rect.width).toBeLessThanOrEqual(180 + 6 + 6);
    expect(rect.width).toBeLessThan(100);
  });

  it("keeps same-staff pitch leaps in one wash", () => {
    const rects = overlayRectsForRange(
      [
        { tSec: 0, x: 40, y: 10, height: 12, width: 12 },
        { tSec: 0.5, x: 80, y: 40, height: 12, width: 12 },
        { tSec: 1, x: 120, y: 25, height: 12, width: 12 },
      ],
      0,
      1.1,
      [{ y: 8, height: 44, x: 0, width: 400 }],
    );
    expect(rects).toHaveLength(1);
    expect(rects[0]?.y).toBe(8);
    expect(rects[0]?.height).toBe(44);
  });

  it("washes one system for a focused time window", () => {
    const rects = overlayRectsForRange(
      [
        { tSec: 0, x: 40, y: 20, height: 36 },
        { tSec: 0.5, x: 80, y: 20, height: 36 },
        { tSec: 1, x: 120, y: 20, height: 36 },
        { tSec: 2, x: 40, y: 90, height: 36 },
      ],
      0.4,
      1.1,
    );
    expect(rects).toHaveLength(1);
    expect(rects[0]?.y).toBe(20);
    expect(rects[0]?.height).toBeGreaterThanOrEqual(36);
    expect(rects[0]?.width).toBeGreaterThan(40);
    // Equal pad around first/last note centres → wash stays centred.
    const leftPad = 80 - (rects[0]?.x ?? 0);
    const rightPad = (rects[0]?.x ?? 0) + (rects[0]?.width ?? 0) - 120;
    expect(leftPad).toBeCloseTo(rightPad, 5);
  });

  it("keeps a fixed staff height when noteheads leap in pitch", () => {
    const rects = overlayRectsForRange(
      [
        { tSec: 0, x: 40, y: 48, height: 12 },
        { tSec: 0.5, x: 80, y: 56, height: 12 },
        { tSec: 1, x: 120, y: 52, height: 12 },
      ],
      0,
      1.1,
    );
    expect(rects).toHaveLength(1);
    // Notehead min→max would be ~20px; staff-sized wash stays larger and fixed.
    expect(rects[0]?.height).toBe(48);
    expect(rects[0]?.height).toBeGreaterThan(24);
  });

  it("snaps the wash to an engraved staff band", () => {
    const rects = overlayRectsForRange(
      [
        { tSec: 0, x: 80, y: 55, height: 12 },
        { tSec: 0.5, x: 120, y: 70, height: 12 },
      ],
      0,
      1,
      [{ y: 40, height: 48, x: 20, width: 400 }],
    );
    expect(rects[0]?.y).toBe(40);
    expect(rects[0]?.height).toBe(48);
  });

  it("emits one underline per note pose under the notehead", () => {
    const marks = overlayNoteUnderlinesForRange(
      [
        { tSec: 0, x: 40, y: 20, height: 36 },
        { tSec: 0.5, x: 80, y: 20, height: 36 },
        { tSec: 1, x: 120, y: 20, height: 36 },
      ],
      0.4,
      1.1,
    );
    expect(marks.length).toBeGreaterThanOrEqual(2);
    for (const mark of marks) {
      expect(mark.width).toBeGreaterThan(mark.height);
      expect(mark.y).toBeGreaterThan(20 + 36 * 0.5);
    }
  });

  it("shapes bar washes just inside the staff lines", () => {
    const wash = { x: 40, y: 20, width: 120, height: 48 };
    const heat = shapePassageUnderlay(wash, "heat");
    const measure = shapePassageUnderlay(wash, "measure");
    const note = shapePassageUnderlay(wash, "note");
    // Inside the staff — below top line, above bottom line.
    expect(measure.y).toBeGreaterThan(wash.y);
    expect(measure.y + measure.height).toBeLessThanOrEqual(wash.y + wash.height);
    expect(measure.height).toBeLessThan(wash.height);
    expect(measure.height).toBeGreaterThan(wash.height * 0.65);
    expect(heat.y).toBeGreaterThan(wash.y);
    expect(note.y).toBeGreaterThan(wash.y);
    expect(measure.width).toBeLessThanOrEqual(wash.width);
    expect(measure.x).toBeGreaterThanOrEqual(wash.x);
  });
});
