import type { ScalePracticeNoteRow } from "@/lib/scalePracticeTypes";
import {
  SCALE_CLEAR_MISS_CENTS,
  SCALE_IN_TUNE_CENTS,
} from "@/lib/intonationScore";

/** Short label for chips: "C4" → "C", "F#4" → "F♯" */
export function shortNoteName(label: string): string {
  return label.replace(/\d+$/, "").replace("#", "♯").replace("b", "♭");
}

/** Traffic-light accuracy only — not sharp vs flat. */
export type NoteVisualTone = "good" | "slight" | "bad" | "unclear";

export function toneFromAbsCents(absCents: number | null): NoteVisualTone {
  if (absCents == null || !Number.isFinite(absCents)) return "unclear";
  if (absCents <= SCALE_IN_TUNE_CENTS) return "good";
  if (absCents <= SCALE_CLEAR_MISS_CENTS) return "slight";
  return "bad";
}

export function noteVisualTone(row: ScalePracticeNoteRow): NoteVisualTone {
  if (row.missingData || row.intonationBucket === "unknown") return "unclear";
  return toneFromAbsCents(Math.abs(row.centsDifference));
}

/**
 * Staff arrow = what to try next, not which way the take went.
 * Sharp (positive cents) → go lower. Flat → go higher.
 */
export function pitchCorrectionDir(
  cents: number | null,
): "up" | "down" | null {
  if (cents == null || !Number.isFinite(cents)) return null;
  if (Math.abs(cents) <= SCALE_IN_TUNE_CENTS) return null;
  return cents > 0 ? "down" : "up";
}

export function pitchCorrectionArrow(dir: "up" | "down"): "↑" | "↓" {
  return dir === "up" ? "↑" : "↓";
}

export const NOTE_TONE_STYLES: Record<
  NoteVisualTone,
  { chip: string; glow: string; label: string }
> = {
  good: {
    chip: "border-[color-mix(in_srgb,var(--musai-ok)_35%,var(--musai-border))] bg-[color-mix(in_srgb,var(--musai-ok)_85%,white)] text-[var(--musai-ink)]",
    glow: "shadow-[0_2px_8px_color-mix(in_srgb,var(--musai-ok)_18%,transparent)]",
    label: "On pitch",
  },
  slight: {
    chip: "border-[color-mix(in_srgb,var(--musai-warn)_35%,var(--musai-border))] bg-[color-mix(in_srgb,var(--musai-warn)_80%,white)] text-[var(--musai-ink)]",
    glow: "shadow-[0_2px_8px_color-mix(in_srgb,var(--musai-warn)_16%,transparent)]",
    label: "Slightly off",
  },
  bad: {
    chip: "border-[color-mix(in_srgb,var(--musai-accent-2)_35%,var(--musai-border))] bg-[color-mix(in_srgb,var(--musai-accent-2)_80%,white)] text-[var(--musai-ink)]",
    glow: "shadow-[0_2px_8px_color-mix(in_srgb,var(--musai-accent-2)_16%,transparent)]",
    label: "Out of tune",
  },
  unclear: {
    chip: "border-[var(--musai-border)] bg-[var(--musai-surface-2)] text-[var(--musai-muted)]",
    glow: "",
    label: "Unclear",
  },
};
