import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMusicXmlToScore } from "@/features/piece-studio/score/parseMusicXml";
import { validateMusicXmlInterchange } from "@/features/piece-studio/score/validateMusicXml";

const FIXTURE = resolve(
  process.cwd(),
  "fixtures/piece-import/Mendelssohn-Op64-I-solo-opening.musicxml",
);

describe("Mendelssohn Op.64 solo opening fixture", () => {
  it("parses as a digital score for Piece Studio import", () => {
    const xml = readFileSync(FIXTURE, "utf8");
    const { score } = validateMusicXmlInterchange(xml, "Fallback");
    expect(score.noteCount).toBeGreaterThan(15);
    expect(score.parts[0]?.measures.length).toBe(9);
    expect(score.title.toLowerCase()).toContain("violin concerto");
    expect(score.composer?.toLowerCase()).toContain("mendelssohn");

    const parsed = parseMusicXmlToScore(xml, "Fallback");
    const firstNotes = parsed.parts[0]?.measures[1]?.events
      ?.filter((e) => e.kind === "note")
      .map((e) =>
        e.kind === "note" ? `${e.pitch.step}${e.pitch.octave}` : "",
      );
    // Solo entrance (common-time first line): E5 — G5
    expect(firstNotes).toEqual(["E5", "G5"]);

    const bar3 = parsed.parts[0]?.measures[2]?.events
      ?.filter((e) => e.kind === "note")
      .map((e) =>
        e.kind === "note" ? `${e.pitch.step}${e.pitch.octave}` : "",
      );
    expect(bar3).toEqual(["B5", "G5", "E5"]);

    expect(score.parts[0]?.measures[0]?.events.some((e) => e.kind === "rest")).toBe(
      true,
    );
  });
});
