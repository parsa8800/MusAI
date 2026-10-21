"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MusaiCaptureDock } from "@/components/MusaiCaptureDock";
import { MusaiFloatingMiniRecorder } from "@/components/MusaiFloatingMiniRecorder";
import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";
import { ScaleDetectAmbiguity } from "@/components/ScaleDetectAmbiguity";
import { ScalePracticeInfoProvider } from "@/components/scalePracticeInfoContext";
import { ScalePracticeResultsView } from "@/components/ScalePracticeResultsView";
import { ScaleSwitcherDrawer } from "@/components/ScaleSwitcherDrawer";
import { StudioViewport } from "@/components/StudioViewport";
import { useFloatingMiniRecorder } from "@/hooks/useFloatingMiniRecorder";
import { useSyncedRecorderUi } from "@/hooks/useSyncedRecorderUi";
import { analyzeScalePerformance } from "@/lib/analyzeScalePerformance";
import { bufferToMono } from "@/lib/analyzePitch";
import { alignAnalysisToDetectedOctave } from "@/lib/alignScaleOctave";
import { createAudioContext } from "@/lib/audioContext";
import {
  detectScaleFromAudio,
  type ScaleCandidate,
} from "@/lib/detectScale";
import {
  awaitRecorderChunks,
  blobFromRecorderChunks,
  createMediaRecorder,
  startMediaRecorder,
} from "@/lib/mediaRecorderMime";
import { describeMicOpenError, getMicStream } from "@/lib/micStream";
import {
  candidateMatchesIdentity,
  sessionFromActiveIdentity,
  sessionFromDetectedCandidate,
  workspaceHrefForCandidate,
} from "@/lib/scaleDetectSession";
import {
  decideScaleIdentify,
  hintFromWorkspace,
  nextRivalStreak,
  resolveShownScaleTake,
  type RivalStreak,
} from "@/lib/scaleIdentifyPolicy";
import type { ScaleProgressJourneyV1 } from "@/lib/scaleProgressHistory";
import { listScaleProgressJourneys } from "@/lib/scaleProgressHistory";
import {
  getScaleProgressJourney,
  persistScalePracticeSession,
} from "@/lib/scalePracticeSession";
import { nextScaleTakeCopy, deriveScaleStudioPhase } from "@/lib/scaleTakeLoop";
import {
  messageForQuietTake,
  messageForUnheardScaleTake,
  SCALE_TAKE_FAILED,
  SCALE_TAKE_NO_SCALE,
  SCALE_TAKE_UNREADABLE,
  scaleTakeStatusText,
} from "@/lib/scaleTakeCapture";
import {
  appendAttemptForExercise,
  filterAttemptsForExercise,
} from "@/lib/scaleTakeHistory";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";
import { useInstrument } from "@/components/InstrumentProvider";
import {
  scaleOutOfRangeMessage,
  validateScaleMidisInRange,
} from "@/lib/instrument";
import {
  buildExerciseScaleMidis,
  defaultRootMidiForTonic,
} from "@/lib/scales";
import type { ScaleWorkspaceIdentity } from "@/lib/scaleWorkspace";
import { progressKeyFor, scaleWorkspaceHref } from "@/lib/scaleWorkspace";

type CaptureMode = "record" | "upload";

/**
 * Persistent practice workspace — results layout with compact recording below.
 */
export function ScaleWorkspace({
  identity,
}: {
  identity: ScaleWorkspaceIdentity;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { instrument } = useInstrument();
  const progressKey = progressKeyFor(
    identity.scaleId,
    identity.octaveSpan,
    instrument.id,
  );
  const rootMidi = useMemo(
    () => defaultRootMidiForTonic(identity.tonicPitchClass, instrument),
    [identity.tonicPitchClass, instrument],
  );
  const [loopAttempts, setLoopAttempts] = useState<ScalePracticeSessionV1[]>(
    [],
  );
  const [changeScaleOpen, setChangeScaleOpen] = useState(false);
  const [scaleCount, setScaleCount] = useState(0);
  const [pendingDetect, setPendingDetect] = useState<{
    alternatives: ScaleCandidate[];
    sampleRateHz: number;
    audioSourceType: "recorded" | "uploaded";
  } | null>(null);

  const expectedMidis = useMemo(
    () =>
      buildExerciseScaleMidis(
        rootMidi,
        identity.scaleKind,
        identity.octaveSpan,
      ),
    [identity.octaveSpan, identity.scaleKind, rootMidi],
  );

  useEffect(() => {
    void searchParams;
    const journey = getScaleProgressJourney(progressKey);
    if (journey) {
      setLoopAttempts(
        filterAttemptsForExercise(journey.attempts, {
          scaleId: identity.scaleId,
          octaveSpan: identity.octaveSpan,
          scaleKind: identity.scaleKind,
          expectedNotesMidi: expectedMidis,
        }),
      );
    } else {
      setLoopAttempts([]);
    }
    setScaleCount(listScaleProgressJourneys(instrument.id).length);
  }, [
    expectedMidis,
    identity.octaveSpan,
    progressKey,
    identity.scaleId,
    identity.scaleKind,
    instrument.id,
    searchParams,
  ]);

  const [captureMode, setCaptureModeState] = useState<CaptureMode>("record");
  const [file, setFile] = useState<File | null>(null);
  const [uploadProcessing, setUploadProcessing] = useState(false);
  const uploadTokenRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const autoAnalyzeToken = useRef(0);
  const rivalStreakRef = useRef<RivalStreak | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRecordingRef = useRef(false);
  const mainRecorderRef = useRef<HTMLDivElement | null>(null);

  const {
    elapsedLabel,
    lastTakeLabel,
    levelBars,
    waveformSamples,
    waveformRef,
    waveformLiveRef,
    resetTakeUi,
  } = useSyncedRecorderUi(
    isRecording,
    streamRef,
  );

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const refreshMicDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setMicDevices(all.filter((d) => d.kind === "audioinput"));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    md.addEventListener("devicechange", refreshMicDevices);
    return () => md.removeEventListener("devicechange", refreshMicDevices);
  }, [refreshMicDevices]);

  useEffect(() => {
    return () => {
      discardRecordingRef.current = true;
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      stopStream();
    };
  }, [stopStream]);

  const readyStaff = useMemo(() => {
    const n = expectedMidis.length;
    const looksRoundTrip = n >= 3 && expectedMidis[0] === expectedMidis[n - 1];
    const ascendingSteps = looksRoundTrip ? (n + 1) / 2 : n;
    return {
      ascendingMidis: expectedMidis.slice(0, ascendingSteps),
      descendingMidis: looksRoundTrip
        ? expectedMidis.slice(ascendingSteps)
        : [],
      tonicPitchClass: identity.tonicPitchClass,
      scaleKind: identity.scaleKind,
    };
  }, [expectedMidis, identity.scaleKind, identity.tonicPitchClass]);

  const latestAttempt = loopAttempts[loopAttempts.length - 1] ?? null;

  const completeAttempt = useCallback((session: ScalePracticeSessionV1) => {
    const stamped = persistScalePracticeSession(session);
    setLoopAttempts((prev) => appendAttemptForExercise(prev, stamped));
    setStatus("idle");
    setMessage(null);
    setRecordedBlob(null);
    setFile(null);
    setPendingDetect(null);
    resetTakeUi();
  }, [resetTakeUi]);

  const acceptDetected = useCallback(
    (
      candidate: ScaleCandidate,
      sampleRateHz: number,
      audioSourceType: "recorded" | "uploaded",
    ) => {
      const session = sessionFromDetectedCandidate(
        candidate,
        sampleRateHz,
        audioSourceType,
        waveformRef.current,
        instrument.id,
      );
      if (candidateMatchesIdentity(candidate, identity)) {
        completeAttempt(session);
        return;
      }
      persistScalePracticeSession(session);
      setPendingDetect(null);
      setStatus("idle");
      setMessage(null);
      setRecordedBlob(null);
      setFile(null);
      router.push(workspaceHrefForCandidate(candidate));
    },
    [completeAttempt, identity, instrument.id, router, waveformRef],
  );

  const runAnalyze = useCallback(
    async (blobOverride?: Blob | null, fileOverride?: File | null) => {
      const activeBlob = blobOverride ?? recordedBlob;
      const activeFile = fileOverride ?? file;
      const hasFile = captureMode === "upload" && activeFile;
      const hasRec = captureMode === "record" && activeBlob;
      if (!hasFile && !hasRec) {
        setMessage(
          captureMode === "upload"
            ? "Choose an audio file first."
            : "Record your scale first.",
        );
        setStatus("error");
        return;
      }

      if (!validateScaleMidisInRange(expectedMidis, instrument)) {
        setMessage(scaleOutOfRangeMessage(instrument));
        setStatus("error");
        return;
      }

      const token = ++autoAnalyzeToken.current;
      setStatus("loading");
      setMessage(null);
      setPendingDetect(null);

      try {
        const ctx = createAudioContext();
        if (!ctx) {
          setStatus("error");
          setMessage("This browser cannot decode audio. Try Chrome or Safari.");
          return;
        }
        const raw =
          captureMode === "upload"
            ? await activeFile!.arrayBuffer()
            : await activeBlob!.arrayBuffer();
        if (token !== autoAnalyzeToken.current) return;
        const audioBuffer = await ctx.decodeAudioData(raw.slice(0));
        const sampleRateHz = audioBuffer.sampleRate;
        const mono = bufferToMono(audioBuffer);
        await ctx.close();

        const audioSourceType =
          captureMode === "record" ? "recorded" : "uploaded";

        const hint = hintFromWorkspace(identity);
        const detected = detectScaleFromAudio(mono, sampleRateHz, instrument, {
          hint,
        });
        if (token !== autoAnalyzeToken.current) return;

        const resolved = resolveShownScaleTake(
          decideScaleIdentify(detected, {
            active: hint,
            established: true,
            rivalStreak: rivalStreakRef.current,
          }),
        );
        if (resolved.action === "score_active") {
          rivalStreakRef.current = nextRivalStreak(
            rivalStreakRef.current,
            resolved.rivalVote,
          );
        }

        const analysis = analyzeScalePerformance({
          mono,
          sampleRateHz,
          expectedMidis,
          instrument,
        });

        if (token !== autoAnalyzeToken.current) return;

        if (
          resolved.action === "score_active" &&
          analysis.summary.notesAnalyzed > 0
        ) {
          const aligned = alignAnalysisToDetectedOctave(
            expectedMidis,
            rootMidi,
            analysis,
            instrument,
          );
          const session = sessionFromActiveIdentity(identity, {
            rootMidi: aligned.rootMidi,
            expectedMidis: aligned.expectedMidis,
            analysis: aligned.analysis,
            sampleRateHz,
            audioSourceType,
            waveformAmplitudes: waveformRef.current,
            instrumentId: instrument.id,
          });
          completeAttempt(session);
          return;
        }

        setStatus("error");
        setMessage(
          scaleTakeStatusText(
            messageForUnheardScaleTake({
              notesAnalyzed: analysis.summary.notesAnalyzed,
              heardPitch: detected.ok || detected.reason !== "no_pitch",
            }) ?? SCALE_TAKE_NO_SCALE,
          ),
        );
      } catch {
        if (token !== autoAnalyzeToken.current) return;
        setStatus("error");
        setMessage(scaleTakeStatusText(SCALE_TAKE_UNREADABLE));
      }
    },
    [
      captureMode,
      completeAttempt,
      expectedMidis,
      file,
      identity,
      instrument,
      recordedBlob,
      rootMidi,
      waveformRef,
    ],
  );

  const resetCaptureSession = useCallback(() => {
    setMessage(null);
    setStatus("idle");
    setPendingDetect(null);
  }, []);

  const setCaptureMode = useCallback(
    (mode: CaptureMode) => {
      if (mode === captureMode) return;
      if (isRecording) {
        discardRecordingRef.current = true;
        mediaRecorderRef.current?.stop();
      }
      setCaptureModeState(mode);
      resetCaptureSession();
      if (mode === "upload") {
        setRecordedBlob(null);
      } else {
        setFile(null);
        setUploadProcessing(false);
        uploadTokenRef.current += 1;
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [captureMode, isRecording, resetCaptureSession],
  );

  const handleFileChange = useCallback(
    (f: File) => {
      const token = ++uploadTokenRef.current;
      setFile(f);
      setUploadProcessing(true);
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const minMs = reduced ? 0 : 400;
      void (async () => {
        try {
          await Promise.all([
            new Promise<void>((r) => setTimeout(r, minMs)),
            f.slice(0, Math.min(f.size, 65536)).arrayBuffer(),
          ]);
        } catch {
          /* ignore */
        } finally {
          if (uploadTokenRef.current === token) {
            setUploadProcessing(false);
            void runAnalyze(null, f);
          }
        }
      })();
    },
    [runAnalyze],
  );

  const startRecording = useCallback(async () => {
    setMessage(null);
    setRecordedBlob(null);
    try {
      const stream = await getMicStream(
        selectedMicId.trim() === "" ? null : selectedMicId,
      );
      streamRef.current = stream;
      chunksRef.current = [];
      void refreshMicDevices();

      const recorder = createMediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onerror = () => {
        setIsRecording(false);
        stopStream();
        setMessage(scaleTakeStatusText(SCALE_TAKE_FAILED));
        setStatus("error");
      };
      recorder.onstop = () => {
        setIsRecording(false);
        mediaRecorderRef.current = null;
        if (discardRecordingRef.current) {
          discardRecordingRef.current = false;
          stopStream();
          resetTakeUi();
          chunksRef.current = [];
          setRecordedBlob(null);
          resetCaptureSession();
        }
      };

      startMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err) {
      stopStream();
      setMessage(describeMicOpenError(err));
      setStatus("error");
    }
  }, [refreshMicDevices, resetCaptureSession, resetTakeUi, selectedMicId, stopStream]);

  const stopRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (discardRecordingRef.current) {
      if (rec && rec.state !== "inactive") {
        try {
          rec.stop();
        } catch {
          /* onstop still resets */
        }
      }
      return;
    }
    if (!rec || rec.state === "inactive") {
      setIsRecording(false);
      stopStream();
      setStatus("error");
      setMessage(scaleTakeStatusText(SCALE_TAKE_FAILED));
      return;
    }
    setIsRecording(false);
    setStatus("loading");
    setMessage(null);
    const chunks = chunksRef.current;
    void (async () => {
      const outcome = await awaitRecorderChunks(rec, chunks);
      stopStream();
      if (discardRecordingRef.current) {
        discardRecordingRef.current = false;
        resetTakeUi();
        chunksRef.current = [];
        setRecordedBlob(null);
        resetCaptureSession();
        return;
      }
      const blob = blobFromRecorderChunks(rec, chunks);
      chunksRef.current = [];
      const quiet = messageForQuietTake(blob.size);
      if (quiet) {
        setRecordedBlob(null);
        setStatus("error");
        setMessage(
          scaleTakeStatusText(outcome === "failed" ? SCALE_TAKE_FAILED : quiet),
        );
        return;
      }
      setRecordedBlob(blob);
      void runAnalyze(blob, null);
    })();
  }, [resetCaptureSession, resetTakeUi, runAnalyze, stopStream]);

  const discardRecording = useCallback(() => {
    if (!isRecording) return;
    discardRecordingRef.current = true;
    resetTakeUi();
    stopRecording();
  }, [isRecording, resetTakeUi, stopRecording]);

  const canAnalyze =
    status !== "loading" &&
    !uploadProcessing &&
    (captureMode === "upload" ? !!file : !!recordedBlob);

  const miniEnabled =
    captureMode === "record" && status !== "loading" && !isRecording;
  const { miniMounted, miniVisible } = useFloatingMiniRecorder(
    mainRecorderRef,
    miniEnabled,
  );

  const nextTake = nextScaleTakeCopy(loopAttempts.length);
  const studioPhase = deriveScaleStudioPhase({
    isRecording,
    analysing: status === "loading",
    hasSession: Boolean(latestAttempt),
  });

  const switchToJourney = useCallback(
    (journey: ScaleProgressJourneyV1) => {
      router.push(
        scaleWorkspaceHref(journey.scaleId, journey.lastOctaveSpan),
      );
      setChangeScaleOpen(false);
    },
    [router],
  );

  const handleJourneyReset = useCallback(
    (journey: ScaleProgressJourneyV1) => {
      setScaleCount(listScaleProgressJourneys(instrument.id).length);
      if (journey.progressKey === progressKey) {
        setLoopAttempts([]);
      }
    },
    [instrument.id, progressKey],
  );

  const captureDock = (
    <MusaiCaptureDock
      selectId="musai-mic-scale-workspace"
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
      onMicRefresh={refreshMicDevices}
      onDiscardClip={() => {
        setRecordedBlob(null);
        resetCaptureSession();
      }}
      onStartRecording={() => void startRecording()}
      onStopRecording={stopRecording}
      onDiscardRecording={discardRecording}
      streamRef={streamRef}
      elapsedLabel={elapsedLabel}
      levelBars={levelBars}
      waveformSamples={waveformSamples}
      waveformLiveRef={waveformLiveRef}
      lastTakeLabel={lastTakeLabel}
      nextTake={nextTake}
      message={message}
      status={status}
      canAnalyze={canAnalyze}
      onAnalyze={() => void runAnalyze()}
      hideAnalyze
      module="studio"
    />
  );

  return (
    <ScalePracticeInfoProvider>
      <StudioViewport>
        <header className="flex shrink-0 items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-5 sm:py-2.5">
          <PracticeHubBackLink
            href="/practice/scale"
            label="Scale studio"
            ariaLabel="Back to Scale studio"
            className="!mb-0 shrink-0"
          />
          <button
            type="button"
            className="musai-pressable musai-nav-chip inline-flex min-h-10 shrink-0 items-center gap-2 rounded-[var(--musai-radius)] px-3 py-2 text-[13px] font-semibold sm:px-3.5"
            aria-expanded={changeScaleOpen}
            aria-controls="scale-workspace-switcher"
            aria-haspopup="dialog"
            aria-label={`Switch scale, currently ${identity.scaleLabel}`}
            onClick={() => setChangeScaleOpen((v) => !v)}
          >
            <span className="max-sm:hidden">Switch scale</span>
            <span className="sm:hidden">Scales</span>
            <span
              className={`inline-flex min-w-[1.35rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                scaleCount > 0
                  ? "bg-[var(--musai-accent)] text-[#fffcf8]"
                  : "bg-[var(--musai-surface-2)] text-[var(--musai-muted)]"
              }`}
            >
              {scaleCount}
            </span>
          </button>
        </header>

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-1 sm:px-4">
          <ScalePracticeResultsView
            session={latestAttempt}
            loopAttempts={loopAttempts}
            phase={studioPhase}
            capture={captureDock}
            readyTitle={identity.scaleLabel}
            readyCaption={
              identity.octaveSpan === 2 ? "2 octaves" : "1 octave"
            }
            readyStaff={readyStaff}
          />

          <ScaleSwitcherDrawer
            open={changeScaleOpen}
            onClose={() => setChangeScaleOpen(false)}
            id="scale-workspace-switcher"
            title="Switch scale"
            currentProgressKey={progressKey}
            onContinue={switchToJourney}
            onJourneyReset={handleJourneyReset}
            newScaleHref="/practice/scale"
          />

          {pendingDetect ? (
            <ScaleDetectAmbiguity
              alternatives={pendingDetect.alternatives}
              onPick={(c) =>
                acceptDetected(
                  c,
                  pendingDetect.sampleRateHz,
                  pendingDetect.audioSourceType,
                )
              }
              onCancel={() => setPendingDetect(null)}
            />
          ) : null}
        </div>

        <MusaiFloatingMiniRecorder
          mounted={miniMounted}
          visible={miniVisible && !isRecording}
          isRecording={isRecording}
          onStartRecording={() => void startRecording()}
          onStopRecording={stopRecording}
          elapsedLabel={elapsedLabel}
          levelBars={levelBars}
          idleTitle={nextTake.label}
          startAriaLabel={nextTake.ariaLabel}
        />
      </StudioViewport>
    </ScalePracticeInfoProvider>
  );
}
