"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useRecordingLevelBars } from "@/hooks/useRecordingLevelBars";

function formatElapsedLabel(ms: number): string {
  const capped = Math.max(0, ms);
  const m = Math.floor(capped / 60000);
  const s = Math.floor((capped % 60000) / 1000);
  const cs = Math.floor((capped % 1000) / 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

/**
 * Shared recorder UI values (timer + live input levels) for keeping
 * main + floating recorders perfectly in sync without duplicating logic.
 */
export function useSyncedRecorderUi(
  isRecording: boolean,
  streamRef: RefObject<MediaStream | null>,
) {
  const [elapsedLabel, setElapsedLabel] = useState("00:00.00");
  const [lastTakeLabel, setLastTakeLabel] = useState<string | null>(null);
  const startPerfRef = useRef<number | null>(null);
  const prevRecordingRef = useRef(false);
  const levelBars = useRecordingLevelBars(isRecording, streamRef);

  useEffect(() => {
    if (!isRecording) {
      // Capture final duration before we reset (for the post-recording “ready” state).
      if (prevRecordingRef.current && elapsedLabel !== "00:00.00") {
        queueMicrotask(() => setLastTakeLabel(elapsedLabel));
      }
      prevRecordingRef.current = false;
      startPerfRef.current = null;
      queueMicrotask(() => setElapsedLabel("00:00.00"));
      return;
    }

    prevRecordingRef.current = true;
    if (startPerfRef.current == null) {
      startPerfRef.current = performance.now();
    }

    let raf = 0;
    const tick = () => {
      if (startPerfRef.current == null) return;
      setElapsedLabel(formatElapsedLabel(performance.now() - startPerfRef.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [elapsedLabel, isRecording]);

  return { elapsedLabel, lastTakeLabel, levelBars };
}

