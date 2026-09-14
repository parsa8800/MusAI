import { describe, expect, it } from "vitest";
import {
  applyPieceOsmdTheme,
  pieceOsmdInk,
  pieceOsmdStaffLineColor,
  pieceOsmdZoomForWidth,
  type PieceOsmdThemable,
} from "@/features/piece-studio/score/osmdTheme";

describe("piece OSMD theme + sizing", () => {
  it("scales zoom with available width without fixed offsets", () => {
    expect(pieceOsmdZoomForWidth(320)).toBeLessThan(pieceOsmdZoomForWidth(800));
    expect(pieceOsmdZoomForWidth(1100)).toBeGreaterThanOrEqual(1.45);
  });

  it("uses distinct light and dark ink", () => {
    expect(pieceOsmdInk("light")).not.toBe(pieceOsmdInk("dark"));
  });

  it("applies engraving colors through OSMD rules (no invert)", () => {
    const calls: string[] = [];
    const osmd: PieceOsmdThemable = {
      EngravingRules: {
        applyDefaultColorMusic: (c) => {
          calls.push(c);
        },
        DefaultColorNotehead: "",
        DefaultColorRest: "",
        DefaultColorStem: "",
        DefaultColorLabel: "",
        DefaultColorLyrics: "",
        DefaultColorChordSymbol: "",
        DefaultColorTitle: "",
        StaffLineColor: "",
        LedgerLineColorDefault: "",
        PageBackgroundColor: "",
        ColorBeams: false,
        ColorFlags: false,
        ColorStemsLikeNoteheads: false,
        ExpressionsUseXMLColor: true,
        ColoringEnabled: false,
      },
    };
    applyPieceOsmdTheme(osmd, "dark");
    const rules = osmd.EngravingRules!;
    expect(calls[0]).toBe(pieceOsmdInk("dark"));
    expect(rules.DefaultColorNotehead).toBe(pieceOsmdInk("dark"));
    expect(rules.DefaultColorStem).toBe(pieceOsmdInk("dark"));
    expect(rules.DefaultColorRest).toBe(pieceOsmdInk("dark"));
    expect(rules.StaffLineColor).toBe(pieceOsmdStaffLineColor("dark"));
    expect(rules.ColorBeams).toBe(true);
    expect(rules.ColoringEnabled).toBe(true);
    expect(rules.ExpressionsUseXMLColor).toBe(false);
    expect(rules.PageBackgroundColor).toBe("transparent");
  });
});
