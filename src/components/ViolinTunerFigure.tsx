"use client";

import { useEffect, useState } from "react";
import {
  VIOLIN_STRINGS,
  type ViolinStringId,
} from "@/lib/violinTuner";

type StringVisualState = "idle" | "active" | "holding" | "tuned";

/** Even spacing — left → right = G D A E. */
const XS = [52, 108, 164, 220] as const;
const TOP_Y = 18;
const BOTTOM_Y = 118;
const LABEL_Y = 148;
const VIEW_W = 272;
const VIEW_H = 172;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function stringState(
  id: ViolinStringId,
  activeId: ViolinStringId | null,
  tuned: ReadonlySet<ViolinStringId>,
  holdingId: ViolinStringId | null,
): StringVisualState {
  if (tuned.has(id)) return "tuned";
  if (holdingId === id) return "holding";
  if (activeId === id) return "active";
  return "idle";
}

function stringStroke(
  state: StringVisualState,
  liveDirection: "low" | "high" | "in_tune" | "unclear" | null,
  isLive: boolean,
): { color: string; width: number; opacity: number } {
  if (state === "tuned") {
    return { color: "var(--musai-ok)", width: 2.2, opacity: 1 };
  }
  if (isLive) {
    if (liveDirection === "in_tune") {
      return { color: "var(--musai-ok)", width: 2.4, opacity: 1 };
    }
    if (liveDirection === "low") {
      return { color: "var(--musai-pitch-low)", width: 2.45, opacity: 1 };
    }
    if (liveDirection === "high") {
      return { color: "var(--musai-pitch-high)", width: 2.45, opacity: 1 };
    }
    return { color: "var(--musai-ink)", width: 2.3, opacity: 1 };
  }
  return {
    color: "color-mix(in srgb, var(--musai-ink) 28%, var(--musai-muted))",
    width: 1.35,
    opacity: 0.75,
  };
}

/** Soft S-curve for a living string without looking busy. */
function stringPath(x: number, wobble: number): string {
  if (Math.abs(wobble) < 0.05) {
    return `M ${x} ${TOP_Y} L ${x} ${BOTTOM_Y}`;
  }
  const mid = (TOP_Y + BOTTOM_Y) / 2;
  return `M ${x} ${TOP_Y} C ${x + wobble} ${mid - 18}, ${x - wobble * 0.55} ${mid + 18}, ${x} ${BOTTOM_Y}`;
}

/**
 * Minimal open-string diagram: four quiet lines, one light rail, G–D–A–E.
 */
export function ViolinTunerFigure({
  activeId,
  tuned,
  liveDirection,
  holdingId,
  holdProgress,
  wavePhase,
}: {
  activeId: ViolinStringId | null;
  tuned: ReadonlySet<ViolinStringId>;
  liveDirection: "low" | "high" | "in_tune" | "unclear" | null;
  holdingId: ViolinStringId | null;
  holdProgress: number;
  wavePhase: number;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const tunedList = VIOLIN_STRINGS.filter((s) => tuned.has(s.id))
    .map((s) => s.id)
    .join(", ");

  return (
    <div className="relative mx-auto w-full max-w-[16.5rem]">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-auto w-full"
        role="img"
        aria-label={
          tunedList
            ? `Open strings G, D, A, E. In tune: ${tunedList}.`
            : "Open strings G, D, A, and E."
        }
      >
        {/* Quiet baseline — reads as the nut / bridge edge */}
        <line
          x1={XS[0] - 18}
          y1={BOTTOM_Y}
          x2={XS[3] + 18}
          y2={BOTTOM_Y}
          stroke="var(--musai-border)"
          strokeWidth="1.25"
          strokeLinecap="round"
        />

        {VIOLIN_STRINGS.map((s, i) => {
          const x = XS[i]!;
          const state = stringState(s.id, activeId, tuned, holdingId);
          const isLive = activeId === s.id;
          const stroke = stringStroke(state, isLive ? liveDirection : null, isLive);
          const vibrating = isLive && !reducedMotion;
          const amp =
            liveDirection === "low" || liveDirection === "high" ? 5.2 : 2.8;
          const wobble = vibrating
            ? Math.sin(wavePhase * Math.PI * 2) * amp
            : 0;
          const path = stringPath(x, wobble);

          const labelFill =
            state === "tuned"
              ? "var(--musai-ok)"
              : isLive && liveDirection === "in_tune"
                ? "var(--musai-ok)"
                : isLive && liveDirection === "low"
                  ? "var(--musai-pitch-low)"
                  : isLive && liveDirection === "high"
                    ? "var(--musai-pitch-high)"
                    : isLive
                      ? "var(--musai-ink)"
                      : "var(--musai-muted)";
          const r = 11;
          const circ = 2 * Math.PI * r;
          const showHold =
            holdingId === s.id && holdProgress > 0 && state !== "tuned";

          return (
            <g key={s.id}>
              {vibrating ? (
                <path
                  d={stringPath(x, wobble * 0.55)}
                  fill="none"
                  stroke={stroke.color}
                  strokeWidth={stroke.width + 3}
                  strokeLinecap="round"
                  opacity={0.12}
                />
              ) : null}
              <path
                d={path}
                fill="none"
                stroke={stroke.color}
                strokeWidth={stroke.width}
                strokeLinecap="round"
                opacity={stroke.opacity}
              />
              {/* Tiny seat on the rail */}
              <circle
                cx={x}
                cy={BOTTOM_Y}
                r={state === "tuned" || isLive ? 2.2 : 1.6}
                fill={
                  state === "tuned"
                    ? "var(--musai-ok)"
                    : isLive
                      ? "var(--musai-ink)"
                      : "var(--musai-border)"
                }
              />

              <g>
                <circle
                  cx={x}
                  cy={LABEL_Y}
                  r="13.5"
                  fill="var(--musai-surface)"
                  stroke={
                    state === "tuned"
                      ? "var(--musai-ok)"
                      : isLive && liveDirection === "low"
                        ? "var(--musai-pitch-low)"
                        : isLive && liveDirection === "high"
                          ? "var(--musai-pitch-high)"
                          : isLive
                            ? "color-mix(in srgb, var(--musai-ok) 55%, var(--musai-border))"
                            : "var(--musai-border)"
                  }
                  strokeWidth={state === "tuned" || isLive ? 1.5 : 1}
                />
                {showHold ? (
                  <circle
                    cx={x}
                    cy={LABEL_Y}
                    r={r}
                    fill="none"
                    stroke="var(--musai-ok)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray={circ}
                    strokeDashoffset={circ * (1 - holdProgress)}
                    transform={`rotate(-90 ${x} ${LABEL_Y})`}
                  />
                ) : null}
                {state === "tuned" ? (
                  <circle
                    cx={x}
                    cy={LABEL_Y}
                    r="13.5"
                    fill="var(--musai-ok)"
                    opacity="0.12"
                  />
                ) : null}
                <text
                  x={x}
                  y={LABEL_Y + 4.5}
                  textAnchor="middle"
                  className="font-display"
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    fill: labelFill,
                  }}
                >
                  {s.id}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
