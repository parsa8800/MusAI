"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PitchDetector } from "pitchy";
import { createAudioContext } from "@/lib/audioContext";
import { describeMicOpenError, getMicStream } from "@/lib/micStream";
import {
  identifyTunerPitch,
  VIOLIN_STRINGS,
  type TunerReading,
  type ViolinStringId,
} from "@/lib/violinTuner";

const FRAME = 4096;
const MIN_HZ = 80;
const MAX_HZ = 2000;
/** Hold in-tune this long before locking a string as green. */
const IN_TUNE_HOLD_MS = 420;

function centsToNeedleDeg(cents: number): number {
  const clamped = Math.max(-50, Math.min(50, cents));
  return (clamped / 50) * 42;
}

type StringVisualState = "idle" | "active" | "tuned";

function stringState(
  id: ViolinStringId,
  activeId: ViolinStringId | null,
  tuned: ReadonlySet<ViolinStringId>,
): StringVisualState {
  if (tuned.has(id)) return "tuned";
  if (activeId === id) return "active";
  return "idle";
}

/**
 * Open strings from a quiet shoulder-rest / over-the-scroll view:
 * G → E left to right, player’s perspective.
 */
function ViolinOpenStringsView({
  activeId,
  tuned,
  liveTone,
}: {
  activeId: ViolinStringId | null;
  tuned: ReadonlySet<ViolinStringId>;
  liveTone: TunerReading["tone"] | null;
}) {
  return (
    <div className="relative mx-auto w-full max-w-[22rem]" aria-hidden>
      <svg
        viewBox="0 0 280 220"
        className="h-auto w-full"
        role="img"
        aria-label="Violin open strings G D A E"
      >
        <defs>
          <linearGradient id="musai-fb" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ebe4da" />
            <stop offset="100%" stopColor="#ddd4c6" />
          </linearGradient>
          <linearGradient id="musai-rest" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d8cfc2" />
            <stop offset="100%" stopColor="#c9beb0" />
          </linearGradient>
        </defs>

        {/* Soft shoulder-rest / lower bout cue */}
        <ellipse
          cx="140"
          cy="198"
          rx="108"
          ry="18"
          fill="url(#musai-rest)"
          opacity="0.55"
        />
        <path
          d="M48 188 C70 172 100 164 140 164 C180 164 210 172 232 188"
          fill="none"
          stroke="var(--musai-border)"
          strokeWidth="1.25"
          opacity="0.9"
        />

        {/* Fingerboard plane */}
        <path
          d="M86 28 L194 28 L208 176 L72 176 Z"
          fill="url(#musai-fb)"
          stroke="var(--musai-border)"
          strokeWidth="1"
        />
        <path
          d="M100 28 L180 28"
          stroke="color-mix(in srgb, var(--musai-ink) 12%, transparent)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {VIOLIN_STRINGS.map((s, i) => {
          const state = stringState(s.id, activeId, tuned);
          const xTop = 112 + i * 18.5;
          const xBot = 98 + i * 28;
          const thickness = 1.35 + (3 - i) * 0.35;
          const isActive = state === "active";
          const isTuned = state === "tuned";

          let stroke = "color-mix(in srgb, var(--musai-ink) 38%, var(--musai-border))";
          if (isTuned) stroke = "var(--musai-ok)";
          else if (isActive) {
            if (liveTone === "good") stroke = "var(--musai-ok)";
            else if (liveTone === "slight") stroke = "var(--musai-warn)";
            else if (liveTone === "bad") stroke = "var(--musai-accent-2)";
            else stroke = "var(--musai-ink)";
          }

          return (
            <g key={s.id}>
              {isActive ? (
                <line
                  x1={xTop}
                  y1={34}
                  x2={xBot}
                  y2={172}
                  stroke={stroke}
                  strokeWidth={thickness + 5}
                  strokeLinecap="round"
                  opacity={0.14}
                />
              ) : null}
              <line
                x1={xTop}
                y1={34}
                x2={xBot}
                y2={172}
                stroke={stroke}
                strokeWidth={isActive ? thickness + 0.55 : thickness}
                strokeLinecap="round"
                className={isActive && !isTuned ? "musai-string-pulse" : undefined}
                style={{
                  transition:
                    "stroke 220ms ease, stroke-width 220ms ease, opacity 220ms ease",
                }}
              />
              <text
                x={xBot}
                y={208}
                textAnchor="middle"
                className="font-display"
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  fill: isTuned
                    ? "var(--musai-ok)"
                    : isActive
                      ? "var(--musai-ink)"
                      : "var(--musai-muted)",
                  transition: "fill 220ms ease",
                }}
              >
                {s.id}
              </text>
              {isTuned ? (
                <circle
                  cx={xBot}
                  cy={190}
                  r="2.4"
                  fill="var(--musai-ok)"
                  opacity="0.85"
                />
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function ViolinTuner() {
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reading, setReading] = useState<TunerReading | null>(null);
  const [tuned, setTuned] = useState<ReadonlySet<ViolinStringId>>(
    () => new Set(),
  );

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothedHz = useRef<number | null>(null);
  const holdRef = useRef<{ id: ViolinStringId; since: number } | null>(null);
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
    holdRef.current = null;
    startedRef.current = false;
    setListening(false);
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
        if (
          pitch > MIN_HZ &&
          pitch < MAX_HZ &&
          clarity >= 0.78 &&
          Number.isFinite(pitch)
        ) {
          const prev = smoothedHz.current;
          const hz = prev == null ? pitch : prev * 0.72 + pitch * 0.28;
          smoothedHz.current = hz;
          const next = identifyTunerPitch(hz);
          setReading(next);

          if (
            next?.stringId &&
            next.direction === "in_tune" &&
            next.tone === "good"
          ) {
            const id = next.stringId;
            const now = performance.now();
            const hold = holdRef.current;
            if (!hold || hold.id !== id) {
              holdRef.current = { id, since: now };
            } else if (now - hold.since >= IN_TUNE_HOLD_MS) {
              setTuned((prevTuned) => {
                if (prevTuned.has(id)) return prevTuned;
                const copy = new Set(prevTuned);
                copy.add(id);
                return copy;
              });
            }
          } else {
            holdRef.current = null;
          }
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
  const needleDeg = reading ? centsToNeedleDeg(reading.cents) : 0;
  const directionLabel =
    !reading || reading.direction === "unclear"
      ? null
      : reading.direction === "in_tune"
        ? "In tune"
        : reading.direction === "high"
          ? "High"
          : "Low";

  const allTuned = tuned.size === VIOLIN_STRINGS.length;

  return (
    <section className="w-full max-w-[min(640px,100%)] space-y-5">
      <div
        className={`musai-glass-surface overflow-hidden px-5 py-7 sm:px-9 sm:py-9 ${
          listening ? "musai-capture-strip--live border-[color-mix(in_srgb,var(--musai-ok)_28%,var(--musai-border))]" : ""
        }`}
      >
        <div className="mb-5 flex justify-center">
          {listening ? (
            <span className="musai-studio-status musai-studio-status--listen">
              <span className="musai-studio-status__dot" aria-hidden />
              Listening
            </span>
          ) : (
            <span className="musai-studio-status musai-studio-status--ready opacity-70">
              <span className="musai-studio-status__dot" aria-hidden />
              Mic off
            </span>
          )}
        </div>

        <ViolinOpenStringsView
          activeId={activeId}
          tuned={tuned}
          liveTone={activeId ? tone : null}
        />

        <div className="relative mx-auto mt-2 h-20 w-full max-w-xs">
          <div
            className="pointer-events-none absolute inset-x-6 bottom-5 top-0 rounded-t-full border border-[var(--musai-border)] border-b-0 bg-gradient-to-b from-[var(--musai-surface-2)] to-transparent opacity-80"
            aria-hidden
          />
          <div
            className="absolute bottom-5 left-1/2 h-[3.75rem] w-[2.5px] origin-bottom rounded-full bg-[var(--musai-ink)] shadow-[0_1px_3px_rgba(28,25,23,0.1)] transition-transform duration-75 ease-out motion-reduce:transition-none"
            style={{ transform: `translateX(-50%) rotate(${needleDeg}deg)` }}
            aria-hidden
          />
          <div className="absolute bottom-4 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-[var(--musai-muted)]" />
        </div>

        <div className="mt-1 text-center" aria-live="polite">
          <p
            className={`font-display text-[2.35rem] font-semibold tracking-tight sm:text-5xl ${
              tone === "good"
                ? "text-[var(--musai-ok)]"
                : tone === "slight"
                  ? "text-[var(--musai-warn)]"
                  : tone === "bad"
                    ? "text-[var(--musai-accent-2)]"
                    : "text-[var(--musai-muted)]"
            }`}
          >
            {reading?.pitchClassName ?? "—"}
          </p>
          <div className="mt-1.5 flex items-center justify-center gap-2 text-sm text-[var(--musai-muted)]">
            {directionLabel ? (
              <span className="font-medium text-[var(--musai-ink)]">
                {directionLabel}
              </span>
            ) : (
              <span>{listening ? "Play a string" : "Waiting"}</span>
            )}
            {reading ? (
              <>
                <span className="text-[var(--musai-border)]" aria-hidden>
                  ·
                </span>
                <span className="font-mono text-[12px] tabular-nums">
                  {reading.cents >= 0 ? "+" : ""}
                  {reading.cents.toFixed(1)}¢
                </span>
              </>
            ) : null}
          </div>
          {allTuned ? (
            <p className="mt-3 text-sm font-medium text-[var(--musai-ok)]">
              All tuned
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex justify-center">
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
