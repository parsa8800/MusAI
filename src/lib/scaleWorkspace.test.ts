import { describe, expect, it } from "vitest";
import {
  identityFromSelection,
  parseScaleWorkspaceSlug,
  progressKeyFor,
  scaleWorkspaceHref,
  scaleWorkspaceSlug,
  workspaceTitle,
} from "@/lib/scaleWorkspace";

describe("scaleWorkspace", () => {
  it("builds octave-aware progress keys and slugs", () => {
    expect(progressKeyFor("C_major", 1)).toBe("C_major__1");
    expect(scaleWorkspaceSlug("C_major", 1)).toBe("c-major-1oct");
    expect(scaleWorkspaceSlug("Bb_natural_minor", 2)).toBe(
      "bb-natural-minor-2oct",
    );
    expect(workspaceTitle("C major", 1)).toBe("C major · 1 octave");
  });

  it("parses workspace slugs back to identity", () => {
    const id = parseScaleWorkspaceSlug("c-major-1oct");
    expect(id?.scaleId).toBe("C_major");
    expect(id?.octaveSpan).toBe(1);
    expect(id?.progressKey).toBe("C_major__1");
    expect(id?.tonicPitchClass).toBe(0);
  });

  it("returns null for unknown slugs", () => {
    expect(parseScaleWorkspaceSlug("not-a-scale-1oct")).toBeNull();
  });

  it("builds href with optional root", () => {
    expect(scaleWorkspaceHref("D_major", 1)).toBe(
      "/practice/scale/d-major-1oct",
    );
    expect(scaleWorkspaceHref("D_major", 1, 62)).toBe(
      "/practice/scale/d-major-1oct?root=62",
    );
  });

  it("identityFromSelection keeps major/minor and octave journeys apart", () => {
    const cMaj1 = identityFromSelection(0, "major", 1);
    const cMin1 = identityFromSelection(0, "natural_minor", 1);
    const cMaj2 = identityFromSelection(0, "major", 2);
    expect(cMaj1.progressKey).toBe("C_major__1");
    expect(cMin1.progressKey).toBe("C_natural_minor__1");
    expect(cMaj2.progressKey).toBe("C_major__2");
    expect(cMaj1.progressKey).not.toBe(cMin1.progressKey);
    expect(cMaj1.progressKey).not.toBe(cMaj2.progressKey);
  });

  it("does not put direction in the progress key (workspace is always up & down)", () => {
    expect(progressKeyFor("C_major", 1)).toBe("C_major__1");
    expect(progressKeyFor("C_major", 1)).not.toMatch(/asc|desc|up/i);
  });
});
