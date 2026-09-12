"use client";

import type { ChangeEvent, ReactNode, RefObject } from "react";
import { AudioActivityVisualizer } from "@/components/AudioActivityVisualizer";
import { MusaiMicCapturePanel } from "@/components/MusaiMicCapturePanel";
import { MusaiSegmentedControl } from "@/components/MusaiSegmentedControl";
import { AnimatedReveal } from "@/components/motion/AnimatedReveal";
import { tapFeedback } from "@/lib/motion";
import type { WaveformLiveClock } from "@/lib/recordingWaveform";

export type MusaiCaptureMode = "record" | "upload";

type Props = {
  selectId: string;
  captureMode: MusaiCaptureMode;
  onCaptureMode: (mode: MusaiCaptureMode) => void;
  isRecording: boolean;
  recordedBlob: Blob | null;
  file: File | null;
  uploadProcessing: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  mainRecorderRef: RefObject<HTMLDivElement | null>;
  micDevices: MediaDeviceInfo[];
  selectedMicId: string;
  onMicChange: (id: string) => void;
  onMicRefresh: () => void;
  onDiscardClip: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  /** Discard the in-progress take without analysing. */
  onDiscardRecording?: () => void;
  streamRef: RefObject<MediaStream | null>;
  elapsedLabel: string;
  levelBars: number[];
  lastTakeLabel: string | null;
  waveformSamples?: number[];
  /** Live Voice Memos clock (canvas). Persistence still uses waveformSamples. */
  waveformLiveRef?: RefObject<WaveformLiveClock>;
  message: string | null;
  status: "idle" | "loading" | "error";
  canAnalyze: boolean;
  onAnalyze: () => void;
  analyzeLabel?: string;
  /** When true, hide Analyse — parent runs analysis automatically after capture. */
  hideAnalyze?: boolean;
  /** Next attempt in the scale loop (Take 2, Play it again). */
  nextTake?: {
    label: string;
    hint: string;
    ariaLabel: string;
    again?: boolean;
  } | null;
  /** Idle recorder hint when `nextTake` is not used (Tuning trainer). */
  idleHint?: string;
  /**
   * `studio` = Scale Studio compact module under the staff.
   * Omit for Tuning trainer / other full capture docks.
   */
  module?: "studio";
};

function CaptureStagePanel({
  mode,
  active,
  children,
}: {
  mode: MusaiCaptureMode;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="musai-capture-strip__panel"
      data-mode={mode}
      data-active={active ? "true" : "false"}
      aria-hidden={active ? undefined : true}
      inert={active ? undefined : true}
    >
      {children}
    </div>
  );
}

/**
 * Shared capture dock for Scale Studio and Tuning trainer.
 * Mode switch stays pinned; Record and Import share one stacked stage.
 */
export function MusaiCaptureDock({
  selectId,
  captureMode,
  onCaptureMode,
  isRecording,
  recordedBlob,
  file,
  uploadProcessing,
  fileInputRef,
  onFileChange,
  mainRecorderRef,
  micDevices,
  selectedMicId,
  onMicChange,
  onMicRefresh,
  onDiscardClip,
  onStartRecording,
  onStopRecording,
  onDiscardRecording,
  streamRef,
  elapsedLabel,
  levelBars,
  lastTakeLabel,
  waveformSamples = [],
  waveformLiveRef,
  message,
  status,
  canAnalyze,
  onAnalyze,
  analyzeLabel = "Analyse",
  hideAnalyze = false,
  nextTake = null,
  idleHint,
  module,
}: Props) {
  const analysing = status === "loading" || uploadProcessing;
  const ready =
    !analysing &&
    ((captureMode === "record" && !!recordedBlob) ||
      (captureMode === "upload" && !!file));
  const showRecord = captureMode === "record";

  return (
    <div
      className={`musai-capture-strip ${
        module === "studio" ? "musai-capture-strip--studio" : ""
      } ${
        isRecording
          ? "musai-capture-strip--live"
          : analysing
            ? "musai-capture-strip--analysing"
            : ready
              ? "musai-capture-strip--ready"
              : ""
      }`.trim()}
      data-capture-module={module ?? "default"}
    >
      <div className="musai-capture-strip__mode">
        <MusaiSegmentedControl<MusaiCaptureMode>
          ariaLabel="Capture source"
          value={captureMode}
          onChange={(mode) => {
            if (isRecording || status === "loading") return;
            onCaptureMode(mode);
          }}
          options={[
            { value: "record", label: "Record" },
            { value: "upload", label: "Import" },
          ]}
          className={
            module === "studio"
              ? "musai-capture-strip__mode-switch"
              : "max-w-[12.5rem]"
          }
          size={module === "studio" ? "default" : "compact"}
          disabled={isRecording || status === "loading"}
        />
      </div>

      <div className="musai-capture-strip__stage">
        <CaptureStagePanel mode="record" active={showRecord}>
          <div ref={mainRecorderRef} className="h-full w-full">
            <MusaiMicCapturePanel
              selectId={selectId}
              micDevices={micDevices}
              selectedMicId={selectedMicId}
              onMicChange={onMicChange}
              onMicRefresh={onMicRefresh}
              isRecording={isRecording}
              hasSavedClip={!!recordedBlob}
              density="compact"
              experience="studio"
              clipChrome="minimal"
              onDiscardClip={onDiscardClip}
              onStartRecording={onStartRecording}
              onStopRecording={onStopRecording}
              onDiscardRecording={onDiscardRecording}
              streamRef={streamRef}
              elapsedLabelOverride={elapsedLabel}
              levelBarsOverride={levelBars}
              waveformSamplesOverride={waveformSamples}
              waveformLiveRef={waveformLiveRef}
              lastTakeLabelOverride={lastTakeLabel}
              idleTitle={nextTake?.label}
              idleHint={nextTake?.hint ?? idleHint}
              startAriaLabel={nextTake?.ariaLabel}
              busy={status === "loading"}
            />
          </div>
        </CaptureStagePanel>

        <CaptureStagePanel mode="upload" active={!showRecord}>
          <div
            className={`musai-capture-import ${
              uploadProcessing
                ? "musai-capture-import--busy"
                : file
                  ? "musai-capture-import--ready"
                  : ""
            }`}
          >
            {file ? (
              <div className="relative min-h-0 w-full flex-1">
                <div
                  className={`absolute inset-0 flex flex-col items-center justify-center px-4 py-3 transition-opacity duration-300 ${
                    uploadProcessing
                      ? "z-10 opacity-100"
                      : "pointer-events-none z-0 opacity-0"
                  }`}
                  aria-hidden={!uploadProcessing}
                  aria-busy={uploadProcessing}
                  aria-label="Processing selected audio file"
                >
                  <AudioActivityVisualizer variant="compact" className="mb-2" />
                  <span className="text-sm font-semibold tracking-tight text-[var(--musai-ink)]">
                    Reading…
                  </span>
                  <span className="mt-1 max-w-full truncate px-2 text-center text-xs text-[var(--musai-muted)]">
                    {file.name}
                  </span>
                </div>
                <label
                  className={`musai-capture-import__body transition-opacity duration-300 ${
                    uploadProcessing
                      ? "pointer-events-none relative z-0 opacity-0"
                      : "relative z-10 opacity-100"
                  }`}
                >
                  <span className="text-sm font-semibold text-[var(--musai-ok)]">
                    Ready
                  </span>
                  <span className="mt-1 max-w-full truncate px-2 text-center text-xs text-[var(--musai-muted)]">
                    {file.name}
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm,.flac"
                    className="sr-only"
                    onChange={onFileChange}
                  />
                </label>
              </div>
            ) : (
              <label className="musai-capture-import__body">
                <span className="text-sm font-semibold text-[var(--musai-ink)]">
                  {nextTake?.again
                    ? `Import ${nextTake.label.toLowerCase()}`
                    : "Import audio"}
                </span>
                <span className="mt-1 text-center text-[12px] text-[var(--musai-muted)]">
                  {nextTake?.again
                    ? "Another recording of this scale"
                    : "Tap to choose a file"}
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm,.flac"
                  className="sr-only"
                  onChange={onFileChange}
                />
              </label>
            )}
          </div>
        </CaptureStagePanel>
      </div>

      {message && status === "error" ? (
        <AnimatedReveal
          className="musai-capture-strip__alert musai-glass-inset mt-3 border-[color-mix(in_srgb,var(--musai-accent-2)_30%,var(--musai-border))] bg-[color-mix(in_srgb,var(--musai-accent-2)_8%,var(--musai-wash))] px-4 py-3 text-center text-sm text-[var(--musai-accent-2)]"
          role="alert"
          aria-live="assertive"
          delay={20}
        >
          <p data-anime-enter>{message}</p>
        </AnimatedReveal>
      ) : null}

      {hideAnalyze ? null : (
        <div className="musai-capture-strip__actions">
          <button
            type="button"
            disabled={!canAnalyze}
            onClick={() => {
              tapFeedback("medium");
              onAnalyze();
            }}
            className="musai-btn-primary"
          >
            {status === "loading" ? "Working…" : analyzeLabel}
          </button>
        </div>
      )}
    </div>
  );
}
