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

  it("does not stretch the score paper to full stage height by default", () => {
    const css = readFileSync(
      path.join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );
    const wrapBlock = css.match(
      /\.musai-piece-workspace__stage\s+\.musai-piece-osmd-wrap\s*\{[^}]+\}/,
    )?.[0];
    expect(wrapBlock).toBeTruthy();
    expect(wrapBlock).toMatch(/height:\s*auto/);
    expect(wrapBlock).toMatch(/flex:\s*0\s+1\s+auto/);
    expect(wrapBlock).not.toMatch(/(?<!max-)height:\s*100%/);
    expect(wrapBlock).toMatch(/border-radius:/);
  });

  it("keeps soft corners on the Score/Listen stage shell", () => {
    const css = readFileSync(
      path.join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );
    const listenShell = css.match(
      /\.musai-piece-workspace__practise-stage\[data-practise="false"\]\s*\{[^}]+\}/,
    )?.[0];
    expect(listenShell).toBeTruthy();
    expect(listenShell).toMatch(/border-radius:\s*calc\(/);
    expect(listenShell).not.toMatch(/border-radius:\s*0/);
  });

  it("lets Listen hug short scores so transport sits under the music", () => {
    const css = readFileSync(
      path.join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );
    expect(css).toMatch(
      /\.musai-piece-workspace--listen\s+\.musai-piece-workspace__practise-stage:has\(\s*\.musai-piece-osmd-wrap--compact[\s\S]*?\{[^}]*flex:\s*0\s+1\s+auto/s,
    );
    expect(css).toMatch(
      /\.musai-piece-workspace--listen\s+\.musai-piece-workspace__stage:has\(\s*\.musai-piece-osmd-wrap--compact[\s\S]*?\{[^}]*flex:\s*0\s+1\s+auto/s,
    );
    expect(css).toMatch(
      /\.musai-piece-workspace--listen\s+\.musai-piece-workspace__dock\s*\{[^}]*margin-top:/s,
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
