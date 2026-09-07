"use client";

import type { ChangeEvent, RefObject } from "react";
import { AudioActivityVisualizer } from "@/components/AudioActivityVisualizer";
import { MusaiMicCapturePanel } from "@/components/MusaiMicCapturePanel";
import { MusaiSegmentedControl } from "@/components/MusaiSegmentedControl";
import { AnimatedReveal } from "@/components/motion/AnimatedReveal";

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
  streamRef: RefObject<MediaStream | null>;
  elapsedLabel: string;
  levelBars: number[];
  lastTakeLabel: string | null;
  message: string | null;
  status: "idle" | "loading" | "error";
  canAnalyze: boolean;
  onAnalyze: () => void;
  analyzeLabel?: string;
  /** When true, hide Analyse — parent runs analysis automatically after capture. */
  hideAnalyze?: boolean;
};

function CaptureStatus({
  isRecording,
  ready,
}: {
  isRecording: boolean;
  ready: boolean;
}) {
  if (isRecording) {
    return (
      <span className="musai-studio-status musai-studio-status--live">
        <span className="musai-studio-status__dot" aria-hidden />
        Recording
      </span>
    );
  }
  if (ready) {
    return (
      <span className="musai-studio-status musai-studio-status--ready">
        <span className="musai-studio-status__dot" aria-hidden />
        Ready
      </span>
    );
  }
  return null;
}

/**
 * Shared capture dock for Scale Studio and Tuning trainer.
 * One record button, secondary Import/mic, clear live/ready state.
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
  streamRef,
  elapsedLabel,
  levelBars,
  lastTakeLabel,
  message,
  status,
  canAnalyze,
  onAnalyze,
  analyzeLabel = "Analyse",
  hideAnalyze = false,
}: Props) {
  const ready =
    (captureMode === "record" && !!recordedBlob) ||
    (captureMode === "upload" && !!file);

  return (
    <div
      className={`musai-capture-strip ${
        isRecording
          ? "musai-capture-strip--live"
          : ready
            ? "musai-capture-strip--ready"
            : ""
      }`}
    >
      {!isRecording ? (
        <div className="mb-3 flex flex-wrap items-center justify-center gap-2.5">
          <CaptureStatus isRecording={false} ready={ready} />
          <MusaiSegmentedControl<MusaiCaptureMode>
            ariaLabel="Capture source"
            value={captureMode}
            onChange={onCaptureMode}
            options={[
              { value: "record", label: "Record" },
              { value: "upload", label: "Import" },
            ]}
            className="max-w-[11.5rem] opacity-90"
            size="compact"
          />
        </div>
      ) : (
        <div className="mb-3 flex justify-center">
          <CaptureStatus isRecording ready={false} />
        </div>
      )}

      {captureMode === "upload" ? (
        <div
          className={`mx-auto w-full max-w-[15rem] overflow-hidden rounded-[var(--musai-radius)] transition-[border-color,background-color] duration-300 ${
            uploadProcessing
              ? "border border-[color-mix(in_srgb,var(--musai-accent)_35%,var(--musai-border))] bg-[var(--musai-accent-soft)]"
              : file
                ? "border border-[color-mix(in_srgb,var(--musai-ok)_30%,var(--musai-border))] bg-[var(--musai-surface)]"
                : "border border-dashed border-[var(--musai-border)] bg-[var(--musai-surface)] hover:border-[color-mix(in_srgb,var(--musai-accent)_40%,var(--musai-border))]"
          }`}
        >
          {file ? (
            <div className="relative min-h-[6.25rem]">
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
                className={`flex cursor-pointer flex-col items-center justify-center px-4 py-3 transition-opacity duration-300 ${
                  uploadProcessing
                    ? "pointer-events-none relative z-0 min-h-[6.25rem] opacity-0"
                    : "relative z-10 min-h-[6.25rem] opacity-100"
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
            <label className="flex min-h-[6.25rem] cursor-pointer flex-col items-center justify-center px-4 py-4 transition-colors duration-200 hover:bg-[var(--musai-surface-2)]">
              <span className="text-sm font-semibold text-[var(--musai-ink)]">
                Import audio
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
      ) : (
        <div ref={mainRecorderRef}>
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
            streamRef={streamRef}
            elapsedLabelOverride={elapsedLabel}
            levelBarsOverride={levelBars}
            lastTakeLabelOverride={lastTakeLabel}
          />
        </div>
      )}

      {message && status === "error" ? (
        <AnimatedReveal
          className="musai-glass-inset mt-4 border-[color-mix(in_srgb,var(--musai-accent-2)_30%,var(--musai-border))] bg-[color-mix(in_srgb,var(--musai-accent-2)_8%,white)] px-4 py-3 text-center text-sm text-[var(--musai-accent-2)]"
          role="alert"
          aria-live="assertive"
          delay={20}
        >
          <p data-anime-enter>{message}</p>
        </AnimatedReveal>
      ) : null}

      {hideAnalyze ? null : (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            disabled={!canAnalyze}
            onClick={onAnalyze}
            className="musai-btn-primary"
          >
            {status === "loading" ? "Working…" : analyzeLabel}
          </button>
        </div>
      )}
      {hideAnalyze && status === "loading" ? (
        <p className="mt-3 text-center text-[12px] font-medium text-[var(--musai-muted)]">
          Listening through your take…
        </p>
      ) : null}
    </div>
  );
}
