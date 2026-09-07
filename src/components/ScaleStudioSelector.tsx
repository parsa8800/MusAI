"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MusaiCaptureDock } from "@/components/MusaiCaptureDock";
import { MusaiFloatingMiniRecorder } from "@/components/MusaiFloatingMiniRecorder";
import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";
import { ScaleDetectAmbiguity } from "@/components/ScaleDetectAmbiguity";
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
import { persistScalePracticeSession } from "@/lib/scalePracticeSession";
import type { ScaleProgressJourneyV1 } from "@/lib/scaleProgressHistory";
import { scaleWorkspaceHref } from "@/lib/scaleWorkspace";

type CaptureMode = "record" | "upload";

/**
 * Scale Studio home — play any scale; we detect it, save progress, and open
 * that scale’s pad. No select-then-record.
 */
export function ScaleStudioSelector() {
  const router = useRouter();
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
    [captureMode, file, openDetected, recordedBlob],
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
            {progressOpen ? "Hide progress" : "In progress"}
          </button>
        </header>

        <div className="relative grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
          <section
            className="flex min-h-0 flex-col items-center justify-center overflow-hidden px-6 py-4 text-center"
            aria-label="How Scale studio works"
          >
            <p className="font-display text-2xl font-semibold tracking-tight text-[var(--musai-ink)] sm:text-3xl">
              Play a scale
            </p>
            <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-[var(--musai-muted)] sm:text-[14px]">
              Record any major or minor scale. MusAI detects what you played,
              opens that scale’s page, and coaches from the take.
            </p>
            <ol className="mt-5 max-w-xs space-y-2 text-left text-[12px] leading-snug text-[var(--musai-muted)]">
              <li className="flex gap-2">
                <span className="font-semibold tabular-nums text-[var(--musai-ink)]">
                  1
                </span>
                Hit record and play up, then down
              </li>
              <li className="flex gap-2">
                <span className="font-semibold tabular-nums text-[var(--musai-ink)]">
                  2
                </span>
                We open the matching scale page with feedback
              </li>
              <li className="flex gap-2">
                <span className="font-semibold tabular-nums text-[var(--musai-ink)]">
                  3
                </span>
                Record again there — a new scale starts a new page
              </li>
            </ol>
          </section>

          <section
            className="flex min-h-0 flex-col items-center justify-center overflow-hidden border-t border-[var(--musai-border)] px-6 py-4 text-center md:border-l md:border-t-0"
            aria-label="Ready to record"
          >
            {status === "loading" ? (
              <div className="flex flex-col items-center gap-3">
                <div
                  className="h-10 w-10 rounded-full border-2 border-[var(--musai-border)] border-t-[var(--musai-accent)] motion-safe:animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
                <p className="text-[13px] text-[var(--musai-muted)]">
                  Listening for your scale…
                </p>
              </div>
            ) : (
              <>
                <p className="font-display text-xl font-semibold text-[var(--musai-ink)]">
                  Ready when you are
                </p>
                <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-[var(--musai-muted)]">
                  Use the record bar below. No need to pick a key first.
                </p>
              </>
            )}
          </section>

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
