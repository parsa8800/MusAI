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
import { createMediaRecorder, startMediaRecorder } from "@/lib/mediaRecorderMime";
import { describeMicOpenError, getMicStream } from "@/lib/micStream";
import {
  getScaleProgressJourney,
  persistScalePracticeSession,
  readScalePracticeSession,
} from "@/lib/scalePracticeSession";
import type { ScaleProgressJourneyV1 } from "@/lib/scaleProgressHistory";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";
import type { ScaleKind } from "@/lib/scales";
import { buildScalePracticeGuideModel } from "@/lib/scalePracticeGuide";
import {
  buildExerciseScaleMidis,
  defaultRootMidiForTonic,
  validateScaleMidisInViolinRange,
} from "@/lib/scales";

type CaptureMode = "record" | "upload";
type PracticePhase = "studio" | "results";

export function ScalePracticeFlow() {
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<PracticePhase>("studio");
  const [loopAttempts, setLoopAttempts] = useState<ScalePracticeSessionV1[]>(
    [],
  );
  const [historyRevision, setHistoryRevision] = useState(0);
  const [tonicPc, setTonicPc] = useState(0);
  const [scaleKind, setScaleKind] = useState<ScaleKind>("major");
  const defaultRoot = useMemo(
    () => defaultRootMidiForTonic(tonicPc),
    [tonicPc],
  );
  const [advRoot, setAdvRoot] = useState<number | null>(null);
  const [advSpan, setAdvSpan] = useState<1 | 2 | null>(null);
  const restoredAgainRef = useRef(false);

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
    restoredAgainRef.current = true;
    const journey = getScaleProgressJourney(last.scaleId);
    setTonicPc(last.tonicPitchClass);
    setScaleKind(last.scaleKind);
    setAdvRoot(last.rootMidi);
    setAdvSpan(last.octaveSpan);
    setLoopAttempts(journey?.attempts ?? [last]);
    setPhase("studio");
    setMessage("Same scale ready — record your next take");
  }, [searchParams]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRecordingRef = useRef(false);
  const mainRecorderRef = useRef<HTMLDivElement | null>(null);

  const { elapsedLabel, lastTakeLabel, levelBars } = useSyncedRecorderUi(
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

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setFile(null);
      setUploadProcessing(false);
      return;
    }
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
        setMessage("Recording failed. Try again or upload a file.");
        setStatus("error");
      };
      recorder.onstop = () => {
        setIsRecording(false);
        stopStream();
        mediaRecorderRef.current = null;
        if (discardRecordingRef.current) {
          discardRecordingRef.current = false;
          chunksRef.current = [];
          return;
        }
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        chunksRef.current = [];
        if (blob.size < 256) {
          setMessage("Almost no audio captured. Check the mic input.");
          setStatus("error");
          return;
        }
        setRecordedBlob(blob);
      };

      startMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err) {
      stopStream();
      setMessage(describeMicOpenError(err));
      setStatus("error");
    }
  }, [refreshMicDevices, selectedMicId, stopStream]);

  const stopRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      try {
        if (rec.state === "recording") rec.requestData();
      } catch {
        /* ignore */
      }
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const completeAttempt = useCallback((session: ScalePracticeSessionV1) => {
    persistScalePracticeSession(session);
    setLoopAttempts((prev) => {
      const sameScale =
        prev.length > 0 && prev[0]!.scaleId === session.scaleId;
      return sameScale ? [...prev, session] : [session];
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
      });
      setTonicPc(candidate.tonicPitchClass);
      setScaleKind(candidate.scaleKind);
      setAdvRoot(candidate.rootMidi);
      setAdvSpan(candidate.octaveSpan);
      completeAttempt(session);
    },
    [completeAttempt],
  );

  const runAnalyze = useCallback(async () => {
    const hasFile = captureMode === "upload" && file;
    const hasRec = captureMode === "record" && recordedBlob;
    if (!hasFile && !hasRec) {
      setMessage(
        captureMode === "upload"
          ? "Choose an audio file first."
          : "Record your scale first.",
      );
      setStatus("error");
      return;
    }

    if (!validateScaleMidisInViolinRange(expectedMidis)) {
      setMessage(
        "This range leaves the violin span. Try one octave, or choose a lower key.",
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
          : await recordedBlob!.arrayBuffer();
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
      });

      // Happy path: score against the scale the student chose.
      if (analysis.summary.notesAnalyzed > 0) {
        const aligned = alignAnalysisToDetectedOctave(
          expectedMidis,
          rootMidi,
          analysis,
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
        });
        completeAttempt(session);
        return;
      }

      // Invisible fallback: try to recover the scale if the chosen one didn't match.
      const detected = detectScaleFromAudio(mono, sampleRateHz);
      if (detected.ok && detected.ambiguous) {
        setPendingDetect({
          alternatives: detected.alternatives,
          sampleRateHz,
          audioSourceType,
        });
        setStatus("idle");
        return;
      }
      if (detected.ok) {
        persistDetected(detected.best, sampleRateHz, audioSourceType);
        return;
      }

      setStatus("error");
      setMessage(
        detected.reason === "no_pitch"
          ? "Couldn’t detect clear pitches. Re-record slower, one note per bow, in a quieter room."
          : "Couldn’t match that take to your scale. Check the key, then try again.",
      );
    } catch (e) {
      setStatus("error");
      setMessage(
        e instanceof Error
          ? e.message
          : "Could not analyze that take. Try a clearer recording.",
      );
    }
  }, [
    captureMode,
    completeAttempt,
    expectedMidis,
    file,
    octaveSpan,
    persistDetected,
    recordedBlob,
    rootMidi,
    scaleKind,
    tonicPc,
  ]);

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
          <ScaleAnalysisPanel />
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
                onFileChange={handleFileChange}
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
                streamRef={streamRef}
                elapsedLabel={elapsedLabel}
                levelBars={levelBars}
                lastTakeLabel={lastTakeLabel}
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
      />
    </AnimatedReveal>
    </ScalePracticeInfoProvider>
  );
}
