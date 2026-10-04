"use client";

import { useEffect, useRef, useState } from "react";
import { MusaiCaptureDock } from "@/components/MusaiCaptureDock";
import { MusaiSegmentedControl } from "@/components/MusaiSegmentedControl";
import {
  pieceProgressSnapshot,
  pieceTakeCopy,
} from "@/features/piece-studio/practice/piecePracticeCopy";
import { usePiecePracticeCapture } from "@/features/piece-studio/practice/usePiecePracticeCapture";
import { latestAttempt } from "@/features/piece-studio/practice/piecePracticeAttempts";
import { readPieceAttemptRecording } from "@/features/piece-studio/pieceStudioFiles";
import { PieceTakeReplay } from "@/features/piece-studio/practice/PieceTakeReplay";
import { isGeneratedPieceSampleRecording } from "@/features/piece-studio/practice/synthesizePieceSampleTake";
import {
  createHtmlMediaClock,
  seekHtmlMedia,
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
  scoreTimeToAudio,
  pauseTakeRef,
  seekTakeRef,
  takePlayingRef,
  showPitchColourToggle = false,
  pitchColoursOn = true,
  onTogglePitchColours,
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
  /** Written score seconds → recording seconds, for playhead seeks. */
  scoreTimeToAudio?: (scoreSec: number, audioDurationSec: number) => number;
  /** Pause last-take replay when the written section starts. */
  pauseTakeRef?: { current: (() => void) | null };
  /** Move the last take to the note under the playhead. */
  seekTakeRef?: {
    current: ((scoreSec: number, resume: boolean) => void) | null;
  };
  /** Whether the last take is sounding, read when a playhead drag starts. */
  takePlayingRef?: { current: (() => boolean) | null };
  /** Latest take has tuning colours that can be hidden. */
  showPitchColourToggle?: boolean;
  pitchColoursOn?: boolean;
  onTogglePitchColours?: () => void;
}) {
  const {
    selectId,
    captureMode,
    setCaptureMode,
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
    discardRecording,
    discardClip,
    streamRef,
    selectedMicId,
    setSelectedMicId,
    micDevices,
    refreshMicDevices,
    recordedBlob,
    file,
    uploadProcessing,
    fileInputRef,
    handleFileChange,
    mainRecorderRef,
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
  const [scoreOptionsOpen, setScoreOptionsOpen] = useState(false);
  const scoreOptionsRef = useRef<HTMLDivElement | null>(null);
  const onBusyChangeRef = useRef(onBusyChange);
  const onCapturePhaseChangeRef = useRef(onCapturePhaseChange);
  const onPlayheadClockRef = useRef(onPlayheadClock);
  const mapTakeTimeRef = useRef(mapTakeTime);
  const scoreTimeToAudioRef = useRef(scoreTimeToAudio);
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
    scoreTimeToAudioRef.current = scoreTimeToAudio;
  });

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    if (!last?.hasRecording) return undefined;
    const attemptId = last.attemptId;
    void readPieceAttemptRecording(piece.pieceId, attemptId).then((blob) => {
      if (cancelled || !blob || blob.size < 1) return;
      if (isGeneratedPieceSampleRecording(blob)) return;
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
    if (!showPitchColourToggle) setScoreOptionsOpen(false);
  }, [showPitchColourToggle]);

  useEffect(() => {
    if (!scoreOptionsOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (scoreOptionsRef.current?.contains(target)) return;
      setScoreOptionsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setScoreOptionsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [scoreOptionsOpen]);

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
    const audioSecFor = (scoreSec: number) => {
      const el = audioRef.current;
      const dur = el?.duration;
      const audioDur = typeof dur === "number" && Number.isFinite(dur) && dur > 0 ? dur : 0;
      return scoreTimeToAudioRef.current
        ? scoreTimeToAudioRef.current(scoreSec, audioDur)
        : scoreSec;
    };
    if (pauseTakeRef) {
      pauseTakeRef.current = () => {
        audioRef.current?.pause();
      };
    }
    if (takePlayingRef) {
      takePlayingRef.current = () => {
        const el = audioRef.current;
        return Boolean(el && !el.paused && !el.ended);
      };
    }
    if (seekTakeRef) {
      seekTakeRef.current = (scoreSec, resume) => {
        const el = audioRef.current;
        if (!el) return;
        seekHtmlMedia(el, audioSecFor(scoreSec));
        if (resume) void el.play().catch(() => undefined);
      };
    }
    return () => {
      if (pauseTakeRef) pauseTakeRef.current = null;
      if (takePlayingRef) takePlayingRef.current = null;
      if (seekTakeRef) seekTakeRef.current = null;
    };
  }, [pauseTakeRef, seekTakeRef, takePlayingRef, takeUrl, showResult]);

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

  return (
    <div
      className="musai-piece-practise-dock musai-studio-stage__capture"
      data-testid="piece-practise-dock"
      data-recording={isRecording ? "true" : "false"}
      data-analysing={analysing ? "true" : "false"}
    >
      <MusaiCaptureDock
        selectId={selectId}
        captureMode={captureMode}
        onCaptureMode={setCaptureMode}
        isRecording={isRecording}
        recordedBlob={recordedBlob}
        file={file}
        uploadProcessing={uploadProcessing}
        fileInputRef={fileInputRef}
        onFileSelected={handleFileChange}
        mainRecorderRef={mainRecorderRef}
        micDevices={micDevices}
        selectedMicId={selectedMicId}
        onMicChange={setSelectedMicId}
        onMicRefresh={() => void refreshMicDevices()}
        onDiscardClip={discardClip}
        onStartRecording={onStart}
        onStopRecording={onStop}
        onDiscardRecording={discardRecording}
        streamRef={streamRef}
        elapsedLabel={elapsedLabel}
        levelBars={levelBars}
        waveformSamples={waveformSamples}
        waveformLiveRef={waveformLiveRef}
        lastTakeLabel={lastTakeLabel}
        nextTake={{
          label: next.label,
          hint: next.hint,
          ariaLabel: next.ariaLabel,
        }}
        message={message}
        status={status}
        canAnalyze={false}
        onAnalyze={() => undefined}
        hideAnalyze
        module="studio"
      />

      {showPitchColourToggle || (showResult && last?.hasRecording && takeUrl) ? (
        <div className="musai-piece-practise-dock__after">
          {showResult && last?.hasRecording && takeUrl ? (
            <PieceTakeReplay
              src={takeUrl}
              durationSec={last.durationSec}
              takeNumber={last.attemptNumber}
              audioRef={audioRef}
            />
          ) : null}
          {showPitchColourToggle ? (
            <div className="musai-piece-score-options" ref={scoreOptionsRef}>
              <button
                type="button"
                className="musai-pressable musai-piece-score-options__btn"
                aria-label="Score options"
                aria-expanded={scoreOptionsOpen}
                aria-controls="piece-score-options"
                data-testid="piece-score-options"
                data-active={scoreOptionsOpen ? "true" : "false"}
                onClick={() => {
                  tapFeedback("light");
                  setScoreOptionsOpen((open) => !open);
                }}
              >
                <svg viewBox="0 0 24 24" className="musai-piece-score-options__glyph" aria-hidden>
                  <path
                    d="M4 7.5h16M4 12h16M4 16.5h16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  <circle cx="9" cy="7.5" r="1.7" fill="currentColor" />
                  <circle cx="15" cy="12" r="1.7" fill="currentColor" />
                  <circle cx="8" cy="16.5" r="1.7" fill="currentColor" />
                </svg>
              </button>
              {scoreOptionsOpen ? (
                <div
                  id="piece-score-options"
                  className="musai-piece-score-options__menu"
                  role="dialog"
                  aria-label="Score view"
                >
                  <MusaiSegmentedControl<"tuning" | "plain">
                    ariaLabel="Score view"
                    className="musai-piece-score-view__switch"
                    size="compact"
                    value={pitchColoursOn ? "tuning" : "plain"}
                    onChange={() => onTogglePitchColours?.()}
                    options={[
                      { value: "plain", label: "Plain" },
                      { value: "tuning", label: "Tuning" },
                    ]}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
