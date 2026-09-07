"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MusaiCaptureDock } from "@/components/MusaiCaptureDock";
import { MusaiFloatingMiniRecorder } from "@/components/MusaiFloatingMiniRecorder";
import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";
import { ScaleChoiceSidebar } from "@/components/ScaleChoiceSidebar";
import { ScaleDetectAmbiguity } from "@/components/ScaleDetectAmbiguity";
import { ScaleGuidePanel } from "@/components/ScaleGuidePanel";
import { ScalePracticeInfoProvider } from "@/components/scalePracticeInfoContext";
import { ScaleProgressPanel } from "@/components/ScaleProgressPanel";
import { useFloatingMiniRecorder } from "@/hooks/useFloatingMiniRecorder";
import { useSyncedRecorderUi } from "@/hooks/useSyncedRecorderUi";
import { bufferToMono } from "@/lib/analyzePitch";
import { createAudioContext } from "@/lib/audioContext";
import {
  detectScaleFromAudio,
  type ScaleCandidate,
} from "@/lib/detectScale";
import { createMediaRecorder, startMediaRecorder } from "@/lib/mediaRecorderMime";
import { describeMicOpenError, getMicStream } from "@/lib/micStream";
import {
  sessionFromDetectedCandidate,
  workspaceHrefForCandidate,
} from "@/lib/scaleDetectSession";
import { buildScalePracticeGuideModel } from "@/lib/scalePracticeGuide";
import { persistScalePracticeSession } from "@/lib/scalePracticeSession";
import type { ScaleProgressJourneyV1 } from "@/lib/scaleProgressHistory";
import {
  buildExerciseScaleMidis,
  defaultRootMidiForTonic,
  type ScaleKind,
} from "@/lib/scales";
import {
  identityFromSelection,
  scaleWorkspaceHref,
} from "@/lib/scaleWorkspace";

type CaptureMode = "record" | "upload";
type HomeView = "play" | "notes";

/**
 * Scale Studio home — play first (kid-clear). Optional: pick a scale to see notes while recording.
 */
export function ScaleStudioSelector() {
  const router = useRouter();
  const [homeView, setHomeView] = useState<HomeView>("play");
  const [tonicPc, setTonicPc] = useState(0);
  const [scaleKind, setScaleKind] = useState<ScaleKind>("major");
  const [octaveSpan, setOctaveSpan] = useState<1 | 2>(1);
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
  const [pendingDetect, setPendingDetect] = useState<{
    alternatives: ScaleCandidate[];
    sampleRateHz: number;
    audioSourceType: "recorded" | "uploaded";
  } | null>(null);
  const autoAnalyzeToken = useRef(0);

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
      );
      persistScalePracticeSession(session);
      setPendingDetect(null);
      setStatus("idle");
      setMessage(null);
      setRecordedBlob(null);
      setFile(null);
      router.push(workspaceHrefForCandidate(candidate));
    },
    [router],
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
        const detected = detectScaleFromAudio(mono, sampleRateHz);
        if (token !== autoAnalyzeToken.current) return;

        if (detected.ok && detected.ambiguous) {
          const preferred =
            homeView === "notes"
              ? detected.alternatives.find(
                  (c) =>
                    c.tonicPitchClass === tonicPc &&
                    c.scaleKind === scaleKind &&
                    c.octaveSpan === octaveSpan,
                )
              : undefined;
          if (preferred) {
            openDetected(preferred, sampleRateHz, audioSourceType);
            return;
          }
          setPendingDetect({
            alternatives: detected.alternatives,
            sampleRateHz,
            audioSourceType,
          });
          setStatus("idle");
          return;
        }
        if (detected.ok) {
          openDetected(detected.best, sampleRateHz, audioSourceType);
          return;
        }

        setStatus("error");
        setMessage(
          detected.reason === "no_pitch"
            ? "Couldn’t detect clear pitches. Re-record slower, one note per bow, in a quieter room."
            : "Couldn’t match that take to a scale. Play a full scale up and down, then try again.",
        );
      } catch (e) {
        if (token !== autoAnalyzeToken.current) return;
        setStatus("error");
        setMessage(
          e instanceof Error
            ? e.message
            : "Could not analyse that take. Try a clearer recording.",
        );
      }
    },
    [captureMode, file, homeView, octaveSpan, openDetected, recordedBlob, scaleKind, tonicPc],
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
    (e: React.ChangeEvent<HTMLInputElement>) => {
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
        setMessage("Recording failed. Try again or import a file.");
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
        void runDetect(blob, null);
      };

      startMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err) {
      stopStream();
      setMessage(describeMicOpenError(err));
      setStatus("error");
    }
  }, [refreshMicDevices, runDetect, selectedMicId, stopStream]);

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
    setProgressOpen(false);
    router.push(
      scaleWorkspaceHref(journey.scaleId, journey.lastOctaveSpan),
    );
  };

  const rootMidi = useMemo(
    () => defaultRootMidiForTonic(tonicPc),
    [tonicPc],
  );
  const guideIdentity = useMemo(
    () => identityFromSelection(tonicPc, scaleKind, octaveSpan),
    [octaveSpan, scaleKind, tonicPc],
  );
  const expectedMidis = useMemo(
    () => buildExerciseScaleMidis(rootMidi, scaleKind, octaveSpan),
    [octaveSpan, rootMidi, scaleKind],
  );
  const guideModel = useMemo(
    () =>
      buildScalePracticeGuideModel(tonicPc, scaleKind, rootMidi, octaveSpan),
    [octaveSpan, rootMidi, scaleKind, tonicPc],
  );

  const openPickedScale = () => {
    router.push(
      scaleWorkspaceHref(guideIdentity.scaleId, guideIdentity.octaveSpan),
    );
  };

  return (
    <ScalePracticeInfoProvider>
      <div className="relative flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden">
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--musai-border)] px-4 py-2.5 sm:px-6">
          <PracticeHubBackLink className="!mb-0" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold tracking-tight text-[var(--musai-ink)] sm:text-[16px]">
              Scale studio
            </h1>
          </div>
          <button
            type="button"
            className="shrink-0 text-[12px] font-medium text-[var(--musai-muted)] underline decoration-[var(--musai-border)] underline-offset-2 hover:text-[var(--musai-ink)]"
            onClick={() => setProgressOpen((v) => !v)}
            aria-expanded={progressOpen}
          >
            {progressOpen ? "Hide" : "In progress"}
          </button>
        </header>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          {homeView === "play" ? (
            <section
              className="flex h-full min-h-0 flex-col items-center justify-center gap-6 px-6 py-6 text-center"
              aria-label="Play a scale"
            >
              {status === "loading" ? (
                <div className="flex flex-col items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-full border-2 border-[var(--musai-border)] border-t-[var(--musai-accent)] motion-safe:animate-spin motion-reduce:animate-none"
                    aria-hidden
                  />
                  <p className="text-[15px] font-medium text-[var(--musai-ink)]">
                    Listening…
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <p className="font-display text-3xl font-semibold tracking-tight text-[var(--musai-ink)] sm:text-4xl">
                      Play a scale
                    </p>
                    <p className="text-[16px] font-medium text-[var(--musai-muted)] sm:text-[17px]">
                      Press record · play up · then down
                    </p>
                  </div>

                  <ol className="flex flex-wrap items-center justify-center gap-3 text-[13px] font-semibold text-[var(--musai-ink)] sm:gap-4">
                    <li className="inline-flex items-center gap-2 rounded-full border border-[var(--musai-border)] bg-[var(--musai-surface)] px-3 py-1.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--musai-accent-soft)] text-[12px] text-[var(--musai-ok)]">
                        1
                      </span>
                      Record
                    </li>
                    <li className="inline-flex items-center gap-2 rounded-full border border-[var(--musai-border)] bg-[var(--musai-surface)] px-3 py-1.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--musai-accent-soft)] text-[12px] text-[var(--musai-ok)]">
                        2
                      </span>
                      We find it
                    </li>
                    <li className="inline-flex items-center gap-2 rounded-full border border-[var(--musai-border)] bg-[var(--musai-surface)] px-3 py-1.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--musai-accent-soft)] text-[12px] text-[var(--musai-ok)]">
                        3
                      </span>
                      Get tips
                    </li>
                  </ol>

                  <button
                    type="button"
                    onClick={() => setHomeView("notes")}
                    className="musai-btn-secondary mt-1 px-4 py-2 text-[13px]"
                  >
                    Need notes? Pick a scale
                  </button>
                </>
              )}
            </section>
          ) : (
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
              <div className="flex shrink-0 items-center gap-3 border-b border-[var(--musai-border)] px-4 py-2 sm:px-5">
                <button
                  type="button"
                  onClick={() => setHomeView("play")}
                  className="text-[13px] font-medium text-[var(--musai-muted)] underline decoration-[var(--musai-border)] underline-offset-2 hover:text-[var(--musai-ink)]"
                >
                  Back
                </button>
                <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--musai-ink)]">
                  Read these notes · then record
                </p>
                <button
                  type="button"
                  onClick={openPickedScale}
                  className="musai-btn-secondary shrink-0 px-3 py-1.5 text-[12px]"
                >
                  Open page
                </button>
              </div>

              <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[minmax(11rem,16rem)_minmax(0,1fr)]">
                <div className="min-h-0 overflow-y-auto border-b border-[var(--musai-border)] px-3 py-3 md:border-b-0 md:border-r">
                  <ScaleChoiceSidebar
                    tonicPc={tonicPc}
                    onTonicPc={setTonicPc}
                    scaleKind={scaleKind}
                    onScaleKind={setScaleKind}
                    octaveSpan={octaveSpan}
                    onOctaveSpan={setOctaveSpan}
                  />
                </div>
                <div className="min-h-0 overflow-hidden px-3 py-3 sm:px-5">
                  {status === "loading" ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3">
                      <div
                        className="h-10 w-10 rounded-full border-2 border-[var(--musai-border)] border-t-[var(--musai-accent)] motion-safe:animate-spin motion-reduce:animate-none"
                        aria-hidden
                      />
                      <p className="text-[15px] font-medium text-[var(--musai-ink)]">
                        Listening…
                      </p>
                    </div>
                  ) : (
                    <ScaleGuidePanel
                      guide={guideModel}
                      exerciseMidis={expectedMidis}
                      tonicPitchClass={tonicPc}
                      scaleKind={scaleKind}
                      octaveSpan={octaveSpan}
                      compact
                    />
                  )}
                </div>
              </div>
            </div>
          )}

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

          {progressOpen ? (
            <div className="absolute inset-y-0 right-0 z-10 w-full max-w-sm overflow-y-auto border-l border-[var(--musai-border)] bg-[var(--musai-bg)] p-4 shadow-[var(--musai-shadow)]">
              <ScaleProgressPanel onContinue={continueJourney} />
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-[var(--musai-border)] px-3 py-2 sm:px-4">
          <MusaiCaptureDock
            selectId="musai-mic-scale-studio"
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
            onAnalyze={() => void runDetect()}
            hideAnalyze
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
        />
      </div>
    </ScalePracticeInfoProvider>
  );
}
