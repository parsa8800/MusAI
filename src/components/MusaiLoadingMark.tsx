"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * The one loading mark. A dot walks three notes, rests on the first and the
 * last, then comes back. A progress bar is only shown when `progress` is set
 * (piece upload, or opening a piece to practise).
 *
 * Real progress is the floor. The bar eases up to it, then keeps a slowing
 * crawl so a long reading step never looks frozen. It does not reach the
 * end until the read actually finishes.
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
  const target =
    typeof progress === "number" && Number.isFinite(progress)
      ? Math.max(0, Math.min(100, progress))
      : null;
  const shown = useDisplayedProgress(target);
  const percent = shown == null ? null : Math.round(shown);
  const fill = shown == null ? 0 : shown;
  const scale = Math.max(0, Math.min(1, fill / 100));
  const drawn = percent != null && percent >= 100;

  return (
    <div
      className={compact ? "musai-load musai-load--compact" : "musai-load"}
      aria-hidden={shown == null ? true : undefined}
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
            className={
              drawn
                ? "musai-load__overall musai-load__overall--done"
                : "musai-load__overall"
            }
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={progressLabel}
          >
            <span
              className="musai-load__glow"
              aria-hidden="true"
              style={{ transform: `scaleX(${scale})` }}
            />
            <span className="musai-load__track">
              <span
                className="musai-load__fill"
                style={{ transform: `scaleX(${scale})` }}
              />
            </span>
            <span
              className="musai-load__tip"
              aria-hidden="true"
              style={{ left: `${scale * 100}%` }}
            />
          </div>
          <p className="musai-load__percent">{percent}%</p>
        </div>
      ) : null}
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

/**
 * Ease toward real progress, then keep moving through the quiet stretches
 * between reader updates.
 */
function useDisplayedProgress(target: number | null): number | null {
  const [shown, setShown] = useState<number | null>(null);
  const valueRef = useRef(0);
  const targetRef = useRef(target);
  const activeRef = useRef(false);
  targetRef.current = target;

  useEffect(() => {
    if (target == null) {
      activeRef.current = false;
      valueRef.current = 0;
      setShown(null);
      return;
    }

    if (!activeRef.current) {
      activeRef.current = true;
      valueRef.current = target;
      setShown(target);
    }

    let frame = 0;
    let last = performance.now();

    const step = (now: number) => {
      const dt = Math.max(0, now - last);
      last = now;
      const goal = targetRef.current ?? 0;
      const value = advanceDisplayedProgress(valueRef.current, goal, dt);
      valueRef.current = value;
      setShown(value);
      frame = window.requestAnimationFrame(step);
    };

    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [target == null]);

  return shown;
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
