"use client";

import { useEffect, useRef, type RefObject } from "react";
import { animate, createTimeline } from "animejs";
import { MUSAI_DUR, MUSAI_EASE, prefersReducedMotion } from "@/lib/motion";

type AnimeLike = { pause: () => void; revert?: () => void; cancel?: () => void };

function stopAnim(a: AnimeLike | null) {
  if (!a) return;
  try {
    a.pause();
    a.revert?.();
    a.cancel?.();
  } catch {
    /* cleanup */
  }
}

/**
 * Anime.js timeline helpers for Scale Studio record → stop → ready.
 * Targets elements via data attributes inside a capture stage root.
 */
export function useScaleRecordingMotion(
  rootRef: RefObject<HTMLElement | null>,
  isRecording: boolean,
  hasSavedClip: boolean,
) {
  const prevRec = useRef(isRecording);
  const prevClip = useRef(hasSavedClip);
  const running = useRef<AnimeLike | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const started = !prevRec.current && isRecording;
    const stopped = prevRec.current && !isRecording;
    prevRec.current = isRecording;

    if (prefersReducedMotion()) return;

    if (started) {
      stopAnim(running.current);
      const stage = root.querySelector<HTMLElement>("[data-rec-stage]");
      const live = root.querySelector<HTMLElement>("[data-rec-live]");
      const idle = root.querySelector<HTMLElement>("[data-rec-idle]");
      const ring = root.querySelector<HTMLElement>("[data-rec-ring]");

      if (idle) idle.style.opacity = "0";
      if (live) {
        live.style.opacity = "0";
        live.style.transform = "translateY(8px)";
      }

      const tl = createTimeline({
        defaults: { ease: MUSAI_EASE.out, duration: MUSAI_DUR.base },
      });

      if (stage) {
        tl.add(
          stage,
          {
            scale: [0.985, 1],
            duration: MUSAI_DUR.enter,
          },
          0,
        );
      }
      if (ring) {
        tl.add(
          ring,
          {
            opacity: [0, 1],
            scale: [0.85, 1],
            duration: MUSAI_DUR.fast,
          },
          0,
        );
      }
      if (live) {
        tl.add(
          live,
          {
            opacity: [0, 1],
            y: [8, 0],
            duration: MUSAI_DUR.enter,
          },
          40,
        );
      }

      running.current = tl as unknown as AnimeLike;
    }

    if (stopped) {
      stopAnim(running.current);
      const live = root.querySelector<HTMLElement>("[data-rec-live]");
      const idle = root.querySelector<HTMLElement>("[data-rec-idle]");

      if (live) {
        const out = animate(live, {
          opacity: [1, 0],
          y: [0, -4],
          duration: MUSAI_DUR.fast,
          ease: MUSAI_EASE.soft,
        });
        running.current = out as AnimeLike;
      }
      if (idle) {
        idle.style.opacity = "1";
      }
    }

    return () => {
      stopAnim(running.current);
      running.current = null;
    };
  }, [isRecording, rootRef]);

  useEffect(() => {
    const root = rootRef.current;
    const appeared = !prevClip.current && hasSavedClip && !isRecording;
    prevClip.current = hasSavedClip;
    if (!root || !appeared || prefersReducedMotion()) return;

    const ready = root.querySelector<HTMLElement>("[data-rec-ready]");
    if (!ready) return;

    ready.style.opacity = "0";
    ready.style.transform = "translateY(10px)";
    const anim = animate(ready, {
      opacity: [0, 1],
      y: [8, 0],
      duration: MUSAI_DUR.enter,
      ease: MUSAI_EASE.out,
      delay: 40,
    });

    return () => stopAnim(anim as AnimeLike);
  }, [hasSavedClip, isRecording, rootRef]);
}
