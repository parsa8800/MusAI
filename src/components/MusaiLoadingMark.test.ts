import { describe, expect, it } from "vitest";
import { advanceDisplayedProgress } from "@/components/MusaiLoadingMark";

function hold(start: number, goal: number, ms: number) {
  let value = start;
  for (let t = 0; t < ms; t += 16) {
    value = advanceDisplayedProgress(value, goal, 16);
  }
  return value;
}

describe("advanceDisplayedProgress", () => {
  it("catches up to a higher reading without passing it in one step", () => {
    const next = advanceDisplayedProgress(20, 52, 16);
    expect(next).toBeGreaterThan(20);
    expect(next).toBeLessThanOrEqual(52);
  });

  it("keeps moving while a reading sits still", () => {
    const afterOne = hold(28, 28, 1000);
    const afterFour = hold(28, 28, 4000);
    expect(afterOne).toBeGreaterThan(29);
    expect(afterFour).toBeGreaterThan(afterOne + 2);
    expect(afterFour).toBeLessThan(50);
  });

  it("does not freeze on the long 52 reading", () => {
    const later = hold(52, 52, 3000);
    expect(later).toBeGreaterThan(55);
    expect(later).toBeLessThan(75);
  });

  it("finishes only when the read is actually done", () => {
    expect(hold(80, 80, 20_000)).toBeLessThan(92.5);
    expect(hold(80, 100, 2000)).toBe(100);
  });
});
