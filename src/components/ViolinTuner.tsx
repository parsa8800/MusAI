"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PitchDetector } from "pitchy";
import { createAudioContext } from "@/lib/audioContext";
import { describeMicOpenError, getMicStream } from "@/lib/micStream";
import { useInstrument } from "@/components/InstrumentProvider";
import { prefersReducedMotion } from "@/lib/motion";
import { rmsFromTimeDomain } from "@/lib/recordingWaveform";
import type { TunerMotionFrame } from "@/lib/tunerStringMotion";
import {
  IDLE_TUNER_METER,
  stepTunerMeter,
  TUNER_METER_FIT_CENTS,
  TUNER_METER_SPAN_CENTS,
  tunerMeterPercents,
  tunerMeterSide,
} from "@/lib/tunerMeterMotion";
import { tunerStringsFor } from "@/lib/instrument";
import { ViolinTunerFigure } from "@/components/ViolinTunerFigure";
import {
  advanceTunerHold,
  ALL_TUNED_RESET_MS,
  identifyTunerPitch,
  PITCH_SILENCE_MS,
  pruneTunedToInstrument,
  TUNER_IN_TUNE_CENTS,
  tunerCueCopy,
  type TunerHoldState,
  type TunerOpenString,
  type TunerReading,
  type TunerStringId,
} from "@/lib/violinTuner";

const FRAME = 4096;
const MIN_HZ = 80;
const MAX_HZ = 2000;

function useGlidingTunerCents(sample: number | null): number {
  const sampleRef = useRef(sample);
  sampleRef.current = sample;
  const motionRef = useRef(IDLE_TUNER_METER);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const next = stepTunerMeter(
        motionRef.current,
        sampleRef.current,
        now,
        now - last,
        prefersReducedMotion(),
      );
      last = now;
      motionRef.current = next;
      setShown((prev) => (prev === next.shown ? prev : next.shown));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return shown;
}

function PitchBalanceMeter({
  reading,
  holding,
  holdProgress,
  idle,
}: {
  reading: TunerReading | null;
  holding: boolean;
  holdProgress: number;
  idle: boolean;
}) {
  const shown = useGlidingTunerCents(reading ? reading.cents : null);
  const side = tunerMeterSide(shown);
  const flat = reading != null && side === "low";
  const sharp = reading != null && side === "high";
  const inTune = reading != null && side === "in_tune";
  const { left, fillLeft, fillWidth } = tunerMeterPercents(shown);
  const showNeedle = reading != null || Math.abs(shown) >= 0.8;
  const fitted = Math.abs(shown) <= TUNER_METER_FIT_CENTS;
  const needleTone = fitted || inTune ? "ok" : shown < 0 ? "low" : shown > 0 ? "high" : "ok";
  const wellPct = (TUNER_IN_TUNE_CENTS / TUNER_METER_SPAN_CENTS) * 100;

  return (
    <div
      className="musai-tuner-meter"
      data-idle={idle ? "true" : "false"}
      data-cents={shown.toFixed(1)}
      data-side={reading ? side : "idle"}
      data-fit={fitted && reading ? "true" : "false"}
    >
      <div className="musai-tuner-meter__row">
        <div className="musai-tuner-meter__end">
          <span
            className={`musai-tuner-meter__accidental font-display ${
              flat
                ? "text-[var(--musai-pitch-low)] musai-tuner-lean-flat"
                : "text-[color-mix(in_srgb,var(--musai-pitch-low)_38%,transparent)]"
            }`}
            aria-hidden
          >
            ♭
          </span>
          <span
            className={`musai-tuner-meter__caption ${
              flat
                ? "text-[var(--musai-pitch-low)]"
                : "text-[color-mix(in_srgb,var(--musai-muted)_55%,transparent)]"
            }`}
          >
            low
          </span>
        </div>

        <div className="musai-tuner-meter__track">
          <div
            className="musai-tuner-meter__well"
            style={{ width: `${wellPct}%` }}
            data-in-well={inTune ? "true" : "false"}
          />
          <div className="musai-tuner-meter__bar">
            {fillWidth > 0.4 ? (
              <div
                className={`musai-tuner-meter__fill ${
                  shown < 0
                    ? "musai-tuner-meter__fill--low"
                    : "musai-tuner-meter__fill--high"
                }`}
                style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}
              />
            ) : null}
          </div>
          <div
            className="musai-tuner-meter__slot"
            data-fit={fitted && reading ? "true" : "false"}
            aria-hidden
          />
          {showNeedle ? (
            <div
              className={`musai-tuner-meter__needle musai-tuner-meter__gem ${
                needleTone === "ok"
                  ? "musai-tuner-meter__needle--ok"
                  : needleTone === "low"
                    ? "musai-tuner-meter__needle--low"
                    : "musai-tuner-meter__needle--high"
              }`}
              data-fit={fitted && reading ? "true" : "false"}
              style={{ left: `${left}%` }}
              aria-hidden
            />
          ) : null}
        </div>

        <div className="musai-tuner-meter__end">
          <span
            className={`musai-tuner-meter__accidental font-display ${
              sharp
                ? "text-[var(--musai-pitch-high)] musai-tuner-lean-sharp"
                : "text-[color-mix(in_srgb,var(--musai-pitch-high)_38%,transparent)]"
            }`}
            aria-hidden
          >
            ♯
          </span>
          <span
            className={`musai-tuner-meter__caption ${
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
        <div className="musai-tuner-meter__hold">
          <div
            className="musai-tuner-meter__hold-fill"
            style={{ width: `${Math.round(holdProgress * 100)}%` }}
          />
        </div>
      ) : (
        <div className="musai-tuner-meter__hold musai-tuner-meter__hold--spacer" />
      )}
    </div>
  );
}

function spokenStatus(
  reading: TunerReading | null,
  holding: boolean,
  holdProgress: number,
  tuned: ReadonlySet<TunerStringId>,
  layout: readonly TunerOpenString[],
  instrument: ReturnType<typeof useInstrument>["instrument"],
): string {
  if (layout.length > 0 && layout.every((s) => tuned.has(s.id))) {
    return `All ${layout.length} strings are in tune.`;
  }
  if (!reading) return `${tunerCueCopy(reading, instrument).headline}.`;
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

export function Tuner() {
  const { instrument } = useInstrument();
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reading, setReading] = useState<TunerReading | null>(null);
  const [tuned, setTuned] = useState<ReadonlySet<TunerStringId>>(() => new Set());
  const [holdProgress, setHoldProgress] = useState(0);
  const [holdingId, setHoldingId] = useState<TunerStringId | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothedHz = useRef<number | null>(null);
  const holdRef = useRef<TunerHoldState | null>(null);
  const tunedRef = useRef(tuned);
  const lastStringRef = useRef<TunerStringId | null>(null);
  const lastHeardRef = useRef(0);
  const startedRef = useRef(false);
  const instrumentRef = useRef(instrument);
  const stringMotionRef = useRef<TunerMotionFrame>({
    activeId: null,
    hz: 196,
    rms: 0,
    cents: 0,
    inTune: false,
    alive: false,
  });

  tunedRef.current = tuned;
  instrumentRef.current = instrument;

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
    stringMotionRef.current = {
      activeId: null,
      hz: stringMotionRef.current.hz,
      rms: 0,
      cents: 0,
      inTune: false,
      alive: false,
    };
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
      stringMotionRef.current.alive = true;

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
          if (tunedRef.current.has(id)) return;
          const copy = new Set(tunedRef.current);
          copy.add(id);
          tunedRef.current = copy;
          setTuned(copy);
        }
      };

      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        const [pitch, clarity] = detector.findPitch(buf, ctx.sampleRate);
        const now = performance.now();
        const rms = rmsFromTimeDomain(buf);
        const heard = instrumentRef.current;
        const minHz =
          heard.openStrings.length > 0 ? MIN_HZ : heard.pitch.minHz;
        const maxHz =
          heard.openStrings.length > 0 ? MAX_HZ : heard.pitch.maxHz;
        if (
          pitch > minHz &&
          pitch < maxHz &&
          clarity >= 0.78 &&
          Number.isFinite(pitch)
        ) {
          const prev = smoothedHz.current;
          const hz = prev == null ? pitch : prev * 0.8 + pitch * 0.2;
          smoothedHz.current = hz;
          lastHeardRef.current = now;
          const nextReading = identifyTunerPitch(
            hz,
            lastStringRef.current,
            instrumentRef.current,
          );
          lastStringRef.current = nextReading?.stringId ?? lastStringRef.current;
          stringMotionRef.current = {
            activeId: nextReading?.stringId ?? null,
            hz,
            rms,
            cents: nextReading?.cents ?? 0,
            inTune: nextReading?.direction === "in_tune",
            alive: true,
          };
          setReading(nextReading);
          applyHold(nextReading, now);
        } else if (
          lastHeardRef.current > 0 &&
          now - lastHeardRef.current >= PITCH_SILENCE_MS
        ) {
          smoothedHz.current = null;
          lastStringRef.current = null;
          stringMotionRef.current = {
            ...stringMotionRef.current,
            activeId: null,
            rms: 0,
            inTune: false,
            alive: true,
          };
          setReading(null);
          applyHold(null, now);
        } else {
          stringMotionRef.current = {
            ...stringMotionRef.current,
            rms,
            alive: true,
          };
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
    const nextTuned = pruneTunedToInstrument(tunedRef.current, instrument);
    tunedRef.current = nextTuned;
    setTuned(nextTuned);
    setReading(null);
    lastStringRef.current = null;
    holdRef.current = null;
    setHoldProgress(0);
    setHoldingId(null);
    stringMotionRef.current = {
      ...stringMotionRef.current,
      activeId: null,
      rms: 0,
      inTune: false,
    };
  }, [instrument]);

  useEffect(() => {
    const layout = tunerStringsFor(instrument);
    if (layout.length === 0 || !layout.every((s) => tuned.has(s.id))) return;
    const timer = window.setTimeout(() => {
      setTuned(new Set());
      holdRef.current = null;
      setHoldProgress(0);
      setHoldingId(null);
    }, ALL_TUNED_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [instrument, tuned]);

  const layout = tunerStringsFor(instrument);
  const activeId = reading?.stringId ?? null;
  const holding = holdingId != null && holdProgress > 0 && holdProgress < 1;
  const allTuned = layout.length > 0 && layout.every((s) => tuned.has(s.id));
  const idle = listening && !reading && !holding && !allTuned;

  return (
    <section className="musai-tuner">
      <div
        className={`musai-glass-surface musai-tuner-shell ${
          listening ? "musai-tuner-shell--live" : ""
        } ${allTuned ? "musai-tuner-shell--all-tuned" : ""}`}
      >
        <div className="musai-tuner-board">
          {layout.length > 0 ? (
            <ViolinTunerFigure
              strings={layout}
              activeId={activeId}
              tuned={tuned}
              liveDirection={reading?.direction ?? null}
              holdingId={holdingId}
              holdProgress={holdProgress}
              motionRef={stringMotionRef}
              idle={idle}
            />
          ) : (
            <p className="musai-tuner-pitch font-display">
              {reading?.targetLabel ?? "—"}
            </p>
          )}

          <PitchBalanceMeter
            reading={reading}
            holding={holding}
            holdProgress={holdProgress}
            idle={idle}
          />
        </div>

        <p className="sr-only" aria-live="polite">
          {spokenStatus(reading, holding, holdProgress, tuned, layout, instrument)}
        </p>

        {message ? (
          <div className="musai-tuner-alert">
            <p
              className="musai-glass-inset musai-tuner-alert__copy"
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

export { Tuner as ViolinTuner };
