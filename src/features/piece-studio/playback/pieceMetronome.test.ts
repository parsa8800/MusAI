import { describe, expect, it } from "vitest";
import {
  PIECE_CLICK_LEVEL_DEFAULT,
  pieceClickGain,
} from "@/features/piece-studio/playback/pieceMetronome";

describe("pieceClickGain", () => {
  it("keeps a soft tick at the bottom and a clear click at the top", () => {
    expect(pieceClickGain(0)).toBeCloseTo(0.22);
    expect(pieceClickGain(100)).toBeCloseTo(1);
    expect(pieceClickGain(PIECE_CLICK_LEVEL_DEFAULT)).toBeGreaterThan(0.7);
    expect(pieceClickGain(40)).toBeLessThan(pieceClickGain(80));
  });
});
