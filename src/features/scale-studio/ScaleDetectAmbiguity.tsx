"use client";

import type { ScaleCandidate } from "@/lib/detectScale";
import { candidateChipLabel } from "@/lib/scaleDetectSession";

/**
 * When detection is ambiguous, let the student confirm which scale they played.
 */
export function ScaleDetectAmbiguity({
  alternatives,
  onPick,
  onCancel,
}: {
  alternatives: ScaleCandidate[];
  onPick: (candidate: ScaleCandidate) => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-[color-mix(in_srgb,var(--musai-bg)_55%,transparent)] px-4 backdrop-blur-[8px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scale-detect-title"
    >
      <div className="musai-glass musai-glass--strong w-full max-w-sm rounded-[var(--musai-radius-lg)] px-5 py-5">
        <p
          id="scale-detect-title"
          className="text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--musai-muted)]"
        >
          Which scale?
        </p>
        <p className="mt-2 text-center text-[13px] leading-snug text-[var(--musai-muted)]">
          A few close matches — pick what you played.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {alternatives.map((c) => (
            <button
              key={`${c.scaleLabel}-${c.octaveSpan}-${c.pattern}-${c.rootMidi}`}
              type="button"
              className="musai-btn-secondary w-full justify-center text-[13px]"
              onClick={() => onPick(c)}
            >
              {candidateChipLabel(c)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="mt-3 w-full text-center text-[12px] font-medium text-[var(--musai-muted)] underline decoration-[var(--musai-border)] underline-offset-2 hover:text-[var(--musai-ink)]"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
