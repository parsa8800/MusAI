import { describe, expect, it } from "vitest";
import {
  OMR_COPY,
  omrUserMessage,
  OmrError,
} from "@/features/piece-studio/omr/omrProvider";
import { importPhaseLabel } from "@/features/piece-studio/pieceStudioImport";

describe("Piece Studio user-facing import copy", () => {
  it("keeps phase labels simple", () => {
    expect(importPhaseLabel("uploading")).toBe("Reading your music");
    expect(importPhaseLabel("processing")).toBe("Reading your music");
    expect(importPhaseLabel("validating")).toBe("Checking the score");
  });

  it("never puts npm, env, or worker jargon in OMR_COPY", () => {
    const blob = Object.values(OMR_COPY).join("\n");
    expect(blob).not.toMatch(/npm /i);
    expect(blob).not.toMatch(/omr-worker/i);
    expect(blob).not.toMatch(/MUSAI_/i);
    expect(blob).not.toMatch(/Audiveris/i);
    expect(blob).not.toMatch(/\bOMR\b/);
    expect(blob).not.toMatch(/terminal/i);
    expect(OMR_COPY.scanningUnavailable).toBe(
      "Photos and PDFs can’t be scanned right now — digital scores still work",
    );
    expect(OMR_COPY.failed).toBe("Couldn’t read this score");
    expect(OMR_COPY.checking).toBe("Checking the score");
  });

  it("does not forward raw parser errors to the UI", () => {
    expect(
      omrUserMessage(new Error("Unexpected token near score-partwise")),
    ).toBe(OMR_COPY.failed);
    expect(omrUserMessage(new OmrError(OMR_COPY.noMusic))).toBe(OMR_COPY.noMusic);
    expect(omrUserMessage(new OmrError("Set MUSAI_OMR_PROVIDER=audiveris"))).toBe(
      OMR_COPY.failed,
    );
  });
});
