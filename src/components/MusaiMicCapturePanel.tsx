"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { RecordingWaveformHistory } from "@/components/RecordingWaveformHistory";
import { useRecordingLevelBars } from "@/hooks/useRecordingLevelBars";
import { useScaleRecordingMotion } from "@/hooks/useScaleRecordingMotion";
import { tapFeedback } from "@/lib/motion";
import type { WaveformLiveClock } from "@/lib/recordingWaveform";

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
  /** Discard the in-progress take without analysing. */
  onDiscardRecording?: () => void;
  /** True while analysis is running — keep the record control anchored. */
  busy?: boolean;
  /** Live mic stream while recording (drives real level meter). */
  streamRef: RefObject<MediaStream | null>;
  /**
   * Optional shared values (for floating mini-recorder syncing).
   * If omitted, this component computes them internally.
   */
  elapsedLabelOverride?: string;
  levelBarsOverride?: number[];
  lastTakeLabelOverride?: string | null;
  /** Growing 0–1 amplitude history for the current take. */
  waveformSamplesOverride?: number[];
  waveformLiveRef?: RefObject<WaveformLiveClock>;
  /** Scale studio uses a tighter block so notes stay the focus. */
  density?: "comfortable" | "compact";
  /** Scale Studio recording polish (waveform + motion timelines). */
  experience?: "default" | "studio";
  /**
   * `minimal` — discard only (parent dock shows Ready).
   * `full` — Ready badge + discard (legacy standalone).
   */
  clipChrome?: "full" | "minimal";
  idleTitle?: string;
  idleHint?: string;
  startAriaLabel?: string;
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
  onDiscardRecording,
  elapsedLabel,
  lastTakeLabel = null,
  levelBars,
  waveformSamples = [],
  waveformLiveRef,
  hasSavedClip = false,
  size = "full",
  variant = "stacked",
  className = "",
  experience = "default",
  idleTitle,
  idleHint,
  startAriaLabel,
  busy = false,
}: {
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  /** Throw away the active take and return to idle. */
  onDiscardRecording?: () => void;
  /** Pre-formatted `MM:SS.cs` string. */
  elapsedLabel: string;
  lastTakeLabel?: string | null;
  /** Smoothed 0–1 levels. */
  levelBars: number[];
  /** Left-to-right amplitude history for the current take. */
  waveformSamples?: number[];
  waveformLiveRef?: RefObject<WaveformLiveClock>;
  hasSavedClip?: boolean;
  size?: "full" | "mini";
  /** `dock` is the compact floating module layout. */
  variant?: "stacked" | "dock";
  className?: string;
  experience?: "default" | "studio";
  idleTitle?: string;
  idleHint?: string;
  startAriaLabel?: string;
  busy?: boolean;
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

  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const startLabel = startAriaLabel ?? "Start recording";
  const timerLabel =
    isRecording || !lastTakeLabel ? elapsedLabel : lastTakeLabel;
  const showDiscard = Boolean(onDiscardRecording && isRecording);
  const actionLocked = busy && !isRecording;
  const caption = isRecording
    ? "Stop"
    : actionLocked
      ? "Analysing"
      : "Record";

  useEffect(() => {
    if (!isRecording) setConfirmDiscard(false);
  }, [isRecording]);

  const recordButton = (
    <button
      type="button"
      onPointerDown={() => {
        if (actionLocked) return;
        tapFeedback(isRecording ? "medium" : "light");
      }}
      onClick={() => {
        if (actionLocked) return;
        if (isRecording) onStopRecording();
        else onStartRecording();
      }}
      disabled={actionLocked}
      aria-label={
        isRecording ? "Stop recording" : actionLocked ? "Analysing take" : startLabel
      }
      aria-busy={actionLocked || undefined}
      className={`musai-vm-trigger ${studio ? "musai-vm-trigger--studio" : ""}`}
      data-recording={isRecording ? "true" : "false"}
      data-analysing={actionLocked ? "true" : "false"}
      data-testid="musai-rec-anchor"
      style={vmVars}
    >
      {isRecording ? (
        <span className="musai-vm-rec-ring" data-rec-ring aria-hidden />
      ) : null}
      <span
        className="musai-vm-core"
        data-recording={isRecording ? "true" : "false"}
        aria-hidden
      />
    </button>
  );

  if (variant === "dock") {
    return (
      <div className={className}>
        <div className="flex flex-col items-center">
          {recordButton}
          <div className="mt-1.5 flex min-h-[1.125rem] flex-col items-center justify-center">
            {isRecording ? (
              <p className="font-mono text-[11px] tabular-nums tracking-tight text-[var(--musai-muted)]">
                {elapsedLabel}
              </p>
            ) : idleTitle ? (
              <p className="text-[11px] font-semibold tabular-nums tracking-tight text-[var(--musai-ink)]">
                {idleTitle}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const statusMinH = size === "mini" ? "min-h-[3.5rem]" : "min-h-[4.75rem]";
  const statusTitle = busy && !isRecording ? "Analysing" : idleTitle;
  const statusHint = busy && !isRecording ? "Finishing this take" : idleHint;

  return (
    <div
      className={className}
      data-rec-stage
      data-studio={studio ? "true" : undefined}
    >
      <div className="musai-rec-stage">
        <div className="musai-rec-stage__status" data-rec-slot="status">
          {studio ? null : statusTitle ? (
            <p className="text-[15px] font-semibold tracking-tight text-[var(--musai-ink)]">
              {statusTitle}
            </p>
          ) : null}
          {studio ? null : statusHint ? (
            <p
              className={`${statusTitle ? "mt-0.5" : ""} text-[12px] font-medium text-[var(--musai-muted)]`}
            >
              {statusHint}
            </p>
          ) : null}
        </div>

        <div className="musai-rec-stage__button" data-rec-slot="button">
          {recordButton}
          <span
            className="musai-rec-stage__caption"
            data-recording={isRecording ? "true" : "false"}
            data-analysing={actionLocked ? "true" : "false"}
          >
            {caption}
          </span>
        </div>

        <div
          className="musai-rec-wave-well"
          data-idle={
            studio && !isRecording && !hasSavedClip ? "true" : "false"
          }
        >
          <div className="musai-rec-stage__wave" data-rec-slot="wave">
            {studio ? (
              <RecordingWaveformHistory
                samples={waveformSamples}
                live={isRecording}
                liveClockRef={waveformLiveRef}
                layout="tape"
                label={
                  isRecording
                    ? "Live recording volume history"
                    : hasSavedClip
                      ? "Recorded take volume history"
                      : "Recording volume history"
                }
              />
            ) : (
              <div
                className={`flex w-full flex-col items-center justify-center overflow-hidden ${statusMinH}`}
                aria-live="polite"
              >
                {isRecording ? (
                  <RecordingLevelMeter levels={meterBars} size={size} />
                ) : null}
              </div>
            )}
          </div>

          <div className="musai-rec-stage__timer" data-rec-slot="timer">
            <p
              className={`musai-rec-live__timer font-mono tabular-nums tracking-tight ${timerSize} ${
                isRecording
                  ? "text-[var(--musai-ok)]"
                  : "text-[var(--musai-muted)]"
              }`}
            >
              {timerLabel}
            </p>
          </div>
        </div>

        <div className="musai-rec-stage__action" data-rec-slot="action">
          {showDiscard && confirmDiscard ? (
            <div
              className="musai-rec-discard-confirm"
              role="group"
              aria-label="Discard take?"
            >
              <p className="musai-rec-discard-confirm__prompt">Discard take?</p>
              <div className="musai-rec-discard-confirm__row">
                <button
                  type="button"
                  className="musai-rec-discard musai-rec-discard--confirm"
                  onClick={() => {
                    tapFeedback("medium");
                    setConfirmDiscard(false);
                    onDiscardRecording?.();
                  }}
                >
                  Discard
                </button>
                <button
                  type="button"
                  className="musai-rec-keep"
                  onClick={() => {
                    tapFeedback("light");
                    setConfirmDiscard(false);
                  }}
                >
                  Keep recording
                </button>
              </div>
            </div>
          ) : showDiscard ? (
            <button
              type="button"
              className="musai-rec-discard"
              onClick={() => {
                tapFeedback("light");
                setConfirmDiscard(true);
              }}
            >
              Discard
            </button>
          ) : (
            <span className="musai-rec-stage__action-slot" aria-hidden />
          )}
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
      <div className="musai-mic-picker mx-auto w-full max-w-[11.5rem]">
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
  onStartRecording,
  onStopRecording,
  onDiscardRecording,
  busy = false,
  streamRef,
  elapsedLabelOverride,
  levelBarsOverride,
  lastTakeLabelOverride,
  waveformSamplesOverride,
  waveformLiveRef,
  density = "compact",
  experience = "studio",
  clipChrome = "full",
  idleTitle,
  idleHint,
  startAriaLabel,
}: MusaiMicCapturePanelProps) {
  const fallbackElapsedLabel = useRecordingElapsedLabel(isRecording);
  const fallbackLevelBars = useRecordingLevelBars(isRecording, streamRef);
  const elapsedLabel = elapsedLabelOverride ?? fallbackElapsedLabel;
  const levelBars = levelBarsOverride ?? fallbackLevelBars;
  const lastTakeLabel = lastTakeLabelOverride ?? null;
  const waveformSamples = waveformSamplesOverride ?? [];

  const compact = density === "compact";
  const stageRef = useRef<HTMLDivElement>(null);
  useScaleRecordingMotion(stageRef, isRecording, hasSavedClip);

  return (
    <div
      ref={stageRef}
      className="w-full overflow-visible [overflow-anchor:none]"
    >
      <div className="musai-rec-stage__mic px-1" data-rec-slot="mic">
        <MusaiAudioInputRow
          id={selectId}
          micDevices={micDevices}
          selectedMicId={selectedMicId}
          onMicChange={onMicChange}
          onMicRefresh={onMicRefresh}
          disabled={isRecording || busy}
          compact
        />
      </div>

      <div
        className={
          compact
            ? "flex w-full flex-col items-center px-1 pb-0 pt-0"
            : "flex w-full flex-col items-center px-6 pb-12 pt-10"
        }
      >
        <MusaiRecorderControls
          isRecording={isRecording}
          onStartRecording={onStartRecording}
          onStopRecording={onStopRecording}
          onDiscardRecording={onDiscardRecording}
          elapsedLabel={elapsedLabel}
          lastTakeLabel={lastTakeLabel}
          levelBars={levelBars}
          waveformSamples={waveformSamples}
          waveformLiveRef={waveformLiveRef}
          hasSavedClip={hasSavedClip}
          size={compact ? "mini" : "full"}
          experience={experience}
          idleTitle={idleTitle}
          idleHint={idleHint}
          startAriaLabel={startAriaLabel}
          busy={busy}
          className="w-full"
        />

        {hasSavedClip && !isRecording && clipChrome === "full" ? (
          <div
            data-rec-ready
            className="mt-2 flex w-full max-w-[280px] flex-col items-center gap-1.5"
          >
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
          </div>
        ) : null}
      </div>
    </div>
  );
}
