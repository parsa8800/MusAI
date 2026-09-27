"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
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

const SLIDE_MS = 560;

function slideFrom(el: HTMLElement, dx: number) {
  if (Math.abs(dx) < 0.5) return null;
  el.style.transform = `translateX(${dx}px)`;
  return animate(el, {
    x: [dx, 0],
    duration: SLIDE_MS,
    ease: MUSAI_EASE.out,
    onComplete: () => {
      el.style.transform = "";
    },
  }) as AnimeLike;
}

/**
 * Slides the centered record control to the right when a take starts,
 * and back to center when it stops. The live waveform eases in beside it.
 */
export function useScaleRecordingMotion(
  rootRef: RefObject<HTMLElement | null>,
  isRecording: boolean,
  hasSavedClip: boolean,
) {
  const prevRec = useRef(isRecording);
  const prevClip = useRef(hasSavedClip);
  const running = useRef<AnimeLike | null>(null);
  const idleLeft = useRef<{ button: number; mic: number | null } | null>(null);
  const liveLeft = useRef<{ button: number; mic: number | null } | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const button = root.querySelector<HTMLElement>('[data-rec-slot="button"]');
    const mic = root.querySelector<HTMLElement>('[data-rec-slot="mic"]');
    if (!button) return;

    const buttonLeft = button.getBoundingClientRect().left;
    const micLeft = mic ? mic.getBoundingClientRect().left : null;
    const started = isRecording && !prevRec.current;
    const stopped = !isRecording && prevRec.current;
    prevRec.current = isRecording;

    if (!isRecording) idleLeft.current = { button: buttonLeft, mic: micLeft };
    else liveLeft.current = { button: buttonLeft, mic: micLeft };

    if (prefersReducedMotion()) return;

    if (started) {
      stopAnim(running.current);
      const from = idleLeft.current;
      const moves: AnimeLike[] = [];
      if (from) {
        const buttonMove = slideFrom(button, from.button - buttonLeft);
        if (buttonMove) moves.push(buttonMove);
        if (mic && from.mic != null && micLeft != null) {
          const micMove = slideFrom(mic, from.mic - micLeft);
          if (micMove) moves.push(micMove);
        }
      }
      const ring = root.querySelector<HTMLElement>("[data-rec-ring]");
      if (ring) {
        const tl = createTimeline({
          defaults: { ease: MUSAI_EASE.out, duration: MUSAI_DUR.base },
        });
        tl.add(ring, { opacity: [0, 1], scale: [0.85, 1], duration: MUSAI_DUR.fast }, 0);
        moves.push(tl as unknown as AnimeLike);
      }
      running.current = {
        pause: () => moves.forEach((move) => move.pause()),
        revert: () => moves.forEach((move) => move.revert?.()),
        cancel: () => moves.forEach((move) => move.cancel?.()),
      };
    }

    if (stopped) {
      stopAnim(running.current);
      const from = liveLeft.current;
      const moves: AnimeLike[] = [];
      if (from) {
        const buttonMove = slideFrom(button, from.button - buttonLeft);
        if (buttonMove) moves.push(buttonMove);
        if (mic && from.mic != null && micLeft != null) {
          const micMove = slideFrom(mic, from.mic - micLeft);
          if (micMove) moves.push(micMove);
        }
      }
      running.current = {
        pause: () => moves.forEach((move) => move.pause()),
        revert: () => moves.forEach((move) => move.revert?.()),
        cancel: () => moves.forEach((move) => move.cancel?.()),
      };
    }
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
