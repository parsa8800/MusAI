"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { PiecePlaybackTimeListener } from "@/features/piece-studio/playback/playbackTime";
import {
  pickCursorTime,
  type CursorPose,
} from "@/features/piece-studio/score/cursorTrack";
import {
  applyPlayheadElement,
  followPlayheadInScrollParent,
  interpolatePlayhead,
} from "@/features/piece-studio/score/scorePlayhead";
import type { StaffBand } from "@/features/piece-studio/score/staffBands";

/**
 * Reusable live score playhead — a vertical rounded bar driven by real
 * playback time (rAF), not a CSS animation restarted per note.
 *
 * Host this once on the engraved score overlay. Listen and Practise pass a
 * playback clock; instrument / page shells should not reimplement the pointer.
 *
 * When `scrubEnabled`, the playhead can be dragged horizontally. Audio stays
 * muted until `onScrubCommit` on pointer up.
 */
export function ScorePlaybackPlayhead({
  active,
  snapsRef,
  staffBandsRef,
  scrollParentRef,
  getPlaybackTime,
  subscribePlaybackTime,
  syncRef,
  scrubEnabled = false,
  /** Press anywhere on the score to move the pointer and the recording. */
  scrubFromScore = false,
  onScrubPreview,
  onScrubCommit,
  getPlaying,
  onScrubGesture,
}: {
  active: boolean;
  snapsRef: { current: readonly CursorPose[] };
  staffBandsRef: { current: readonly StaffBand[] };
  scrollParentRef: { current: HTMLElement | null };
  getPlaybackTime?: () => number;
  subscribePlaybackTime?: (listener: PiecePlaybackTimeListener) => () => void;
  syncRef?: { current: (() => void) | null };
  scrubEnabled?: boolean;
  scrubFromScore?: boolean;
  onScrubPreview?: (tSec: number) => void;
  /** Called on pointer up with whether playback should resume. */
  onScrubCommit?: (tSec: number, resume: boolean) => void;
  getPlaying?: () => boolean;
  /** Fires when a drag ends so hosts can ignore the follow-up click. */
  onScrubGesture?: () => void;
}) {
  const elRef = useRef<HTMLSpanElement>(null);
  const lastScrollY = useRef<number | null>(null);
  const lastKey = useRef("");
  const scrubbingRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const movedRef = useRef(false);
  const getTimeRef = useRef(getPlaybackTime);
  getTimeRef.current = getPlaybackTime;

  const applyRef = useRef<(tSec: number) => void>(() => {});
  applyRef.current = (tSec: number) => {
    const el = elRef.current;
    if (!el) return;
    const pose = interpolatePlayhead(
      snapsRef.current,
      tSec,
      staffBandsRef.current,
    );
    const key = pose
      ? `${pose.x.toFixed(2)},${pose.y.toFixed(2)},${pose.height.toFixed(2)}`
      : "";
    if (key !== lastKey.current) {
      lastKey.current = key;
      applyPlayheadElement(el, pose);
    }
    if (!pose) return;
    const wrap = scrollParentRef.current;
    if (wrap && !scrubbingRef.current) {
      followPlayheadInScrollParent(wrap, pose, lastScrollY);
    }
  };

  const pointerToTime = useCallback(
    (clientX: number, clientY: number): number | null => {
      const wrap = scrollParentRef.current;
      if (!wrap) return null;
      const rect = wrap.getBoundingClientRect();
      const x = clientX - rect.left + wrap.scrollLeft;
      const y = clientY - rect.top + wrap.scrollTop;
      return pickCursorTime(snapsRef.current, x, y);
    },
    [scrollParentRef, snapsRef],
  );

  const previewAt = useCallback(
    (clientX: number, clientY: number) => {
      const t = pointerToTime(clientX, clientY);
      if (t == null || !onScrubPreview) return null;
      onScrubPreview(t);
      applyRef.current(t);
      return t;
    },
    [onScrubPreview, pointerToTime],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLSpanElement>) => {
      if (!scrubEnabled || !onScrubPreview || !onScrubCommit) return;
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const wrap = scrollParentRef.current;
      if (!wrap) return;

      wasPlayingRef.current = getPlaying?.() ?? false;
      scrubbingRef.current = true;
      movedRef.current = false;
      wrap.dataset.scrubbing = "true";

      if ("setPointerCapture" in event.currentTarget) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      previewAt(event.clientX, event.clientY);
    },
    [
      getPlaying,
      onScrubCommit,
      onScrubPreview,
      previewAt,
      scrollParentRef,
      scrubEnabled,
    ],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLSpanElement>) => {
      if (!scrubbingRef.current) return;
      movedRef.current = true;
      event.stopPropagation();
      previewAt(event.clientX, event.clientY);
    },
    [previewAt],
  );

  const finishScrub = useCallback(
    (event: React.PointerEvent<HTMLSpanElement>) => {
      if (!scrubbingRef.current) return;
      scrubbingRef.current = false;
      const wrap = scrollParentRef.current;
      if (wrap) delete wrap.dataset.scrubbing;

      if (
        "hasPointerCapture" in event.currentTarget &&
        event.currentTarget.hasPointerCapture(event.pointerId)
      ) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      const t = pointerToTime(event.clientX, event.clientY);
      if (t != null && onScrubCommit) {
        onScrubCommit(t, wasPlayingRef.current);
      }
      event.stopPropagation();
      if (movedRef.current) {
        onScrubGesture?.();
      }
      movedRef.current = false;
    },
    [onScrubCommit, onScrubGesture, pointerToTime, scrollParentRef],
  );

  useEffect(() => {
    if (!scrubFromScore || !onScrubPreview || !onScrubCommit) return;
    const wrap = scrollParentRef.current;
    if (!wrap) return;

    const onPlayhead = (target: EventTarget | null) => {
      const el = elRef.current;
      return Boolean(el && target instanceof Node && (target === el || el.contains(target)));
    };

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || scrubbingRef.current || onPlayhead(event.target)) return;
      const target = event.target instanceof Element ? event.target : null;
      // Rhythm highlights are buttons on the staff. Leave those presses alone
      // so they can open the coach instead of moving the playhead.
      if (
        target?.closest(
          "a, button, input, select, textarea, [data-testid='piece-score-heat']",
        )
      ) {
        return;
      }

      wasPlayingRef.current = getPlaying?.() ?? false;
      scrubbingRef.current = true;
      movedRef.current = false;
      wrap.dataset.scrubbing = "true";
      try {
        wrap.setPointerCapture(event.pointerId);
      } catch {
        /* jsdom and some hosts refuse capture */
      }
      const t = pointerToTime(event.clientX, event.clientY);
      if (t != null) {
        onScrubPreview(t);
        applyRef.current(t);
      }
    };

    const onMove = (event: PointerEvent) => {
      if (!scrubbingRef.current || onPlayhead(event.target)) return;
      movedRef.current = true;
      const t = pointerToTime(event.clientX, event.clientY);
      if (t == null) return;
      onScrubPreview(t);
      applyRef.current(t);
    };

    const onUp = (event: PointerEvent) => {
      if (!scrubbingRef.current || onPlayhead(event.target)) return;
      scrubbingRef.current = false;
      delete wrap.dataset.scrubbing;
      try {
        if (wrap.hasPointerCapture(event.pointerId)) {
          wrap.releasePointerCapture(event.pointerId);
        }
      } catch {
        /* ignore */
      }
      const t = pointerToTime(event.clientX, event.clientY);
      if (t != null) onScrubCommit(t, wasPlayingRef.current);
      onScrubGesture?.();
      movedRef.current = false;
    };

    wrap.addEventListener("pointerdown", onDown);
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerup", onUp);
    wrap.addEventListener("pointercancel", onUp);
    return () => {
      wrap.removeEventListener("pointerdown", onDown);
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerup", onUp);
      wrap.removeEventListener("pointercancel", onUp);
    };
  }, [
    getPlaying,
    onScrubCommit,
    onScrubGesture,
    onScrubPreview,
    pointerToTime,
    scrollParentRef,
    scrubFromScore,
  ]);

  useLayoutEffect(() => {
    const el = elRef.current;
    if (!active || !el) {
      lastKey.current = "";
      lastScrollY.current = null;
      if (el) applyPlayheadElement(el, null);
      if (syncRef) syncRef.current = null;
      return;
    }
    const sync = () => applyRef.current(getTimeRef.current?.() ?? 0);
    if (syncRef) syncRef.current = sync;
    sync();
    return () => {
      if (syncRef) syncRef.current = null;
    };
  }, [active, syncRef]);

  useEffect(() => {
    if (!active) return;

    const unsubscribe = subscribePlaybackTime?.((tSec) => {
      if (scrubbingRef.current) return;
      applyRef.current(tSec);
    });
    let raf = 0;
    const tick = () => {
      if (!scrubbingRef.current) {
        applyRef.current(getTimeRef.current?.() ?? 0);
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(raf);
      unsubscribe?.();
    };
  }, [active, subscribePlaybackTime]);

  return (
    <span
      ref={elRef}
      className="musai-score-playhead"
      data-testid="piece-score-playhead"
      data-active={active ? "true" : "false"}
      data-scrub={scrubEnabled ? "true" : "false"}
      aria-hidden
      style={{ visibility: "hidden" }}
      onPointerDown={scrubEnabled ? onPointerDown : undefined}
      onPointerMove={scrubEnabled ? onPointerMove : undefined}
      onPointerUp={scrubEnabled ? finishScrub : undefined}
      onPointerCancel={scrubEnabled ? finishScrub : undefined}
    />
  );
}
