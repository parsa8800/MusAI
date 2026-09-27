"use client";

import { useEffect, useRef, useState } from "react";
import { MusaiMicCapturePanel } from "@/components/MusaiMicCapturePanel";
import {
  pieceProgressSnapshot,
  pieceTakeCopy,
} from "@/features/piece-studio/practice/piecePracticeCopy";
import { usePiecePracticeCapture } from "@/features/piece-studio/practice/usePiecePracticeCapture";
import { latestAttempt } from "@/features/piece-studio/practice/piecePracticeAttempts";
import { readPieceAttemptRecording } from "@/features/piece-studio/pieceStudioFiles";
import { PieceTakeReplay } from "@/features/piece-studio/practice/PieceTakeReplay";
import {
  createHtmlMediaClock,
  type PiecePlayheadClock,
  type TakeClockMap,
} from "@/features/piece-studio/playback/htmlMediaClock";
import type { PieceWorkspaceV1 } from "@/features/piece-studio/pieceStudioTypes";
import type { MusaiScoreV1 } from "@/features/piece-studio/score/musaiScore";
import { tapFeedback } from "@/lib/motion";

function playableTakeBlob(blob: Blob): Blob {
  const type = blob.type.split(";")[0]?.trim() ?? "";
  if (type.startsWith("audio/")) return blob;
  return new Blob([blob], { type: "audio/webm" });
}

/**
 * Compact practise controls under the score.
 * Attempt replay drives the shared score playhead — not a second pointer.
 */
export function PiecePractiseDock({
  piece,
  structured,
  onAttemptSaved,
  onBusyChange,
  onCapturePhaseChange,
  onPlayheadClock,
  mapTakeTime,
  pauseTakeRef,
}: {
  piece: PieceWorkspaceV1;
  structured: MusaiScoreV1 | null | undefined;
  onAttemptSaved: () => void;
  onBusyChange?: (busy: boolean) => void;
  /** idle | recording | processing — for support-panel copy. */
  onCapturePhaseChange?: (
    phase: "idle" | "recording" | "processing",
  ) => void;
  /** Shared score playhead clock from attempt replay. */
  onPlayheadClock?: (clock: PiecePlayheadClock | null) => void;
  /** Recording seconds → written score seconds, read on every tick. */
  mapTakeTime?: TakeClockMap;
  /** Pause last-take replay when the written section starts. */
  pauseTakeRef?: { current: (() => void) | null };
}) {
  const {
    selectId,
    isRecording,
    analysing,
    elapsedLabel,
    lastTakeLabel,
    levelBars,
    waveformSamples,
    waveformLiveRef,
    message,
    status,
    startRecording,
    stopRecording,
    loadSampleTake,
    discardRecording,
    streamRef,
    selectedMicId,
    setSelectedMicId,
    micDevices,
    refreshMicDevices,
    recordedBlob,
  } = usePiecePracticeCapture({
    pieceId: piece.pieceId,
    structured,
    onSaved: onAttemptSaved,
  });
  const last = latestAttempt(piece.attempts);
  const progress = pieceProgressSnapshot(piece);
  const next = pieceTakeCopy(progress.attempts);
  const [clip, setClip] = useState<{ attemptId: string; url: string } | null>(
    null,
  );
  const onBusyChangeRef = useRef(onBusyChange);
  const onCapturePhaseChangeRef = useRef(onCapturePhaseChange);
  const onPlayheadClockRef = useRef(onPlayheadClock);
  const mapTakeTimeRef = useRef(mapTakeTime);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const takeUrl =
    last?.hasRecording && clip?.attemptId === last.attemptId ? clip.url : null;
  const busy = isRecording || analysing;
  const capturePhase: "idle" | "recording" | "processing" = isRecording
    ? "recording"
    : analysing
      ? "processing"
      : "idle";
  const showResult = Boolean(last) && !busy;

  useEffect(() => {
    onBusyChangeRef.current = onBusyChange;
    onCapturePhaseChangeRef.current = onCapturePhaseChange;
    onPlayheadClockRef.current = onPlayheadClock;
    mapTakeTimeRef.current = mapTakeTime;
  });

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    if (!last?.hasRecording) return undefined;
    const attemptId = last.attemptId;
    void readPieceAttemptRecording(piece.pieceId, attemptId).then((blob) => {
      if (cancelled || !blob || blob.size < 1) return;
      const url = URL.createObjectURL(playableTakeBlob(blob));
      if (cancelled) {
        URL.revokeObjectURL(url);
        return;
      }
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

  useEffect(() => {
    onCapturePhaseChangeRef.current?.(capturePhase);
    return () => onCapturePhaseChangeRef.current?.("idle");
  }, [capturePhase]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !takeUrl || !showResult) {
      onPlayheadClockRef.current?.(null);
      return;
    }
    const clock = createHtmlMediaClock(el, (audioSec, audioDurationSec) =>
      mapTakeTimeRef.current
        ? mapTakeTimeRef.current(audioSec, audioDurationSec)
        : audioSec,
    );
    onPlayheadClockRef.current?.(clock);
    return () => {
      clock.dispose();
      onPlayheadClockRef.current?.(null);
    };
  }, [takeUrl, showResult]);

  useEffect(() => {
    if (!pauseTakeRef) return;
    pauseTakeRef.current = () => {
      audioRef.current?.pause();
    };
    return () => {
      pauseTakeRef.current = null;
    };
  }, [pauseTakeRef, takeUrl, showResult]);

  const onStart = () => {
    if (busy) return;
    audioRef.current?.pause();
    tapFeedback("medium");
    void startRecording();
  };

  const onStop = () => {
    if (!isRecording) return;
    tapFeedback("light");
    stopRecording();
  };

  const canSample =
    Boolean(structured) && expectedNotesReady(structured) && !busy;

  return (
    <div className="musai-piece-practise-dock" data-testid="piece-practise-dock">
    <div
      className="musai-piece-practise"
      data-recording={isRecording ? "true" : "false"}
      data-analysing={analysing ? "true" : "false"}
    >
      <div className="musai-piece-practise__capture">
        <MusaiMicCapturePanel
          selectId={selectId}
          micDevices={micDevices}
          selectedMicId={selectedMicId}
          onMicChange={setSelectedMicId}
          onMicRefresh={() => void refreshMicDevices()}
          isRecording={isRecording}
          hasSavedClip={Boolean(recordedBlob) || Boolean(takeUrl)}
          density="compact"
          experience="studio"
          clipChrome="minimal"
          onStartRecording={onStart}
          onStopRecording={onStop}
          onDiscardRecording={discardRecording}
          streamRef={streamRef}
          elapsedLabelOverride={elapsedLabel}
          levelBarsOverride={levelBars}
          waveformSamplesOverride={waveformSamples}
          waveformLiveRef={waveformLiveRef}
          lastTakeLabelOverride={lastTakeLabel}
          idleTitle={undefined}
          idleHint={undefined}
          startAriaLabel={next.ariaLabel}
          busy={analysing}
        />
      </div>

      {message ? (
        <p
          className="musai-piece-practise__message"
          role={status === "error" ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}

      {showResult && last?.hasRecording && takeUrl ? (
        <PieceTakeReplay
          src={takeUrl}
          durationSec={last.durationSec}
          takeNumber={last.attemptNumber}
          audioRef={audioRef}
        />
      ) : null}
    </div>
    {structured ? (
      <button
        type="button"
        className="musai-pressable musai-piece-practise__sample"
        disabled={!canSample}
        onClick={() => {
          if (!canSample) return;
          tapFeedback("light");
          audioRef.current?.pause();
          loadSampleTake();
        }}
      >
        Sample take
      </button>
    ) : null}
    </div>
  );
}

function expectedNotesReady(
  score: MusaiScoreV1 | null | undefined,
): boolean {
  return Boolean(score && score.parts.some((part) => part.measures.length > 0));
}
