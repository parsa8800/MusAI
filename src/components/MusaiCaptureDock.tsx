"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { MusaiFileImport } from "@/components/MusaiFileImport";
import { MusaiMicCapturePanel } from "@/components/MusaiMicCapturePanel";
import { MusaiSegmentedControl } from "@/components/MusaiSegmentedControl";
import { AnimatedReveal } from "@/components/motion/AnimatedReveal";
import { MUSAI_AUDIO_UPLOAD_ACCEPT } from "@/lib/musaiFileImport";
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
  /** Same path for click and drag-and-drop (shared MusaiFileImport gate). */
  onFileSelected: (file: File) => void;
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
 * Shared capture dock (Record / Import chrome around {@link MusaiMicCapturePanel}).
 * Scale Studio, Note Trainer, and similar hosts consume this — do not fork a
 * per-studio recorder. Import uses {@link MusaiFileImport}.
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
  onFileSelected,
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
  const [rejectMessage, setRejectMessage] = useState<string | null>(null);
  const [importTick, setImportTick] = useState(false);
  const analysing = status === "loading" || uploadProcessing;
  const ready =
    !analysing &&
    ((captureMode === "record" && !!recordedBlob) ||
      (captureMode === "upload" && !!file));
  const showRecord = captureMode === "record";

  useEffect(() => {
    const imported = Boolean(file) && !uploadProcessing;
    if (!imported) {
      setImportTick(false);
      return;
    }
    setImportTick(true);
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = window.setTimeout(() => setImportTick(false), reduced ? 700 : 1900);
    return () => window.clearTimeout(id);
  }, [file, uploadProcessing]);

  const importLabel = file
    ? "Ready"
    : nextTake?.again
      ? `Import ${nextTake.label.toLowerCase()}`
      : "Import audio";
  const importHint = file
    ? file.name
    : nextTake?.again
      ? "Another recording of this scale"
      : "Drop a file or tap to choose";

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
            setRejectMessage(null);
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
            }${importTick ? " musai-capture-import--tick" : ""}`}
          >
            {importTick ? <ImportSuccessTick /> : null}
            <MusaiFileImport
              className="musai-capture-file-import"
              testId="scale-file-import"
              compact
              acceptedFiles={MUSAI_AUDIO_UPLOAD_ACCEPT}
              inputRef={fileInputRef}
              processing={uploadProcessing}
              processingLabel="Reading…"
              disabled={status === "loading"}
              label={importLabel}
              hint={importHint}
              inputAriaLabel="Import audio file"
              error={rejectMessage}
              onReject={setRejectMessage}
              onPickerOpen={() => setImportTick(false)}
              onFilesSelected={(files) => {
                const next = files[0];
                if (!next) return;
                setRejectMessage(null);
                setImportTick(false);
                onFileSelected(next);
              }}
            />
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

function ImportSuccessTick() {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    let second = 0;
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => setPlaying(true));
    });
    return () => {
      window.cancelAnimationFrame(first);
      window.cancelAnimationFrame(second);
    };
  }, []);

  return (
    <div
      className={`musai-import-tick-pop${playing ? " is-playing" : ""}`}
      aria-hidden
    >
      <span className="musai-import-tick__glow" />
      <svg className="musai-import-tick" viewBox="0 0 48 48">
        <circle className="musai-import-tick__ring" cx="24" cy="24" r="16" pathLength="1" />
        <path
          className="musai-import-tick__mark"
          d="M16.2 24.6l5 5.1L32.2 18.4"
          pathLength="1"
        />
      </svg>
    </div>
  );
}
