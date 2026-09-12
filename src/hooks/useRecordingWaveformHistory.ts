"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import { createAudioContext } from "@/lib/audioContext";
import {
  WAVEFORM_LIVE_MAX,
  WAVEFORM_SAMPLE_MS,
  createWaveformCollector,
  rmsFromTimeDomain,
  shapeRecordingAmplitude,
  smoothAmplitude,
  type WaveformLiveClock,
} from "@/lib/recordingWaveform";

/**
 * Amplitude history for the current take, sampled from the existing mic stream.
 * Live samples stay on a ref (canvas reads them). State is flushed when recording stops.
 */
export function useRecordingWaveformHistory(
  isRecording: boolean,
  streamRef: RefObject<MediaStream | null>,
): {
  samples: number[];
  samplesRef: MutableRefObject<number[]>;
  liveClockRef: MutableRefObject<WaveformLiveClock>;
  clearSamples: () => void;
} {
  const [samples, setSamples] = useState<number[]>([]);
  const samplesRef = useRef<number[]>([]);
  const liveClockRef = useRef<WaveformLiveClock>({ samples: [], times: [] });
  const collectorRef = useRef(createWaveformCollector());
  const discardedRef = useRef(false);

  const writeClock = (next: number[], times: number[]) => {
    samplesRef.current = next;
    liveClockRef.current.samples = next;
    liveClockRef.current.times = times;
  };

  const clearSamples = useCallback(() => {
    discardedRef.current = true;
    collectorRef.current = createWaveformCollector();
    writeClock([], []);
    setSamples([]);
  }, []);

  useEffect(() => {
    if (!isRecording) return;

    discardedRef.current = false;
    const collector = createWaveformCollector(WAVEFORM_LIVE_MAX);
    collectorRef.current = collector;
    writeClock([], []);
    queueMicrotask(() => setSamples([]));

    let ctx: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let raf = 0;
    let lastPush = 0;
    let smoothed = 0;
    let hasSmooth = false;
    const times: number[] = [];

    const attach = (stream: MediaStream) => {
      ctx = createAudioContext();
      if (!ctx) return false;
      void ctx.resume();
      source = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.18;
      source.connect(analyser);
      return true;
    };

    const stream = streamRef.current;
    if (!stream) return;
    try {
      if (!attach(stream)) return;
    } catch {
      return;
    }

    const data = new Float32Array(analyser!.fftSize);

    const tick = (now: number) => {
      if (!analyser) return;
      raf = requestAnimationFrame(tick);
      if (now - lastPush < WAVEFORM_SAMPLE_MS) return;
      lastPush = now;
      analyser.getFloatTimeDomainData(data);
      const raw = shapeRecordingAmplitude(rmsFromTimeDomain(data));
      smoothed = hasSmooth ? smoothAmplitude(smoothed, raw) : raw;
      hasSmooth = true;
      collector.push(smoothed);
      times.push(now);
      if (times.length > WAVEFORM_LIVE_MAX) {
        times.splice(0, times.length - WAVEFORM_LIVE_MAX);
      }
      writeClock(collector.snapshot(), times.slice());
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      if (discardedRef.current) {
        writeClock([], []);
        queueMicrotask(() => setSamples([]));
      } else {
        const frozen = collector.snapshot();
        writeClock(frozen, times.slice());
        queueMicrotask(() => setSamples(frozen));
      }
      try {
        source?.disconnect();
        analyser?.disconnect();
        void ctx?.close();
      } catch {
        /* ignore */
      }
    };
  }, [isRecording, streamRef]);

  return { samples, samplesRef, liveClockRef, clearSamples };
}
