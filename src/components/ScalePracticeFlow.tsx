"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MusaiCaptureDock } from "@/components/MusaiCaptureDock";
import { MusaiFloatingMiniRecorder } from "@/components/MusaiFloatingMiniRecorder";
import { AnimatedReveal } from "@/components/motion/AnimatedReveal";
import { ScaleAnalysisPanel } from "@/components/motion/ScaleAnalysisPanel";
import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";
import { ScaleChoiceSidebar } from "@/components/ScaleChoiceSidebar";
import { ScaleGuidePanel } from "@/components/ScaleGuidePanel";
import { ScalePracticeInfoProvider } from "@/components/scalePracticeInfoContext";
import { ScalePracticeResultsView } from "@/components/ScalePracticeResultsView";
import { ScaleProgressPanel } from "@/components/ScaleProgressPanel";
import { ScaleStudioHeader } from "@/components/ScaleStudioHeader";
import { useFloatingMiniRecorder } from "@/hooks/useFloatingMiniRecorder";
import { useSyncedRecorderUi } from "@/hooks/useSyncedRecorderUi";
import { analyzeScalePerformance } from "@/lib/analyzeScalePerformance";
import { bufferToMono } from "@/lib/analyzePitch";
import { alignAnalysisToDetectedOctave } from "@/lib/alignScaleOctave";
import { createAudioContext } from "@/lib/audioContext";
import { buildScalePracticeSession } from "@/lib/buildScalePracticeSession";
import {
  detectScaleFromAudio,
  type ScaleCandidate,
} from "@/lib/detectScale";
import {
  decideScaleIdentify,
  hintFromPicker,
  nextRivalStreak,
  resolveShownScaleTake,
  type RivalStreak,
} from "@/lib/scaleIdentifyPolicy";
import {
  awaitRecorderChunks,
  blobFromRecorderChunks,
  createMediaRecorder,
  startMediaRecorder,
} from "@/lib/mediaRecorderMime";
import { describeMicOpenError, getMicStream } from "@/lib/micStream";
import {
  getScaleProgressJourney,
  persistScalePracticeSession,
  readScalePracticeSession,
} from "@/lib/scalePracticeSession";
import {
  progressKeyForSession,
  type ScaleProgressJourneyV1,
} from "@/lib/scaleProgressHistory";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";
import type { ScaleKind } from "@/lib/scales";
import { buildScalePracticeGuideModel } from "@/lib/scalePracticeGuide";
import { nextScaleTakeCopy } from "@/lib/scaleTakeLoop";
import {
  messageForQuietTake,
  messageForUnheardScaleTake,
  SCALE_TAKE_FAILED,
  SCALE_TAKE_NO_SCALE,
  SCALE_TAKE_UNREADABLE,
  scaleTakeStatusText,
} from "@/lib/scaleTakeCapture";
import { useInstrument } from "@/components/InstrumentProvider";
import {
  isPlayableMidi,
  scaleOutOfRangeMessage,
  validateScaleMidisInRange,
} from "@/lib/instrument";
import {
  availableOctaveSpans,
  buildExerciseScaleMidis,
  defaultRootMidiForTonic,
} from "@/lib/scales";

type CaptureMode = "record" | "upload";
type PracticePhase = "studio" | "results";

export function ScalePracticeFlow() {
  const searchParams = useSearchParams();
  const { instrument } = useInstrument();
  const [phase, setPhase] = useState<PracticePhase>("studio");
  const [loopAttempts, setLoopAttempts] = useState<ScalePracticeSessionV1[]>(
    [],
  );
  const [historyRevision, setHistoryRevision] = useState(0);
  const [tonicPc, setTonicPc] = useState(0);
  const [scaleKind, setScaleKind] = useState<ScaleKind>("major");
  const defaultRoot = useMemo(
    () => defaultRootMidiForTonic(tonicPc, instrument),
    [tonicPc, instrument],
  );
  const [advRoot, setAdvRoot] = useState<number | null>(null);
  const [advSpan, setAdvSpan] = useState<1 | 2 | null>(null);
  const restoredAgainRef = useRef(false);
  const rivalStreakRef = useRef<RivalStreak | null>(null);

  const selectTonicPc = useCallback((pc: number) => {
    setTonicPc(pc);
    setAdvRoot(null);
    setAdvSpan(null);
  }, []);

  const selectScaleKind = useCallback((kind: ScaleKind) => {
    setScaleKind(kind);
    setAdvRoot(null);
    setAdvSpan(null);
  }, []);

  const rootMidi = advRoot ?? defaultRoot;
  const octaveSpan = advSpan ?? 1;
  const octaveSpans = useMemo(
    () => availableOctaveSpans(rootMidi, scaleKind, instrument),
    [instrument, rootMidi, scaleKind],
  );

  useEffect(() => {
    if (advRoot != null && !isPlayableMidi(advRoot, instrument)) {
      setAdvRoot(null);
    }
  }, [advRoot, instrument]);

  useEffect(() => {
    if (octaveSpan === 2 && !octaveSpans.includes(2)) setAdvSpan(1);
  }, [octaveSpan, octaveSpans]);

  useEffect(() => {
    setLoopAttempts([]);
    setPendingDetect(null);
  }, [instrument.id]);

  const [captureMode, setCaptureModeState] = useState<CaptureMode>("record");
  const [pendingDetect, setPendingDetect] = useState<{
    alternatives: ScaleCandidate[];
    sampleRateHz: number;
    audioSourceType: "recorded" | "uploaded";
  } | null>(null);
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

  // Resume same scale after leaving results (history / deep link).
  useEffect(() => {
    if (restoredAgainRef.current) return;
    if (searchParams.get("again") !== "1") return;
    const last = readScalePracticeSession();
    if (!last) return;
    if ((last.instrumentId ?? "violin") !== instrument.id) return;
    restoredAgainRef.current = true;
    const journey = getScaleProgressJourney(progressKeyForSession(last));
    setTonicPc(last.tonicPitchClass);
    setScaleKind(last.scaleKind);
    setAdvRoot(last.rootMidi);
    setAdvSpan(last.octaveSpan);
    setLoopAttempts(journey?.attempts ?? [last]);
    setPhase("studio");
    setMessage("Same scale ready — record your next take");
  }, [instrument.id, searchParams]);

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

  const expectedMidis = useMemo(
    () => buildExerciseScaleMidis(rootMidi, scaleKind, octaveSpan),
    [octaveSpan, rootMidi, scaleKind],
  );

  const guideModel = useMemo(
    () => buildScalePracticeGuideModel(tonicPc, scaleKind, rootMidi, octaveSpan),
    [octaveSpan, rootMidi, scaleKind, tonicPc],
  );

  const resetCaptureSession = useCallback(() => {
    setMessage(null);
    setStatus("idle");
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

  const handleFileChange = useCallback((f: File) => {
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
        if (uploadTokenRef.current === token) setUploadProcessing(false);
      }
    })();
  }, []);

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

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
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
          setStatus("idle");
          setMessage(null);
        }
      };

      startMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err) {
      stopStream();
      setMessage(describeMicOpenError(err));
      setStatus("error");
    }
  }, [refreshMicDevices, resetTakeUi, selectedMicId, stopStream]);

  const completeAttempt = useCallback((session: ScalePracticeSessionV1) => {
    const stamped = persistScalePracticeSession(session);
    setLoopAttempts((prev) => {
      const sameScale =
        prev.length > 0 && prev[0]!.scaleId === stamped.scaleId;
      return sameScale ? [...prev, stamped] : [stamped];
    });
    setHistoryRevision((n) => n + 1);
    setPendingDetect(null);
    setStatus("idle");
    setMessage(null);
    setPhase("results");
  }, []);

  const continueJourney = useCallback((journey: ScaleProgressJourneyV1) => {
    setTonicPc(journey.tonicPitchClass);
    setScaleKind(journey.scaleKind);
    setAdvRoot(journey.lastRootMidi);
    setAdvSpan(journey.lastOctaveSpan);
    setLoopAttempts(journey.attempts);
    setRecordedBlob(null);
    setFile(null);
    setUploadProcessing(false);
    uploadTokenRef.current += 1;
    if (fileInputRef.current) fileInputRef.current.value = "";
    setPendingDetect(null);
    setStatus("idle");
    setPhase("studio");
    setMessage(
      `Continue ${journey.scaleLabel} — take ${journey.attempts.length + 1} ready`,
    );
  }, []);

  const prepareNextTake = useCallback(() => {
    setRecordedBlob(null);
    setFile(null);
    setUploadProcessing(false);
    uploadTokenRef.current += 1;
    if (fileInputRef.current) fileInputRef.current.value = "";
    setPendingDetect(null);
    setStatus("idle");
    const nextTake = loopAttempts.length + 1;
    setMessage(
      nextTake > 1
        ? `Take ${nextTake} ready — same scale, fresh listen`
        : null,
    );
    setPhase("studio");
  }, [loopAttempts.length]);

  const persistDetected = useCallback(
    (
      candidate: ScaleCandidate,
      sampleRateHz: number,
      audioSourceType: "recorded" | "uploaded",
    ) => {
      const session = buildScalePracticeSession({
        tonicPitchClass: candidate.tonicPitchClass,
        scaleKind: candidate.scaleKind,
        rootMidi: candidate.rootMidi,
        octaveSpan: candidate.octaveSpan,
        audioSourceType,
        sampleRateHz,
        analysis: candidate.analysis,
        expectedNotesMidi: candidate.expectedMidis,
        scaleSource: "detected",
        waveformAmplitudes: waveformRef.current,
        instrumentId: instrument.id,
      });
      setTonicPc(candidate.tonicPitchClass);
      setScaleKind(candidate.scaleKind);
      setAdvRoot(candidate.rootMidi);
      setAdvSpan(candidate.octaveSpan);
      completeAttempt(session);
    },
    [completeAttempt, instrument.id, waveformRef],
  );

  const runAnalyze = useCallback(async (blobOverride?: Blob | null) => {
    const activeBlob = blobOverride ?? recordedBlob;
    const hasFile = captureMode === "upload" && file;
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
      setMessage(
        scaleOutOfRangeMessage(
          instrument,
          "Try one octave, or choose a lower key.",
        ),
      );
      setStatus("error");
      return;
    }

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
          ? await file!.arrayBuffer()
          : await activeBlob!.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(raw.slice(0));
      const sampleRateHz = audioBuffer.sampleRate;
      const mono = bufferToMono(audioBuffer);
      await ctx.close();

      const audioSourceType =
        captureMode === "record" ? "recorded" : "uploaded";

      const analysis = analyzeScalePerformance({
        mono,
        sampleRateHz,
        expectedMidis,
        instrument,
      });

      const hint = hintFromPicker({
        tonicPitchClass: tonicPc,
        scaleKind,
        octaveSpan,
      });
      const detected = detectScaleFromAudio(mono, sampleRateHz, instrument, {
        hint,
      });
      const resolved = resolveShownScaleTake(
        decideScaleIdentify(detected, {
          active: hint,
          established: true,
          rivalStreak: rivalStreakRef.current,
        }),
      );

      // The written scale stays. A rival take is scored against it.
      if (analysis.summary.notesAnalyzed > 0 && resolved.action === "score_active") {
        rivalStreakRef.current = nextRivalStreak(
          rivalStreakRef.current,
          resolved.rivalVote,
        );
        const aligned = alignAnalysisToDetectedOctave(
          expectedMidis,
          rootMidi,
          analysis,
          instrument,
        );

        const session = buildScalePracticeSession({
          tonicPitchClass: tonicPc,
          scaleKind,
          rootMidi: aligned.rootMidi,
          octaveSpan,
          audioSourceType,
          sampleRateHz,
          analysis: aligned.analysis,
          expectedNotesMidi: aligned.expectedMidis,
          scaleSource: "selected",
          waveformAmplitudes: waveformRef.current,
          instrumentId: instrument.id,
        });
        completeAttempt(session);
        return;
      }

      if (resolved.action === "score_active") {
        rivalStreakRef.current = nextRivalStreak(
          rivalStreakRef.current,
          resolved.rivalVote,
        );
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
      setStatus("error");
      setMessage(scaleTakeStatusText(SCALE_TAKE_UNREADABLE));
    }
  }, [
    captureMode,
    completeAttempt,
    expectedMidis,
    file,
    instrument,
    octaveSpan,
    recordedBlob,
    rootMidi,
    scaleKind,
    tonicPc,
    waveformRef,
  ]);

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
        setStatus("idle");
        setMessage(null);
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
      void runAnalyze(blob);
    })();
  }, [resetTakeUi, runAnalyze, stopStream]);

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
    phase === "studio" && captureMode === "record" && status !== "loading";
  const { miniMounted, miniVisible } = useFloatingMiniRecorder(
    mainRecorderRef,
    miniEnabled,
  );

  const latestAttempt = loopAttempts[loopAttempts.length - 1] ?? null;

  if (phase === "results" && latestAttempt) {
    return (
      <ScalePracticeInfoProvider>
        <div className="w-full max-w-[min(1280px,100%)]">
          <PracticeHubBackLink />
        </div>
        <ScalePracticeResultsView
          session={latestAttempt}
          loopAttempts={loopAttempts}
          onTryAgain={prepareNextTake}
          tryAgainLabel={`Record ${nextScaleTakeCopy(loopAttempts.length).label.toLowerCase()}`}
        />
      </ScalePracticeInfoProvider>
    );
  }

  return (
    <ScalePracticeInfoProvider>
    <div className="w-full max-w-[min(1280px,100%)]">
      <PracticeHubBackLink />
    </div>
    <ScaleStudioHeader />
    <AnimatedReveal className="w-full max-w-[min(1280px,100%)] space-y-6 sm:space-y-8">

      {status === "loading" ? (
        <div data-anime-enter>
          <ScaleAnalysisPanel label="Listening…" />
        </div>
      ) : null}

      <div
        data-anime-enter
        className={`space-y-6 transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:space-y-7 ${
          status === "loading" ? "pointer-events-none opacity-35" : ""
        }`}
      >
        {loopAttempts.length > 0 ? (
          <p
            data-anime-enter
            className="mx-auto max-w-6xl px-4 text-[12px] font-medium tabular-nums text-[var(--musai-muted)] sm:px-6"
          >
            Session · Take {loopAttempts.length + 1} of {guideModel.scaleLabel}
          </p>
        ) : null}

        {!pendingDetect && !isRecording ? (
          <div className="mx-auto w-full max-w-md lg:hidden">
            <ScaleProgressPanel
              revision={historyRevision}
              onContinue={continueJourney}
              framed
            />
          </div>
        ) : null}

        <div className="musai-workspace relative mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-6">
          {isRecording ? (
            <div className="mb-4 flex justify-start">
              <span className="musai-studio-status musai-studio-status--live">
                <span className="musai-studio-status__dot" aria-hidden />
                Recording
              </span>
            </div>
          ) : null}

          <div className="musai-studio-layout">
            <div className="musai-studio-layout__keys relative z-10">
              <ScaleChoiceSidebar
                tonicPc={tonicPc}
                onTonicPc={selectTonicPc}
                scaleKind={scaleKind}
                onScaleKind={selectScaleKind}
                octaveSpan={octaveSpan}
                onOctaveSpan={setAdvSpan}
                octaveSpans={octaveSpans}
              />
            </div>

            <div className="musai-studio-layout__notes min-w-0">
              <AnimatedReveal key="written-guide" delay={40}>
                <div data-anime-enter className="mx-auto w-full max-w-3xl">
                  <ScaleGuidePanel
                    guide={guideModel}
                    exerciseMidis={expectedMidis}
                    tonicPitchClass={tonicPc}
                    scaleKind={scaleKind}
                    octaveSpan={octaveSpan}
                  />
                </div>
              </AnimatedReveal>
            </div>

            <div className="musai-studio-layout__capture">
              <MusaiCaptureDock
                selectId="musai-mic-scale"
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
                nextTake={nextScaleTakeCopy(loopAttempts.length)}
                message={message}
                status={status}
                canAnalyze={canAnalyze}
                onAnalyze={() => void runAnalyze()}
              />
            </div>

            {!pendingDetect && !isRecording ? (
              <aside
                data-anime-enter
                className="pointer-events-none absolute top-16 right-0 hidden w-[14.5rem] translate-x-[calc(100%+1rem)] lg:block xl:hidden"
              >
                <div className="pointer-events-auto sticky top-24">
                  <ScaleProgressPanel
                    revision={historyRevision}
                    onContinue={continueJourney}
                    framed
                  />
                </div>
              </aside>
            ) : null}
          </div>
        </div>

        {pendingDetect ? (
          <AnimatedReveal
            className="musai-glass-inset mx-auto max-w-lg px-5 py-6 text-center"
            delay={60}
          >
            <p
              data-anime-enter
              className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--musai-accent)]"
            >
              Which scale?
            </p>
            <div data-anime-enter className="mt-5 flex flex-col gap-2">
              {pendingDetect.alternatives.map((c) => (
                <button
                  key={`${c.scaleLabel}-${c.octaveSpan}-${c.pattern}-${c.rootMidi}`}
                  type="button"
                  className="musai-chip musai-chip--off w-full justify-center py-2.5"
                  onClick={() =>
                    persistDetected(
                      c,
                      pendingDetect.sampleRateHz,
                      pendingDetect.audioSourceType,
                    )
                  }
                >
                  {c.scaleLabel}
                  {c.octaveSpan === 2 ? " · 2 oct" : " · 1 oct"}
                </button>
              ))}
            </div>
            <button
              data-anime-enter
              type="button"
              className="mt-4 text-[12px] font-medium text-[var(--musai-muted)] underline decoration-[var(--musai-border)] underline-offset-2 hover:text-[var(--musai-ink)]"
              onClick={() => setPendingDetect(null)}
            >
              Cancel
            </button>
          </AnimatedReveal>
        ) : null}
      </div>

      <MusaiFloatingMiniRecorder
        mounted={miniMounted}
        visible={miniVisible}
        isRecording={isRecording}
        onStartRecording={() => void startRecording()}
        onStopRecording={stopRecording}
        elapsedLabel={elapsedLabel}
        levelBars={levelBars}
        idleTitle={nextScaleTakeCopy(loopAttempts.length).label}
        startAriaLabel={nextScaleTakeCopy(loopAttempts.length).ariaLabel}
      />
    </AnimatedReveal>
    </ScalePracticeInfoProvider>
  );
}
