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
  /** Discard mid-take and restart without analysing. */
  onRetakeRecording?: () => void;
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
  /**
   * `minimal` — discard only (parent dock shows Ready).
   * `full` — Ready badge + discard (legacy standalone).
   */
  clipChrome?: "full" | "minimal";
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
          className="musai-capture-meter-bar w-[2px] max-w-[2px] shrink-0 rounded-full"
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
  onRetakeRecording,
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
  /** Discard the current take and start again without analysing. */
  onRetakeRecording?: () => void;
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
              className="pointer-events-none absolute inset-0 rounded-full border border-[var(--musai-border)]"
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
              <p className="font-mono text-[11px] tabular-nums tracking-tight text-[var(--musai-muted)]">
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
        {!isRecording ? (
          <p data-rec-idle-label className="sr-only">
            Record
          </p>
        ) : (
          <p
            className="musai-rec-live-hint mb-2.5"
            aria-live="polite"
          >
            <span className="musai-rec-live-hint__dot" aria-hidden />
            Recording · tap to stop
          </p>
        )}
        <button
          type="button"
          onClick={isRecording ? onStopRecording : onStartRecording}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
          className={`musai-vm-trigger ${studio ? "musai-vm-trigger--studio" : ""} ${
            !isRecording
              ? "ring-2 ring-[color-mix(in_srgb,var(--musai-accent-2)_35%,transparent)] ring-offset-2 ring-offset-[var(--musai-bg)]"
              : ""
          }`}
          data-recording={isRecording ? "true" : "false"}
          style={vmVars}
        >
          <span
            className="pointer-events-none absolute inset-0 rounded-full border border-[var(--musai-border)]"
            aria-hidden
          />
          {isRecording ? (
            <span className="musai-vm-rec-ring" data-rec-ring aria-hidden />
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
              className="musai-rec-live flex w-full flex-col items-center justify-start"
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
              <div className="musai-rec-live__meta mt-2.5 flex flex-col items-center gap-2.5 text-center">
                <p
                  className={`musai-rec-live__timer font-mono tabular-nums tracking-tight text-[var(--musai-accent-2)] ${timerSize}`}
                >
                  {elapsedLabel}
                </p>
                {onRetakeRecording ? (
                  <button
                    type="button"
                    onClick={onRetakeRecording}
                    className="musai-rec-retake"
                  >
                    Retake
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MicGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3a3 3 0 00-3 3v5a3 3 0 006 0V6a3 3 0 00-3-3z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 11a7 7 0 01-14 0M12 18v3"
      />
    </svg>
  );
}

function ChevronGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 7.5l5 5 5-5"
      />
    </svg>
  );
}

function selectedMicLabel(
  selectedMicId: string,
  micDevices: MediaDeviceInfo[],
): string {
  if (!selectedMicId.trim()) return "Default microphone";
  const match = micDevices.find((d) => d.deviceId === selectedMicId);
  const raw = match?.label?.trim();
  if (!raw) return "Microphone";
  return raw.length > 34 ? `${raw.slice(0, 32)}…` : raw;
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
  const label = selectedMicLabel(selectedMicId, micDevices);

  if (compact) {
    return (
      <div className="musai-mic-picker mx-auto w-full max-w-[16.5rem]">
        <label htmlFor={id} className="sr-only">
          Microphone input
        </label>
        <span className="musai-mic-picker__icon" aria-hidden>
          <MicGlyph className="h-3.5 w-3.5" />
        </span>
        <select
          id={id}
          value={selectedMicId}
          onChange={(e) => onMicChange(e.target.value)}
          onFocus={() => void onMicRefresh()}
          disabled={disabled}
          className="musai-mic-picker__select"
          aria-label={`Microphone: ${label}`}
          title={label}
        >
          <option value="">Default microphone</option>
          {micDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label?.trim() || `Input ${d.deviceId.slice(0, 8)}`}
            </option>
          ))}
        </select>
        <span className="musai-mic-picker__chevron" aria-hidden>
          <ChevronGlyph className="h-3.5 w-3.5" />
        </span>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[260px]">
      <label
        htmlFor={id}
        className="mb-2 block text-center text-[11px] font-medium tracking-wide text-[var(--musai-muted)]"
      >
        Microphone
      </label>
      <div className="musai-mic-picker">
        <span className="musai-mic-picker__icon" aria-hidden>
          <MicGlyph className="h-3.5 w-3.5" />
        </span>
        <select
          id={id}
          value={selectedMicId}
          onChange={(e) => onMicChange(e.target.value)}
          onFocus={() => void onMicRefresh()}
          disabled={disabled}
          className="musai-mic-picker__select"
        >
          <option value="">Default microphone</option>
          {micDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label?.trim() || `Input ${d.deviceId.slice(0, 8)}`}
            </option>
          ))}
        </select>
        <span className="musai-mic-picker__chevron" aria-hidden>
          <ChevronGlyph className="h-3.5 w-3.5" />
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
  onRetakeRecording,
  streamRef,
  elapsedLabelOverride,
  levelBarsOverride,
  lastTakeLabelOverride,
  density = "compact",
  experience = "studio",
  clipChrome = "full",
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
      className="overflow-visible [overflow-anchor:none]"
    >
      {!isRecording ? (
        <div className="mb-2 px-1">
          <MusaiAudioInputRow
            id={selectId}
            micDevices={micDevices}
            selectedMicId={selectedMicId}
            onMicChange={onMicChange}
            onMicRefresh={onMicRefresh}
            disabled={isRecording}
            compact
          />
        </div>
      ) : null}

      <div
        className={
          compact
            ? "flex flex-col items-center px-2 pb-1 pt-2"
            : "flex flex-col items-center px-6 pb-12 pt-10"
        }
      >
        <MusaiRecorderControls
          isRecording={isRecording}
          onStartRecording={onStartRecording}
          onStopRecording={onStopRecording}
          onRetakeRecording={onRetakeRecording}
          elapsedLabel={elapsedLabel}
          levelBars={levelBars}
          size={compact ? "mini" : "full"}
          experience={experience}
        />

        {hasSavedClip && !isRecording ? (
          <div
            data-rec-ready
            className="mt-2 flex w-full max-w-[280px] flex-col items-center gap-1.5"
          >
            {clipChrome === "full" ? (
              <div className="musai-glass-inset flex w-full items-center justify-between gap-3 rounded-[var(--musai-radius)] border-[color-mix(in_srgb,var(--musai-ok)_28%,var(--musai-border))] bg-[var(--musai-accent-soft)] px-3.5 py-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--musai-surface)] text-[var(--musai-ok)] ring-1 ring-[color-mix(in_srgb,var(--musai-ok)_25%,transparent)]"
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
                  <p className="text-[12px] font-semibold tracking-tight text-[var(--musai-ok)]">
                    Ready
                  </p>
                </div>
                {lastTakeLabel ? (
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--musai-muted)]">
                    {lastTakeLabel}
                  </span>
                ) : null}
              </div>
            ) : lastTakeLabel ? (
              <p className="font-mono text-[11px] tabular-nums text-[var(--musai-muted)]">
                {lastTakeLabel}
              </p>
            ) : null}

            <button
              type="button"
              className="text-[12px] font-medium text-[var(--musai-muted)] underline decoration-[var(--musai-border)] underline-offset-2 transition-colors duration-200 hover:text-[var(--musai-ink)]"
              onClick={onDiscardClip}
            >
              Discard
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
