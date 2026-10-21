import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.join(process.cwd(), "src/features/scale-studio");

/** Piece Studio domain — must never appear in Scale Studio production code. */
const PIECE_DOMAIN = [
  "@/features/piece-studio",
  "musai-piece-",
  "PieceWorkspaceView",
  "PieceStudioView",
  "analyzePieceTake",
  "matchPiecePitch",
  "runPieceFeedback",
  "MusaiScoreV1",
  "OpenSheetMusicDisplay",
  "opensheetmusicdisplay",
  "pieceCoachChat",
  "pieceStudioCatalog",
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
    out.push(full);
  }
  return out;
}

describe("scale studio isolation", () => {
  const files = listProductionFiles(ROOT);

  it("scans production scale-studio sources", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("does not import Piece Studio domain, OSMD, or piece storage keys", () => {
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const rel = path.relative(process.cwd(), file);
      for (const token of PIECE_DOMAIN) {
        expect(src, `${rel} imports ${token}`).not.toContain(token);
      }
    }
  });
});
