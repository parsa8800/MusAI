"use client";

/** Mini notehead that mirrors staff colour + the fix arrow. */
function CueNote({
  fill,
  outlined = false,
}: {
  fill: string;
  outlined?: boolean;
}) {
  return (
    <svg viewBox="0 0 20 16" className="h-4 w-5 shrink-0" aria-hidden>
      <ellipse
        cx="10"
        cy="8"
        rx="7.4"
        ry="5.4"
        transform="rotate(-20 10 8)"
        fill={outlined ? "none" : fill}
        stroke={fill}
        strokeWidth={outlined ? 1.8 : 0}
      />
    </svg>
  );
}

const CUES = [
  {
    key: "ok",
    label: "In tune",
    fill: "var(--musai-pitch-ok)",
  },
  {
    key: "high",
    label: "Go lower",
    fill: "var(--musai-pitch-high)",
    arrow: "↓" as const,
  },
  {
    key: "low",
    label: "Go higher",
    fill: "var(--musai-pitch-low)",
    arrow: "↑" as const,
  },
  {
    key: "miss",
    label: "Missed",
    fill: "var(--musai-pitch-miss)",
    outlined: true,
  },
] as const;

/**
 * Pitch key — colour + arrow tell them what to try next.
 * Orange / ↓ = that note was high. Blue / ↑ = that note was low.
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
          compact ? "gap-1.5" : "gap-2 sm:gap-2.5"
        }`}
      >
        {CUES.map((cue) => (
          <li
            key={cue.key}
            className={`musai-pitch-key__chip musai-pitch-key__chip--${cue.key} ${
              compact ? "musai-pitch-key__chip--compact" : ""
            }`}
          >
            <CueNote
              fill={cue.fill}
              outlined={"outlined" in cue ? cue.outlined : false}
            />
            {"arrow" in cue ? (
              <span className="musai-pitch-key__arrow" aria-hidden>
                {cue.arrow}
              </span>
            ) : null}
            <span className="musai-pitch-key__label">{cue.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
