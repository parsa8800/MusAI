import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MOCK_PIECE_FEEDBACK_SOURCE,
  mockPieceFeedbackIssues,
} from "@/features/piece-studio/feedback/visual/mockPieceFeedbackPreview";
import { overlayRectsForRange } from "@/features/piece-studio/score/scoreOverlayGeometry";
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
    expect(issues.map((issue) => issue.visualTone)).toEqual([
      "pitch",
      "rhythm",
      "rushing",
      "dragging",
      "dynamics",
    ]);
    expect(issues.map((issue) => issue.kind)).toEqual(
      expect.arrayContaining(["sharp", "late", "rushing", "slowing", "too_loud"]),
    );
    expect(issues[0]?.id).toBe("mock-pitch");
    expect(issues[0]?.visualStyle).toBe("note");
    expect(issues[0]?.measure).toBe("1");
    expect(issues[0]?.where).toMatch(/bar 1/i);
    expect(issues.find((issue) => issue.id === "mock-dragging")?.label).toBe(
      "Dragging",
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
    expect(rects[0]?.y).toBeLessThan(30);
    expect(rects[0]?.width).toBeGreaterThan(40);
  });
});
