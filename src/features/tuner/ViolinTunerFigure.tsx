"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { animate } from "animejs";
import { useTunerStringWave } from "@/hooks/useTunerStringWave";
import { MUSAI_DUR, MUSAI_EASE } from "@/lib/motion";
import type { TunerMotionFrame } from "@/lib/tunerStringMotion";
import {
  VIOLIN_STRINGS,
  type TunerOpenString,
  type TunerStringId,
} from "@/lib/violinTuner";

type StringVisualState = "idle" | "active" | "holding" | "tuned";

/** Even spacing — left → right along the current layout. */
const XS = [58, 139, 221, 302] as const;
const TOP_Y = 14;
const BOTTOM_Y = 200;
const VIEW_W = 360;
const VIEW_H = 218;
const HOLD_VIEW = 36;
const HOLD_STROKE = 1.5;
const HOLD_R = (HOLD_VIEW - HOLD_STROKE) / 2;
const HOLD_C = 2 * Math.PI * HOLD_R;

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
  id: TunerStringId,
  activeId: TunerStringId | null,
  tuned: ReadonlySet<TunerStringId>,
  holdingId: TunerStringId | null,
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
    return { color: "var(--musai-ok)", width: 2.6, opacity: 1 };
  }
  if (isLive) {
    if (liveDirection === "in_tune") {
      return { color: "var(--musai-ok)", width: 2.85, opacity: 1 };
    }
    if (liveDirection === "low") {
      return { color: "var(--musai-pitch-low)", width: 2.9, opacity: 1 };
    }
    if (liveDirection === "high") {
      return { color: "var(--musai-pitch-high)", width: 2.9, opacity: 1 };
    }
    return { color: "var(--musai-ink)", width: 2.7, opacity: 1 };
  }
  return {
    color: "color-mix(in srgb, var(--musai-ink) 42%, var(--musai-muted))",
    width: 2.05,
    opacity: 0.92,
  };
}

function slotTone(
  state: StringVisualState,
  liveDirection: "low" | "high" | "in_tune" | "unclear" | null,
): string {
  if (state === "tuned" || (state === "active" && liveDirection === "in_tune")) {
    return "ok";
  }
  if (state === "active" && liveDirection === "low") return "low";
  if (state === "active" && liveDirection === "high") return "high";
  if (state === "holding" || state === "active") return "known";
  return "idle";
}

/**
 * Open-string seats for the active instrument. Letters are always visible;
 * colour and motion respond as each string is heard and tuned.
 */
export function ViolinTunerFigure({
  strings = VIOLIN_STRINGS,
  activeId,
  tuned,
  liveDirection,
  holdingId,
  holdProgress,
  motionRef,
  idle = false,
}: {
  strings?: readonly TunerOpenString[];
  /** @deprecated Letters always show; kept optional for call-site compat. */
  revealed?: ReadonlySet<TunerStringId>;
  activeId: TunerStringId | null;
  tuned: ReadonlySet<TunerStringId>;
  liveDirection: "low" | "high" | "in_tune" | "unclear" | null;
  holdingId: TunerStringId | null;
  holdProgress: number;
  motionRef: RefObject<TunerMotionFrame>;
  idle?: boolean;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const labels = strings.map((s) => s.id);
  const tunedList = labels.filter((id) => tuned.has(id)).join(", ");
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const glowRefs = useRef<(SVGPathElement | null)[]>([]);
  const bloomRefs = useRef<Partial<Record<TunerStringId, HTMLElement | null>>>({});
  const slots = strings.map((s, i) => ({ id: s.id, restX: XS[i]! }));

  useTunerStringWave({
    motionRef,
    slots,
    reducedMotion,
    pathRefs,
    glowRefs,
    bloomRefs,
  });

  const prevTuned = useRef(tuned);
  const lockAnims = useRef<{ pause: () => void; revert?: () => void; cancel?: () => void }[]>(
    [],
  );
  useEffect(() => {
    if (reducedMotion) {
      prevTuned.current = tuned;
      return;
    }
    for (const id of tuned) {
      if (prevTuned.current.has(id)) continue;
      const bloom = bloomRefs.current[id];
      if (!bloom) continue;
      lockAnims.current.push(
        animate(bloom, {
          opacity: [0, 0.7, 0],
          scale: [0.88, 1.14, 1],
          duration: MUSAI_DUR.emphasize,
          ease: MUSAI_EASE.out,
        }) as (typeof lockAnims.current)[number],
      );
    }
    prevTuned.current = tuned;
  }, [reducedMotion, tuned]);

  useEffect(() => {
    return () => {
      for (const anim of lockAnims.current) {
        try {
          anim.pause();
          anim.revert?.();
          anim.cancel?.();
        } catch {
          /* unmount */
        }
      }
      lockAnims.current = [];
    };
  }, []);

  return (
    <div
      className="musai-tuner-figure"
      data-idle={idle ? "true" : "false"}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={
          tunedList
            ? `Open strings ${labels.join(", ")}. In tune: ${tunedList}.`
            : `Open strings ${labels.join(", ")}.`
        }
      >
        <line
          x1={XS[0]! - 18}
          y1={BOTTOM_Y}
          x2={XS[3]! + 18}
          y2={BOTTOM_Y}
          stroke="var(--musai-border)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {strings.map((s, i) => {
          const x = XS[i]!;
          const state = stringState(s.id, activeId, tuned, holdingId);
          const isLive = activeId === s.id;
          const stroke = stringStroke(
            state,
            isLive ? liveDirection : null,
            isLive,
          );

          return (
            <g key={`line-${s.id}`}>
              <path
                ref={(el) => {
                  glowRefs.current[i] = el;
                }}
                d={`M ${x} ${TOP_Y} L ${x} ${BOTTOM_Y}`}
                fill="none"
                stroke={stroke.color}
                strokeWidth={stroke.width + 5}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0}
              />
              <path
                ref={(el) => {
                  pathRefs.current[i] = el;
                }}
                d={`M ${x} ${TOP_Y} L ${x} ${BOTTOM_Y}`}
                fill="none"
                stroke={stroke.color}
                strokeWidth={stroke.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={stroke.opacity}
              />
              <circle
                cx={x}
                cy={BOTTOM_Y}
                r={state === "tuned" || isLive ? 2.6 : 2.1}
                fill={
                  state === "tuned"
                    ? "var(--musai-ok)"
                    : isLive
                      ? "var(--musai-ink)"
                      : "color-mix(in srgb, var(--musai-ink) 45%, var(--musai-border))"
                }
              />
            </g>
          );
        })}
      </svg>

      <div className="musai-tuner-slots" aria-hidden>
        {strings.map((s, i) => {
          const x = XS[i]!;
          const state = stringState(s.id, activeId, tuned, holdingId);
          const isLive = activeId === s.id;
          const showHold =
            holdingId === s.id && holdProgress > 0 && state !== "tuned";
          return (
            <span
              key={s.id}
              className="musai-tuner-bead"
              data-tone={slotTone(state, isLive ? liveDirection : null)}
              style={{ left: `${(x / VIEW_W) * 100}%` }}
            >
              <span
                className="musai-tuner-bead__bloom"
                ref={(el) => {
                  bloomRefs.current[s.id] = el;
                }}
              />
              {showHold ? (
                <svg
                  className="musai-tuner-bead__hold"
                  viewBox={`0 0 ${HOLD_VIEW} ${HOLD_VIEW}`}
                  aria-hidden
                >
                  <circle
                    cx={HOLD_VIEW / 2}
                    cy={HOLD_VIEW / 2}
                    r={HOLD_R}
                    fill="none"
                    stroke="var(--musai-ok)"
                    strokeWidth={HOLD_STROKE}
                    strokeLinecap="butt"
                    vectorEffect="non-scaling-stroke"
                    strokeDasharray={HOLD_C}
                    strokeDashoffset={HOLD_C * (1 - holdProgress)}
                    transform={`rotate(-90 ${HOLD_VIEW / 2} ${HOLD_VIEW / 2})`}
                  />
                </svg>
              ) : null}
              <span className="musai-tuner-bead__letter font-display">
                {s.id}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
