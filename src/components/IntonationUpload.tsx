"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AudioActivityVisualizer } from "@/components/AudioActivityVisualizer";
import { NoteRing } from "@/components/NoteRing";
import { IntonationRecordingHelpButton } from "@/components/IntonationRecordingHelpButton";
import { MusaiCaptureDock } from "@/components/MusaiCaptureDock";
import { MusaiFloatingMiniRecorder } from "@/components/MusaiFloatingMiniRecorder";
import { ReferenceToneHelpButton } from "@/components/ReferenceToneHelpButton";
import { useFloatingMiniRecorder } from "@/hooks/useFloatingMiniRecorder";
import { useSyncedRecorderUi } from "@/hooks/useSyncedRecorderUi";
import { createAudioContext } from "@/lib/audioContext";
import {
  bufferToMono,
  estimatePitchMedianHz,
} from "@/lib/analyzePitch";
import {
  formatNoteLabel,
  intonationLabel,
  matchHzToPitchClass,
} from "@/lib/intonation";
import { createMediaRecorder, startMediaRecorder } from "@/lib/mediaRecorderMime";
import { describeMicOpenError, getMicStream } from "@/lib/micStream";
import { persistIntonationResult } from "@/lib/musaiResultSession";

type InputMode = "upload" | "record";

/** Brief import feedback — keep light so recording stays the focus. */
const UPLOAD_PROCESSING_MIN_MS = 400;
const UPLOAD_PROCESSING_MIN_MS_REDUCED = 0;

export function IntonationUpload() {
  const router = useRouter();
  const [inputMode, setInputMode] = useState<InputMode>("record");
  const [midi, setMidi] = useState(69);
  const [file, setFile] = useState<File | null>(null);
  /** Brief “processing” phase after pick so the card feels alive (not instant/static). */
  const [uploadProcessing, setUploadProcessing] = useState(false);
  const uploadTokenRef = useRef(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRecordingRef = useRef(false);
  const retakeAfterStopRef = useRef(false);
  const mainRecorderRef = useRef<HTMLDivElement | null>(null);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState("");

  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
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

  const resetSession = useCallback(() => {
    setStatus("idle");
    setMessage(null);
  }, []);

  const { elapsedLabel, lastTakeLabel, levelBars } = useSyncedRecorderUi(
    isRecording,
    streamRef,
  );
  const miniEnabled = inputMode === "record" && status !== "loading";
  const { miniMounted, miniVisible } = useFloatingMiniRecorder(
    mainRecorderRef,
    miniEnabled,
  );

  const handleAudioFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0] ?? null;
      if (!f) {
        setFile(null);
        setUploadProcessing(false);
        resetSession();
        return;
      }
      const token = ++uploadTokenRef.current;
      setFile(f);
      resetSession();
      setUploadProcessing(true);
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const minMs = reduced
        ? UPLOAD_PROCESSING_MIN_MS_REDUCED
        : UPLOAD_PROCESSING_MIN_MS;
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
          }
        }
      })();
    },
    [resetSession],
  );

  const setMode = (mode: InputMode) => {
    if (mode === inputMode) return;
    if (isRecording) {
      discardRecordingRef.current = true;
      mediaRecorderRef.current?.stop();
    }
    setInputMode(mode);
    resetSession();
    if (mode === "upload") {
      setRecordedBlob(null);
    } else {
      setFile(null);
      setUploadProcessing(false);
      uploadTokenRef.current += 1;
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

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

      const micTrack = stream.getAudioTracks()[0];
      if (micTrack?.muted) {
        stopStream();
        setMessage(
          "The selected microphone is muted in system settings. Unmute it and try again.",
        );
        setStatus("error");
        return;
      }

      const recorder = createMediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onerror = () => {
        setMessage(
          "Recording failed in the browser. Try again or use upload instead.",
        );
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
          setMessage(
            "No audio was captured. Try another mic under Input, or a longer take.",
          );
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

  const analyze = useCallback(async () => {
    const hasUpload = inputMode === "upload" && file;
    const hasRecording = inputMode === "record" && recordedBlob;
    if (!hasUpload && !hasRecording) {
      setMessage(
        inputMode === "upload"
          ? "Add a file first."
          : "Record a take first.",
      );
      setStatus("error");
      return;
    }

    setStatus("loading");
    setMessage(null);

    try {
      const ctx = createAudioContext();
      if (!ctx) {
        setStatus("error");
        setMessage(
          "This browser cannot start audio decoding. Try Chrome, Safari, or Firefox.",
        );
        return;
      }
      const arrayBuffer =
        inputMode === "upload"
          ? await file!.arrayBuffer()
          : await recordedBlob!.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      const sampleRateHz = audioBuffer.sampleRate;
      await ctx.close();

      const mono = bufferToMono(audioBuffer);
      const { medianHz, validFrames, totalFrames } = estimatePitchMedianHz(
        mono,
        sampleRateHz,
      );

      if (validFrames === 0 || medianHz <= 0) {
        setStatus("error");
        setMessage(
          "No clear pitch was found. Try a longer clip, one sustained note, and less background noise.",
        );
        return;
      }

      const targetPc = ((midi % 12) + 12) % 12;
      const match = matchHzToPitchClass(medianHz, targetPc);
      const label = intonationLabel(match.cents);

      persistIntonationResult({
        detectedHz: medianHz,
        targetHz: match.targetHz,
        cents: Math.round(match.cents * 10) / 10,
        label,
        score: match.score,
        validFrames,
        totalFrames,
        sampleRateHz,
        targetNoteLabel: formatNoteLabel(match.targetMidi),
      });
      setStatus("idle");
      router.push("/results");
    } catch (e) {
      setStatus("error");
      setMessage(
        e instanceof Error
          ? e.message
          : "Could not read that audio. Try another file or format.",
      );
    }
  }, [file, inputMode, midi, recordedBlob, router]);

  const canAnalyze =
    status !== "loading" &&
    (inputMode === "upload"
      ? !!file && !uploadProcessing
      : !!recordedBlob);

  return (
    <section className="w-full max-w-[min(1000px,100%)] space-y-7 sm:space-y-9">
      {status === "loading" && (
        <div
          className="musai-glass-surface relative flex flex-col items-center overflow-visible px-6 py-10 sm:py-12"
          role="status"
          aria-live="polite"
          aria-label="Analyzing audio"
        >
          <AudioActivityVisualizer variant="prominent" />
          <p className="mt-7 text-sm font-medium text-[var(--musai-ink)]">Analyzing…</p>
        </div>
      )}

      <div
        className={`${status === "loading" ? "pointer-events-none opacity-35" : ""}`}
      >
        <div className="musai-glass-surface relative overflow-visible">
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1.5rem]"
            aria-hidden
          >
            <div className="absolute bottom-4 left-3 top-4 w-[2px] rounded-full bg-gradient-to-b from-[var(--musai-accent)] via-[color-mix(in_srgb,var(--musai-accent)_60%,var(--musai-accent-2))] to-[var(--musai-accent-2)]" />
          </div>

          <div className="relative z-[2] grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
            {/* Target pitch */}
            <div className="flex flex-col overflow-visible border-b border-[var(--musai-border)] p-6 pt-7 sm:p-8 sm:pt-9 lg:border-b-0 lg:border-r lg:border-[var(--musai-border)]">
              <div className="flex items-start justify-between gap-3 pr-1 pt-0.5">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold tracking-tight text-[var(--musai-ink)]">
                    Target
                  </h2>
                </div>
                <ReferenceToneHelpButton />
              </div>

              <div className="relative mt-7 flex min-h-0 flex-1 items-center justify-center py-4 sm:py-6">
                <div
                  className="pointer-events-none absolute left-1/2 top-1/2 h-[min(92vw,380px)] w-[min(92vw,380px)] max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color-mix(in_srgb,var(--musai-accent)_9%,transparent)] blur-[72px]"
                  aria-hidden
                />
                <div className="relative z-[1] flex w-full justify-center">
                  <NoteRing
                    value={midi}
                    onChange={setMidi}
                    className="mx-auto w-full max-w-[min(100%,420px)]"
                  />
                </div>
              </div>
            </div>

            {/* Capture + analyze — same dock as Scale Studio */}
            <div className="flex flex-col justify-center p-6 sm:p-8">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold tracking-tight text-[var(--musai-ink)]">
                  Record
                </h2>
                <IntonationRecordingHelpButton />
              </div>
              <MusaiCaptureDock
                selectId="musai-mic-tuning"
                captureMode={inputMode}
                onCaptureMode={setMode}
                isRecording={isRecording}
                recordedBlob={recordedBlob}
                file={file}
                uploadProcessing={uploadProcessing}
                fileInputRef={fileInputRef}
                onFileChange={handleAudioFileChange}
                mainRecorderRef={mainRecorderRef}
                micDevices={micDevices}
                selectedMicId={selectedMicId}
                onMicChange={setSelectedMicId}
                onMicRefresh={refreshMicDevices}
                onDiscardClip={() => {
                  setRecordedBlob(null);
                  resetSession();
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
                onAnalyze={() => void analyze()}
              />
            </div>
          </div>
        </div>
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
    </section>
  );
}
