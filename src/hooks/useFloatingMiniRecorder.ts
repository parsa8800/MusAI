"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Floating mini recorder visibility rules:
 * - Only after the user has seen the main recorder at least once.
 * - Hide while the main recorder is visible.
 * - Show when the main recorder scrolls out of view.
 * - Smooth enter/exit with hysteresis so show/hide cannot flap.
 */
export function useFloatingMiniRecorder(
  anchorRef: RefObject<Element | null>,
  enabled: boolean,
) {
  const [hasSeen, setHasSeen] = useState(false);
  const [anchorVisible, setAnchorVisible] = useState(true);
  const [miniMounted, setMiniMounted] = useState(false);
  const [miniVisible, setMiniVisible] = useState(false);
  const showDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleRef = useRef(true);

  useEffect(() => {
    const el = anchorRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        // Hysteresis: harder to flip once shown/hidden, avoids scroll jitter loops.
        const nextVisible = visibleRef.current
          ? entry.intersectionRatio > 0.12
          : entry.isIntersecting && entry.intersectionRatio > 0.35;
        if (nextVisible === visibleRef.current) return;
        visibleRef.current = nextVisible;
        setAnchorVisible(nextVisible);
        if (nextVisible) setHasSeen(true);
      },
      {
        threshold: [0, 0.12, 0.35, 0.5, 1],
        rootMargin: "-8% 0px -8% 0px",
      },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [anchorRef]);

  const shouldShow = enabled && hasSeen && !anchorVisible;

  useEffect(() => {
    if (showDelayRef.current) clearTimeout(showDelayRef.current);
    if (hideDelayRef.current) clearTimeout(hideDelayRef.current);

    if (shouldShow) {
      queueMicrotask(() => setMiniMounted(true));
      showDelayRef.current = setTimeout(() => setMiniVisible(true), 150);
      return;
    }

    queueMicrotask(() => setMiniVisible(false));
    hideDelayRef.current = setTimeout(() => setMiniMounted(false), 320);

    return () => {
      if (showDelayRef.current) clearTimeout(showDelayRef.current);
      if (hideDelayRef.current) clearTimeout(hideDelayRef.current);
    };
  }, [shouldShow]);

  return { miniMounted, miniVisible };
}
