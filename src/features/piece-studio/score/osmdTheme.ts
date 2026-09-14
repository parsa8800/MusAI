/**
 * Piece Studio OSMD theming + sizing helpers.
 * Isolated from Scale Studio VexFlow notation.
 */

export type PieceOsmdTheme = "light" | "dark";

export type PieceOsmdEngravingRules = {
  applyDefaultColorMusic: (color: string) => void;
  DefaultColorNotehead: string;
  DefaultColorRest: string;
  DefaultColorStem: string;
  DefaultColorLabel: string;
  DefaultColorLyrics: string;
  DefaultColorChordSymbol: string;
  DefaultColorTitle: string;
  StaffLineColor: string;
  LedgerLineColorDefault: string;
  PageBackgroundColor: string;
  ColorBeams: boolean;
  ColorFlags: boolean;
  ColorStemsLikeNoteheads: boolean;
  ExpressionsUseXMLColor: boolean;
  ColoringEnabled?: boolean;
  PageLeftMargin?: number;
  PageRightMargin?: number;
  PageTopMargin?: number;
  PageBottomMargin?: number;
  PageTopMarginNarrow?: number;
};

export type PieceOsmdThemable = {
  Zoom?: number;
  EngravingRules?: PieceOsmdEngravingRules;
};

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

/** Resolve MusAI ink for OSMD — matches Scale Studio’s --musai-notation intent. */
export function pieceOsmdInk(theme: PieceOsmdTheme): string {
  if (theme === "dark") {
    return cssVar("--musai-notation", "#eef2f6");
  }
  return cssVar("--musai-notation", "#1c1917");
}

/**
 * Staff / ledger lines need slightly softer ink so dense scores stay readable,
 * but dark mode must stay high-contrast on the paper stage.
 * Use solid hex — OSMD paints SVG attributes; CSS color-mix is unreliable there.
 */
export function pieceOsmdStaffLineColor(theme: PieceOsmdTheme): string {
  if (theme === "dark") return "#d2dae4";
  return "#5c5651";
}

export function pieceOsmdPageBackground(theme: PieceOsmdTheme): string {
  // Transparent — the workspace paper stage provides the surface.
  void theme;
  return "transparent";
}

export function readPieceOsmdTheme(): PieceOsmdTheme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/**
 * Apply theme colors through OSMD EngravingRules (not CSS invert).
 * Call before render(); re-apply when the document theme changes.
 */
export function applyPieceOsmdTheme(
  osmd: PieceOsmdThemable,
  theme: PieceOsmdTheme = readPieceOsmdTheme(),
): void {
  const rules = osmd.EngravingRules;
  if (!rules) return;
  const ink = pieceOsmdInk(theme);
  const staff = pieceOsmdStaffLineColor(theme);

  rules.applyDefaultColorMusic(ink);
  rules.DefaultColorNotehead = ink;
  rules.DefaultColorRest = ink;
  rules.DefaultColorStem = ink;
  rules.DefaultColorLabel = ink;
  rules.DefaultColorLyrics = ink;
  rules.DefaultColorChordSymbol = ink;
  rules.DefaultColorTitle = ink;
  rules.StaffLineColor = staff;
  rules.LedgerLineColorDefault = staff;
  rules.PageBackgroundColor = pieceOsmdPageBackground(theme);
  rules.ColorBeams = true;
  rules.ColorFlags = true;
  rules.ColorStemsLikeNoteheads = true;
  if (typeof rules.ColoringEnabled === "boolean") {
    rules.ColoringEnabled = true;
  }
  // Prefer theme ink over MusicXML-embedded expression colors in dark mode.
  rules.ExpressionsUseXMLColor = theme === "light";
}

/**
 * Readable zoom from available host width. OSMD still wraps systems to width;
 * zoom controls staff size (line spacing), not left offset.
 * Prefer `pieceOsmdZoomForPresentation` for Score viewer modes.
 */
export function pieceOsmdZoomForWidth(containerWidthPx: number): number {
  const w = Math.max(0, containerWidthPx);
  if (w < 340) return 1.15;
  if (w < 420) return 1.24;
  if (w < 560) return 1.32;
  if (w < 720) return 1.4;
  if (w < 960) return 1.46;
  return 1.5;
}

export function applyPieceOsmdZoom(
  osmd: PieceOsmdThemable,
  containerWidthPx: number,
  zoomOverride?: number,
): number {
  const zoom = zoomOverride ?? pieceOsmdZoomForWidth(containerWidthPx);
  osmd.Zoom = zoom;
  return zoom;
}
