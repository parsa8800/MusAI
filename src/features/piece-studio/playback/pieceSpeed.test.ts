import { describe, expect, it } from "vitest";
import {
  pieceSpeedBpm,
  pieceSpeedPresetForBpm,
} from "@/features/piece-studio/playback/pieceSpeed";

describe("piece speed", () => {
  it("treats 1× as the written tempo and the others as fractions of it", () => {
    expect(pieceSpeedBpm("written", 66)).toBe(66);
    expect(pieceSpeedBpm("threeQuarter", 66)).toBe(50);
    expect(pieceSpeedBpm("half", 80)).toBe(40);
  });

  it("matches a slider value back to a speed button", () => {
    expect(pieceSpeedPresetForBpm(80, 80)).toBe("written");
    expect(pieceSpeedPresetForBpm(60, 80)).toBe("threeQuarter");
    expect(pieceSpeedPresetForBpm(40, 80)).toBe("half");
    expect(pieceSpeedPresetForBpm(70, 80)).toBeNull();
  });
});
