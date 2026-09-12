"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  buildScalePracticeGuideModel,
  scaleRecordingTips,
} from "@/lib/scalePracticeGuide";
import { persistScalePracticeSession } from "@/lib/scalePracticeSession";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";
import { appendAttemptForExercise } from "@/lib/scaleTakeHistory";
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
  buildAscendingScaleMidis,
  buildScaleExerciseMidis,
  defaultRootMidiForTonic,
  scaleDisplayLabel,
  type ScaleKind,
} from "@/lib/scales";
import {
  scaleWorkspaceHref,
} from "@/lib/scaleWorkspace";

type CaptureMode = "record" | "upload";

/**
 * Scale Studio home — results layout with recording on the same page.
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
  const [loopAttempts, setLoopAttempts] = useState<ScalePracticeSessionV1[]>(
    [],
  );
  const autoAnalyzeToken = useRef(0);

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
        waveformRef.current,
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
    [resetTakeUi, waveformRef],
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
          resetTakeUi();
          chunksRef.current = [];
          setRecordedBlob(null);
          resetCaptureSession();
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
  }, [refreshMicDevices, resetCaptureSession, resetTakeUi, runDetect, selectedMicId, stopStream]);

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

  const rootMidi = useMemo(
    () => defaultRootMidiForTonic(tonicPc),
    [tonicPc],
  );
  const ascendingMidis = useMemo(
    () => buildAscendingScaleMidis(rootMidi, scaleKind, octaveSpan),
    [octaveSpan, rootMidi, scaleKind],
  );
  const expectedMidis = useMemo(
    () => buildScaleExerciseMidis(rootMidi, scaleKind, octaveSpan, scaleMotion),
    [octaveSpan, rootMidi, scaleKind, scaleMotion],
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
        recordingTips: scaleRecordingTips(false),
      };
    }
    return base;
  }, [ascendingMidis.length, octaveSpan, rootMidi, scaleKind, scaleMotion, tonicPc]);

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
            readyTitle={
              needNotes
                ? scaleDisplayLabel(tonicPc, scaleKind)
                : "Play a scale"
            }
            readyCaption=""
            showStaffHeading={Boolean(latestAttempt) || !needNotes}
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
            subtitle="Scales you’ve already practised. Tap one to keep going."
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
