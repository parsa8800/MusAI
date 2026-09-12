"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RecordingWaveformHistory } from "@/components/RecordingWaveformHistory";
import { buildLoopAttemptMeta } from "@/lib/scalePracticeProgress";
import { masteryPercentThroughTake } from "@/lib/scaleMasteryTimeline";
import { prefersReducedMotion } from "@/lib/motion";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";

const COMPLETE_PULSE_MS = 1400;

function ScaleMasteryBar({
  percent,
  size = "sm",
  label = "Progress",
  ariaLabel,
  historical = false,
  highlight = false,
  endSlot,
}: {
  percent: number;
  size?: "sm" | "lg";
  label?: string;
  ariaLabel?: string;
  historical?: boolean;
  highlight?: boolean;
  endSlot?: ReactNode;
}) {
  const prevPct = useRef(percent);
  const [fill, setFill] = useState(percent);
  const [grew, setGrew] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [showCompleteMsg, setShowCompleteMsg] = useState(percent >= 100);
  const displayPct = Math.round(percent);
  const barLabel = ariaLabel ?? label;

  useEffect(() => {
    const from = prevPct.current;
    const to = percent;
    const reduce = prefersReducedMotion();
    prevPct.current = to;
    const crossedComplete = to >= 100 && from < 100;

    if (reduce || from === to) {
      setFill(to);
      setGrew(false);
      if (to >= 100) setShowCompleteMsg(true);
      else setShowCompleteMsg(false);
      return;
    }

    setFill(from);
    const frame = window.requestAnimationFrame(() => setFill(to));

    if (crossedComplete) {
      setCompleting(true);
      setShowCompleteMsg(true);
      setGrew(true);
      const pulse = window.setTimeout(() => setCompleting(false), COMPLETE_PULSE_MS);
      return () => {
        window.cancelAnimationFrame(frame);
        window.clearTimeout(pulse);
      };
    }

    if (to > from) {
      setGrew(true);
      const t = window.setTimeout(() => setGrew(false), 1100);
      if (to < 100) {
        setCompleting(false);
        setShowCompleteMsg(false);
      }
      return () => {
        window.cancelAnimationFrame(frame);
        window.clearTimeout(t);
      };
    }

    if (to < 100) {
      setCompleting(false);
      setShowCompleteMsg(false);
    }

    return () => window.cancelAnimationFrame(frame);
  }, [percent]);

  const complete = percent >= 100;

  return (
    <div
      className={`musai-scale-progress-block min-w-0 flex-1${
        historical ? " musai-scale-progress-block--historical" : ""
      }`}
    >
      <div className="musai-scale-progress-meta">
        <span className="musai-scale-progress-label">{label}</span>
        <div className="musai-scale-progress-meta-end">
          <span
            className={`musai-scale-progress-pct${
              grew || completing ? " musai-scale-progress-pct--pulse" : ""
            }${highlight ? " musai-scale-progress-pct--best" : ""}`}
            aria-hidden
          >
            {displayPct}%
          </span>
          {endSlot ? <div className="shrink-0">{endSlot}</div> : null}
        </div>
      </div>
      <div
        className={`musai-scale-progress relative min-w-0 w-full${
          size === "lg" ? " musai-scale-progress--lg" : ""
        }${complete ? " musai-scale-progress--complete" : ""}${
          completing ? " musai-scale-progress--completing" : ""
        }`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={displayPct}
        aria-label={barLabel}
      >
        <div
          className={`musai-scale-progress-fill${grew ? " musai-scale-progress-fill--up" : ""}${
            completing ? " musai-scale-progress-fill--complete" : ""
          }`}
          style={{ width: `${fill}%` }}
        />
      </div>
      {showCompleteMsg && complete ? (
        <p
          className={`musai-scale-progress-complete-msg${
            completing ? " musai-scale-progress-complete-msg--enter" : ""
          }`}
          role="status"
        >
          Complete
        </p>
      ) : null}
    </div>
  );
}

/**
 * Compact loop progress: labeled mastery bar with percentage.
 * When viewing an older take, the bar shows mastery as of that take.
 */
export function ScaleAttemptProgressStrip({
  session,
  loopAttempts,
  showNewBest = false,
  size = "sm",
  padded = true,
  showWaveform = true,
  endSlot,
}: {
  session: ScalePracticeSessionV1;
  loopAttempts: ScalePracticeSessionV1[];
  showNewBest?: boolean;
  size?: "sm" | "lg";
  padded?: boolean;
  showWaveform?: boolean;
  /** Compact control after the percentage (take history). */
  endSlot?: ReactNode;
}) {
  const attempts = useMemo(
    () => (loopAttempts.length > 0 ? loopAttempts : [session]),
    [loopAttempts, session],
  );
  const loopMeta = useMemo(
    () => buildLoopAttemptMeta(attempts),
    [attempts],
  );
  const progressPercent = useMemo(
    () => masteryPercentThroughTake(attempts, session.sessionId),
    [attempts, session.sessionId],
  );
  const viewingLatest =
    attempts.length === 0 ||
    session.sessionId === attempts[attempts.length - 1]?.sessionId;

  return (
    <div className={padded ? "shrink-0 px-4 pb-2 sm:px-5" : "shrink-0"}>
      <ScaleMasteryBar
        percent={progressPercent}
        size={size}
        label={viewingLatest ? "Progress" : "This take"}
        ariaLabel={viewingLatest ? "Progress" : "Progress at this take"}
        historical={!viewingLatest}
        highlight={showNewBest && viewingLatest && loopMeta.isNewBest}
        endSlot={endSlot}
      />
      {showWaveform &&
      session.waveformAmplitudes &&
      session.waveformAmplitudes.length > 0 ? (
        <div className="mt-2 min-w-0">
          <RecordingWaveformHistory
            samples={session.waveformAmplitudes}
            compact
            label="This take volume history"
          />
        </div>
      ) : null}
    </div>
  );
}

/** Empty ready-state twin of the mastery bar (0%). */
export function ScaleProgressReadyBar({
  size = "lg",
}: {
  size?: "sm" | "lg";
}) {
  return (
    <div className="musai-scale-progress-block min-w-0 flex-1">
      <div className="musai-scale-progress-meta">
        <span className="musai-scale-progress-label">Progress</span>
        <span className="musai-scale-progress-pct" aria-hidden>
          0%
        </span>
      </div>
      <div
        className={`musai-scale-progress relative min-w-0 w-full${
          size === "lg" ? " musai-scale-progress--lg" : ""
        }`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={0}
        aria-label="Progress"
      >
        <div className="musai-scale-progress-fill" style={{ width: "0%" }} />
      </div>
    </div>
  );
}
