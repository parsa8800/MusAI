"use client";

const CUES = [
  { key: "ok", label: "In tune" },
  { key: "high", label: "Go lower" },
  { key: "low", label: "Go higher" },
  { key: "miss", label: "Missed" },
] as const;

/**
 * Pitch key — colour tells them what to try next.
 * Orange = that note was high. Blue = that note was low.
 */
export function ScalePitchCueKey({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className="mx-auto w-full max-w-xl shrink-0"
      role="group"
      aria-label="What to try on the next take"
    >
      <ul
        className={`flex flex-wrap items-center justify-center ${
          compact ? "gap-x-4 gap-y-1.5" : "gap-x-5 gap-y-2"
        }`}
      >
        {CUES.map((cue) => (
          <li
            key={cue.key}
            className={`musai-pitch-key__chip musai-pitch-key__chip--${cue.key} ${
              compact ? "musai-pitch-key__chip--compact" : ""
            }`}
          >
            <span className="musai-pitch-key__mark" aria-hidden />
            <span className="musai-pitch-key__label">{cue.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
