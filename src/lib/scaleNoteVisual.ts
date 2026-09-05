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

export const NOTE_TONE_STYLES: Record<
  NoteVisualTone,
  { chip: string; glow: string; label: string }
> = {
  good: {
    chip: "border-emerald-300/50 bg-emerald-500/85 text-white",
    glow: "shadow-[0_0_22px_rgba(16,185,129,0.35)]",
    label: "On pitch",
  },
  slight: {
    chip: "border-yellow-300/55 bg-yellow-400/90 text-zinc-950",
    glow: "shadow-[0_0_20px_rgba(250,204,21,0.32)]",
    label: "Slightly off",
  },
  bad: {
    chip: "border-red-300/50 bg-red-500/90 text-white",
    glow: "shadow-[0_0_22px_rgba(239,68,68,0.35)]",
    label: "Out of tune",
  },
  unclear: {
    chip: "border-zinc-500/40 bg-zinc-600/70 text-zinc-200",
    glow: "",
    label: "Unclear",
  },
};
