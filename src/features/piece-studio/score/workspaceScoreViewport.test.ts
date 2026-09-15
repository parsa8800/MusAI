import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canPaintScoreViewport,
  MIN_SCORE_VIEWPORT_HEIGHT_PX,
  MIN_SCORE_VIEWPORT_WIDTH_PX,
} from "@/features/piece-studio/score/scoreViewport";

/**
 * Regression: workspace Score blanked after “Use this score” because OSMD
 * painted before the embedded stage gave a real flex box. Import-preview CSS
 * was fixed earlier; workspace must mirror that contract — full size before
 * paint, then compact cards may hug the SVG.
 */
describe("workspace score viewport contract", () => {
  it("keeps workspace embedded stage rules that give OSMD non-zero flex size", () => {
    const css = readFileSync(
      path.join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );
    expect(css).toMatch(
      /\.musai-piece-workspace__stage\s+\.musai-piece-score--embedded\s*\{[^}]*height:\s*100%/s,
    );
    expect(css).toMatch(
      /\.musai-piece-workspace__stage\s+\.musai-piece-osmd-wrap\s*\{[^}]*width:\s*100%/s,
    );
    expect(css).toMatch(
      /\.musai-piece-workspace__stage\s+\.musai-piece-osmd\s*\{[^}]*width:\s*100%/s,
    );
  });

  it("lets compact workspace cards hug engraved SVG bounds", () => {
    const css = readFileSync(
      path.join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );
    expect(css).toMatch(
      /\.musai-piece-workspace__stage\s+\.musai-piece-osmd-wrap--compact:has\(\.musai-piece-osmd svg\)\s*\{[^}]*width:\s*fit-content/s,
    );
    expect(css).toMatch(
      /\.musai-piece-workspace__stage\s+\.musai-piece-osmd-wrap--scroll\s*\{[^}]*height:\s*100%/s,
    );
    expect(css).toMatch(
      /\.musai-piece-workspace__stage\s*\{[^}]*background:\s*transparent/s,
    );
  });

  it("refuses OSMD paint below the shared min viewport", () => {
    expect(canPaintScoreViewport(0, 400)).toBe(false);
    expect(canPaintScoreViewport(400, 0)).toBe(false);
    expect(
      canPaintScoreViewport(
        MIN_SCORE_VIEWPORT_WIDTH_PX,
        MIN_SCORE_VIEWPORT_HEIGHT_PX,
      ),
    ).toBe(true);
  });
});
