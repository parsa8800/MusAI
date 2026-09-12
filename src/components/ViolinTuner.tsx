"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PitchDetector } from "pitchy";
import { createAudioContext } from "@/lib/audioContext";
import { describeMicOpenError, getMicStream } from "@/lib/micStream";
import { ViolinTunerFigure } from "@/components/ViolinTunerFigure";
import {
  advanceTunerHold,
  ALL_TUNED_RESET_MS,
  identifyTunerPitch,
  PITCH_SILENCE_MS,
  TUNER_IN_TUNE_CENTS,
  tunerCueCopy,
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
  const fillLeft = Math.min(t, 0.5) * 100;
  const fillWidth = reading ? Math.abs(t - 0.5) * 100 : 0;
  const pocketPct = (TUNER_IN_TUNE_CENTS / METER_SPAN_CENTS) * 50;

  return (
    <div className="mx-auto w-full max-w-[21rem]">
      <div className="grid grid-cols-[3rem_minmax(0,1fr)_3rem] items-center gap-1.5">
        <div className="flex flex-col items-center">
          <span
            className={`font-display text-[1.65rem] leading-none ${
              flat
                ? "text-[var(--musai-pitch-low)] musai-tuner-lean-flat"
                : "text-[color-mix(in_srgb,var(--musai-pitch-low)_38%,transparent)]"
            }`}
            aria-hidden
          >
            ♭
          </span>
          <span
            className={`mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
              flat
                ? "text-[var(--musai-pitch-low)]"
                : "text-[color-mix(in_srgb,var(--musai-muted)_55%,transparent)]"
            }`}
          >
            low
          </span>
        </div>

        <div className="relative h-8">
          <div className="absolute inset-x-0 top-1/2 h-[10px] -translate-y-1/2 overflow-hidden rounded-full bg-[var(--musai-surface-2)] ring-1 ring-[var(--musai-border)]">
            <div
              className="absolute top-0 h-full -translate-x-1/2 rounded-full bg-[color-mix(in_srgb,var(--musai-ok)_22%,var(--musai-surface-2))]"
              style={{ left: "50%", width: `${pocketPct}%` }}
            />
            {reading && fillWidth > 0.8 ? (
              <div
                className={`absolute top-0 h-full ${
                  flat
                    ? "bg-[color-mix(in_srgb,var(--musai-pitch-low)_55%,transparent)]"
                    : sharp
                      ? "bg-[color-mix(in_srgb,var(--musai-pitch-high)_55%,transparent)]"
                      : "bg-transparent"
                }`}
                style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}
              />
            ) : null}
            <div
              className="absolute top-0 h-full w-[2px] -translate-x-1/2 bg-[color-mix(in_srgb,var(--musai-ink)_28%,transparent)]"
              style={{ left: "50%" }}
            />
          </div>
          {reading ? (
            <div
              className={`absolute top-1/2 h-7 w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_1px_6px_rgba(0,0,0,0.28)] transition-[left,background-color] duration-75 ease-out motion-reduce:transition-none ${
                inTune
                  ? "bg-[var(--musai-ok)]"
                  : flat
                    ? "bg-[var(--musai-pitch-low)]"
                    : "bg-[var(--musai-pitch-high)]"
              }`}
              style={{ left: `${t * 100}%` }}
              aria-hidden
            />
          ) : null}
        </div>

        <div className="flex flex-col items-center">
          <span
            className={`font-display text-[1.65rem] leading-none ${
              sharp
                ? "text-[var(--musai-pitch-high)] musai-tuner-lean-sharp"
                : "text-[color-mix(in_srgb,var(--musai-pitch-high)_38%,transparent)]"
            }`}
            aria-hidden
          >
            ♯
          </span>
          <span
            className={`mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
              sharp
                ? "text-[var(--musai-pitch-high)]"
                : "text-[color-mix(in_srgb,var(--musai-muted)_55%,transparent)]"
            }`}
          >
            high
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
  const cue = tunerCueCopy(reading);
  if (!reading) return `${cue.headline}. ${cue.hint}.`;
  const name = reading.stringId ?? reading.pitchClassName;
  if (reading.direction === "in_tune") {
    if (reading.stringId && tuned.has(reading.stringId)) {
      return `${name} is in tune.`;
    }
    if (holding) {
      return `Hold ${name}. ${Math.round(holdProgress * 100)} percent.`;
    }
    return `${name} is in tune. Keep holding.`;
  }
  if (reading.direction === "low") return `${name} is too low. Go higher.`;
  if (reading.direction === "high") return `${name} is too high. Go lower.`;
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
  const lastStringRef = useRef<ViolinStringId | null>(null);
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
    lastStringRef.current = null;
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
          const hz = prev == null ? pitch : prev * 0.8 + pitch * 0.2;
          smoothedHz.current = hz;
          lastHeardRef.current = now;
          const nextReading = identifyTunerPitch(hz, lastStringRef.current);
          lastStringRef.current = nextReading?.stringId ?? lastStringRef.current;
          setWavePhase((now / 85) % 1);
          setReading(nextReading);
          applyHold(nextReading, now);
        } else if (
          lastHeardRef.current > 0 &&
          now - lastHeardRef.current >= PITCH_SILENCE_MS
        ) {
          smoothedHz.current = null;
          lastStringRef.current = null;
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

  useEffect(() => {
    if (tuned.size !== VIOLIN_STRINGS.length) return;
    const timer = window.setTimeout(() => {
      setTuned(new Set());
      holdRef.current = null;
      setHoldProgress(0);
      setHoldingId(null);
    }, ALL_TUNED_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [tuned]);

  const activeId = reading?.stringId ?? null;
  const holding = holdingId != null && holdProgress > 0 && holdProgress < 1;
  const allTuned = tuned.size === VIOLIN_STRINGS.length;
  const cue = tunerCueCopy(reading);
  const cueColor =
    reading?.direction === "in_tune"
      ? "text-[var(--musai-ok)]"
      : reading?.direction === "low"
        ? "text-[var(--musai-pitch-low)]"
        : reading?.direction === "high"
          ? "text-[var(--musai-pitch-high)]"
          : "text-[var(--musai-muted)]";

  return (
    <section className="w-full max-w-[min(440px,100%)]">
      <div
        className={`musai-glass-surface musai-tuner-shell px-5 py-5 sm:px-7 sm:py-6 ${
          listening ? "musai-tuner-shell--live" : ""
        }`}
      >
        <div
          className="musai-tuner-live"
          aria-hidden
          data-active={listening ? "true" : "false"}
          data-holding={holding ? "true" : "false"}
        >
          {listening ? <span className="musai-tuner-live__pulse" /> : null}
        </div>

        <ViolinTunerFigure
          activeId={activeId}
          tuned={tuned}
          liveDirection={reading?.direction ?? null}
          holdingId={holdingId}
          holdProgress={holdProgress}
          wavePhase={wavePhase}
        />

        <div className="mt-1 text-center" aria-live="polite">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--musai-muted)]">
            {reading?.stringId ? `${reading.stringId} string` : "Open string"}
          </p>
          <p
            className={`mt-1 font-display text-[2rem] font-semibold tracking-tight sm:text-[2.25rem] ${cueColor}`}
          >
            {reading?.direction === "low"
              ? "↑ Too low"
              : reading?.direction === "high"
                ? "↓ Too high"
                : cue.headline}
          </p>
          <p className={`mt-0.5 text-[13px] font-medium ${cueColor} opacity-80`}>
            {cue.hint}
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

        {message ? (
          <div className="mt-5 flex flex-col items-center gap-3">
            <p
              className="musai-glass-inset w-full border-[color-mix(in_srgb,var(--musai-accent-2)_30%,var(--musai-border))] bg-[color-mix(in_srgb,var(--musai-accent-2)_8%,white)] px-4 py-3 text-center text-sm text-[var(--musai-accent-2)]"
              role="alert"
            >
              {message}
            </p>
            <button
              type="button"
              onClick={() => void start()}
              className="musai-btn-secondary px-4 py-2 text-[13px]"
            >
              Try mic again
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
