"use client";

import {
  NOTE_TONE_STYLES,
  noteVisualTone,
  pitchCorrectionArrow,
  pitchCorrectionDir,
  shortNoteName,
} from "@/lib/scaleNoteVisual";
import type { ScalePracticeNoteRow } from "@/lib/scalePracticeTypes";

function NoteChip({ row }: { row: ScalePracticeNoteRow }) {
  const tone = noteVisualTone(row);
  const styles = NOTE_TONE_STYLES[tone];
  const fix = row.missingData ? null : pitchCorrectionDir(row.centsDifference);
  const dir = fix ? pitchCorrectionArrow(fix) : null;

  return (
    <div
      className={`relative flex h-14 min-w-14 flex-col items-center justify-center rounded-2xl border px-1 text-center transition ${styles.chip} ${styles.glow}`}
      title={
        row.missingData
          ? `${row.expectedNoteLabel}: unclear`
          : `${row.expectedNoteLabel}: ${styles.label} (${row.centsDifference >= 0 ? "+" : ""}${Math.round(row.centsDifference)}¢)`
      }
    >
      <span className="text-lg font-semibold tracking-tight">
        {shortNoteName(row.expectedNoteLabel)}
      </span>
      {dir ? (
        <span className="mt-0.5 text-[10px] font-bold leading-none opacity-80">
          {dir}
        </span>
      ) : null}
    </div>
  );
}

function NoteRow({
  label,
  notes,
}: {
  label: string;
  notes: ScalePracticeNoteRow[];
}) {
  if (notes.length === 0) return null;
  return (
    <div className="w-full space-y-3">
      <p className="text-center text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--musai-muted)]">
        {label}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
        {notes.map((row) => (
          <NoteChip
            key={`${label}-${row.noteIndex}-${row.expectedNoteLabel}`}
            row={row}
          />
        ))}
      </div>
    </div>
  );
}

export function ScaleNoteMap({
  ascending,
  descending,
}: {
  ascending: ScalePracticeNoteRow[];
  descending: ScalePracticeNoteRow[];
}) {
  return (
    <div className="w-full space-y-8">
      <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-[var(--musai-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[var(--musai-ok)]" /> On pitch
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[var(--musai-warn)]" /> Slightly off
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[var(--musai-accent-2)]" /> Out of tune
        </span>
      </div>
      <NoteRow label="Ascending" notes={ascending} />
      <NoteRow label="Descending" notes={descending} />
    </div>
  );
}
