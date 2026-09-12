"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useRecordingLevelBars } from "@/hooks/useRecordingLevelBars";
import { useRecordingWaveformHistory } from "@/hooks/useRecordingWaveformHistory";

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
  const elapsedRef = useRef("00:00.00");
  const prevRecordingRef = useRef(false);
  const skipLastTakeRef = useRef(false);
  const levelBars = useRecordingLevelBars(isRecording, streamRef);
  const {
    samples: waveformSamples,
    samplesRef: waveformRef,
    liveClockRef: waveformLiveRef,
    clearSamples,
  } = useRecordingWaveformHistory(isRecording, streamRef);

  const resetTakeUi = useCallback(() => {
    skipLastTakeRef.current = true;
    elapsedRef.current = "00:00.00";
    setLastTakeLabel(null);
    setElapsedLabel("00:00.00");
    clearSamples();
  }, [clearSamples]);

  useEffect(() => {
    if (!isRecording) {
      if (prevRecordingRef.current && !skipLastTakeRef.current) {
        const frozen = elapsedRef.current;
        if (frozen !== "00:00.00") setLastTakeLabel(frozen);
      } else if (skipLastTakeRef.current) {
        setLastTakeLabel(null);
        elapsedRef.current = "00:00.00";
        setElapsedLabel("00:00.00");
      }
      skipLastTakeRef.current = false;
      prevRecordingRef.current = false;
      startPerfRef.current = null;
      return;
    }

    prevRecordingRef.current = true;
    skipLastTakeRef.current = false;
    setLastTakeLabel(null);
    if (startPerfRef.current == null) {
      startPerfRef.current = performance.now();
    }

    let raf = 0;
    let live = true;
    const tick = () => {
      if (!live || startPerfRef.current == null) return;
      const next = formatElapsedLabel(performance.now() - startPerfRef.current);
      elapsedRef.current = next;
      setElapsedLabel(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      live = false;
      cancelAnimationFrame(raf);
    };
  }, [isRecording]);

  return {
    elapsedLabel,
    lastTakeLabel,
    levelBars,
    waveformSamples,
    waveformRef,
    waveformLiveRef,
    resetTakeUi,
  };
}
