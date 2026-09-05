"use client";

import { animate, createTimeline, stagger } from "animejs";
import { useEffect, useRef } from "react";
import { MUSAI_DUR, MUSAI_EASE, prefersReducedMotion } from "@/lib/motion";

type EntranceOptions = {
  /** Stagger child selector inside the root (default: `[data-anime-enter]`). */
  childSelector?: string;
  /** Delay before the timeline starts (ms). */
  delay?: number;
  /** Skip animation entirely. */
  disabled?: boolean;
};

type AnimeHandle = { pause: () => void; revert?: () => void; cancel?: () => void };

/**
 * Fade + rise entrance for a section. Animates `[data-anime-enter]` children
 * with a short stagger, or the root itself when no children match.
 */
export function useAnimeEntrance<T extends HTMLElement>(
  options: EntranceOptions = {},
) {
  const rootRef = useRef<T | null>(null);
  const { childSelector = "[data-anime-enter]", delay = 0, disabled = false } =
    options;

  useEffect(() => {
    const root = rootRef.current;
    if (!root || disabled) return;

    if (prefersReducedMotion()) {
      root.style.opacity = "1";
      root.querySelectorAll<HTMLElement>(childSelector).forEach((el) => {
        el.style.opacity = "1";
        el.style.transform = "none";
      });
      return;
    }

    const children = [
      ...root.querySelectorAll<HTMLElement>(childSelector),
    ];
    const targets = children.length > 0 ? children : [root];

    for (const el of targets) {
      el.style.opacity = "0";
      el.style.transform = "translateY(8px)";
    }

    const handles: AnimeHandle[] = [];

    if (targets.length === 1) {
      handles.push(
        animate(targets[0]!, {
          opacity: [0, 1],
          y: [8, 0],
          duration: MUSAI_DUR.enter,
          ease: MUSAI_EASE.out,
          delay,
        }) as AnimeHandle,
      );
    } else {
      const tl = createTimeline({
        defaults: { ease: MUSAI_EASE.out, duration: MUSAI_DUR.enter },
        delay,
      });
      tl.add(targets, {
        opacity: [0, 1],
        y: [8, 0],
        delay: stagger(42),
      });
      handles.push(tl as unknown as AnimeHandle);
    }

    return () => {
      for (const h of handles) {
        try {
          h.pause();
          h.revert?.();
          h.cancel?.();
        } catch {
          /* unmount cleanup */
        }
      }
    };
  }, [childSelector, delay, disabled]);

  return rootRef;
}
