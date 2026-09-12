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
  NOTE_RING_CX,
  NOTE_RING_CY,
  NOTE_RING_R_IN,
  NOTE_RING_R_OUT,
  NOTE_RING_R_WEDGE,
  NOTE_RING_SIZE,
  NOTE_RING_STEP_DEG,
  annulusClipPath,
  easeOutCubic,
  hubDiameterFrac,
  insetWedgePath,
  lerpDeg,
  midAngleForPitchClass,
  pitchClassFromRingCoordinates,
  polar,
  shortestDegDelta,
  wedgeAngles,
  wedgePath,
  wedgePathForPitchClass,
} from "@/lib/noteRingGeometry";
import { prefersReducedMotion, tapFeedback } from "@/lib/motion";
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
  /** Replaces the default wrapper when set. */
  className?: string;
};

/** Soft chromatic tints around the wheel (C=0 … B=11). */
function pitchClassHue(pc: number): number {
  return (pc * 30 + 4) % 360;
}

function wedgePalette(pc: number) {
  const h = pitchClassHue(pc);
  return {
    idleFill: `hsla(${h}, 58%, 48%, 0.48)`,
    hoverFill: `hsla(${h}, 62%, 52%, 0.62)`,
    selectedFill: `hsla(${h}, 56%, 50%, 0.55)`,
    glassFill: `hsla(${h}, 45%, 82%, 0.2)`,
    edge: `hsla(${h}, 80%, 92%, 0.9)`,
  };
}

function svgPointFromClient(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: NOTE_RING_CX, y: NOTE_RING_CY };
  return pt.matrixTransform(ctm.inverse());
}

function useAnimatedDeg(target: number, ms = 240): number {
  const [value, setValue] = useState(target);
  const valueRef = useRef(target);

  useLayoutEffect(() => {
    if (
      prefersReducedMotion() ||
      Math.abs(shortestDegDelta(valueRef.current, target)) < 0.08
    ) {
      valueRef.current = target;
      setValue(target);
      return;
    }
    const from = valueRef.current;
    const started = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / ms);
      const next = lerpDeg(from, target, easeOutCubic(t));
      valueRef.current = next;
      setValue(next);
      if (t < 1) raf = requestAnimationFrame(tick);
      else {
        valueRef.current = target;
        setValue(target);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ms, target]);

  return value;
}

export function NoteRing({ value, onChange, className }: NoteRingProps) {
  const uid = useId().replace(/:/g, "");
  const annulusClipId = `annulus-${uid}`;
  const selectClipId = `sel-${uid}`;
  const hubGradId = `hub-${uid}`;
  const glassSheenId = `sheen-${uid}`;

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
  const [pressedPc, setPressedPc] = useState<number | null>(null);
  const [holdMidi, setHoldMidi] = useState<number | null>(null);
  const [latchedMidis, setLatchedMidis] = useState<Set<number>>(
    () => new Set(),
  );
  const touchTapRef = useRef<{ pc: number; t: number } | null>(null);
  const lastLatchToggleRef = useRef(0);
  const { octave, pitchClass } = splitMidi(value);
  const glassMid = useAnimatedDeg(midAngleForPitchClass(pitchClass));

  const validSet = useMemo(
    () => new Set(validPitchClassesInOctave(octave)),
    [octave],
  );

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
      setPressedPc(null);
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
      setPressedPc(pc);
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
    setPressedPc(pc);
    return true;
  };

  useLayoutEffect(() => {
    beginWedgePressRef.current = beginWedgePress;
  });

  const hubSizePct = Math.round(hubDiameterFrac() * 1000) / 10;
  const pressGap = pressedPc === pitchClass ? 1.15 : 0;
  const glassSpan = NOTE_RING_STEP_DEG / 2 - 0.85 - pressGap;
  const glassStart = glassMid - glassSpan;
  const glassEnd = glassMid + glassSpan;
  const glassSector = wedgePath(
    glassStart,
    glassEnd,
    NOTE_RING_R_IN,
    NOTE_RING_R_WEDGE,
  );
  const glassInner = insetWedgePath(glassStart, glassEnd);
  const selectedTint = wedgePalette(pitchClass);

  return (
    <div
      className={className ?? "mx-auto w-full max-w-[min(100%,26rem)]"}
      role="group"
      aria-label="Target note picker"
    >
      <div className="musai-note-ring-shell relative aspect-square w-full rounded-full">
        <div className="musai-note-ring-face relative h-full w-full overflow-hidden rounded-full">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${NOTE_RING_SIZE} ${NOTE_RING_SIZE}`}
            className="h-full w-full touch-none select-none"
            overflow="hidden"
          >
            <defs>
              <clipPath id={annulusClipId} clipPathUnits="userSpaceOnUse">
                <path
                  d={annulusClipPath()}
                  fillRule="evenodd"
                />
              </clipPath>
              <clipPath id={selectClipId} clipPathUnits="userSpaceOnUse">
                <path d={glassSector} />
              </clipPath>
              <radialGradient id={hubGradId} cx="32%" cy="22%" r="74%">
                <stop offset="0%" stopColor="var(--musai-surface)" stopOpacity="1" />
                <stop offset="100%" stopColor="var(--musai-surface-2)" stopOpacity="1" />
              </radialGradient>
              <linearGradient id={glassSheenId} x1="30%" y1="0%" x2="70%" y2="100%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.42)" />
                <stop offset="45%" stopColor="rgba(255,255,255,0.06)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0)" />
              </linearGradient>
            </defs>

            <circle
              cx={NOTE_RING_CX}
              cy={NOTE_RING_CY}
              r={NOTE_RING_R_OUT}
              fill="var(--musai-surface-2)"
              stroke="var(--musai-glass-stroke)"
              strokeWidth={1}
            />

            <g clipPath={`url(#${annulusClipId})`}>
              {Array.from({ length: 12 }, (_, i) => {
                const extraGap = pressedPc === i ? 1.15 : 0;
                const interactive = wedgeInteractive.has(i);
                const selected = pitchClass === i;
                const tint = wedgePalette(i);
                const fill = !interactive
                  ? "color-mix(in srgb, var(--musai-ink) 4%, transparent)"
                  : selected
                    ? tint.selectedFill
                    : hoveredWedge === i
                      ? tint.hoverFill
                      : tint.idleFill;

                return (
                  <path
                    key={i}
                    d={wedgePathForPitchClass(i, extraGap)}
                    fill={fill}
                    className={
                      interactive
                        ? "musai-note-wedge cursor-pointer outline-none"
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
                      if (beginWedgePress(i)) {
                        lastDragPcRef.current = i;
                        tapFeedback("light");
                      }
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
                    aria-pressed={interactive ? selected : undefined}
                    aria-label={
                      interactive
                        ? [
                            validSet.has(i)
                              ? `${pitchClassLabel(i)} in octave ${octave}`
                              : `${pitchClassLabel(i)} (chromatic neighbor)`,
                            [...latchedMidis].some(
                              (m) => splitMidi(m).pitchClass === i,
                            )
                              ? "latched"
                              : null,
                            holdMidi !== null &&
                            splitMidi(holdMidi).pitchClass === i
                              ? "held"
                              : null,
                          ]
                            .filter(Boolean)
                            .join(", ")
                        : undefined
                    }
                  />
                );
              })}

              <g clipPath={`url(#${selectClipId})`} pointerEvents="none">
                <path d={glassSector} fill={selectedTint.glassFill} />
                <path d={glassSector} fill={`url(#${glassSheenId})`} />
                <path
                  d={glassInner}
                  fill="none"
                  stroke={selectedTint.edge}
                  strokeWidth={1.15}
                  strokeLinejoin="miter"
                />
              </g>
            </g>

            {Array.from({ length: 12 }, (_, i) => {
              const interactive = wedgeInteractive.has(i);
              const selected = pitchClass === i;
              const isLatchedHere = [...latchedMidis].some(
                (m) => splitMidi(m).pitchClass === i,
              );
              const { mid } = wedgeAngles(i);
              const lp = polar(mid, (NOTE_RING_R_IN + NOTE_RING_R_WEDGE) / 2);
              return (
                <g key={`lbl-${i}`} className="pointer-events-none">
                  <text
                    x={lp.x}
                    y={lp.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={selected ? 12.5 : 11}
                    fontWeight={selected ? 700 : 600}
                    className="musai-note-ring-label select-none"
                    data-selected={selected ? "true" : "false"}
                    data-muted={!interactive ? "true" : "false"}
                    fill={
                      !interactive
                        ? "color-mix(in srgb, var(--musai-muted) 42%, transparent)"
                        : selected
                          ? "#fffcf8"
                          : "color-mix(in srgb, var(--musai-ink) 72%, var(--musai-muted))"
                    }
                  >
                    {pitchClassLabel(i)}
                  </text>
                  {isLatchedHere ? (
                    <circle
                      cx={polar(mid, NOTE_RING_R_WEDGE - 5.5).x}
                      cy={polar(mid, NOTE_RING_R_WEDGE - 5.5).y}
                      r={1.35}
                      fill="var(--musai-accent-2)"
                    />
                  ) : null}
                </g>
              );
            })}

            <circle
              cx={NOTE_RING_CX}
              cy={NOTE_RING_CY}
              r={NOTE_RING_R_OUT - 0.5}
              fill="none"
              stroke="var(--musai-glass-stroke)"
              strokeWidth={1.1}
              pointerEvents="none"
            />

            <circle
              cx={NOTE_RING_CX}
              cy={NOTE_RING_CY}
              r={NOTE_RING_R_IN - 1.2}
              fill={`url(#${hubGradId})`}
              stroke="var(--musai-glass-stroke)"
              strokeWidth={1.15}
            />
          </svg>

          <div
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{
              width: `${hubSizePct}%`,
              height: `${hubSizePct}%`,
            }}
          >
            <div className="pointer-events-auto flex h-full w-full flex-col items-center justify-center rounded-full px-1.5">
              <span className="musai-note-ring-hub__note">
                {formatNoteLabel(value)}
              </span>
              <span className="musai-note-ring-hub__hz">
                {hz.toFixed(1)} Hz
              </span>
              <div className="musai-note-ring-hub__oct">
                <button
                  type="button"
                  disabled={!canOctDown}
                  onClick={() => {
                    tapFeedback("light");
                    bumpOctave(-1);
                  }}
                  className="musai-pressable musai-note-ring-hub__oct-btn"
                  aria-label="Lower octave"
                >
                  −
                </button>
                <span className="musai-note-ring-hub__oct-label">
                  Oct {octave}
                </span>
                <button
                  type="button"
                  disabled={!canOctUp}
                  onClick={() => {
                    tapFeedback("light");
                    bumpOctave(1);
                  }}
                  className="musai-pressable musai-note-ring-hub__oct-btn"
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
  );
}
