"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  formatPieceAttemptWhen,
  pieceProgressSnapshot,
  pieceTakeCopy,
} from "@/features/piece-studio/practice/piecePracticeCopy";
import { usePiecePracticeCapture } from "@/features/piece-studio/practice/usePiecePracticeCapture";
import { latestAttempt } from "@/features/piece-studio/practice/piecePracticeAttempts";
import { readPieceAttemptRecording } from "@/features/piece-studio/pieceStudioFiles";
import type { PieceWorkspaceV1 } from "@/features/piece-studio/pieceStudioTypes";
import type { MusaiScoreV1 } from "@/features/piece-studio/score/musaiScore";
import { tapFeedback } from "@/lib/motion";

/**
 * Compact practise controls under the score.
 * Record → Stop → Feedback stays on this page; mic / import stay secondary.
 */
export function PiecePractiseDock({
  piece,
  structured,
  onAttemptSaved,
  onBusyChange,
}: {
  piece: PieceWorkspaceV1;
  structured: MusaiScoreV1 | null | undefined;
  onAttemptSaved: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const {
    isRecording,
    analysing,
    elapsedLabel,
    message,
    status,
    captureMode,
    setCaptureMode,
    startRecording,
    stopRecording,
    selectedMicId,
    setSelectedMicId,
    micDevices,
    refreshMicDevices,
    fileInputRef,
    handleFileChange,
  } = usePiecePracticeCapture({
    pieceId: piece.pieceId,
    structured,
    onSaved: onAttemptSaved,
  });
  const micSelectId = useId();
  const importId = useId();
  const last = latestAttempt(piece.attempts);
  const progress = pieceProgressSnapshot(piece);
  const next = pieceTakeCopy(progress.attempts);
  const best = progress.best;
  const [clip, setClip] = useState<{ attemptId: string; url: string } | null>(
    null,
  );
  const onBusyChangeRef = useRef(onBusyChange);
  const takeUrl =
    last?.hasRecording && clip?.attemptId === last.attemptId ? clip.url : null;
  const busy = isRecording || analysing;
  const showResult = Boolean(last) && !busy;
  const attemptsLabel =
    progress.attempts === 1 ? "1 attempt" : `${progress.attempts} attempts`;
  const micLabel = selectedMicLabel(selectedMicId, micDevices);

  useEffect(() => {
    onBusyChangeRef.current = onBusyChange;
  });

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    if (!last?.hasRecording) return undefined;
    const attemptId = last.attemptId;
    void readPieceAttemptRecording(piece.pieceId, attemptId).then((blob) => {
      if (cancelled || !blob) return;
      const url = URL.createObjectURL(blob);
      revoked = url;
      setClip({ attemptId, url });
    });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [last?.attemptId, last?.hasRecording, piece.pieceId]);

  useEffect(() => {
    onBusyChangeRef.current?.(busy);
    return () => onBusyChangeRef.current?.(false);
  }, [busy]);

  const start = () => {
    if (busy) return;
    tapFeedback("medium");
    if (captureMode !== "record") setCaptureMode("record");
    void startRecording();
  };

  const stop = () => {
    if (!isRecording) return;
    tapFeedback("light");
    stopRecording();
  };

  return (
    <div
      className="musai-piece-practise"
      data-testid="piece-practise-dock"
      data-recording={isRecording ? "true" : "false"}
      data-analysing={analysing ? "true" : "false"}
    >
      {progress.attempts > 0 && !busy ? (
        <div
          className="musai-piece-progress"
          data-testid="piece-progress-summary"
        >
          <p className="musai-piece-progress__label">Progress</p>
          <div className="musai-piece-progress__stats">
            <span>
              Best{" "}
              <strong>
                {progress.best != null ? `${progress.best}%` : "—"}
              </strong>
            </span>
            <span>
              Latest{" "}
              <strong>
                {progress.latest != null ? `${progress.latest}%` : "—"}
              </strong>
            </span>
            <span>{attemptsLabel}</span>
          </div>
          {progress.deltaLabel ? (
            <p
              className="musai-piece-progress__delta"
              data-improved={
                progress.delta != null && progress.delta > 0 ? "true" : "false"
              }
            >
              {progress.deltaLabel}
            </p>
          ) : null}
          {best != null ? (
            <div
              className="musai-piece-progress__bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={best}
              aria-label="Best score on this piece"
            >
              <div
                className="musai-piece-progress__fill"
                style={{ width: `${Math.max(0, Math.min(100, best))}%` }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="musai-piece-practise__actions">
        <div className="musai-piece-practise__record">
          {isRecording ? (
            <>
              <button
                type="button"
                className="musai-pressable musai-piece-practise__primary musai-piece-practise__primary--stop"
                onClick={stop}
                data-testid="piece-record-stop"
                aria-label="Stop recording"
              >
                Stop
              </button>
              <p className="musai-piece-practise__live" aria-live="polite">
                <span className="musai-studio-status musai-studio-status--live">
                  <span className="musai-studio-status__dot" aria-hidden />
                  Recording
                </span>
                <span className="musai-piece-practise__elapsed">
                  {elapsedLabel}
                </span>
              </p>
            </>
          ) : analysing ? (
            <p className="musai-piece-practise__status" role="status">
              Listening to your take…
            </p>
          ) : (
            <button
              type="button"
              className="musai-pressable musai-piece-practise__primary"
              onClick={start}
              data-testid="piece-record-start"
              aria-label={next.ariaLabel}
            >
              {next.again ? "Try again" : "Record"}
            </button>
          )}
        </div>

        {!busy ? (
          <div className="musai-piece-practise__tools">
            <div className="musai-piece-practise__mic">
              <span className="musai-piece-practise__mic-face" aria-hidden>
                <MicGlyph />
                <span>Mic</span>
              </span>
              <label htmlFor={micSelectId} className="sr-only">
                Microphone
              </label>
              <select
                id={micSelectId}
                value={selectedMicValue(selectedMicId, micDevices)}
                disabled={busy}
                onChange={(e) => setSelectedMicId(e.target.value)}
                onFocus={() => void refreshMicDevices()}
                className="musai-piece-practise__mic-select"
                aria-label={`Microphone: ${micLabel}`}
                title={micLabel}
                data-testid="piece-practise-mic"
              >
                <option value="">Default microphone</option>
                {micDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label?.trim() || "Microphone"}
                  </option>
                ))}
              </select>
            </div>
            <label
              className="musai-pressable musai-piece-practise__import-btn"
              htmlFor={importId}
              title="Import a take"
            >
              <span className="sr-only">Import a take</span>
              <ImportGlyph />
              <input
                id={importId}
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
                disabled={busy}
                data-testid="piece-practise-import"
                onChange={(e) => {
                  setCaptureMode("upload");
                  handleFileChange(e);
                }}
              />
            </label>
          </div>
        ) : null}
      </div>

      {message ? (
        <p
          className="musai-piece-practise__message"
          role={status === "error" ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}

      {showResult && last ? (
        <div className="musai-piece-result">
          <p className="musai-piece-result__take">
            Take {last.attemptNumber || progress.attempts}
            <span className="musai-piece-result__when">
              {" "}
              · {formatPieceAttemptWhen(last.recordedAt)}
            </span>
          </p>
          {takeUrl ? (
            <audio
              className="musai-piece-audio"
              controls
              src={takeUrl}
              aria-label={`Take ${last.attemptNumber || progress.attempts} recording`}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function selectedMicValue(
  selectedMicId: string,
  devices: MediaDeviceInfo[],
): string {
  if (!selectedMicId) return "";
  return devices.some((d) => d.deviceId === selectedMicId) ? selectedMicId : "";
}

function selectedMicLabel(
  selectedMicId: string,
  devices: MediaDeviceInfo[],
): string {
  if (!selectedMicId.trim()) return "Default microphone";
  const match = devices.find((d) => d.deviceId === selectedMicId);
  return match?.label?.trim() || "Microphone";
}

function MicGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
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

function ImportGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.85}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14"
      />
    </svg>
  );
}
