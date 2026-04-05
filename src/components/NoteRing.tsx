"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  formatNoteLabel,
  isViolinRangeMidi,
  midiForChromaticCircleStep,
  midiToHz,
  nearestViolinMidiInOctave,
  pitchClassLabel,
  splitMidi,
  validPitchClassesInOctave,
  violinChromaticNeighborMidi,
  violinOctaveBounds,
} from "@/lib/intonation";
import {
  playReferenceTone,
  startHoldReference,
  stopAllLatchedReference,
  stopHoldReference,
  syncLatchedReferences,
} from "@/lib/referencePitch";

type NoteRingProps = {
  value: number;
  onChange: (midi: number) => void;
};

const CX = 120;
const CY = 120;
const R_OUT = 106;
const R_IN = 64;
/** Matches SVG hub circle — HTML hub stays inside this (no overlap with wedges). */
const HUB_FRAC = (2 * (R_IN - 2)) / 240;

const GLASS = {
  invalidFill: "rgba(255,255,255,0.035)",
  invalidStroke: "rgba(255,255,255,0.1)",
  idleFill: "rgba(255,255,255,0.085)",
  idleStroke: "rgba(255,255,255,0.16)",
  hoverFill: "rgba(255,255,255,0.14)",
  selectedFill: "rgba(255,255,255,0.2)",
  selectedStroke: "rgba(255,255,255,1)",
  selectedStrokeW: 2.1,
  idleStrokeW: 0.75,
  /** Pointer / key hold (temporary sustain) */
  heldFill: "rgba(56, 189, 248, 0.26)",
  heldStroke: "rgba(125, 211, 252, 0.95)",
  heldStrokeW: 2,
  /** Double-click / double-tap latched drone */
  latchedFill: "rgba(168, 85, 247, 0.16)",
  latchedStroke: "rgba(232, 121, 249, 0.92)",
  latchedStrokeW: 2.35,
} as const;

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

const RIM_SLOP = 8;

function svgPointFromClient(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: CX, y: CY };
  return pt.matrixTransform(ctm.inverse());
}

/** Pitch class 0–11 under the pointer, or null if outside the note ring annulus. */
function pitchClassFromRingCoordinates(
  x: number,
  y: number,
): number | null {
  const dx = x - CX;
  const dy = y - CY;
  const r = Math.hypot(dx, dy);
  if (r < R_IN - RIM_SLOP || r > R_OUT + RIM_SLOP) return null;
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const t = (deg + 90 + 360) % 360;
  return Math.min(11, Math.floor(t / 30));
}

function wedgePath(
  startDeg: number,
  endDeg: number,
  innerR: number,
  outerR: number,
): string {
  const p1 = polar(CX, CY, innerR, startDeg);
  const p2 = polar(CX, CY, outerR, startDeg);
  const p3 = polar(CX, CY, outerR, endDeg);
  const p4 = polar(CX, CY, innerR, endDeg);
  return [
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `L ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `A ${outerR} ${outerR} 0 0 1 ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    `L ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
    `A ${innerR} ${innerR} 0 0 0 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

export function NoteRing({ value, onChange }: NoteRingProps) {
  const gradId = useId().replace(/:/g, "");
  const rimGradId = `rim-${gradId}`;
  const hubGradId = `hub-${gradId}`;
  const hubEdgeId = `hub-edge-${gradId}`;
  const domeGradId = `dome-${gradId}`;

  const { min: OCTAVE_MIN, max: OCTAVE_MAX } = useMemo(
    () => violinOctaveBounds(),
    [],
  );

  const prevMidiRef = useRef(value);
  useEffect(() => {
    prevMidiRef.current = value;
  }, [value]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const ringDragRef = useRef(false);
  const lastDragPcRef = useRef<number | null>(null);
  const beginWedgePressRef = useRef<(pc: number) => boolean>(() => false);

  const [hoveredWedge, setHoveredWedge] = useState<number | null>(null);
  const [holdMidi, setHoldMidi] = useState<number | null>(null);
  const [latchedMidis, setLatchedMidis] = useState<Set<number>>(
    () => new Set(),
  );
  const touchTapRef = useRef<{ pc: number; t: number } | null>(null);
  const lastLatchToggleRef = useRef(0);
  const { octave, pitchClass } = splitMidi(value);

  const validSet = useMemo(
    () => new Set(validPitchClassesInOctave(octave)),
    [octave],
  );

  /** In this octave on the violin, or one playable semitone away (e.g. B from C7 → B6). */
  const wedgeInteractive = useMemo(() => {
    const out = new Set<number>();
    for (let i = 0; i < 12; i++) {
      if (validSet.has(i)) out.add(i);
      else if (violinChromaticNeighborMidi(value, i) !== null) out.add(i);
    }
    return out;
  }, [validSet, value]);

  const canOctDown = octave > OCTAVE_MIN;
  const canOctUp = octave < OCTAVE_MAX;

  const hz = midiToHz(value);

  useLayoutEffect(() => {
    syncLatchedReferences(latchedMidis);
  }, [latchedMidis]);

  useEffect(() => {
    return () => {
      stopHoldReference();
      stopAllLatchedReference();
    };
  }, []);

  useEffect(() => {
    const endHold = () => {
      stopHoldReference();
      setHoldMidi(null);
      ringDragRef.current = false;
      lastDragPcRef.current = null;
    };

    const onMove = (e: PointerEvent) => {
      if (!ringDragRef.current || (e.buttons & 1) === 0) return;
      const svg = svgRef.current;
      if (!svg) return;
      const { x, y } = svgPointFromClient(svg, e.clientX, e.clientY);
      const pc = pitchClassFromRingCoordinates(x, y);
      if (pc === null) {
        stopHoldReference();
        setHoldMidi(null);
        lastDragPcRef.current = null;
        return;
      }
      if (pc === lastDragPcRef.current) return;
      if (!beginWedgePressRef.current(pc)) return;
      lastDragPcRef.current = pc;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", endHold);
    window.addEventListener("pointercancel", endHold);
    window.addEventListener("lostpointercapture", endHold);
    const keyEnd = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter") endHold();
    };
    window.addEventListener("keyup", keyEnd);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", endHold);
      window.removeEventListener("pointercancel", endHold);
      window.removeEventListener("lostpointercapture", endHold);
      window.removeEventListener("keyup", keyEnd);
      endHold();
    };
  }, []);

  const preview = (midi: number) => {
    playReferenceTone(midi);
  };

  const bumpOctave = (delta: number) => {
    stopHoldReference();
    setHoldMidi(null);
    const next = octave + delta;
    if (next < OCTAVE_MIN || next > OCTAVE_MAX) return;
    const m = nearestViolinMidiInOctave(next, pitchClass);
    onChange(m);
    preview(m);
  };

  const resolveWedgeMidi = (pc: number): number | null => {
    const prev = prevMidiRef.current;
    const m = midiForChromaticCircleStep(prev, pc);
    if (m === null || !isViolinRangeMidi(m)) return null;
    return m;
  };

  const toggleLatchForMidi = useCallback((midi: number) => {
    const now = Date.now();
    if (now - lastLatchToggleRef.current < 90) return;
    lastLatchToggleRef.current = now;
    setLatchedMidis((prev) => {
      const next = new Set(prev);
      if (next.has(midi)) next.delete(midi);
      else next.add(midi);
      return next;
    });
  }, []);

  const beginWedgePress = (pc: number): boolean => {
    const m = resolveWedgeMidi(pc);
    if (m === null) return false;
    prevMidiRef.current = m;
    onChange(m);
    startHoldReference(m);
    setHoldMidi(m);
    return true;
  };

  useLayoutEffect(() => {
    beginWedgePressRef.current = beginWedgePress;
  });

  const hubSizePct = Math.round(HUB_FRAC * 1000) / 10 - 1.2;

  return (
    <div
      className="mx-auto w-full max-w-[min(100%,320px)]"
      role="group"
      aria-label="Target note picker"
    >
      {/* Glass chassis: jewelled bezel + frosted bowl */}
      <div className="musai-note-ring-shell relative rounded-full bg-gradient-to-b from-white/30 via-white/[0.12] to-white/[0.04] p-[1.5px] shadow-[0_2px_4px_rgba(0,0,0,0.2),0_28px_56px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-1px_0_rgba(255,255,255,0.08)]">
        <div className="relative overflow-hidden rounded-full bg-zinc-950/45 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12),inset_0_2px_3px_rgba(255,255,255,0.18),inset_0_-20px_40px_rgba(0,0,0,0.5)] backdrop-blur-[28px] backdrop-saturate-150">
          {/* Specular highlight — top “lit glass” arc */}
          <div
            className="pointer-events-none absolute inset-0 rounded-full opacity-[0.55]"
            style={{
              background:
                "radial-gradient(ellipse 95% 42% at 50% -5%, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.12) 35%, transparent 62%)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 rounded-full opacity-30"
            style={{
              background:
                "radial-gradient(circle at 50% 100%, rgba(255,255,255,0.08) 0%, transparent 45%)",
            }}
          />
          <div className="relative aspect-square w-full p-2.5 sm:p-3">
            <svg
              ref={svgRef}
              viewBox="0 0 240 240"
              className="h-full w-full touch-none overflow-visible select-none"
            >
              <defs>
                <linearGradient
                  id={rimGradId}
                  x1="20%"
                  y1="0%"
                  x2="80%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="rgba(255,255,255,0.65)" />
                  <stop offset="25%" stopColor="rgba(255,255,255,0.2)" />
                  <stop offset="55%" stopColor="rgba(255,255,255,0.06)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0.15)" />
                </linearGradient>
                <radialGradient id={hubGradId} cx="30%" cy="22%" r="72%">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.42)" />
                  <stop offset="22%" stopColor="rgba(255,255,255,0.14)" />
                  <stop offset="48%" stopColor="rgba(255,255,255,0.04)" />
                  <stop offset="100%" stopColor="rgba(0,0,0,0.72)" />
                </radialGradient>
                <radialGradient id={hubEdgeId} cx="50%" cy="50%" r="50%">
                  <stop offset="78%" stopColor="rgba(255,255,255,0)" />
                  <stop offset="92%" stopColor="rgba(255,255,255,0.35)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0.55)" />
                </radialGradient>
                <radialGradient id={domeGradId} cx="50%" cy="35%" r="65%">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.2)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                </radialGradient>
              </defs>

              <circle
                cx={CX}
                cy={CY}
                r={R_OUT + 2.5}
                fill="none"
                stroke={`url(#${rimGradId})`}
                strokeWidth={1.35}
                opacity={1}
              />
              {Array.from({ length: 12 }, (_, i) => {
                const start = -90 + i * 30;
                const end = start + 30;
                const inOctave = validSet.has(i);
                const interactive = wedgeInteractive.has(i);
                const selected = pitchClass === i;
                const isLatchedHere = [...latchedMidis].some(
                  (m) => splitMidi(m).pitchClass === i,
                );
                const isHeldHere =
                  holdMidi !== null && splitMidi(holdMidi).pitchClass === i;
                const mid = (start + end) / 2;
                const labelR = (R_IN + R_OUT) / 2;
                const lp = polar(CX, CY, labelR, mid);

                let fill: string;
                let stroke: string;
                let strokeW: number;
                if (!interactive) {
                  fill = GLASS.invalidFill;
                  stroke = GLASS.invalidStroke;
                  strokeW = 0.55;
                } else if (isHeldHere) {
                  fill = GLASS.heldFill;
                  stroke = isLatchedHere
                    ? GLASS.latchedStroke
                    : GLASS.heldStroke;
                  strokeW = isLatchedHere
                    ? GLASS.latchedStrokeW
                    : GLASS.heldStrokeW;
                } else if (selected) {
                  fill = GLASS.selectedFill;
                  stroke = isLatchedHere
                    ? GLASS.latchedStroke
                    : GLASS.selectedStroke;
                  strokeW = isLatchedHere
                    ? GLASS.latchedStrokeW
                    : GLASS.selectedStrokeW;
                } else if (isLatchedHere) {
                  fill = GLASS.latchedFill;
                  stroke = GLASS.latchedStroke;
                  strokeW = GLASS.latchedStrokeW;
                } else if (hoveredWedge === i) {
                  fill = GLASS.hoverFill;
                  stroke = GLASS.idleStroke;
                  strokeW = GLASS.idleStrokeW;
                } else {
                  fill = GLASS.idleFill;
                  stroke = GLASS.idleStroke;
                  strokeW = GLASS.idleStrokeW;
                }

                return (
                  <g key={i}>
                    <path
                      d={wedgePath(start, end, R_IN, R_OUT)}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={strokeW}
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                      className={
                        interactive
                          ? "musai-note-wedge cursor-pointer outline-none transition-[fill,stroke,opacity] duration-200 ease-out focus:outline-none focus-visible:outline-none"
                          : "pointer-events-none"
                      }
                      onPointerDown={(e) => {
                        if (!interactive) return;
                        e.preventDefault();
                        ringDragRef.current = true;
                        try {
                          e.currentTarget.focus({ preventScroll: true });
                        } catch {
                          e.currentTarget.focus();
                        }
                        if (beginWedgePress(i)) lastDragPcRef.current = i;
                      }}
                      onPointerUp={(e) => {
                        if (!interactive || e.pointerType !== "touch") return;
                        const now = Date.now();
                        const prev = touchTapRef.current;
                        if (prev && prev.pc === i && now - prev.t < 420) {
                          const m = resolveWedgeMidi(i);
                          if (m !== null) toggleLatchForMidi(m);
                          touchTapRef.current = null;
                        } else {
                          touchTapRef.current = { pc: i, t: now };
                        }
                      }}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        if (!interactive) return;
                        const m = resolveWedgeMidi(i);
                        if (m !== null) toggleLatchForMidi(m);
                      }}
                      onPointerEnter={(e) => {
                        if (!interactive || e.buttons === 0) return;
                        if (!ringDragRef.current) return;
                        if (i === lastDragPcRef.current) return;
                        if (!beginWedgePress(i)) return;
                        lastDragPcRef.current = i;
                      }}
                      onMouseEnter={() => {
                        if (interactive && !selected) setHoveredWedge(i);
                      }}
                      onMouseLeave={() => setHoveredWedge(null)}
                      onKeyDown={(e) => {
                        if (!interactive || e.repeat) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          beginWedgePress(i);
                        }
                      }}
                      tabIndex={interactive ? 0 : undefined}
                      role={interactive ? "button" : undefined}
                      aria-label={
                        interactive
                          ? [
                              inOctave
                                ? `${pitchClassLabel(i)} in octave ${octave}`
                                : `${pitchClassLabel(i)} (chromatic neighbor)`,
                              isLatchedHere ? "latched" : null,
                              isHeldHere ? "held" : null,
                            ]
                              .filter(Boolean)
                              .join(", ")
                          : undefined
                      }
                    />
                    <text
                      x={lp.x}
                      y={lp.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="pointer-events-none select-none text-[11px] font-semibold tracking-tight"
                      fill={
                        !interactive
                          ? "rgba(255,255,255,0.18)"
                          : isHeldHere
                            ? "#e0f2fe"
                            : isLatchedHere
                              ? "#f5d0fe"
                              : selected
                                ? "#ffffff"
                                : "rgba(255,255,255,0.48)"
                      }
                      style={{
                        textShadow:
                          isHeldHere
                            ? "0 0 12px rgba(56, 189, 248, 0.55)"
                            : isLatchedHere
                              ? "0 0 12px rgba(232, 121, 249, 0.5)"
                              : selected
                                ? "0 0 14px rgba(255,255,255,0.45)"
                                : "0 1px 2px rgba(0,0,0,0.8)",
                      }}
                    >
                      {pitchClassLabel(i)}
                    </text>
                  </g>
                );
              })}

              {/* Gloss pass over note ring — reads as curved glass */}
              <circle
                cx={CX}
                cy={CY}
                r={R_OUT - 4}
                fill={`url(#${domeGradId})`}
                opacity={0.5}
                pointerEvents="none"
                style={{ mixBlendMode: "soft-light" }}
              />

              <circle
                cx={CX}
                cy={CY}
                r={R_IN - 2}
                fill={`url(#${hubGradId})`}
                stroke={`url(#${hubEdgeId})`}
                strokeWidth={1.2}
                style={{
                  filter:
                    "drop-shadow(0 -3px 10px rgba(255,255,255,0.2)) drop-shadow(0 4px 14px rgba(0,0,0,0.45))",
                }}
              />
              <circle
                cx={CX}
                cy={CY}
                r={R_IN - 3.2}
                fill="none"
                stroke="rgba(255,255,255,0.12)"
                strokeWidth={0.6}
                opacity={0.9}
              />
            </svg>

            {/* Hub UI: strictly inside inner circle (no overlap with note ring) */}
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{
                width: `${hubSizePct}%`,
                height: `${hubSizePct}%`,
                maxWidth: `${hubSizePct}%`,
                maxHeight: `${hubSizePct}%`,
              }}
            >
              <div className="pointer-events-auto flex h-full w-full flex-col items-center justify-center gap-0 rounded-full border border-white/35 bg-gradient-to-b from-white/25 via-white/[0.1] to-white/[0.03] px-1 py-0.5 shadow-[inset_0_2px_3px_rgba(255,255,255,0.65),inset_0_-14px_28px_rgba(0,0,0,0.42),0_0_32px_rgba(255,255,255,0.08)] backdrop-blur-xl backdrop-saturate-150">
                <span className="leading-none text-[clamp(1.15rem,4.8vw,1.65rem)] font-semibold tracking-tight text-white tabular-nums drop-shadow-[0_2px_12px_rgba(0,0,0,0.55)]">
                  {formatNoteLabel(value)}
                </span>
                <span className="mt-0.5 text-[9px] tabular-nums leading-none text-white/50">
                  {hz.toFixed(1)} Hz
                </span>
                <div className="mt-1 flex w-full max-w-[5.5rem] items-center justify-between gap-0.5 px-0.5">
                  <button
                    type="button"
                    disabled={!canOctDown}
                    onClick={() => bumpOctave(-1)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/40 bg-white/[0.12] text-sm font-light leading-none text-white shadow-[inset_0_2px_3px_rgba(255,255,255,0.45),inset_0_-1px_0_rgba(0,0,0,0.15)] transition hover:border-white/55 hover:bg-white/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-20"
                    aria-label="Lower octave"
                  >
                    −
                  </button>
                  <span className="min-w-0 flex-1 text-center text-[8px] font-semibold uppercase leading-tight tracking-[0.12em] text-white/45">
                    Oct&nbsp;{octave}
                  </span>
                  <button
                    type="button"
                    disabled={!canOctUp}
                    onClick={() => bumpOctave(1)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/40 bg-white/[0.12] text-sm font-light leading-none text-white shadow-[inset_0_2px_3px_rgba(255,255,255,0.45),inset_0_-1px_0_rgba(0,0,0,0.15)] transition hover:border-white/55 hover:bg-white/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-20"
                    aria-label="Higher octave"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
