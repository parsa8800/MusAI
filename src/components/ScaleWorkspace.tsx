"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MusaiCaptureDock } from "@/components/MusaiCaptureDock";
import { MusaiFloatingMiniRecorder } from "@/components/MusaiFloatingMiniRecorder";
import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";
import { ScaleGuidePanel } from "@/components/ScaleGuidePanel";
import { ScaleInlineFeedback } from "@/components/ScaleInlineFeedback";
import { ScalePracticeInfoProvider } from "@/components/scalePracticeInfoContext";
import { useFloatingMiniRecorder } from "@/hooks/useFloatingMiniRecorder";
import { useSyncedRecorderUi } from "@/hooks/useSyncedRecorderUi";
import { analyzeScalePerformance } from "@/lib/analyzeScalePerformance";
import { bufferToMono } from "@/lib/analyzePitch";
import {
  alignAnalysisToDetectedOctave,
  staffFeedbackFromSession,
} from "@/lib/alignScaleOctave";
import { createAudioContext } from "@/lib/audioContext";
import { buildScalePracticeSession } from "@/lib/buildScalePracticeSession";
import { createMediaRecorder, startMediaRecorder } from "@/lib/mediaRecorderMime";
import { describeMicOpenError, getMicStream } from "@/lib/micStream";
import {
  getScaleProgressJourney,
  persistScalePracticeSession,
} from "@/lib/scalePracticeSession";
import { buildScalePracticeGuideModel } from "@/lib/scalePracticeGuide";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";
import {
  buildExerciseScaleMidis,
  defaultRootMidiForTonic,
  validateScaleMidisInViolinRange,
} from "@/lib/scales";
import type { ScaleWorkspaceIdentity } from "@/lib/scaleWorkspace";
import { workspaceTitle } from "@/lib/scaleWorkspace";

type CaptureMode = "record" | "upload";

/**
 * Persistent practice workspace — one pad screen: notes | coach, record pinned.
 */
export function ScaleWorkspace({
  identity,
}: {
  identity: ScaleWorkspaceIdentity;
}) {
  const searchParams = useSearchParams();
  const rootMidi = useMemo(
    () => defaultRootMidiForTonic(identity.tonicPitchClass),
    [identity.tonicPitchClass],
  );
  const [loopAttempts, setLoopAttempts] = useState<ScalePracticeSessionV1[]>(
    [],
  );
  const [bestAccuracy, setBestAccuracy] = useState(0);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    void searchParams;
    const journey = getScaleProgressJourney(identity.progressKey);
    if (journey) {
      setLoopAttempts(journey.attempts);
      setBestAccuracy(journey.bestInTunePercent);
      setFeedbackOpen(journey.attempts.length > 0);
    } else {
      setLoopAttempts([]);
      setBestAccuracy(0);
      setFeedbackOpen(false);
    }
  }, [identity.progressKey, searchParams]);

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
    () =>
      buildExerciseScaleMidis(
        rootMidi,
        identity.scaleKind,
        identity.octaveSpan,
      ),
    [identity.octaveSpan, identity.scaleKind, rootMidi],
  );

  const guideModel = useMemo(
    () =>
      buildScalePracticeGuideModel(
        identity.tonicPitchClass,
        identity.scaleKind,
        rootMidi,
        identity.octaveSpan,
      ),
    [identity.octaveSpan, identity.scaleKind, identity.tonicPitchClass, rootMidi],
  );

  const latestAttempt = loopAttempts[loopAttempts.length - 1] ?? null;
  const staffFeedback = useMemo(() => {
    if (!latestAttempt || !feedbackOpen) return null;
    return staffFeedbackFromSession(latestAttempt);
  }, [feedbackOpen, latestAttempt]);

  const staffMidis = staffFeedback?.displayMidis ?? expectedMidis;

  const completeAttempt = useCallback((session: ScalePracticeSessionV1) => {
    persistScalePracticeSession(session);
    setLoopAttempts((prev) => {
      const same =
        prev.length > 0 &&
        prev[0]!.scaleId === session.scaleId &&
        prev[0]!.octaveSpan === session.octaveSpan;
      return same ? [...prev, session] : [session];
    });
    setBestAccuracy((prev) =>
      Math.max(prev, session.summary.inTunePercent),
    );
    setStatus("idle");
    setMessage(null);
    setRecordedBlob(null);
    setFile(null);
    setFeedbackOpen(true);
  }, []);

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

      if (!validateScaleMidisInViolinRange(expectedMidis)) {
        setMessage(
          "This range leaves the violin span. Choose a lower start note.",
        );
        setStatus("error");
        return;
      }

      const token = ++autoAnalyzeToken.current;
      setStatus("loading");
      setMessage(null);

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

        const analysis = analyzeScalePerformance({
          mono,
          sampleRateHz,
          expectedMidis,
        });

        if (token !== autoAnalyzeToken.current) return;

        if (analysis.summary.notesAnalyzed > 0) {
          const aligned = alignAnalysisToDetectedOctave(
            expectedMidis,
            rootMidi,
            analysis,
          );
          const session = buildScalePracticeSession({
            tonicPitchClass: identity.tonicPitchClass,
            scaleKind: identity.scaleKind,
            rootMidi: aligned.rootMidi,
            octaveSpan: identity.octaveSpan,
            audioSourceType,
            sampleRateHz,
            analysis: aligned.analysis,
            expectedNotesMidi: aligned.expectedMidis,
            scaleSource: "selected",
          });
          completeAttempt(session);
          return;
        }

        setStatus("error");
        setMessage(
          "Couldn’t hear a clear scale. Re-record slower, one note per bow, then try again.",
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
    [
      captureMode,
      completeAttempt,
      expectedMidis,
      file,
      identity.octaveSpan,
      identity.scaleKind,
      identity.tonicPitchClass,
      recordedBlob,
      rootMidi,
    ],
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
        void runAnalyze(blob, null);
      };

      startMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err) {
      stopStream();
      setMessage(describeMicOpenError(err));
      setStatus("error");
    }
  }, [refreshMicDevices, runAnalyze, selectedMicId, stopStream]);

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

  const title = workspaceTitle(identity.scaleLabel, identity.octaveSpan);

  return (
    <ScalePracticeInfoProvider>
      <div className="flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden">
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--musai-border)] px-4 py-2.5 sm:px-6">
          <PracticeHubBackLink
            href="/practice/scale"
            label="Scale studio"
            ariaLabel="Back to Scale studio"
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold tracking-tight text-[var(--musai-ink)] sm:text-[16px]">
              {title}
            </h1>
          </div>
          {bestAccuracy > 0 ? (
            <span
              className="musai-chip musai-chip--on shrink-0 tabular-nums"
              title="Best in-tune"
            >
              Best {Math.round(bestAccuracy)}%
            </span>
          ) : null}
          <Link
            href="/practice/scale"
            className="shrink-0 text-[12px] font-medium text-[var(--musai-muted)] underline decoration-[var(--musai-border)] underline-offset-2 hover:text-[var(--musai-ink)]"
          >
            Change scale
          </Link>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
          <section
            className="flex min-h-0 flex-col overflow-hidden px-4 py-3 sm:px-5"
            aria-label="Scale notes"
          >
            <div className="min-h-0 flex-1 overflow-hidden">
              <ScaleGuidePanel
                guide={guideModel}
                exerciseMidis={staffMidis}
                tonicPitchClass={identity.tonicPitchClass}
                scaleKind={identity.scaleKind}
                octaveSpan={identity.octaveSpan}
                ascendingCents={staffFeedback?.ascendingCents}
                descendingCents={staffFeedback?.descendingCents}
                compact
              />
            </div>
          </section>

          <section
            className="flex min-h-0 flex-col overflow-hidden border-t border-[var(--musai-border)] md:border-l md:border-t-0"
            aria-label="Coach feedback"
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3 sm:px-5">
              {feedbackOpen && latestAttempt ? (
                <ScaleInlineFeedback
                  session={latestAttempt}
                  loopAttempts={loopAttempts}
                  compact
                />
              ) : (
                <p className="py-8 text-center text-[13px] text-[var(--musai-muted)]">
                  Record to hear feedback
                </p>
              )}
            </div>
          </section>
        </div>

        <div className="shrink-0 border-t border-[var(--musai-border)] px-3 py-2 sm:px-4">
          <MusaiCaptureDock
            selectId="musai-mic-scale-workspace"
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
            lastTakeLabel={
              lastTakeLabel ??
              (loopAttempts.length > 0
                ? `Take ${loopAttempts.length + 1}`
                : null)
            }
            message={message}
            status={status}
            canAnalyze={canAnalyze}
            onAnalyze={() => void runAnalyze()}
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
