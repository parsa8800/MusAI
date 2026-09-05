"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createAudioContext } from "@/lib/audioContext";

/** Bar count for the live level strip (thin, Voice Memos–adjacent). */
export const MUSAI_CAPTURE_METER_BARS = 28;

/**
 * Smoothed 0–1 levels per bar from the live mic stream while recording.
 * Idle / not recording returns a low baseline (unused visually when hidden).
 */
export function useRecordingLevelBars(
  isRecording: boolean,
  streamRef: RefObject<MediaStream | null>,
): number[] {
  const [levels, setLevels] = useState(() =>
    Array.from({ length: MUSAI_CAPTURE_METER_BARS }, () => 0.08),
  );
  const smoothRef = useRef<Float32Array | null>(null);
  const displayRef = useRef<Float32Array | null>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    if (!isRecording) {
      queueMicrotask(() => {
        setLevels(
          Array.from({ length: MUSAI_CAPTURE_METER_BARS }, () => 0.08),
        );
      });
      return;
    }

    const stream = streamRef.current;
    if (!stream) return;

    let ctx: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;

    const n = MUSAI_CAPTURE_METER_BARS;
    smoothRef.current = new Float32Array(n).fill(0.06);
    displayRef.current = new Float32Array(n).fill(0.08);

    try {
      ctx = createAudioContext();
      if (!ctx) return;
      void ctx.resume();
      source = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.86;
      source.connect(analyser);
    } catch {
      smoothRef.current = null;
      displayRef.current = null;
      return;
    }

    const bufferLength = analyser.frequencyBinCount;
    const data = new Uint8Array(bufferLength);
    const perBin = Math.max(1, Math.floor(bufferLength / n));
    let raf = 0;

    const tick = () => {
      if (!analyser || !smoothRef.current || !displayRef.current) return;
      raf = requestAnimationFrame(tick);
      analyser.getByteFrequencyData(data);
      frameRef.current += 1;

      const smooth = smoothRef.current;
      const disp = displayRef.current;
      let peak = 0;
      const raw: number[] = [];

      for (let b = 0; b < n; b++) {
        let maxv = 0;
        const start = b * perBin;
        const end = Math.min(start + perBin, bufferLength);
        for (let j = start; j < end; j++) {
          maxv = Math.max(maxv, data[j]! / 255);
        }
        const centerWeight =
          1 - (Math.abs(b - (n - 1) / 2) / Math.max((n - 1) / 2, 1)) * 0.22;
        const shaped = maxv * (0.48 + 0.52 * centerWeight);
        smooth[b] = smooth[b]! * 0.56 + shaped * 0.44;
        const v = Math.min(1, smooth[b]! * 2.15 + 0.035);
        raw.push(v);
        peak = Math.max(peak, v);
      }

      const quiet = peak < 0.11;
      const t = performance.now() / 1000;
      const next: number[] = [];
      for (let b = 0; b < n; b++) {
        const r = raw[b]!;
        const drift =
          0.065 +
          Math.sin(t * 1.12 + b * 0.38) * (quiet ? 0.038 : 0.012) +
          Math.sin(t * 0.58 + b * 0.17) * (quiet ? 0.028 : 0.009);
        const target = quiet ? drift * 0.82 + r * 0.18 : r * 0.9 + drift * 0.1;
        disp[b] = disp[b]! * 0.66 + target * 0.34;
        next.push(Math.min(1, Math.max(0.055, disp[b]!)));
      }

      if (frameRef.current % 2 === 0) {
        setLevels(next);
      }
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      try {
        source?.disconnect();
        analyser?.disconnect();
        void ctx?.close();
      } catch {
        /* ignore */
      }
      smoothRef.current = null;
      displayRef.current = null;
    };
  }, [isRecording, streamRef]);

  return levels;
}
