/**
 * Shared motion tokens + Anime.js helpers.
 * Prefer transform/opacity; always respect prefers-reduced-motion.
 */

export const MUSAI_EASE = {
  out: "outCubic",
  soft: "outQuad",
  morph: "inOutCubic",
  spring: "outBack",
} as const;

export const MUSAI_DUR = {
  micro: 140,
  fast: 200,
  base: 280,
  enter: 360,
  emphasize: 480,
} as const;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Duration in ms, or 0 when the user prefers reduced motion. */
export function motionMs(ms: number): number {
  return prefersReducedMotion() ? 0 : ms;
}

/**
 * Short device vibration on supported phones (no-op on iOS / desktop).
 * Skip when the user prefers reduced motion.
 */
export function tapFeedback(kind: "light" | "medium" = "light"): void {
  if (typeof navigator === "undefined" || prefersReducedMotion()) return;
  try {
    if (typeof navigator.vibrate !== "function") return;
    navigator.vibrate(kind === "medium" ? 14 : 8);
  } catch {
    /* unsupported */
  }
}
