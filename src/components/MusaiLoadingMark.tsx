"use client";

import {
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * The one loading mark. A soft dot walks three notes, rests on the first and
 * the last, then comes back. Nothing else is drawn.
 */
export function MusaiLoadingMark({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <div
      className={compact ? "musai-load musai-load--compact" : "musai-load"}
      aria-hidden="true"
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
        <g className="musai-piece-load__dot">
          <circle className="musai-piece-load__dot-blur" r="8" />
          <circle r="4.4" />
        </g>
      </svg>
    </div>
  );
}

/**
 * Real progress is the floor. Catch up to it quickly, then keep a slowing
 * crawl so a long step never leaves the bar sitting on one number.
 * The crawl stays well short of done until the read actually finishes.
 */
export function advanceDisplayedProgress(
  value: number,
  goal: number,
  dt: number,
): number {
  const dtMs = Math.min(48, Math.max(0, dt));
  const target = Math.max(0, Math.min(100, goal));
  let next = value;

  if (target >= 100) {
    const gap = 100 - next;
    next = Math.min(
      100,
      next + Math.max(gap * (1 - Math.exp(-dtMs / 130)), dtMs * 0.09),
    );
  } else if (next < target) {
    const gap = target - next;
    next = Math.min(
      target,
      next + Math.max(gap * (1 - Math.exp(-dtMs / 200)), dtMs * 0.03),
    );
  } else {
    const ceiling = 92;
    const room = ceiling - next;
    if (room > 0) {
      const ahead = next - target;
      const perMs = Math.max(
        0.00085 * Math.min(1, room / 4),
        0.0024 * Math.exp(-ahead / 12) * Math.min(1, room / 5),
      );
      next = Math.min(ceiling, next + dtMs * perMs);
    }
  }

  return Math.max(value, next);
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
