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

  it("identityFromSelection matches slug round-trip", () => {
    const id = identityFromSelection(2, "major", 2);
    expect(parseScaleWorkspaceSlug(id.slug)?.progressKey).toBe(id.progressKey);
  });
});
