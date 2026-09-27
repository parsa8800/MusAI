"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInstrument } from "@/components/InstrumentProvider";
import { MusaiCaptureDock } from "@/components/MusaiCaptureDock";
import { MusaiFloatingMiniRecorder } from "@/components/MusaiFloatingMiniRecorder";
import { MusaiSegmentedControl } from "@/components/MusaiSegmentedControl";
import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";
import { ScalePickControls, type ScaleMotion } from "@/components/ScalePickControls";
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
  sessionFromActiveIdentity,
  sessionFromDetectedCandidate,
} from "@/lib/scaleDetectSession";
import {
  decideScaleIdentify,
  hintFromPicker,
  hintFromSession,
  identityKey,
  nextRivalStreak,
  resolveShownScaleTake,
  type RivalStreak,
} from "@/lib/scaleIdentifyPolicy";
import {
  buildScalePracticeGuideModel,
  scaleRecordingTips,
} from "@/lib/scalePracticeGuide";
import { persistScalePracticeSession } from "@/lib/scalePracticeSession";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";
import { appendAttemptForExercise } from "@/lib/scaleTakeHistory";
import {
  messageForQuietTake,
  messageForUnheardScaleTake,
  SCALE_TAKE_FAILED,
  SCALE_TAKE_NO_SCALE,
  SCALE_TAKE_UNREADABLE,
  scaleTakeStatusText,
} from "@/lib/scaleTakeCapture";
import {
  deriveScaleStudioPhase,
  nextScaleTakeCopy,
} from "@/lib/scaleTakeLoop";
import type { ScaleProgressJourneyV1 } from "@/lib/scaleProgressHistory";
import {
  getScaleProgressJourney,
  listScaleProgressJourneys,
  progressKeyForSession,
} from "@/lib/scaleProgressHistory";
import {
  availableOctaveSpans,
  buildAscendingScaleMidis,
  buildScaleExerciseMidis,
  defaultRootMidiForTonic,
  scaleDisplayLabel,
  type ScaleKind,
} from "@/lib/scales";
import {
  scaleOutOfRangeMessage,
  validateScaleMidisInRange,
} from "@/lib/instrument";
import { scaleWorkspaceHref } from "@/lib/scaleWorkspace";

type CaptureMode = "record" | "upload";

/**
 * Scale Studio home — results layout with recording on the same page.
 */
export function ScaleStudioSelector() {
  const router = useRouter();
  const { instrument } = useInstrument();
  const [needNotes, setNeedNotes] = useState(false);
  const [tonicPc, setTonicPc] = useState(0);
  const [scaleKind, setScaleKind] = useState<ScaleKind>("major");
  const [octaveSpan, setOctaveSpan] = useState<1 | 2>(1);
  const [scaleMotion, setScaleMotion] = useState<ScaleMotion>("ascending");
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
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressRevision, setProgressRevision] = useState(0);
  const [scaleCount, setScaleCount] = useState(0);
  const [pendingDetect, setPendingDetect] = useState<{
    alternatives: ScaleCandidate[];
    sampleRateHz: number;
    audioSourceType: "recorded" | "uploaded";
  } | null>(null);
  const [loopAttempts, setLoopAttempts] = useState<ScalePracticeSessionV1[]>(
    [],
  );
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

  useEffect(() => {
    setScaleCount(listScaleProgressJourneys(instrument.id).length);
  }, [progressRevision, instrument.id]);

  const rootMidi = useMemo(
    () => defaultRootMidiForTonic(tonicPc, instrument),
    [instrument, tonicPc],
  );
  const octaveSpans = useMemo(
    () => availableOctaveSpans(rootMidi, scaleKind, instrument),
    [instrument, rootMidi, scaleKind],
  );
  const ascendingMidis = useMemo(
    () => buildAscendingScaleMidis(rootMidi, scaleKind, octaveSpan),
    [octaveSpan, rootMidi, scaleKind],
  );
  const expectedMidis = useMemo(
    () => buildScaleExerciseMidis(rootMidi, scaleKind, octaveSpan, scaleMotion),
    [octaveSpan, rootMidi, scaleKind, scaleMotion],
  );
  const shownAttempt = loopAttempts[loopAttempts.length - 1] ?? null;
  const activeHint = shownAttempt
    ? hintFromSession(shownAttempt)
    : needNotes
      ? hintFromPicker({ tonicPitchClass: tonicPc, scaleKind, octaveSpan })
      : null;
  const activeKey = activeHint ? identityKey(activeHint) : "";

  useEffect(() => {
    rivalStreakRef.current = null;
  }, [activeKey]);

  const guideModel = useMemo(() => {
    const base = buildScalePracticeGuideModel(
      tonicPc,
      scaleKind,
      rootMidi,
      octaveSpan,
    );
    if (scaleMotion === "ascending") {
      return {
        ...base,
        descendingLabels: [],
        ascendingCount: ascendingMidis.length,
        totalSteps: ascendingMidis.length,
        recordingTips: scaleRecordingTips(false),
      };
    }
    return base;
  }, [ascendingMidis.length, octaveSpan, rootMidi, scaleKind, scaleMotion, tonicPc]);

  useEffect(() => {
    if (octaveSpan === 2 && !octaveSpans.includes(2)) setOctaveSpan(1);
  }, [octaveSpan, octaveSpans]);

  useEffect(() => {
    setLoopAttempts([]);
    setPendingDetect(null);
    setMessage(null);
  }, [instrument.id]);

  const openDetected = useCallback(
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
      const stamped = persistScalePracticeSession(session);
      const journey = getScaleProgressJourney(progressKeyForSession(stamped));
      setLoopAttempts(
        appendAttemptForExercise(journey?.attempts ?? [], stamped),
      );
      setPendingDetect(null);
      setStatus("idle");
      setMessage(null);
      setRecordedBlob(null);
      setFile(null);
      setProgressRevision((n) => n + 1);
      resetTakeUi();
    },
    [resetTakeUi, waveformRef, instrument.id],
  );

  const commitShownScale = useCallback(
    (
      identity: {
        tonicPitchClass: number;
        scaleKind: ScaleKind;
        octaveSpan: 1 | 2;
        rootMidi: number;
        expectedMidis: readonly number[];
      },
      mono: Float32Array,
      sampleRateHz: number,
      audioSourceType: "recorded" | "uploaded",
    ) => {
      const analysis = analyzeScalePerformance({
        mono,
        sampleRateHz,
        expectedMidis: identity.expectedMidis,
        instrument,
      });
      if (analysis.summary.notesAnalyzed === 0) return false;
      const aligned = alignAnalysisToDetectedOctave(
        identity.expectedMidis,
        identity.rootMidi,
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
      const stamped = persistScalePracticeSession(session);
      const journey = getScaleProgressJourney(progressKeyForSession(stamped));
      setLoopAttempts(appendAttemptForExercise(journey?.attempts ?? [], stamped));
      setPendingDetect(null);
      setStatus("idle");
      setMessage(null);
      setRecordedBlob(null);
      setFile(null);
      setProgressRevision((n) => n + 1);
      resetTakeUi();
      return true;
    },
    [instrument, resetTakeUi, waveformRef],
  );

  const runDetect = useCallback(
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

      if (needNotes && !validateScaleMidisInRange(expectedMidis, instrument)) {
        setMessage(
          scaleOutOfRangeMessage(
            instrument,
            "Try one octave, or choose a lower key.",
          ),
        );
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
        const detected = detectScaleFromAudio(
          mono,
          sampleRateHz,
          instrument,
          activeHint ? { hint: activeHint } : undefined,
        );
        if (token !== autoAnalyzeToken.current) return;

        const resolved = resolveShownScaleTake(
          decideScaleIdentify(detected, {
            active: activeHint,
            established: activeHint != null,
            rivalStreak: rivalStreakRef.current,
          }),
        );

        if (resolved.action === "open") {
          rivalStreakRef.current = null;
          openDetected(resolved.candidate, sampleRateHz, audioSourceType);
          return;
        }
        if (resolved.action === "confirm") {
          setPendingDetect({
            alternatives: resolved.alternatives,
            sampleRateHz,
            audioSourceType,
          });
          setStatus("idle");
          return;
        }
        if (resolved.action === "score_active" && activeHint) {
          rivalStreakRef.current = nextRivalStreak(
            rivalStreakRef.current,
            resolved.rivalVote,
          );
          const identity = shownAttempt
            ? {
                tonicPitchClass: shownAttempt.tonicPitchClass,
                scaleKind: shownAttempt.scaleKind,
                octaveSpan: shownAttempt.octaveSpan,
                rootMidi: shownAttempt.rootMidi,
                expectedMidis: shownAttempt.expectedNotesMidi,
              }
            : {
                tonicPitchClass: tonicPc,
                scaleKind,
                octaveSpan,
                rootMidi,
                expectedMidis,
              };
          if (
            commitShownScale(identity, mono, sampleRateHz, audioSourceType)
          ) {
            return;
          }
        }

        setStatus("error");
        setMessage(
          scaleTakeStatusText(
            messageForUnheardScaleTake({
              notesAnalyzed: 0,
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
      activeHint,
      captureMode,
      commitShownScale,
      expectedMidis,
      file,
      instrument,
      octaveSpan,
      openDetected,
      recordedBlob,
      rootMidi,
      scaleKind,
      shownAttempt,
      tonicPc,
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
            void runDetect(null, f);
          }
        }
      })();
    },
    [runDetect],
  );

  const startRecording = useCallback(async () => {
    setMessage(null);
    setRecordedBlob(null);
    setPendingDetect(null);
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
      void runDetect(blob, null);
    })();
  }, [resetCaptureSession, resetTakeUi, runDetect, stopStream]);

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

  const continueJourney = (journey: ScaleProgressJourneyV1) => {
    router.push(scaleWorkspaceHref(journey.scaleId, journey.lastOctaveSpan));
    setProgressOpen(false);
  };

  const handleJourneyReset = (journey: ScaleProgressJourneyV1) => {
    setProgressRevision((n) => n + 1);
    setLoopAttempts((prev) =>
      prev.some((a) => progressKeyForSession(a) === journey.progressKey)
        ? []
        : prev,
    );
  };

  const latestAttempt = loopAttempts[loopAttempts.length - 1] ?? null;
  const studioPhase = deriveScaleStudioPhase({
    isRecording,
    analysing: status === "loading",
    hasSession: Boolean(latestAttempt),
  });
  const nextTake = nextScaleTakeCopy(loopAttempts.length);

  const captureDock = (
    <MusaiCaptureDock
      selectId="musai-mic-scale-studio"
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
      onAnalyze={() => void runDetect()}
      hideAnalyze
      module="studio"
    />
  );

  return (
    <ScalePracticeInfoProvider>
      <StudioViewport>
        <header className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 sm:gap-3 sm:px-5 sm:py-2.5">
          <div className="justify-self-start">
            <PracticeHubBackLink className="!mb-0 shrink-0" />
          </div>
          <h1 className="font-display min-w-0 truncate text-center text-[1.05rem] font-semibold tracking-tight text-[var(--musai-ink)] sm:text-xl">
            Scale studio
          </h1>
          <div className="justify-self-end">
            <button
              type="button"
              className="musai-pressable musai-nav-chip inline-flex min-h-10 shrink-0 items-center gap-2 rounded-[var(--musai-radius)] px-3 py-2 text-[13px] font-semibold sm:px-3.5"
              onClick={() => setProgressOpen((v) => !v)}
              aria-expanded={progressOpen}
              aria-controls="scale-studio-my-scales"
              aria-haspopup="dialog"
            >
              <span className="max-sm:hidden">My scales</span>
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
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-1 sm:px-4">
          <ScalePracticeResultsView
            session={latestAttempt}
            loopAttempts={loopAttempts}
            phase={studioPhase}
            capture={captureDock}
            quietHome={!latestAttempt}
            readyTitle={
              needNotes
                ? scaleDisplayLabel(tonicPc, scaleKind)
                : "Play a scale"
            }
            readyCaption={
              needNotes ? (octaveSpan === 2 ? "2 octaves" : "1 octave") : ""
            }
            showStaffHeading
            readyStaff={
              needNotes
                ? ({
                    ascendingMidis: expectedMidis.slice(
                      0,
                      guideModel.ascendingCount,
                    ),
                    descendingMidis: expectedMidis.slice(
                      guideModel.ascendingCount,
                    ),
                    tonicPitchClass: tonicPc,
                    scaleKind,
                  })
                : "draft"
            }
            staffChrome={
              latestAttempt ? undefined : (
                <div
                  className="musai-scale-staff-chrome"
                  data-mode={needNotes ? "pick" : "play"}
                >
                  <MusaiSegmentedControl<"play" | "pick">
                    ariaLabel="Notes mode"
                    value={needNotes ? "pick" : "play"}
                    onChange={(mode) => setNeedNotes(mode === "pick")}
                    size="compact"
                    options={[
                      { value: "play", label: "Just play" },
                      { value: "pick", label: "Pick notes" },
                    ]}
                    className="musai-scale-staff-chrome__mode"
                  />
                  {/*
                    Pick controls sit in a compact slot under the mode switch.
                    Capture stays pinned under the notes column so mode changes
                    do not push recording off-screen.
                  */}
                  <div
                    className="musai-scale-staff-chrome__pick-slot"
                    aria-hidden={!needNotes}
                  >
                    {needNotes ? (
                      <ScalePickControls
                        tonicPc={tonicPc}
                        onTonicPc={setTonicPc}
                        scaleKind={scaleKind}
                        onScaleKind={setScaleKind}
                        octaveSpan={octaveSpan}
                        onOctaveSpan={setOctaveSpan}
                        octaveSpans={octaveSpans}
                        scaleMotion={scaleMotion}
                        onScaleMotion={setScaleMotion}
                      />
                    ) : null}
                  </div>
                </div>
              )
            }
          />

          {pendingDetect ? (
            <ScaleDetectAmbiguity
              alternatives={pendingDetect.alternatives}
              onPick={(c) =>
                openDetected(
                  c,
                  pendingDetect.sampleRateHz,
                  pendingDetect.audioSourceType,
                )
              }
              onCancel={() => {
                setPendingDetect(null);
                setMessage(null);
              }}
            />
          ) : null}

          <ScaleSwitcherDrawer
            open={progressOpen}
            onClose={() => setProgressOpen(false)}
            id="scale-studio-my-scales"
            title="My scales"
            revision={progressRevision}
            onContinue={continueJourney}
            onJourneyReset={handleJourneyReset}
            newScaleHref="/practice/scale"
          />
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
