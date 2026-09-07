"use client";

import { useEffect, useState } from "react";
import {
  VIOLIN_STRINGS,
  type ViolinStringId,
} from "@/lib/violinTuner";
import type { NoteVisualTone } from "@/lib/scaleNoteVisual";

type StringVisualState = "idle" | "active" | "holding" | "tuned";

type StringGeom = {
  id: ViolinStringId;
  farX: number;
  bridgeX: number;
  thickness: number;
};

/** Player’s chin-rest view: near = bridge (bottom), far = up the fingerboard. */
const FAR_Y = 22;
const BRIDGE_Y = 132;
const TAIL_Y = 168;

const STRING_GEOM: StringGeom[] = [
  { id: "G", farX: 124, bridgeX: 98, thickness: 2.7 },
  { id: "D", farX: 148, bridgeX: 138, thickness: 1.95 },
  { id: "A", farX: 172, bridgeX: 182, thickness: 1.35 },
  { id: "E", farX: 196, bridgeX: 222, thickness: 0.95 },
];

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

function stringColor(
  state: StringVisualState,
  liveTone: NoteVisualTone | null,
  isLive: boolean,
): string {
  if (state === "tuned") return "var(--musai-ok)";
  if (isLive) {
    if (liveTone === "good") return "var(--musai-ok)";
    if (liveTone === "slight") return "var(--musai-warn)";
    if (liveTone === "bad") return "var(--musai-accent-2)";
    return "#2c2620";
  }
  return "#8a8278";
}

function wavePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  offset: number,
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * offset;
  const py = (dx / len) * offset;
  const c1x = x1 + dx * 0.34 + px;
  const c1y = y1 + dy * 0.34 + py;
  const c2x = x1 + dx * 0.68 - px * 0.28;
  const c2y = y1 + dy * 0.68 - py * 0.28;
  return `M ${x1} ${y1} C ${c1x} ${c1y} ${c2x} ${c2y} ${x2} ${y2}`;
}

export function ViolinTunerFigure({
  activeId,
  tuned,
  liveTone,
  holdingId,
  holdProgress,
  wavePhase,
}: {
  activeId: ViolinStringId | null;
  tuned: ReadonlySet<ViolinStringId>;
  liveTone: NoteVisualTone | null;
  holdingId: ViolinStringId | null;
  holdProgress: number;
  wavePhase: number;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const tunedList = VIOLIN_STRINGS.filter((s) => tuned.has(s.id))
    .map((s) => s.id)
    .join(", ");

  return (
    <div className="relative mx-auto w-full max-w-[22rem]">
      <svg
        viewBox="0 0 320 204"
        className="h-auto w-full"
        role="img"
        aria-label={
          tunedList
            ? `Open strings from the chin rest. In tune: ${tunedList}.`
            : "Open strings G, D, A, and E over the bridge, from the chin rest."
        }
      >
        <defs>
          <linearGradient id="vt-board" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2a2520" />
            <stop offset="100%" stopColor="#14110f" />
          </linearGradient>
          <linearGradient id="vt-bridge" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f4e6c4" />
            <stop offset="42%" stopColor="#ddc08a" />
            <stop offset="100%" stopColor="#9a7040" />
          </linearGradient>
          <linearGradient id="vt-bridge-side" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#8a6236" />
            <stop offset="50%" stopColor="#f0ddb0" />
            <stop offset="100%" stopColor="#8a6236" />
          </linearGradient>
        </defs>

        {/* Fingerboard receding away from the player */}
        <path
          d="M118 18 L202 18 L246 128 L74 128 Z"
          fill="url(#vt-board)"
          opacity="0.92"
        />
        <path
          d="M126 18 L194 18"
          stroke="#f4efe6"
          strokeWidth="0.45"
          opacity="0.14"
        />

        {STRING_GEOM.map((geom) => {
          const state = stringState(geom.id, activeId, tuned, holdingId);
          const isLive = activeId === geom.id;
          const color = stringColor(state, isLive ? liveTone : null, isLive);
          const tailX = geom.bridgeX + (geom.bridgeX - geom.farX) * 0.12;
          return (
            <path
              key={`${geom.id}-tail`}
              d={`M ${geom.bridgeX} ${BRIDGE_Y} L ${tailX} ${TAIL_Y}`}
              fill="none"
              stroke={color}
              strokeWidth={Math.max(0.8, geom.thickness * 0.78)}
              strokeLinecap="round"
              opacity={0.85}
            />
          );
        })}

        {/* Bridge, closest to the chin rest */}
        <path
          d="M72 132 L248 132 L236 158 L84 158 Z"
          fill="url(#vt-bridge)"
          stroke="#8a6236"
          strokeWidth="0.7"
        />
        <path
          d="M84 158 L92 172 L228 172 L236 158"
          fill="url(#vt-bridge-side)"
          stroke="#8a6236"
          strokeWidth="0.55"
        />
        <path
          d="M108 158 L114 148 M206 158 L200 148"
          fill="none"
          stroke="#6a4828"
          strokeWidth="0.7"
        />
        <path
          d="M132 146 C148 138 172 138 188 146"
          fill="none"
          stroke="#6a4828"
          strokeWidth="0.8"
        />
        {STRING_GEOM.map((g) => (
          <rect
            key={`${g.id}-notch`}
            x={g.bridgeX - 1.15}
            y={128.2}
            width="2.3"
            height="4.2"
            rx="0.4"
            fill="#3a2414"
          />
        ))}

        {STRING_GEOM.map((geom) => {
          const state = stringState(geom.id, activeId, tuned, holdingId);
          const isLive = activeId === geom.id;
          const color = stringColor(state, isLive ? liveTone : null, isLive);
          const vibrating = isLive && !reducedMotion;
          const amp =
            liveTone === "bad" ? 6.2 : liveTone === "slight" ? 4.6 : 3.2;
          const offset = vibrating ? Math.sin(wavePhase * Math.PI * 2) * amp : 0;
          const play = wavePath(
            geom.farX,
            FAR_Y,
            geom.bridgeX,
            BRIDGE_Y,
            offset,
          );
          const ghost = wavePath(
            geom.farX,
            FAR_Y,
            geom.bridgeX,
            BRIDGE_Y,
            -offset * 0.7,
          );
          return (
            <g key={geom.id}>
              {vibrating ? (
                <path
                  d={ghost}
                  fill="none"
                  stroke={color}
                  strokeWidth={geom.thickness + 2.4}
                  strokeLinecap="round"
                  opacity={0.18}
                />
              ) : null}
              <path
                d={play}
                fill="none"
                stroke={color}
                strokeWidth={vibrating ? geom.thickness + 0.4 : geom.thickness}
                strokeLinecap="round"
              />
            </g>
          );
        })}

        {STRING_GEOM.map((geom, i) => {
          const id = VIOLIN_STRINGS[i].id;
          const state = stringState(id, activeId, tuned, holdingId);
          const isLive = activeId === id;
          const fill =
            state === "tuned"
              ? "var(--musai-ok)"
              : isLive
                ? "var(--musai-ink)"
                : "var(--musai-muted)";
          const x = geom.bridgeX;
          const y = 190;
          const r = 10.4;
          const circ = 2 * Math.PI * r;
          const showHold =
            holdingId === id && holdProgress > 0 && state !== "tuned";
          return (
            <g key={`${id}-label`}>
              <circle
                cx={x}
                cy={y}
                r="13"
                fill="var(--musai-surface)"
                stroke={
                  state === "tuned"
                    ? "var(--musai-ok)"
                    : isLive
                      ? "var(--musai-ink)"
                      : "var(--musai-border)"
                }
                strokeWidth={state === "tuned" || isLive ? 1.6 : 1}
              />
              {showHold ? (
                <circle
                  cx={x}
                  cy={y}
                  r={r}
                  fill="none"
                  stroke="var(--musai-ok)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={circ * (1 - holdProgress)}
                  transform={`rotate(-90 ${x} ${y})`}
                />
              ) : null}
              {state === "tuned" ? (
                <circle cx={x} cy={y} r="13" fill="var(--musai-ok)" opacity="0.14" />
              ) : null}
              <text
                x={x}
                y={y + 4.2}
                textAnchor="middle"
                className="font-display"
                style={{ fontSize: "13px", fontWeight: 650, fill }}
              >
                {id}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
