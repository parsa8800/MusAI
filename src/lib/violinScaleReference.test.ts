import { describe, expect, it } from "vitest";
import { violinStringFingerLabel } from "@/lib/violinScaleReference";

describe("violinStringFingerLabel", () => {
  it("labels open strings as *0", () => {
    expect(violinStringFingerLabel(55)).toBe("G0");
    expect(violinStringFingerLabel(62)).toBe("D0");
    expect(violinStringFingerLabel(69)).toBe("A0");
    expect(violinStringFingerLabel(76)).toBe("E0");
  });

  it("maps first-position fingers, not raw half-steps", () => {
    // C4 = 5 semitones above G → 3rd finger (not G5)
    expect(violinStringFingerLabel(60)).toBe("G3");
    // B3 = 4 semitones above G → 2nd finger
    expect(violinStringFingerLabel(59)).toBe("G2");
    // A3 = 2 semitones above G → 1st finger
    expect(violinStringFingerLabel(57)).toBe("G1");
  });

  it("prefers next open string over 4th finger", () => {
    // Same pitch as open E → E0, never A4
    expect(violinStringFingerLabel(76)).toBe("E0");
    // Same pitch as open A → A0, never D4
    expect(violinStringFingerLabel(69)).toBe("A0");
  });
});
