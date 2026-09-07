import { describe, expect, it } from "vitest";
import type { ScaleCandidate } from "@/lib/detectScale";
import {
  candidateMatchesIdentity,
  sessionFromDetectedCandidate,
  workspaceHrefForCandidate,
} from "@/lib/scaleDetectSession";
import { identityFromSelection } from "@/lib/scaleWorkspace";

function fakeCandidate(
  overrides: Partial<ScaleCandidate> = {},
): ScaleCandidate {
  return {
    tonicPitchClass: 0,
    scaleKind: "major",
    rootMidi: 60,
    octaveSpan: 1,
    pattern: "round_trip",
    expectedMidis: [60, 62, 64, 65, 67, 69, 71, 72],
    scaleLabel: "C major",
    analysis: {
      notes: [],
      frames: [],
      summary: {
        overallScore0to100: 80,
        averageAbsCents: 10,
        inTunePercent: 80,
        weakestNoteIndices: [],
        trend: "balanced",
        meanSignedCents: 0,
        notesAnalyzed: 8,
        notesMissing: 0,
      },
    },
    rankScore: 70,
    ...overrides,
  };
}

describe("scaleDetectSession", () => {
  it("builds a detected session for the candidate scale", () => {
    const session = sessionFromDetectedCandidate(
      fakeCandidate(),
      48000,
      "recorded",
    );
    expect(session.scaleId).toBe("C_major");
    expect(session.scaleSource).toBe("detected");
    expect(session.octaveSpan).toBe(1);
  });

  it("matches workspace identity by scale + octave span", () => {
    const identity = identityFromSelection(0, "major", 1);
    expect(candidateMatchesIdentity(fakeCandidate(), identity)).toBe(true);
    expect(
      candidateMatchesIdentity(
        fakeCandidate({ tonicPitchClass: 7, scaleLabel: "G major" }),
        identity,
      ),
    ).toBe(false);
    expect(
      candidateMatchesIdentity(fakeCandidate({ octaveSpan: 2 }), identity),
    ).toBe(false);
  });

  it("routes detected candidates to their workspace slug", () => {
    expect(workspaceHrefForCandidate(fakeCandidate())).toBe(
      "/practice/scale/c-major-1oct",
    );
    expect(
      workspaceHrefForCandidate(
        fakeCandidate({
          tonicPitchClass: 2,
          scaleKind: "natural_minor",
          scaleLabel: "D minor",
          octaveSpan: 2,
        }),
      ),
    ).toBe("/practice/scale/d-natural-minor-2oct");
  });
});
