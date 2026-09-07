"use client";

/** Mini notehead that mirrors staff colour + ↑/↓ cues. */
function CueNote({
  fill,
  arrow,
  faded = false,
}: {
  fill: string;
  arrow?: "up" | "down";
  faded?: boolean;
}) {
  return (
    <span
      className={`relative inline-flex h-7 w-6 items-center justify-center ${
        faded ? "opacity-55" : ""
      }`}
      aria-hidden
    >
      {arrow === "up" ? (
        <span
          className="absolute -top-0.5 text-[11px] font-bold leading-none"
          style={{ color: fill }}
        >
          ↑
        </span>
      ) : null}
      <svg viewBox="0 0 20 16" className="h-3.5 w-[18px]" aria-hidden>
        <ellipse
          cx="10"
          cy="9"
          rx="7.2"
          ry="5.2"
          transform="rotate(-20 10 9)"
          fill={fill}
        />
      </svg>
      {arrow === "down" ? (
        <span
          className="absolute -bottom-0.5 text-[11px] font-bold leading-none"
          style={{ color: fill }}
        >
          ↓
        </span>
      ) : null}
    </span>
  );
}

const CUES = [
  {
    key: "in",
    label: "In tune",
    hint: "Settled on the pitch",
    fill: "#3d7a5f",
  },
  {
    key: "high",
    label: "Too high",
    hint: "Ease a touch flatter",
    fill: "#b45309",
    arrow: "up" as const,
  },
  {
    key: "low",
    label: "Too low",
    hint: "Place a touch higher",
    fill: "#4a6fa5",
    arrow: "down" as const,
  },
  {
    key: "miss",
    label: "Missed",
    hint: "Didn’t catch this note",
    fill: "rgba(120,113,108,0.72)",
    faded: true,
  },
] as const;

/**
 * Pitch key beside the staff — same colours/arrows the notes use,
 * worded like a teacher pointing at the page.
 */
export function ScalePitchCueKey({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`mx-auto w-full max-w-md shrink-0 rounded-[var(--musai-radius)] border border-[var(--musai-border)] bg-[color-mix(in_srgb,var(--musai-surface)_88%,transparent)] px-2.5 py-2 shadow-[var(--musai-shadow)] ${
        compact ? "px-2 py-1.5" : ""
      }`}
      role="group"
      aria-label="How to read coloured notes"
    >
      <p className="mb-1.5 text-center text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--musai-muted)]">
        On the page
      </p>
      <ul className="grid grid-cols-2 gap-x-2 gap-y-1.5 sm:grid-cols-4 sm:gap-1">
        {CUES.map((cue) => (
          <li
            key={cue.key}
            className="flex min-w-0 items-center gap-1.5 rounded-[calc(var(--musai-radius)-2px)] px-1 py-0.5"
            title={cue.hint}
          >
            <CueNote
              fill={cue.fill}
              arrow={"arrow" in cue ? cue.arrow : undefined}
              faded={"faded" in cue ? cue.faded : false}
            />
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-semibold leading-tight text-[var(--musai-ink)] sm:text-[13px]">
                {cue.label}
              </span>
              {!compact ? (
                <span className="hidden truncate text-[10px] leading-tight text-[var(--musai-muted)] sm:block">
                  {cue.hint}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
