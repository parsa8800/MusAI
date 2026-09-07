"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PitchDetector } from "pitchy";
import { createAudioContext } from "@/lib/audioContext";
import { describeMicOpenError, getMicStream } from "@/lib/micStream";
import {
  identifyTunerPitch,
  VIOLIN_STRINGS,
  type TunerReading,
} from "@/lib/violinTuner";

const FRAME = 4096;
const MIN_HZ = 80;
const MAX_HZ = 2000;

function centsToNeedleDeg(cents: number): number {
  const clamped = Math.max(-50, Math.min(50, cents));
  return (clamped / 50) * 48;
}

export function ViolinTuner() {
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reading, setReading] = useState<TunerReading | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothedHz = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    smoothedHz.current = null;
    setListening(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const start = useCallback(async () => {
    setMessage(null);
    try {
      const stream = await getMicStream(null);
      const ctx = createAudioContext();
      if (!ctx) {
        stream.getTracks().forEach((t) => t.stop());
        setMessage("This browser cannot start live audio. Try Chrome.");
        return;
      }
      await ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FRAME;
      analyser.smoothingTimeConstant = 0;
      const silent = ctx.createGain();
      silent.gain.value = 0;
      source.connect(analyser);
      analyser.connect(silent);
      silent.connect(ctx.destination);

      const detector = PitchDetector.forFloat32Array(FRAME);
      detector.clarityThreshold = 0.78;
      detector.minVolumeDecibels = -42;
      const buf = new Float32Array(FRAME);

      streamRef.current = stream;
      ctxRef.current = ctx;
      setListening(true);

      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        const [pitch, clarity] = detector.findPitch(buf, ctx.sampleRate);
        if (
          pitch > MIN_HZ &&
          pitch < MAX_HZ &&
          clarity >= 0.78 &&
          Number.isFinite(pitch)
        ) {
          const prev = smoothedHz.current;
          const hz = prev == null ? pitch : prev * 0.72 + pitch * 0.28;
          smoothedHz.current = hz;
          setReading(identifyTunerPitch(hz));
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      stop();
      setMessage(describeMicOpenError(err));
    }
  }, [stop]);

  const tone = reading?.tone ?? "unclear";
  const needleDeg = reading ? centsToNeedleDeg(reading.cents) : 0;
  const directionLabel =
    !reading || reading.direction === "unclear"
      ? null
      : reading.direction === "in_tune"
        ? "In tune"
        : reading.direction === "high"
          ? "Too high"
          : "Too low";

  return (
    <section className="w-full max-w-[min(640px,100%)] space-y-6">
      <div className="musai-glass-surface overflow-hidden px-5 py-8 sm:px-10 sm:py-10">
        <div className="flex justify-center gap-2">
          {VIOLIN_STRINGS.map((s) => {
            const on = reading?.stringId === s.id;
            return (
              <span
                key={s.id}
                className={`musai-chip ${on ? "musai-chip--on" : "musai-chip--off"}`}
              >
                {s.id}
              </span>
            );
          })}
        </div>

        <div className="relative mx-auto mt-10 h-44 w-full max-w-sm">
          <div
            className="pointer-events-none absolute inset-x-8 bottom-8 top-2 rounded-t-full border border-[var(--musai-border)] border-b-0 bg-gradient-to-b from-[var(--musai-surface-2)] to-transparent"
            aria-hidden
          />
          <div
            className="absolute bottom-8 left-1/2 h-[7.5rem] w-[3px] origin-bottom rounded-full bg-[var(--musai-ink)] shadow-[0_1px_4px_rgba(28,25,23,0.12)] transition-transform duration-75 ease-out motion-reduce:transition-none"
            style={{ transform: `translateX(-50%) rotate(${needleDeg}deg)` }}
            aria-hidden
          />
          <div className="absolute bottom-6 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-[var(--musai-muted)]" />
          <p className="absolute bottom-0 left-0 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--musai-muted)]">
            Low
          </p>
          <p className="absolute bottom-0 right-0 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--musai-muted)]">
            High
          </p>
        </div>

        <div className="mt-4 text-center">
          <p
            className={`text-4xl font-semibold tracking-tight ${
              tone === "good"
                ? "text-[var(--musai-ok)]"
                : tone === "slight"
                  ? "text-[var(--musai-warn)]"
                  : tone === "bad"
                    ? "text-[var(--musai-accent-2)]"
                    : "text-[var(--musai-muted)]"
            }`}
          >
            {reading?.targetLabel ?? "—"}
          </p>
          {directionLabel ? (
            <p className="mt-2 text-sm font-medium text-[var(--musai-muted)]">
              {directionLabel}
            </p>
          ) : null}
          {reading ? (
            <p className="mt-1 font-mono text-[12px] tabular-nums text-[var(--musai-muted)]">
              {reading.cents >= 0 ? "+" : ""}
              {reading.cents.toFixed(1)} cents
            </p>
          ) : null}
        </div>

        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => (listening ? stop() : void start())}
            className="musai-btn-primary"
          >
            {listening ? "Stop" : "Listen"}
          </button>
        </div>

        {message ? (
          <p
            className="musai-glass-inset mt-5 border-[color-mix(in_srgb,var(--musai-accent-2)_30%,var(--musai-border))] bg-[color-mix(in_srgb,var(--musai-accent-2)_8%,white)] px-4 py-3 text-center text-sm text-[var(--musai-accent-2)]"
            role="alert"
          >
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
