"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * The one loading mark. A dot walks three notes, rests on the first and the
 * last, then comes back. A progress bar is only shown when `progress` is set
 * (piece upload, or opening a piece to practise).
 */
export function MusaiLoadingMark({
  compact = false,
  progress,
  progressLabel = "Loading the piece",
}: {
  compact?: boolean;
  progress?: number;
  progressLabel?: string;
}) {
  const overall =
    typeof progress === "number" && Number.isFinite(progress)
      ? Math.max(0, Math.min(100, progress))
      : null;
  const percent = overall == null ? null : Math.round(overall);
  return (
    <div
      className={compact ? "musai-load musai-load--compact" : "musai-load"}
      aria-hidden={overall == null ? true : undefined}
    >
      <svg className="musai-piece-load__staff" viewBox="0 0 240 88">
        <g className="musai-piece-load__lines">
          <line x1="16" y1="28" x2="224" y2="28" />
          <line x1="16" y1="38" x2="224" y2="38" />
          <line x1="16" y1="48" x2="224" y2="48" />
          <line x1="16" y1="58" x2="224" y2="58" />
          <line x1="16" y1="68" x2="224" y2="68" />
        </g>
        <LoadNote cx={52} cy={58} className="musai-piece-load__note" />
        <LoadNote cx={120} cy={48} className="musai-piece-load__note" />
        <LoadNote cx={188} cy={38} className="musai-piece-load__note" />
        <LoadNote
          cx={52}
          cy={58}
          className="musai-piece-load__glow musai-piece-load__glow--1"
        />
        <LoadNote
          cx={120}
          cy={48}
          className="musai-piece-load__glow musai-piece-load__glow--2"
        />
        <LoadNote
          cx={188}
          cy={38}
          className="musai-piece-load__glow musai-piece-load__glow--3"
        />
        <circle className="musai-piece-load__dot" cx="0" cy="0" r="4.4" />
      </svg>
      {percent != null ? (
        <div className="musai-load__meter">
          <div
            className="musai-load__overall"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={progressLabel}
          >
            <span style={{ width: `${percent}%` }} />
          </div>
          <p className="musai-load__percent">{percent}%</p>
        </div>
      ) : null}
    </div>
  );
}

function LoadNote({
  cx,
  cy,
  className,
}: {
  cx: number;
  cy: number;
  className: string;
}) {
  const stemX = cx + 6.4;
  return (
    <g className={className}>
      <ellipse
        cx={cx}
        cy={cy}
        rx="7.2"
        ry="5"
        transform={`rotate(-16 ${cx} ${cy})`}
      />
      <path d={`M${stemX} ${cy - 1.6}V${cy - 24}`} />
    </g>
  );
}

/** Full-page wait. Same mark as every other loading screen. */
export function MusaiLoadingScreen({
  label = "Loading",
}: {
  label?: string;
}) {
  return (
    <div
      className="musai-load-screen"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <MusaiLoadingMark />
      <p className="musai-load-screen__copy">{label}</p>
    </div>
  );
}

/** Keep a studio’s opening mark up long enough to read as loading. */
const STUDIO_HOLD_MS = 2600;

export function StudioReveal({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [covered, setCovered] = useState(process.env.NODE_ENV !== "test");

  useEffect(() => {
    if (process.env.NODE_ENV === "test") return;
    const id = window.setTimeout(() => setCovered(false), STUDIO_HOLD_MS);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <>
      {children}
      {covered ? (
        <div className="musai-studio-reveal">
          <MusaiLoadingScreen label={label} />
        </div>
      ) : null}
    </>
  );
}
