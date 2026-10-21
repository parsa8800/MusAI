import { describe, expect, it } from "vitest";
import { parseScaleFingeringStored } from "@/lib/scaleFingeringPreference";

describe("scale fingering preference", () => {
  it("stays off until the player turns it on", () => {
    expect(parseScaleFingeringStored(null)).toBe(false);
    expect(parseScaleFingeringStored("0")).toBe(false);
    expect(parseScaleFingeringStored("1")).toBe(true);
  });
});
