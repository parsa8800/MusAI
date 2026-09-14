import { describe, expect, it } from "vitest";
import { createDefaultScoreRenderer } from "@/features/piece-studio/score/createDefaultScoreRenderer";
import { musicXmlRenderSource } from "@/features/piece-studio/score/scoreRenderSource";

describe("ScoreRenderer", () => {
  it("defaults to the OpenSheetMusicDisplay implementation", () => {
    const renderer = createDefaultScoreRenderer();
    expect(renderer.id).toBe("opensheetmusicdisplay");
  });

  it("exposes MusicXML as the opaque interchange source", () => {
    expect(musicXmlRenderSource("<score-partwise/>")).toEqual({
      format: "musicxml",
      content: "<score-partwise/>",
    });
  });
});
