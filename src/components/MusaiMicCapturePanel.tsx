"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { LiveRecordingWaveform } from "@/components/motion/LiveRecordingWaveform";
import { useRecordingLevelBars } from "@/hooks/useRecordingLevelBars";
import { useScaleRecordingMotion } from "@/hooks/useScaleRecordingMotion";

type MusaiMicCapturePanelProps = {
  /** Unique id for the microphone `<select>` (accessibility). */
  selectId: string;
  micDevices: MediaDeviceInfo[];
  selectedMicId: string;
  onMicChange: (deviceId: string) => void;
  onMicRefresh: () => void;
  isRecording: boolean;
  hasSavedClip: boolean;
  onDiscardClip: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  /** Live mic stream while recording (drives real level meter). */
  streamRef: RefObject<MediaStream | null>;
  /**
   * Optional shared values (for floating mini-recorder syncing).
   * If omitted, this component computes them internally.
   */
  elapsedLabelOverride?: string;
  levelBarsOverride?: number[];
  lastTakeLabelOverride?: string | null;
  /** Scale studio uses a tighter block so notes stay the focus. */
  density?: "comfortable" | "compact";
  /** Scale Studio recording polish (waveform + motion timelines). */
  experience?: "default" | "studio";
};

const METER_MAX_PX = 30;

function formatRecordingElapsed(ms: number): string {
  const capped = Math.max(0, ms);
  const m = Math.floor(capped / 60000);
  const s = Math.floor((capped % 60000) / 1000);
  const cs = Math.floor((capped % 1000) / 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function useRecordingElapsedLabel(isRecording: boolean): string {
  const [label, setLabel] = useState("00:00.00");
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRecording) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      startRef.current = null;
      queueMicrotask(() => setLabel("00:00.00"));
      return;
    }

    startRef.current = performance.now();
    const tick = () => {
      if (startRef.current == null) return;
      setLabel(formatRecordingElapsed(performance.now() - startRef.current));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isRecording]);

  return label;
}

function RecordingLevelMeter({
  levels,
  size,
}: {
  levels: number[];
  size: "full" | "mini";
}) {
  const maxPx = size === "mini" ? 14 : METER_MAX_PX;
  const maxW = size === "mini" ? "max-w-[140px]" : "max-w-[220px]";
  const gap = size === "mini" ? "gap-[2px]" : "gap-[3px]";
  return (
    <div
      className={`flex h-7 w-full items-end justify-center px-2 ${maxW} ${gap}`}
      role="img"
      aria-label="Microphone input level"
    >
      {levels.map((lv, i) => (
        <span
          key={i}
          className={`musai-capture-meter-bar w-[2px] max-w-[2px] shrink-0 rounded-full ${
            size === "mini" ? "bg-zinc-300/45" : "bg-zinc-300/55"
          }`}
          style={{
            height: `${Math.max(3, Math.round(lv * maxPx))}px`,
            opacity: 0.28 + lv * 0.52,
          }}
        />
      ))}
    </div>
  );
}

export function MusaiRecorderControls({
  isRecording,
  onStartRecording,
  onStopRecording,
  elapsedLabel,
  levelBars,
  size = "full",
  variant = "stacked",
  className = "",
  experience = "default",
}: {
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  /** Pre-formatted `MM:SS.cs` string. */
  elapsedLabel: string;
  /** Smoothed 0–1 levels. */
  levelBars: number[];
  size?: "full" | "mini";
  /** `dock` is the compact floating module layout. */
  variant?: "stacked" | "dock";
  className?: string;
  experience?: "default" | "studio";
}) {
  const studio = experience === "studio";
  const meterBars = useMemo(() => {
    // In mini mode we intentionally downsample the strip to reduce visual noise.
    if (size === "full" || studio) return levelBars;
    const take = 18;
    const step = Math.max(1, Math.floor(levelBars.length / take));
    const picked: number[] = [];
    for (let i = 0; i < levelBars.length; i += step) picked.push(levelBars[i]!);
    return picked.slice(0, take);
  }, [levelBars, size, studio]);

  const timerSize = size === "mini" && !studio ? "text-[12px]" : "text-[15px]";
  const labelSize = size === "mini" && !studio ? "text-[10px]" : "text-[11px]";
  const vmVars: CSSProperties | undefined =
    size === "mini" && !studio
      ? ({
          ["--musai-vm-trigger"]: "72px",
          ["--musai-vm-core-idle"]: "52px",
          ["--musai-vm-core-rec"]: "18px",
          ["--musai-vm-core-rec-radius"]: "4px",
        } as unknown as CSSProperties)
      : studio && size === "mini"
        ? ({
            ["--musai-vm-trigger"]: "88px",
            ["--musai-vm-core-idle"]: "64px",
            ["--musai-vm-core-rec"]: "22px",
            ["--musai-vm-core-rec-radius"]: "5px",
          } as unknown as CSSProperties)
        : undefined;

  if (variant === "dock") {
    return (
      <div className={className}>
        <div className="flex flex-col items-center">
          <button
            type="button"
            onClick={isRecording ? onStopRecording : onStartRecording}
            aria-label={isRecording ? "Stop recording" : "Start recording"}
            className="musai-vm-trigger"
            data-recording={isRecording ? "true" : "false"}
            style={vmVars}
          >
            <span
              className="pointer-events-none absolute inset-0 rounded-full border border-white/[0.2]"
              aria-hidden
            />
            {isRecording ? (
              <span className="musai-vm-rec-ring" aria-hidden />
            ) : null}
            <span
              className="musai-vm-core"
              data-recording={isRecording ? "true" : "false"}
              aria-hidden
            />
          </button>

          <div className="mt-1.5 flex h-[1.125rem] items-center justify-center">
            {isRecording ? (
              <p className="font-mono text-[11px] tabular-nums tracking-tight text-zinc-400">
                {elapsedLabel}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const statusMinH = studio
    ? isRecording
      ? "min-h-[4.75rem]"
      : "min-h-0"
    : size === "mini"
      ? "min-h-[3.5rem]"
      : "min-h-[4.75rem]";

  return (
    <div className={className} data-rec-stage>
      <div className="flex flex-col items-center">
        <button
          type="button"
          onClick={isRecording ? onStopRecording : onStartRecording}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
          className={`musai-vm-trigger ${studio ? "musai-vm-trigger--studio" : ""}`}
          data-recording={isRecording ? "true" : "false"}
          style={vmVars}
        >
          <span
            className="pointer-events-none absolute inset-0 rounded-full border border-white/[0.2]"
            aria-hidden
          />
          {isRecording ? (
            <span
              className="musai-vm-rec-ring"
              data-rec-ring
              aria-hidden
            />
          ) : null}
          <span
            className="musai-vm-core"
            data-recording={isRecording ? "true" : "false"}
            aria-hidden
          />
        </button>

        <div
          className={`mt-1.5 flex w-full flex-col items-center justify-start overflow-hidden ${statusMinH}`}
          aria-live="polite"
        >
          {isRecording ? (
            <div
              data-rec-live
              className="flex w-full flex-col items-center justify-start"
            >
              {studio ? (
                <LiveRecordingWaveform
                  levels={meterBars}
                  height={size === "mini" ? 32 : 40}
                  tone="studio"
                />
              ) : (
                <RecordingLevelMeter levels={meterBars} size={size} />
              )}
              <div className="mt-2 flex flex-col items-center justify-start gap-0.5 text-center">
                <p
                  className={`font-mono tabular-nums tracking-tight ${
                    studio ? "text-rose-100/90" : "text-zinc-400"
                  } ${timerSize}`}
                >
                  {elapsedLabel}
                </p>
                {size === "mini" && !studio ? null : (
                  <p
                    className={`font-medium ${
                      studio ? "text-rose-300/80" : "text-zinc-500"
                    } ${labelSize}`}
                  >
                    Recording
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p
              data-rec-idle
              className={
                studio
                  ? "sr-only"
                  : size === "mini"
                    ? "mt-1 text-[12px] text-zinc-500"
                    : "mt-2 text-[13px] text-zinc-500"
              }
            >
              {studio ? "Start recording" : "Tap to Record"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function MusaiAudioInputRow({
  id,
  micDevices,
  selectedMicId,
  onMicChange,
  onMicRefresh,
  disabled,
  compact = false,
}: {
  id: string;
  micDevices: MediaDeviceInfo[];
  selectedMicId: string;
  onMicChange: (deviceId: string) => void;
  onMicRefresh: () => void;
  disabled: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`mx-auto w-full ${compact ? "max-w-[220px]" : "max-w-[260px]"}`}>
      <label
        htmlFor={id}
        className={
          compact
            ? "sr-only"
            : "mb-2 block text-center text-[11px] font-medium tracking-wide text-zinc-500"
        }
      >
        Input
      </label>
      <div className="relative">
        <select
          id={id}
          value={selectedMicId}
          onChange={(e) => onMicChange(e.target.value)}
          onFocus={() => void onMicRefresh()}
          disabled={disabled}
          className="musai-field-select pr-9"
        >
          <option value="">Default</option>
          {micDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label?.trim() || `Input ${d.deviceId.slice(0, 8)}`}
            </option>
          ))}
        </select>
        <span
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
          aria-hidden
        >
          <svg
            viewBox="0 0 20 20"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 7l5 5 5-5"
            />
          </svg>
        </span>
      </div>
    </div>
  );
}

/**
 * Shared mic input + Voice Memos–style record control (tuning + scale).
 */
export function MusaiMicCapturePanel({
  selectId,
  micDevices,
  selectedMicId,
  onMicChange,
  onMicRefresh,
  isRecording,
  hasSavedClip,
  onDiscardClip,
  onStartRecording,
  onStopRecording,
  streamRef,
  elapsedLabelOverride,
  levelBarsOverride,
  lastTakeLabelOverride,
  density = "comfortable",
  experience = "default",
}: MusaiMicCapturePanelProps) {
  const fallbackElapsedLabel = useRecordingElapsedLabel(isRecording);
  const fallbackLevelBars = useRecordingLevelBars(isRecording, streamRef);
  const elapsedLabel = elapsedLabelOverride ?? fallbackElapsedLabel;
  const levelBars = levelBarsOverride ?? fallbackLevelBars;
  const lastTakeLabel = lastTakeLabelOverride ?? null;

  const compact = density === "compact";
  const studio = experience === "studio";
  const stageRef = useRef<HTMLDivElement>(null);
  useScaleRecordingMotion(stageRef, isRecording, hasSavedClip);

  return (
    <div
      ref={stageRef}
      className={
        compact
          ? "overflow-visible [overflow-anchor:none]"
          : "musai-glass-inset overflow-visible [overflow-anchor:none]"
      }
    >
      <div
        className={
          compact
            ? `px-1 pt-1 transition-opacity duration-300 motion-reduce:transition-none ${
                isRecording && studio ? "opacity-40" : "opacity-100"
              }`
            : "border-b border-white/[0.05] px-5 py-4 sm:px-6"
        }
      >
        <MusaiAudioInputRow
          id={selectId}
          micDevices={micDevices}
          selectedMicId={selectedMicId}
          onMicChange={onMicChange}
          onMicRefresh={onMicRefresh}
          disabled={isRecording}
          compact={compact}
        />
      </div>

      <div
        className={
          compact
            ? "flex flex-col items-center px-2 pb-2 pt-3"
            : "flex flex-col items-center px-6 pb-20 pt-16 sm:pb-24 sm:pt-20"
        }
      >
        <MusaiRecorderControls
          isRecording={isRecording}
          onStartRecording={onStartRecording}
          onStopRecording={onStopRecording}
          elapsedLabel={elapsedLabel}
          levelBars={levelBars}
          size={compact ? "mini" : "full"}
          experience={experience}
        />

        {hasSavedClip ? (
          <div
            data-rec-ready
            className={
              compact
                ? `mt-2 flex w-full max-w-[280px] flex-col items-center gap-1.5 ${isRecording ? "invisible" : ""}`
                : `mt-6 flex w-full max-w-[360px] flex-col items-center gap-3 ${isRecording ? "invisible" : ""}`
            }
            aria-hidden={isRecording}
          >
            <div
              className={`musai-glass-inset flex w-full items-center justify-between gap-3 rounded-full border-emerald-500/18 bg-emerald-500/[0.05] ${
                compact ? "px-3.5 py-2" : "px-4 py-3"
              } ${studio ? "shadow-[0_0_28px_rgba(16,185,129,0.12)]" : ""}`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/20"
                  aria-hidden
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.1}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </span>
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold tracking-tight text-emerald-100/95">
                    Ready
                  </p>
                </div>
              </div>
              {lastTakeLabel ? (
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-400">
                  {lastTakeLabel}
                </span>
              ) : null}
            </div>

            <button
              type="button"
              className="text-[12px] font-medium text-zinc-500 underline decoration-zinc-600/80 underline-offset-2 transition-colors duration-200 hover:text-zinc-300"
              onClick={onDiscardClip}
            >
              Discard recording
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
