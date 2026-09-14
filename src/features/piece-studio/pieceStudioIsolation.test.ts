import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.join(process.cwd(), "src/features/piece-studio");

/** Scale Studio *domain* — must never appear in Piece Studio production code. */
const SCALE_DOMAIN = [
  "@/lib/scale",
  "@/lib/analyzeScalePerformance",
  "@/lib/scalePractice",
  "@/lib/scaleTakeHistory",
  "@/lib/scaleProgressHistory",
  "@/lib/scaleCoachChat",
  "detectScale",
  "scaleTakeHistory",
  "scalePracticeSession",
  "scaleCoachChat",
  "scaleProgressHistory",
  "ScaleTrebleStaff",
  "ScaleWorkspace",
  "ScalePracticeFlow",
  "CoachChatPanel",
  "musai-scale-",
];

/** Soft coupling we removed — piece should use PRACTICE_* / mode: "piece". */
const SOFT_SCALE_LEAKS = [
  "SCALE_IN_TUNE_CENTS",
  "SCALE_CLEAR_MISS_CENTS",
  'mode: "scale"',
  "mode: 'scale'",
];

function listProductionFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listProductionFiles(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name)) continue;
    if (/\.test\.(ts|tsx)$/.test(name)) continue;
    // Test-only MusicXML snippets — never production import/catalog data.
    if (name === "musicXmlFixtures.ts") continue;
    out.push(full);
  }
  return out;
}

describe("piece studio isolation", () => {
  const files = listProductionFiles(ROOT);

  it("scans production piece-studio sources", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("does not import Scale Studio domain or notation", () => {
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const rel = path.relative(process.cwd(), file);
      for (const token of SCALE_DOMAIN) {
        expect(src, `${rel} imports ${token}`).not.toContain(token);
      }
    }
  });

  it("does not lean on Scale-named thresholds or pitch mode", () => {
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const rel = path.relative(process.cwd(), file);
      for (const token of SOFT_SCALE_LEAKS) {
        expect(src, `${rel} still uses ${token}`).not.toContain(token);
      }
    }
  });

  it("keeps OpenSheetMusicDisplay inside the ScoreRenderer implementation only", () => {
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const rel = path.relative(process.cwd(), file);
      if (rel.endsWith("score/OpenSheetMusicDisplayRenderer.ts")) continue;
      expect(src, `${rel} imports opensheetmusicdisplay`).not.toMatch(
        /opensheetmusicdisplay/,
      );
    }
  });

  it("keeps Flat / vendor OMR out of catalog and UI", () => {
    const uiAndCatalog = files.filter((f) => {
      const rel = path.relative(process.cwd(), f);
      return (
        rel.includes("PieceStudio") ||
        rel.includes("PieceWorkspace") ||
        rel.includes("PieceScore") ||
        rel.includes("pieceStudioCatalog") ||
        rel.includes("pieceStudioImport") ||
        rel.includes("pieceStudioFiles")
      );
    });
    for (const file of uiAndCatalog) {
      const src = readFileSync(file, "utf8");
      const rel = path.relative(process.cwd(), file);
      expect(src, `${rel} imports flatOmrProvider`).not.toContain(
        "flatOmrProvider",
      );
      expect(src, `${rel} imports @flat-io`).not.toContain("@flat-io");
      expect(src, `${rel} imports resolveOmrProvider`).not.toContain(
        "resolveOmrProvider",
      );
    }
  });

  it("keeps skill analyzers free of practice/ capture imports", () => {
    const analyzers = files.filter((f) =>
      path.relative(process.cwd(), f).includes("feedback/analyzers/"),
    );
    for (const file of analyzers) {
      const src = readFileSync(file, "utf8");
      const rel = path.relative(process.cwd(), file);
      expect(src, `${rel} imports practice/`).not.toMatch(
        /@\/features\/piece-studio\/practice\//,
      );
    }
  });

  it("keeps direct digital import free of OMR recognition clients", () => {
    const digitalFiles = files.filter((f) => {
      const rel = path.relative(process.cwd(), f);
      return (
        rel.endsWith("pieceStudioDigitalImport.ts") ||
        rel.endsWith("score/validateMusicXml.ts")
      );
    });
    expect(digitalFiles.length).toBe(2);
    for (const file of digitalFiles) {
      const src = readFileSync(file, "utf8");
      const rel = path.relative(process.cwd(), file);
      expect(src, `${rel} imports recognizeSheetMusic`).not.toContain(
        "recognizeSheetMusic",
      );
      expect(src, `${rel} imports audiveris`).not.toMatch(/audiveris/i);
      expect(src, `${rel} hits /api/piece-omr`).not.toContain("/api/piece-omr");
      expect(src, `${rel} imports flatOmrProvider`).not.toContain(
        "flatOmrProvider",
      );
    }
  });

  it("never loads test fixtures into production Piece Studio paths", () => {
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const rel = path.relative(process.cwd(), file);
      expect(src, `${rel} references fixtures/piece-import`).not.toContain(
        "fixtures/piece-import",
      );
      expect(src, `${rel} imports musicXmlFixtures`).not.toContain(
        "musicXmlFixtures",
      );
      expect(src, `${rel} embeds TWINKLE_XML`).not.toContain("TWINKLE_XML");
    }
  });
});
