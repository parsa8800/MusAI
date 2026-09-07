"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioActivityVisualizer } from "@/components/AudioActivityVisualizer";
import {
  MusaiMicCapturePanel,
} from "@/components/MusaiMicCapturePanel";
import { MusaiFloatingMiniRecorder } from "@/components/MusaiFloatingMiniRecorder";
import { MusaiSegmentedControl } from "@/components/MusaiSegmentedControl";
import { AnimatedReveal } from "@/components/motion/AnimatedReveal";
import { ScaleAnalysisPanel } from "@/components/motion/ScaleAnalysisPanel";
import { ScaleChoiceSidebar } from "@/components/ScaleChoiceSidebar";
import { ScaleGuidePanel } from "@/components/ScaleGuidePanel";
import { ScalePracticeInfoProvider } from "@/components/scalePracticeInfoContext";
import { ScaleRecentTakesPanel } from "@/components/ScaleRecentTakesPanel";
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
import { persistScalePracticeSession } from "@/lib/scalePracticeSession";
import type { ScaleKind } from "@/lib/scales";
import { buildScalePracticeGuideModel } from "@/lib/scalePracticeGuide";
import {
  buildExerciseScaleMidis,
  defaultRootMidiForTonic,
  validateScaleMidisInViolinRange,
} from "@/lib/scales";

type CaptureMode = "record" | "upload";

export function ScalePracticeFlow() {
  const router = useRouter();
  const [tonicPc, setTonicPc] = useState(0);
  const [scaleKind, setScaleKind] = useState<ScaleKind>("major");
  const defaultRoot = useMemo(
    () => defaultRootMidiForTonic(tonicPc),
    [tonicPc],
  );
  const [advRoot, setAdvRoot] = useState<number | null>(null);
  const [advSpan, setAdvSpan] = useState<1 | 2 | null>(null);

  useEffect(() => {
    setAdvRoot(null);
    setAdvSpan(null);
  }, [tonicPc, scaleKind]);

  const rootMidi = advRoot ?? defaultRoot;
  const octaveSpan = advSpan ?? 1;

  const [captureMode, setCaptureModeState] = useState<CaptureMode>("record");
  const [showWrittenGuide, setShowWrittenGuide] = useState(true);
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
      persistScalePracticeSession(session);
      setPendingDetect(null);
      setStatus("idle");
      router.push("/practice/scale/results");
    },
    [router],
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

    if (showWrittenGuide && !validateScaleMidisInViolinRange(expectedMidis)) {
      setMessage(
        "This range leaves the violin span. Open Range and choose a lower start or one octave.",
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

      if (showWrittenGuide) {
        const analysis = analyzeScalePerformance({
          mono,
          sampleRateHz,
          expectedMidis,
        });

        if (analysis.summary.notesAnalyzed === 0) {
          setStatus("error");
          setMessage(
            "Couldn’t detect clear pitches. Re-record slower, one note per bow, in a quieter room.",
          );
          return;
        }

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
        persistScalePracticeSession(session);
        setStatus("idle");
        router.push("/practice/scale/results");
        return;
      }

      const detected = detectScaleFromAudio(mono, sampleRateHz);
      if (!detected.ok) {
        setShowWrittenGuide(true);
        setStatus("error");
        setMessage(
          detected.reason === "no_pitch"
            ? "Couldn’t hear a clear scale. Play slower, then try again — or show the notes and pick the scale."
            : "Couldn’t match a scale automatically. Show written notes, pick what you played, then analyse again.",
        );
        return;
      }

      if (detected.ambiguous) {
        setPendingDetect({
          alternatives: detected.alternatives,
          sampleRateHz,
          audioSourceType,
        });
        setStatus("idle");
        return;
      }

      persistDetected(detected.best, sampleRateHz, audioSourceType);
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
    expectedMidis,
    file,
    octaveSpan,
    persistDetected,
    recordedBlob,
    rootMidi,
    router,
    scaleKind,
    showWrittenGuide,
    tonicPc,
  ]);

  const canAnalyze =
    status !== "loading" &&
    !uploadProcessing &&
    (captureMode === "upload" ? !!file : !!recordedBlob);

  const miniEnabled = captureMode === "record" && status !== "loading";
  const { miniMounted, miniVisible } = useFloatingMiniRecorder(
    mainRecorderRef,
    miniEnabled,
  );

  return (
    <ScalePracticeInfoProvider>
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
        {!pendingDetect && !isRecording ? (
          <div className="mx-auto w-full max-w-md lg:hidden">
            <ScaleRecentTakesPanel />
          </div>
        ) : null}

        <div className="musai-workspace relative mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            {!isRecording ? (
              <button
                type="button"
                onClick={() => setShowWrittenGuide((v) => !v)}
                className={`musai-chip ${showWrittenGuide ? "musai-chip--on" : "musai-chip--off"} text-sm font-medium`}
              >
                {showWrittenGuide ? "Hide notes" : "Notes"}
              </button>
            ) : (
              <span className="musai-studio-status musai-studio-status--live">
                <span className="musai-studio-status__dot" aria-hidden />
                Recording
              </span>
            )}
            <p className="rounded-full bg-[var(--musai-accent-soft)] px-3 py-1 text-sm font-semibold text-[var(--musai-accent)]">
              {guideModel.scaleLabel}
              {octaveSpan === 2 ? " · 2 oct" : " · 1 oct"}
            </p>
          </div>

          {!isRecording && showWrittenGuide ? (
            <AnimatedReveal
              key="written-guide"
              className="relative lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-6"
              delay={40}
            >
              <div data-anime-enter className="mb-4 lg:mb-0">
                <ScaleChoiceSidebar
                  tonicPc={tonicPc}
                  onTonicPc={setTonicPc}
                  scaleKind={scaleKind}
                  onScaleKind={setScaleKind}
                  octaveSpan={octaveSpan}
                  onOctaveSpan={setAdvSpan}
                  rootMidi={rootMidi}
                  onRootMidi={setAdvRoot}
                  onResetRange={() => {
                    setAdvRoot(null);
                    setAdvSpan(null);
                  }}
                />
              </div>
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
          ) : null}

          {!isRecording && !showWrittenGuide ? (
            <div className="musai-studio-notes-prompt mx-auto max-w-xl px-5 py-5 text-center">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--musai-muted)]">
                Notes closed
              </p>
            </div>
          ) : null}

          <div className="relative mx-auto mt-6 w-full max-w-md">
            <section
              data-anime-enter
              className={`relative w-full overflow-visible rounded-[var(--musai-radius-lg)] border border-[var(--musai-border)] bg-[var(--musai-surface-2)] transition-[border-color] duration-300 ${
                isRecording
                  ? "border-[color-mix(in_srgb,var(--musai-accent-2)_45%,var(--musai-border))]"
                  : recordedBlob && captureMode === "record"
                    ? "border-[color-mix(in_srgb,var(--musai-ok)_35%,var(--musai-border))]"
                    : ""
              }`}
            >
              <div className="px-4 py-4 sm:px-5 sm:py-5">
                {!isRecording ? (
                  <div className="flex items-center justify-between gap-3">
                    {(captureMode === "record" && recordedBlob) ||
                    (captureMode === "upload" && file) ? (
                      <span className="musai-studio-status musai-studio-status--ready">
                        <span className="musai-studio-status__dot" aria-hidden />
                        Ready
                      </span>
                    ) : (
                      <span />
                    )}
                    <MusaiSegmentedControl<CaptureMode>
                      ariaLabel="Capture source"
                      value={captureMode}
                      onChange={setCaptureMode}
                      options={[
                        { value: "record", label: "Record" },
                        { value: "upload", label: "Import" },
                      ]}
                      className="max-w-[12.5rem]"
                      size="compact"
                    />
                  </div>
                ) : null}

              {captureMode === "upload" ? (
                <div
                  className={`mt-3 overflow-hidden rounded-[var(--musai-radius)] transition-[border-color,background-color] duration-300 ${
                    uploadProcessing
                      ? "border border-[color-mix(in_srgb,var(--musai-accent)_35%,var(--musai-border))] bg-[var(--musai-accent-soft)]"
                      : file
                        ? "border border-[color-mix(in_srgb,var(--musai-ok)_30%,var(--musai-border))] bg-[var(--musai-surface)]"
                        : "border border-dashed border-[var(--musai-border)] bg-[var(--musai-surface)] hover:border-[color-mix(in_srgb,var(--musai-accent)_40%,var(--musai-border))]"
                  }`}
                >
                  {file ? (
                    <div className="relative min-h-[7.5rem]">
                      <div
                        className={`absolute inset-0 flex flex-col items-center justify-center px-4 py-4 transition-opacity duration-300 ${
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
                        <span className="mt-2 max-w-full truncate px-2 text-center text-xs text-[var(--musai-muted)]">
                          {file.name}
                        </span>
                      </div>
                      <label
                        className={`group flex cursor-pointer flex-col items-center justify-center px-4 py-4 transition-opacity duration-300 ${
                          uploadProcessing
                            ? "pointer-events-none relative z-0 min-h-[7.5rem] opacity-0"
                            : "relative z-10 min-h-[7.5rem] opacity-100"
                        }`}
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--musai-accent-soft)] text-[var(--musai-ok)] ring-1 ring-[color-mix(in_srgb,var(--musai-ok)_25%,transparent)]">
                          <svg
                            viewBox="0 0 24 24"
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            aria-hidden
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </span>
                          <span className="mt-2 text-sm font-semibold text-[var(--musai-ok)]">
                            Audio ready
                          </span>
                          <span className="mt-1 max-w-full truncate px-2 text-center text-xs text-[var(--musai-muted)]">
                            {file.name}
                          </span>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm,.flac"
                            className="sr-only"
                            onChange={handleFileChange}
                          />
                        </label>
                      </div>
                    ) : (
                      <label className="flex cursor-pointer flex-col items-center justify-center px-4 py-5 transition-colors duration-200 hover:bg-[var(--musai-surface-2)]">
                        <span className="text-sm font-semibold text-[var(--musai-ink)]">
                          Import audio
                        </span>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm,.flac"
                          className="sr-only"
                          onChange={handleFileChange}
                        />
                      </label>
                    )}
                </div>
              ) : (
                <div className="mt-3" ref={mainRecorderRef}>
                  <MusaiMicCapturePanel
                    selectId="musai-mic-scale"
                    micDevices={micDevices}
                    selectedMicId={selectedMicId}
                    onMicChange={setSelectedMicId}
                    onMicRefresh={refreshMicDevices}
                    isRecording={isRecording}
                    hasSavedClip={!!recordedBlob}
                    density="compact"
                    experience="studio"
                    onDiscardClip={() => {
                      setRecordedBlob(null);
                      resetCaptureSession();
                    }}
                    onStartRecording={() => void startRecording()}
                    onStopRecording={stopRecording}
                    streamRef={streamRef}
                    elapsedLabelOverride={elapsedLabel}
                    levelBarsOverride={levelBars}
                    lastTakeLabelOverride={lastTakeLabel}
                  />
                </div>
              )}

              {message && status === "error" ? (
                <AnimatedReveal
                  className="musai-glass-inset mt-5 border-[color-mix(in_srgb,var(--musai-accent-2)_30%,var(--musai-border))] bg-[color-mix(in_srgb,var(--musai-accent-2)_8%,white)] px-4 py-3 text-center text-sm text-[var(--musai-accent-2)]"
                  role="alert"
                  aria-live="assertive"
                  delay={20}
                >
                  <p data-anime-enter>{message}</p>
                </AnimatedReveal>
              ) : null}

              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  disabled={!canAnalyze}
                  onClick={() => void runAnalyze()}
                  className="musai-btn-primary"
                >
                  Analyse
                </button>
              </div>
              </div>
            </section>

            {!pendingDetect && !isRecording ? (
              <aside
                data-anime-enter
                className="pointer-events-none absolute top-0 left-[calc(100%+1.25rem)] hidden w-[14.5rem] lg:block"
              >
                <div className="pointer-events-auto sticky top-24">
                  <ScaleRecentTakesPanel />
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
              onClick={() => {
                setPendingDetect(null);
                setShowWrittenGuide(true);
              }}
            >
              Pick manually
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
