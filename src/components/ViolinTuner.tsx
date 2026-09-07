"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PitchDetector } from "pitchy";
import { createAudioContext } from "@/lib/audioContext";
import { describeMicOpenError, getMicStream } from "@/lib/micStream";
import { ViolinTunerFigure } from "@/components/ViolinTunerFigure";
import {
  advanceTunerHold,
  identifyTunerPitch,
  PITCH_SILENCE_MS,
  TUNER_IN_TUNE_CENTS,
  VIOLIN_STRINGS,
  type TunerHoldState,
  type TunerReading,
  type ViolinStringId,
} from "@/lib/violinTuner";

const FRAME = 4096;
const MIN_HZ = 80;
const MAX_HZ = 2000;
const METER_SPAN_CENTS = 50;

function clampCents(cents: number): number {
  return Math.max(-METER_SPAN_CENTS, Math.min(METER_SPAN_CENTS, cents));
}

function PitchBalanceMeter({
  reading,
  holding,
  holdProgress,
}: {
  reading: TunerReading | null;
  holding: boolean;
  holdProgress: number;
}) {
  const cents = reading ? clampCents(reading.cents) : 0;
  const t = (cents + METER_SPAN_CENTS) / (METER_SPAN_CENTS * 2);
  const direction = reading?.direction ?? "unclear";
  const flat = direction === "low";
  const sharp = direction === "high";
  const inTune = direction === "in_tune";
  const pocketPct = (TUNER_IN_TUNE_CENTS / METER_SPAN_CENTS) * 50;

  return (
    <div className="mx-auto w-full max-w-[19rem]">
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-1">
        <div className="flex flex-col items-center">
          <span
            className={`font-display text-[1.5rem] leading-none transition-all duration-200 ${
              flat
                ? "text-[var(--musai-accent-2)] musai-tuner-lean-flat"
                : "text-[color-mix(in_srgb,var(--musai-muted)_28%,transparent)]"
            }`}
            aria-hidden
          >
            ♭
          </span>
          <span
            className={`mt-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] ${
              flat ? "text-[var(--musai-accent-2)]" : "text-transparent"
            }`}
          >
            flat
          </span>
        </div>

        <div className="relative h-4">
          <div className="absolute inset-x-0 top-[6px] h-[6px] overflow-hidden rounded-full bg-[var(--musai-surface-2)] ring-1 ring-[var(--musai-border)]">
            {flat ? (
              <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-[color-mix(in_srgb,var(--musai-accent-2)_38%,transparent)] to-transparent" />
            ) : null}
            {sharp ? (
              <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-[color-mix(in_srgb,var(--musai-accent-2)_38%,transparent)] to-transparent" />
            ) : null}
            <div
              className={`absolute top-0 h-full -translate-x-1/2 rounded-full transition-colors duration-200 ${
                inTune
                  ? "bg-[color-mix(in_srgb,var(--musai-ok)_55%,white)]"
                  : "bg-[color-mix(in_srgb,var(--musai-ok)_18%,var(--musai-surface-2))]"
              }`}
              style={{ left: "50%", width: `${pocketPct}%` }}
            />
          </div>
          {reading ? (
            <div
              className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] shadow-[0_1px_4px_rgba(28,25,23,0.18)] transition-[left,background-color,border-color] duration-75 ease-out motion-reduce:transition-none ${
                inTune
                  ? "border-[var(--musai-ok)] bg-[var(--musai-ok)]"
                  : "border-[var(--musai-accent-2)] bg-[var(--musai-surface)]"
              }`}
              style={{ left: `${t * 100}%` }}
              aria-hidden
            />
          ) : null}
        </div>

        <div className="flex flex-col items-center">
          <span
            className={`font-display text-[1.5rem] leading-none transition-all duration-200 ${
              sharp
                ? "text-[var(--musai-accent-2)] musai-tuner-lean-sharp"
                : "text-[color-mix(in_srgb,var(--musai-muted)_28%,transparent)]"
            }`}
            aria-hidden
          >
            ♯
          </span>
          <span
            className={`mt-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] ${
              sharp ? "text-[var(--musai-accent-2)]" : "text-transparent"
            }`}
          >
            sharp
          </span>
        </div>
      </div>

      {holding ? (
        <div className="mx-auto mt-3 h-1 w-28 overflow-hidden rounded-full bg-[var(--musai-surface-2)]">
          <div
            className="h-full rounded-full bg-[var(--musai-ok)] transition-[width] duration-100 ease-out motion-reduce:transition-none"
            style={{ width: `${Math.round(holdProgress * 100)}%` }}
          />
        </div>
      ) : (
        <div className="mt-3 h-1" />
      )}
    </div>
  );
}

function spokenStatus(
  reading: TunerReading | null,
  holding: boolean,
  holdProgress: number,
  tuned: ReadonlySet<ViolinStringId>,
): string {
  if (tuned.size === VIOLIN_STRINGS.length) return "All four strings are in tune.";
  if (!reading) return "Play an open string.";
  const name = reading.pitchClassName;
  if (reading.direction === "in_tune" && reading.stringId) {
    if (tuned.has(reading.stringId)) return `${name} is in tune.`;
    if (holding) {
      return `Hold ${name}. ${Math.round(holdProgress * 100)} percent.`;
    }
    return `${name} is centered. Keep holding.`;
  }
  if (reading.direction === "low") return `${name} is flat.`;
  if (reading.direction === "high") return `${name} is sharp.`;
  return `Hearing ${name}.`;
}

export function ViolinTuner() {
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reading, setReading] = useState<TunerReading | null>(null);
  const [tuned, setTuned] = useState<ReadonlySet<ViolinStringId>>(() => new Set());
  const [holdProgress, setHoldProgress] = useState(0);
  const [holdingId, setHoldingId] = useState<ViolinStringId | null>(null);
  const [wavePhase, setWavePhase] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothedHz = useRef<number | null>(null);
  const holdRef = useRef<TunerHoldState | null>(null);
  const tunedRef = useRef(tuned);
  const lastHeardRef = useRef(0);
  const startedRef = useRef(false);

  tunedRef.current = tuned;

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
    holdRef.current = null;
    startedRef.current = false;
    lastHeardRef.current = 0;
    setListening(false);
    setReading(null);
    setHoldProgress(0);
    setHoldingId(null);
  }, []);

  const start = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setMessage(null);
    try {
      const stream = await getMicStream(null);
      const ctx = createAudioContext();
      if (!ctx) {
        stream.getTracks().forEach((t) => t.stop());
        startedRef.current = false;
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

      const applyHold = (nextReading: TunerReading | null, now: number) => {
        const next = advanceTunerHold(
          holdRef.current,
          nextReading,
          now,
          tunedRef.current,
        );
        holdRef.current = next.hold;
        setHoldProgress(next.progress);
        setHoldingId(
          next.hold && next.progress < 1 ? next.hold.stringId : null,
        );
        if (next.lock) {
          const id = next.lock;
          setTuned((prevTuned) => {
            if (prevTuned.has(id)) return prevTuned;
            const copy = new Set(prevTuned);
            copy.add(id);
            return copy;
          });
        }
      };

      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        const [pitch, clarity] = detector.findPitch(buf, ctx.sampleRate);
        const now = performance.now();
        if (
          pitch > MIN_HZ &&
          pitch < MAX_HZ &&
          clarity >= 0.78 &&
          Number.isFinite(pitch)
        ) {
          const prev = smoothedHz.current;
          const hz = prev == null ? pitch : prev * 0.72 + pitch * 0.28;
          smoothedHz.current = hz;
          lastHeardRef.current = now;
          const nextReading = identifyTunerPitch(hz);
          setWavePhase((now / 85) % 1);
          setReading(nextReading);
          applyHold(nextReading, now);
        } else if (
          lastHeardRef.current > 0 &&
          now - lastHeardRef.current >= PITCH_SILENCE_MS
        ) {
          smoothedHz.current = null;
          setReading(null);
          applyHold(null, now);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      startedRef.current = false;
      stop();
      setMessage(describeMicOpenError(err));
    }
  }, [stop]);

  useEffect(() => {
    void start();
    return () => stop();
  }, [start, stop]);

  const activeId = reading?.stringId ?? null;
  const tone = reading?.tone ?? "unclear";
  const holding = holdingId != null && holdProgress > 0 && holdProgress < 1;
  const allTuned = tuned.size === VIOLIN_STRINGS.length;
  const noteLabel = reading?.pitchClassName ?? "—";

  return (
    <section className="w-full max-w-[min(440px,100%)]">
      <div
        className={`musai-glass-surface px-5 py-5 sm:px-7 sm:py-6 ${
          listening
            ? "musai-capture-strip--live border-[color-mix(in_srgb,var(--musai-ok)_28%,var(--musai-border))]"
            : ""
        }`}
      >
        <div className="mb-3 flex justify-center">
          {listening ? (
            <span className="musai-studio-status musai-studio-status--listen">
              <span className="musai-studio-status__dot" aria-hidden />
              {holding ? "Hold" : "Listening"}
            </span>
          ) : (
            <span className="musai-studio-status musai-studio-status--ready opacity-70">
              <span className="musai-studio-status__dot" aria-hidden />
              Mic off
            </span>
          )}
        </div>

        <ViolinTunerFigure
          activeId={activeId}
          tuned={tuned}
          liveTone={activeId ? tone : null}
          holdingId={holdingId}
          holdProgress={holdProgress}
          wavePhase={wavePhase}
        />

        <div className="mt-1 text-center" aria-live="polite">
          <p
            className={`font-display text-[2rem] font-semibold tracking-tight sm:text-[2.25rem] ${
              tone === "good"
                ? "text-[var(--musai-ok)]"
                : tone === "slight"
                  ? "text-[var(--musai-warn)]"
                  : tone === "bad"
                    ? "text-[var(--musai-accent-2)]"
                    : "text-[var(--musai-muted)]"
            }`}
          >
            {noteLabel}
          </p>
        </div>

        <div className="mt-2">
          <PitchBalanceMeter
            reading={reading}
            holding={holding}
            holdProgress={holdProgress}
          />
        </div>

        <p className="sr-only" aria-live="polite">
          {spokenStatus(reading, holding, holdProgress, tuned)}
        </p>

        {allTuned ? (
          <p className="mt-4 text-center text-sm font-medium text-[var(--musai-ok)]">
            All four strings are in tune
          </p>
        ) : null}

        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (listening) stop();
              else void start();
            }}
            className="musai-btn-secondary px-4 py-2 text-[13px]"
          >
            {listening ? "Pause mic" : "Resume"}
          </button>
          {tuned.size > 0 ? (
            <button
              type="button"
              onClick={() => {
                setTuned(new Set());
                holdRef.current = null;
                setHoldProgress(0);
                setHoldingId(null);
              }}
              className="musai-btn-secondary px-4 py-2 text-[13px]"
            >
              Clear
            </button>
          ) : null}
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
