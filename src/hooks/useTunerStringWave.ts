"use client";

import { animate } from "animejs";
import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import { MUSAI_DUR, MUSAI_EASE } from "@/lib/motion";
import {
  STRING_BIAS_SMOOTH,
  STRING_HZ_SMOOTH,
  STRING_MOTION_ATTACK,
  STRING_MOTION_RELEASE,
  amplitudeFromEnergy,
  biasFromCents,
  energyFromRms,
  smoothToward,
  standingWavePath,
  visualHzFromPitch,
  type TunerMotionFrame,
} from "@/lib/tunerStringMotion";
import type { TunerStringId } from "@/lib/violinTuner";

type SlotPaint = {
  restX: number;
  id: TunerStringId;
};

type WaveBody = {
  amp: number;
  bias: number;
  phase: number;
  hz: number;
  confirm: number;
};

type AnimeLike = { pause: () => void; revert?: () => void; cancel?: () => void };

export const TUNER_WAVE_TOP = 14;
export const TUNER_WAVE_BOTTOM = 200;

function stopAnim(a: AnimeLike | null) {
  if (!a) return;
  try {
    a.pause();
    a.revert?.();
    a.cancel?.();
  } catch {
    /* unmount */
  }
}

export function useTunerStringWave({
  motionRef,
  slots,
  reducedMotion,
  pathRefs,
  glowRefs,
  bloomRefs,
}: {
  motionRef: RefObject<TunerMotionFrame>;
  slots: readonly SlotPaint[];
  reducedMotion: boolean;
  pathRefs: MutableRefObject<(SVGPathElement | null)[]>;
  glowRefs: MutableRefObject<(SVGPathElement | null)[]>;
  bloomRefs: MutableRefObject<Partial<Record<TunerStringId, HTMLElement | null>>>;
}) {
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const bodiesRef = useRef<Map<string, WaveBody>>(new Map());
  const prevInTune = useRef(false);
  const prevActive = useRef<string | null>(null);
  const confirms = useRef<AnimeLike[]>([]);

  useEffect(() => {
    const straighten = () => {
      for (const [i, slot] of slotsRef.current.entries()) {
        const straight = standingWavePath(
          slot.restX,
          TUNER_WAVE_TOP,
          TUNER_WAVE_BOTTOM,
          0,
          0,
          0,
        );
        pathRefs.current[i]?.setAttribute("d", straight);
        glowRefs.current[i]?.setAttribute("d", straight);
        glowRefs.current[i]?.setAttribute("opacity", "0");
      }
    };

    if (reducedMotion) {
      straighten();
      return;
    }

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.032, Math.max(0.008, (now - last) / 1000));
      last = now;
      const frame = motionRef.current;
      if (!frame) {
        raf = window.requestAnimationFrame(tick);
        return;
      }
      const energy = frame.alive ? energyFromRms(frame.rms) : 0;
      const targetHz = visualHzFromPitch(frame.hz);
      const inTune = Boolean(frame.alive && frame.inTune && frame.activeId);
      const becameInTune =
        inTune &&
        (!prevInTune.current || prevActive.current !== frame.activeId);

      if (becameInTune && frame.activeId) {
        const id = frame.activeId as TunerStringId;
        const bloom = bloomRefs.current[id];
        if (bloom) {
          for (const prev of confirms.current) stopAnim(prev);
          confirms.current = [];
          const anim = animate(bloom, {
            opacity: [0, 0.58, 0],
            scale: [0.84, 1.1, 1],
            duration: MUSAI_DUR.emphasize,
            ease: MUSAI_EASE.soft,
          }) as AnimeLike;
          confirms.current.push(anim);
        }
      }
      prevInTune.current = inTune;
      prevActive.current = frame.activeId;

      for (const [i, slot] of slotsRef.current.entries()) {
        let body = bodiesRef.current.get(slot.id);
        if (!body) {
          body = { amp: 0, bias: 0, phase: 0, hz: targetHz, confirm: 0 };
          bodiesRef.current.set(slot.id, body);
        }

        const live = frame.alive && frame.activeId === slot.id;
        if (becameInTune && live) body.confirm = 1;
        const targetAmp = live ? amplitudeFromEnergy(energy, inTune) : 0;
        const targetBias = live ? biasFromCents(frame.cents, inTune) : 0;
        body.amp = smoothToward(
          body.amp,
          targetAmp,
          STRING_MOTION_ATTACK,
          STRING_MOTION_RELEASE,
          dt,
        );
        body.bias = smoothToward(
          body.bias,
          targetBias,
          STRING_BIAS_SMOOTH,
          STRING_BIAS_SMOOTH,
          dt,
        );
        body.hz = smoothToward(
          body.hz,
          live ? targetHz : body.hz,
          STRING_HZ_SMOOTH,
          STRING_HZ_SMOOTH,
          dt,
        );
        body.confirm = smoothToward(body.confirm, 0, 0.08, 0.08, dt);
        if (body.amp > 0.03) {
          body.phase += body.hz * Math.PI * 2 * dt;
        }

        const d = standingWavePath(
          slot.restX,
          TUNER_WAVE_TOP,
          TUNER_WAVE_BOTTOM,
          body.amp,
          body.bias,
          body.phase,
        );
        pathRefs.current[i]?.setAttribute("d", d);
        const glow = glowRefs.current[i];
        if (glow) {
          glow.setAttribute("d", d);
          const glowAmp = live
            ? 0.09 + body.amp * 0.03 + body.confirm * 0.24
            : Math.max(0, body.amp * 0.02);
          glow.setAttribute("opacity", glowAmp.toFixed(3));
        }
      }

      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(raf);
      for (const anim of confirms.current) stopAnim(anim);
      confirms.current = [];
      straighten();
    };
  }, [bloomRefs, glowRefs, motionRef, pathRefs, reducedMotion]);
}
