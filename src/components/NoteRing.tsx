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
  /** Replaces the default `mx-auto w-full max-w-[min(100%,320px)]` wrapper when set. */
  className?: string;
};

const CX = 120;
const CY = 120;
const R_OUT = 106;
const R_IN = 64;
/** Matches SVG hub circle — HTML hub stays inside this (no overlap with wedges). */
const HUB_FRAC = (2 * (R_IN - 2)) / 240;

/** Soft chromatic tints around the wheel (C=0 … B=11). */
function pitchClassHue(pc: number): number {
  return (pc * 30 + 8) % 360;
}

function wedgePalette(pc: number) {
  const h = pitchClassHue(pc);
  return {
    idleFill: `hsla(${h}, 38%, 58%, 0.16)`,
    idleStroke: `hsla(${h}, 28%, 52%, 0.32)`,
    hoverFill: `hsla(${h}, 42%, 55%, 0.26)`,
    selectedFill: `hsla(${h}, 44%, 48%, 0.34)`,
    selectedStroke: `hsla(${h}, 48%, 46%, 0.95)`,
    heldFill: `hsla(${h}, 46%, 50%, 0.38)`,
    heldStroke: `hsla(${h}, 50%, 48%, 0.98)`,
  };
}

const GLASS = {
  invalidFill: "color-mix(in srgb, var(--musai-ink) 4%, transparent)",
  invalidStroke: "color-mix(in srgb, var(--musai-ink) 8%, transparent)",
  latchedFill: "color-mix(in srgb, var(--musai-accent-2) 14%, transparent)",
  latchedStroke: "color-mix(in srgb, var(--musai-accent-2) 88%, transparent)",
  latchedStrokeW: 2.2,
  selectedStrokeW: 2.2,
  idleStrokeW: 0.85,
  heldStrokeW: 2,
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

export function NoteRing({ value, onChange, className }: NoteRingProps) {
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
      className={className ?? "mx-auto w-full max-w-[min(100%,320px)]"}
      role="group"
      aria-label="Target note picker"
    >
      {/* Warm paper chassis */}
      <div className="musai-note-ring-shell relative rounded-full border border-[var(--musai-border)] bg-[var(--musai-surface)] p-[1.5px] shadow-[var(--musai-shadow)]">
        <div className="musai-note-ring-face relative overflow-hidden rounded-full bg-[var(--musai-surface-2)] shadow-[inset_0_1px_0_rgba(255,255,255,0.75),inset_0_0_0_1px_var(--musai-border)]">
          {/* Soft top highlight */}
          <div
            className="musai-note-ring-sheen pointer-events-none absolute inset-0 rounded-full opacity-40"
            style={{
              background:
                "radial-gradient(ellipse 95% 42% at 50% -5%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.08) 35%, transparent 62%)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 rounded-full opacity-20"
            style={{
              background:
                "radial-gradient(circle at 50% 100%, rgba(28,25,23,0.04) 0%, transparent 45%)",
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
                  <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
                  <stop offset="25%" stopColor="rgba(231,226,218,0.5)" />
                  <stop offset="55%" stopColor="rgba(231,226,218,0.2)" />
                  <stop offset="100%" stopColor="rgba(231,226,218,0.45)" />
                </linearGradient>
                <radialGradient id={hubGradId} cx="30%" cy="22%" r="72%">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.7)" />
                  <stop offset="22%" stopColor="rgba(243,239,232,0.35)" />
                  <stop offset="48%" stopColor="rgba(243,239,232,0.12)" />
                  <stop offset="100%" stopColor="rgba(231,226,218,0.85)" />
                </radialGradient>
                <radialGradient id={hubEdgeId} cx="50%" cy="50%" r="50%">
                  <stop offset="78%" stopColor="rgba(231,226,218,0)" />
                  <stop offset="92%" stopColor="rgba(231,226,218,0.65)" />
                  <stop offset="100%" stopColor="rgba(196,189,180,0.75)" />
                </radialGradient>
                <radialGradient id={domeGradId} cx="50%" cy="35%" r="65%">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
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
                const tint = wedgePalette(i);
                if (!interactive) {
                  fill = GLASS.invalidFill;
                  stroke = GLASS.invalidStroke;
                  strokeW = 0.55;
                } else if (isHeldHere) {
                  fill = tint.heldFill;
                  stroke = isLatchedHere
                    ? GLASS.latchedStroke
                    : tint.heldStroke;
                  strokeW = isLatchedHere
                    ? GLASS.latchedStrokeW
                    : GLASS.heldStrokeW;
                } else if (selected) {
                  fill = tint.selectedFill;
                  stroke = isLatchedHere
                    ? GLASS.latchedStroke
                    : tint.selectedStroke;
                  strokeW = isLatchedHere
                    ? GLASS.latchedStrokeW
                    : GLASS.selectedStrokeW;
                } else if (isLatchedHere) {
                  fill = GLASS.latchedFill;
                  stroke = GLASS.latchedStroke;
                  strokeW = GLASS.latchedStrokeW;
                } else if (hoveredWedge === i) {
                  fill = tint.hoverFill;
                  stroke = tint.idleStroke;
                  strokeW = GLASS.idleStrokeW;
                } else {
                  fill = tint.idleFill;
                  stroke = tint.idleStroke;
                  strokeW = GLASS.idleStrokeW;
                }

                const selectedAccent =
                  selected &&
                  !isHeldHere &&
                  !isLatchedHere &&
                  interactive;

                return (
                  <g
                    key={i}
                    style={
                      selectedAccent
                        ? {
                            transform: "scale(1.045)",
                            transformOrigin: `${CX}px ${CY}px`,
                          }
                        : undefined
                    }
                    className={
                      selectedAccent
                        ? "transition-transform duration-200 ease-out motion-reduce:transition-none"
                        : undefined
                    }
                  >
                    <path
                      d={wedgePath(start, end, R_IN, R_OUT)}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={strokeW}
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                      style={
                        selectedAccent
                          ? {
                              filter: `drop-shadow(0 0 7px hsla(${pitchClassHue(i)}, 42%, 42%, 0.28))`,
                            }
                          : undefined
                      }
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
                          ? "color-mix(in srgb, var(--musai-muted) 45%, transparent)"
                          : isHeldHere
                            ? "var(--musai-accent)"
                            : isLatchedHere
                              ? "var(--musai-accent-2)"
                              : selected
                                ? "var(--musai-ink)"
                                : "var(--musai-muted)"
                      }
                      style={{
                        textShadow: selected
                          ? "0 0 10px color-mix(in srgb, var(--musai-surface) 70%, transparent)"
                          : "none",
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
                    "drop-shadow(0 -2px 6px rgba(255,255,255,0.5)) drop-shadow(0 2px 8px rgba(28,25,23,0.08))",
                }}
              />
              <circle
                cx={CX}
                cy={CY}
                r={R_IN - 3.2}
                fill="none"
                stroke="rgba(28,25,23,0.1)"
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
              <div className="pointer-events-auto flex h-full w-full flex-col items-center justify-center gap-0 rounded-full border border-[var(--musai-border)] bg-[var(--musai-surface)] px-1 py-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_3px_rgba(28,25,23,0.06)]">
                <span className="leading-none text-[clamp(1.15rem,4.8vw,1.65rem)] font-semibold tracking-tight text-[var(--musai-ink)] tabular-nums">
                  {formatNoteLabel(value)}
                </span>
                <span className="mt-0.5 text-[9px] tabular-nums leading-none text-[var(--musai-muted)]">
                  {hz.toFixed(1)} Hz
                </span>
                <div className="mt-1 flex w-full max-w-[5.5rem] items-center justify-between gap-0.5 px-0.5">
                  <button
                    type="button"
                    disabled={!canOctDown}
                    onClick={() => bumpOctave(-1)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--musai-border)] bg-[var(--musai-surface-2)] text-sm font-light leading-none text-[var(--musai-ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition hover:border-[color-mix(in_srgb,var(--musai-accent)_30%,var(--musai-border))] hover:bg-[var(--musai-accent-soft)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-20"
                    aria-label="Lower octave"
                  >
                    −
                  </button>
                  <span className="min-w-0 flex-1 text-center text-[8px] font-semibold uppercase leading-tight tracking-[0.12em] text-[var(--musai-muted)]">
                    Oct&nbsp;{octave}
                  </span>
                  <button
                    type="button"
                    disabled={!canOctUp}
                    onClick={() => bumpOctave(1)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--musai-border)] bg-[var(--musai-surface-2)] text-sm font-light leading-none text-[var(--musai-ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition hover:border-[color-mix(in_srgb,var(--musai-accent)_30%,var(--musai-border))] hover:bg-[var(--musai-accent-soft)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-20"
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