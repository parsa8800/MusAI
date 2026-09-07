"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MusaiCaptureDock } from "@/components/MusaiCaptureDock";
import { MusaiFloatingMiniRecorder } from "@/components/MusaiFloatingMiniRecorder";
import { MusaiSplitPane, MUSAI_SCALE_SPLIT_STORAGE_KEY } from "@/components/MusaiSplitPane";
import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";
import { ScalePickControls, type ScaleMotion } from "@/components/ScalePickControls";
import { ScaleDetectAmbiguity } from "@/components/ScaleDetectAmbiguity";
import { ScaleExpectCoachPanel } from "@/components/ScaleExpectCoachPanel";
import { DraftNotesFrame } from "@/components/ScaleStudioHomeDraft";
import { ScaleTrebleStaff } from "@/components/ScaleTrebleStaff";
import { ScalePracticeInfoProvider } from "@/components/scalePracticeInfoContext";
import { ScaleProgressPanel } from "@/components/ScaleProgressPanel";
import { StudioViewport } from "@/components/StudioViewport";
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
} from "@/lib/scaleDetectSession";
import { buildScalePracticeGuideModel } from "@/lib/scalePracticeGuide";
import { persistScalePracticeSession } from "@/lib/scalePracticeSession";
import type { ScaleProgressJourneyV1 } from "@/lib/scaleProgressHistory";
import { listScaleProgressJourneys } from "@/lib/scaleProgressHistory";
import {
  buildAscendingScaleMidis,
  buildExerciseScaleMidis,
  defaultRootMidiForTonic,
  type ScaleKind,
} from "@/lib/scales";
import {
  scaleWorkspaceHref,
} from "@/lib/scaleWorkspace";

type CaptureMode = "record" | "upload";

/**
 * Scale Studio home — one notes|tips template. Optional: pick a scale on the left.
 */
export function ScaleStudioSelector() {
  const router = useRouter();
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
  const autoAnalyzeToken = useRef(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRecordingRef = useRef(false);
  const retakeAfterStopRef = useRef(false);
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

  useEffect(() => {
    setScaleCount(listScaleProgressJourneys().length);
  }, [progressOpen, progressRevision]);

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
      setProgressRevision((n) => n + 1);
      // Land on feedback so an import/record can be reviewed immediately.
      router.push("/practice/scale/results");
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
          const preferred = needNotes
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
    [captureMode, file, needNotes, octaveSpan, openDetected, recordedBlob, scaleKind, tonicPc],
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
          if (retakeAfterStopRef.current) {
            retakeAfterStopRef.current = false;
            queueMicrotask(() => {
              void startRecordingRef.current();
            });
          }
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

  const startRecordingRef = useRef(startRecording);
  startRecordingRef.current = startRecording;

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

  const retakeRecording = useCallback(() => {
    if (!isRecording) return;
    retakeAfterStopRef.current = true;
    discardRecordingRef.current = true;
    stopRecording();
  }, [isRecording, stopRecording]);

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
  const ascendingMidis = useMemo(
    () => buildAscendingScaleMidis(rootMidi, scaleKind, octaveSpan),
    [octaveSpan, rootMidi, scaleKind],
  );
  const expectedMidis = useMemo(
    () =>
      scaleMotion === "ascending"
        ? ascendingMidis
        : buildExerciseScaleMidis(rootMidi, scaleKind, octaveSpan),
    [ascendingMidis, octaveSpan, rootMidi, scaleKind, scaleMotion],
  );
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
      };
    }
    return base;
  }, [ascendingMidis.length, octaveSpan, rootMidi, scaleKind, scaleMotion, tonicPc]);

  return (
    <ScalePracticeInfoProvider>
      <StudioViewport>
        <header className="flex shrink-0 items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-6">
          <PracticeHubBackLink className="!mb-0 shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold tracking-tight text-[var(--musai-ink)] sm:text-[16px]">
              Scale studio
            </h1>
          </div>
          <button
            type="button"
            className={`musai-pressable inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-3 py-2 text-[13px] font-semibold sm:px-3.5 ${
              progressOpen
                ? "bg-[var(--musai-accent-soft)] text-[var(--musai-ink)]"
                : "bg-[var(--musai-surface)] text-[var(--musai-ink)] shadow-[var(--musai-shadow)] hover:bg-[var(--musai-surface-2)]"
            }`}
            onClick={() => setProgressOpen((v) => !v)}
            aria-expanded={progressOpen}
            aria-controls="scale-studio-my-scales"
          >
            <span>My scales</span>
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

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <MusaiSplitPane
            storageKey={MUSAI_SCALE_SPLIT_STORAGE_KEY}
            divider="draft"
            resizable
            left={
              <section
                className="musai-studio-pane"
                aria-label={needNotes ? "Pick notes" : "Play a scale"}
              >
                <div className="musai-studio-pane__chrome">
                  <div
                    className="mx-auto flex w-full max-w-sm rounded-full bg-[var(--musai-surface-2)] p-1"
                    role="tablist"
                    aria-label="Notes mode"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={!needNotes}
                      onClick={() => setNeedNotes(false)}
                      className={`flex-1 rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${
                        !needNotes
                          ? "bg-[var(--musai-surface)] text-[var(--musai-ink)] shadow-[0_2px_10px_rgba(28,25,23,0.06)]"
                          : "text-[var(--musai-muted)] hover:text-[var(--musai-ink)]"
                      }`}
                    >
                      Just play
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={needNotes}
                      onClick={() => setNeedNotes(true)}
                      className={`flex-1 rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${
                        needNotes
                          ? "bg-[var(--musai-accent-soft)] text-[var(--musai-ink)] shadow-[0_2px_10px_rgba(28,25,23,0.06)]"
                          : "text-[var(--musai-muted)] hover:text-[var(--musai-ink)]"
                      }`}
                    >
                      Pick notes
                    </button>
                  </div>
                </div>

                {status === "loading" && !needNotes ? (
                  <div className="musai-studio-pane__stage">
                    <div
                      className="h-10 w-10 rounded-full border-2 border-transparent border-t-[var(--musai-accent)] motion-safe:animate-spin motion-reduce:animate-none"
                      aria-hidden
                    />
                    <p className="text-[15px] font-medium text-[var(--musai-ink)]">
                      Listening…
                    </p>
                  </div>
                ) : needNotes ? (
                  <div className="musai-studio-pane__stage musai-studio-pane__stage--pick max-w-2xl self-center w-full">
                    <div className="w-full shrink-0">
                      <ScalePickControls
                        tonicPc={tonicPc}
                        onTonicPc={setTonicPc}
                        scaleKind={scaleKind}
                        onScaleKind={setScaleKind}
                        octaveSpan={octaveSpan}
                        onOctaveSpan={setOctaveSpan}
                        scaleMotion={scaleMotion}
                        onScaleMotion={setScaleMotion}
                      />
                    </div>
                    <div className="flex min-h-0 w-full flex-1 basis-0 flex-col justify-center overflow-hidden">
                      {status === "loading" ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-[1.25rem] bg-[color-mix(in_srgb,var(--musai-surface)_96%,transparent)] px-2 py-6 shadow-[var(--musai-shadow)]">
                          <div
                            className="h-10 w-10 rounded-full border-2 border-transparent border-t-[var(--musai-accent)] motion-safe:animate-spin motion-reduce:animate-none"
                            aria-hidden
                          />
                          <p className="text-[14px] font-medium text-[var(--musai-ink)]">
                            Listening…
                          </p>
                        </div>
                      ) : (
                        <div className="max-h-full min-h-0 overflow-y-auto overflow-x-hidden">
                          <ScaleTrebleStaff
                            ascendingMidis={expectedMidis.slice(
                              0,
                              guideModel.ascendingCount,
                            )}
                            descendingMidis={expectedMidis.slice(
                              guideModel.ascendingCount,
                            )}
                            tonicPitchClass={tonicPc}
                            scaleKind={scaleKind}
                            density="pad"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="musai-studio-pane__stage">
                    <h2 className="musai-studio-pane__title">Play a scale</h2>
                    <DraftNotesFrame />
                  </div>
                )}
              </section>
            }
            right={
              status === "loading" ? (
                <section className="musai-studio-pane" aria-label="Listening">
                  <div className="musai-studio-pane__chrome" aria-hidden />
                  <div className="musai-studio-pane__stage">
                    <div
                      className="h-10 w-10 rounded-full border-2 border-transparent border-t-[var(--musai-accent)] motion-safe:animate-spin motion-reduce:animate-none"
                      aria-hidden
                    />
                    <p className="text-[14px] font-medium text-[var(--musai-muted)]">
                      Listening…
                    </p>
                  </div>
                </section>
              ) : (
                <ScaleExpectCoachPanel compact={needNotes} />
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

          {progressOpen ? (
            <div id="scale-studio-my-scales" className="musai-scales-drawer">
              <ScaleProgressPanel
                revision={progressRevision}
                onContinue={continueJourney}
              />
            </div>
          ) : null}
        </div>

        <div className="shrink-0 px-3 pb-2 pt-2 sm:px-4">
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
            onRetakeRecording={retakeRecording}
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
      </StudioViewport>
    </ScalePracticeInfoProvider>
  );
}
