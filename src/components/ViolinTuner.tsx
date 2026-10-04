"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PitchDetector } from "pitchy";
import { createAudioContext } from "@/lib/audioContext";
import { describeMicOpenError, getMicStream } from "@/lib/micStream";
import { prefersReducedMotion } from "@/lib/motion";
import {
  IDLE_TUNER_METER,
  stepTunerMeter,
  TUNER_METER_SPAN_CENTS,
  tunerMeterSide,
} from "@/lib/tunerMeterMotion";
import {
  IDLE_TUNER_COPY,
  IDLE_TUNER_COPY_HOLD,
  IDLE_TUNER_REEL,
  stepTunerCopy,
  stepTunerReel,
  tunerReelNote,
  type TunerPhraseSample,
  type TunerReelMotion,
  type TunerSettledCopy,
} from "@/lib/tunerNoteReel";
import {
  identifyTunerPitch,
  PITCH_SILENCE_MS,
  tunerCentsLabel,
  type TunerReading,
} from "@/lib/violinTuner";

const FRAME = 4096;
const MIN_HZ = 40;
const MAX_HZ = 4200;
const NEEDLE_SWING_DEG = 52;
const DIAL_TICKS = [-50, -20, 0, 20, 50] as const;
const REEL_CELL_PX = 92;

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

function needleDegrees(cents: number): number {
  const clamped = Math.max(
    -TUNER_METER_SPAN_CENTS,
    Math.min(TUNER_METER_SPAN_CENTS, cents),
  );
  return (clamped / TUNER_METER_SPAN_CENTS) * NEEDLE_SWING_DEG;
}

function dialPoint(cents: number, radius: number): { x: number; y: number } {
  const rad = (needleDegrees(cents) * Math.PI) / 180;
  return {
    x: 140 + Math.sin(rad) * radius,
    y: 168 - Math.cos(rad) * radius,
  };
}

function useGlidingReel(sample: TunerReading | null): TunerReelMotion {
  const sampleRef = useRef(sample);
  sampleRef.current = sample;
  const motionRef = useRef(IDLE_TUNER_REEL);
  const [motion, setMotion] = useState(IDLE_TUNER_REEL);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const reading = sampleRef.current;
      const next = stepTunerReel(
        motionRef.current,
        reading
          ? { pitchClass: reading.pitchClass, cents: reading.cents }
          : null,
        now - last,
        prefersReducedMotion(),
      );
      last = now;
      motionRef.current = next;
      setMotion((prev) =>
        prev.resting === next.resting && Math.abs(prev.shown - next.shown) < 0.0008
          ? prev
          : next,
      );
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return motion;
}

function useSettledTunerCopy(sample: TunerPhraseSample | null): TunerSettledCopy {
  const sampleRef = useRef(sample);
  sampleRef.current = sample;
  const holdRef = useRef(IDLE_TUNER_COPY_HOLD);
  const [shown, setShown] = useState<TunerSettledCopy>(IDLE_TUNER_COPY);

  useEffect(() => {
    let raf = 0;
    const frame = (now: number) => {
      const next = stepTunerCopy(holdRef.current, sampleRef.current, now);
      holdRef.current = next;
      setShown((prev) =>
        prev.name === next.shown.name &&
        prev.phrase === next.shown.phrase &&
        prev.side === next.shown.side
          ? prev
          : next.shown,
      );
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return shown;
}

function letterPresence(distance: number): { opacity: number; scale: number } {
  const d = Math.abs(distance);
  return {
    opacity: Math.max(0, 1 - d / 2.65),
    scale: 1 - Math.min(d, 2.2) * 0.07,
  };
}

function TunerReel({ reading }: { reading: TunerReading | null }) {
  const motion = useGlidingReel(reading);
  const start = Math.floor(motion.shown) - 5;
  const letters = [];
  for (let index = start; index <= Math.ceil(motion.shown) + 5; index += 1) {
    const distance = index - motion.shown;
    const presence = letterPresence(distance);
    letters.push(
      <span
        key={index}
        className="musai-tuner-reel__letter font-display"
        data-note={tunerReelNote(index)}
        style={{
          opacity: motion.resting ? 0 : presence.opacity,
          transform: `translate(-50%, -50%) translateX(${distance * REEL_CELL_PX}px) scale(${presence.scale})`,
        }}
      >
        {tunerReelNote(index)}
      </span>,
    );
  }

  return (
    <div
      className="musai-tuner-reel"
      data-idle={motion.resting ? "true" : "false"}
      aria-hidden
    >
      <div className="musai-tuner-reel__window">{letters}</div>
      <div className="musai-tuner-reel__sheen" />
      {motion.resting ? (
        <p className="musai-tuner-reel__idle font-display">Play a note</p>
      ) : null}
    </div>
  );
}

function TunerNeedle({
  cents,
  heard,
}: {
  cents: number | null;
  heard: boolean;
}) {
  const shown = useGlidingTunerCents(cents);
  const side = heard ? tunerMeterSide(shown) : "idle";
  const deg = needleDegrees(shown);

  return (
    <div
      className="musai-tuner-dial"
      data-idle={heard ? "false" : "true"}
      data-side={side}
      data-cents={shown.toFixed(1)}
    >
      <svg
        className="musai-tuner-dial__svg"
        viewBox="0 0 280 188"
        aria-hidden
      >
        {DIAL_TICKS.map((cents) => {
          const outer = dialPoint(cents, 108);
          const inner = dialPoint(cents, cents === 0 ? 88 : 96);
          return (
            <line
              key={cents}
              className={
                cents === 0
                  ? "musai-tuner-dial__tick musai-tuner-dial__tick--zero"
                  : "musai-tuner-dial__tick"
              }
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
            />
          );
        })}
        <g transform={`rotate(${deg} 140 168)`}>
          <line
            className="musai-tuner-dial__needle"
            x1="140"
            y1="168"
            x2="140"
            y2="62"
          />
          <circle className="musai-tuner-dial__pivot" cx="140" cy="168" r="5.5" />
        </g>
      </svg>
    </div>
  );
}

function spokenStatus(copy: TunerSettledCopy): string {
  if (!copy.name) return "Play a note.";
  if (copy.phrase === "In tune") return `${copy.name} is in tune.`;
  return `${copy.name}, ${copy.phrase}.`;
}

export function Tuner() {
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reading, setReading] = useState<TunerReading | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothedHz = useRef<number | null>(null);
  const lastHeardRef = useRef(0);
  const startedRef = useRef(false);

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
    startedRef.current = false;
    lastHeardRef.current = 0;
    setListening(false);
    setReading(null);
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
          const hz = prev == null ? pitch : prev * 0.62 + pitch * 0.38;
          smoothedHz.current = hz;
          lastHeardRef.current = now;
          setReading(identifyTunerPitch(hz));
        } else if (
          lastHeardRef.current > 0 &&
          now - lastHeardRef.current >= PITCH_SILENCE_MS
        ) {
          smoothedHz.current = null;
          setReading(null);
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

  const heardRef = useRef(false);
  if (reading) heardRef.current = true;
  const heldCents =
    reading && Number.isFinite(reading.cents) ? reading.cents : null;
  const centsRef = useRef<number | null>(null);
  if (heldCents != null) centsRef.current = heldCents;
  const needleCents = heardRef.current ? centsRef.current : null;
  const settled = useSettledTunerCopy(
    reading
      ? {
          name: tunerReelNote(reading.pitchClass),
          phrase: tunerCentsLabel(reading),
          side:
            reading.direction === "low" || reading.direction === "high"
              ? reading.direction
              : "in_tune",
        }
      : null,
  );

  return (
    <section className="musai-tuner">
      <div
        className={`musai-glass-surface musai-tuner-shell ${
          listening ? "musai-tuner-shell--live" : ""
        }`}
      >
        <div className="musai-tuner-board">
          <TunerReel reading={reading} />

          <TunerNeedle cents={needleCents} heard={heardRef.current} />

          <p className="musai-tuner-cents" data-side={settled.side}>
            {settled.phrase}
          </p>
        </div>

        <p className="sr-only" aria-live="polite">
          {spokenStatus(settled)}
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
