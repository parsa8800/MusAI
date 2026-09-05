"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AudioActivityVisualizer } from "@/components/AudioActivityVisualizer";
import { NoteRing } from "@/components/NoteRing";
import { IntonationRecordingHelpButton } from "@/components/IntonationRecordingHelpButton";
import { MusaiMicCapturePanel } from "@/components/MusaiMicCapturePanel";
import { MusaiFloatingMiniRecorder } from "@/components/MusaiFloatingMiniRecorder";
import { MusaiSegmentedControl } from "@/components/MusaiSegmentedControl";
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

/** Long enough that spectrum / EQ motion reads clearly (not a flash). */
const UPLOAD_PROCESSING_MIN_MS = 2100;
const UPLOAD_PROCESSING_MIN_MS_REDUCED = 720;

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
          <p className="mt-7 text-sm font-medium text-zinc-300">Analyzing…</p>
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
            <div className="absolute bottom-4 left-3 top-4 w-[2px] rounded-full bg-gradient-to-b from-emerald-400/55 via-sky-400/40 to-violet-500/35" />
          </div>

          <div className="relative z-[2] grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
            {/* Target pitch */}
            <div className="flex flex-col overflow-visible border-b border-white/[0.06] p-6 pt-7 sm:p-8 sm:pt-9 lg:border-b-0 lg:border-r lg:border-white/[0.06]">
              <div className="flex items-start justify-between gap-3 pr-1 pt-0.5">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-emerald-400/90">
                    Target
                  </p>
                  <h2 className="mt-2 text-base font-semibold tracking-tight text-white">
                    Note
                  </h2>
                  <p className="mt-1.5 text-[12px] leading-snug text-zinc-500">
                    Optional helper. The same letter in any octave still counts.
                  </p>
                </div>
                <ReferenceToneHelpButton />
              </div>

              <div className="relative mt-7 flex min-h-0 flex-1 items-center justify-center py-4 sm:py-6">
                <div
                  className="pointer-events-none absolute left-1/2 top-1/2 h-[min(92vw,380px)] w-[min(92vw,380px)] max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400/[0.09] blur-[72px]"
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

            {/* Capture + analyze */}
            <div className="flex flex-col p-6 sm:p-8">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-sky-400/90">
                    Capture
                  </p>
                  <h2 className="mt-2 text-base font-semibold tracking-tight text-white">
                    Audio
                  </h2>
                </div>
                <IntonationRecordingHelpButton />
              </div>

              <div className="mt-7 flex justify-center sm:mt-8">
                <MusaiSegmentedControl<InputMode>
                  ariaLabel="Capture source"
                  value={inputMode}
                  onChange={setMode}
                  options={[
                    { value: "record", label: "Record" },
                    { value: "upload", label: "Import" },
                  ]}
                  className="max-w-[19rem]"
                />
              </div>

              <div className="mt-7 min-h-0 flex-1 sm:mt-8">
                {inputMode === "upload" ? (
                  <div
                    className={`overflow-hidden rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-[border-color,background-color,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                      uploadProcessing
                        ? "border border-sky-400/30 bg-sky-400/[0.055] shadow-[0_0_48px_rgba(56,189,248,0.12),inset_0_1px_0_rgba(255,255,255,0.08)]"
                        : file
                          ? "border border-emerald-500/20 bg-white/[0.045] shadow-[0_0_32px_rgba(16,185,129,0.06),inset_0_1px_0_rgba(255,255,255,0.07)]"
                          : "border border-dashed border-white/[0.14] bg-white/[0.03] hover:border-sky-400/35 hover:bg-white/[0.05]"
                    }`}
                  >
                    {file ? (
                      <div className="relative min-h-[220px] sm:min-h-[240px]">
                        <div
                          className={`absolute inset-0 flex flex-col items-center justify-center px-4 py-8 transition-[opacity,transform,filter] duration-[550ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:duration-200 motion-reduce:transition-opacity ${
                            uploadProcessing
                              ? "z-10 translate-y-0 opacity-100"
                              : "pointer-events-none z-0 translate-y-2 opacity-0 blur-[1px] motion-reduce:blur-none"
                          }`}
                          aria-hidden={!uploadProcessing}
                          aria-busy={uploadProcessing}
                          aria-label="Processing selected audio file"
                        >
                          <AudioActivityVisualizer
                            variant="compact"
                            className="mb-2"
                          />
                          <span className="text-sm font-semibold tracking-tight text-sky-100/95">
                            Reading your waveform…
                          </span>
                          <span className="mt-2 max-w-full truncate px-2 text-center text-xs text-zinc-400">
                            {file.name}
                          </span>
                          <span className="mt-2 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                            Decoding audio buffer
                          </span>
                        </div>
                        <label
                          className={`group flex cursor-pointer flex-col items-center justify-center px-4 py-8 transition-[opacity,transform,filter] duration-[550ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:duration-200 motion-reduce:transition-opacity ${
                            uploadProcessing
                              ? "pointer-events-none relative z-0 min-h-[220px] -translate-y-2 opacity-0 blur-[1px] motion-reduce:blur-none sm:min-h-[240px]"
                              : "relative z-10 min-h-[220px] translate-y-0 opacity-100 sm:min-h-[240px]"
                          } hover:bg-white/[0.03]`}
                        >
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400/95 ring-1 ring-emerald-400/25 transition-transform duration-500 ease-out motion-reduce:transition-none group-hover:scale-[1.06]">
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
                          <span className="mt-3 text-sm font-semibold text-emerald-200/95">
                            Audio ready
                          </span>
                          <span className="mt-2 max-w-full truncate px-2 text-center text-xs text-zinc-400">
                            {file.name}
                          </span>
                          <span className="mt-2 text-center text-[11px] text-zinc-500">
                            Tap to replace this file
                          </span>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm,.flac"
                            className="sr-only"
                            onChange={handleAudioFileChange}
                          />
                        </label>
                      </div>
                    ) : (
                      <label className="flex min-h-[220px] cursor-pointer flex-col items-center justify-center px-4 py-8 transition-colors duration-300 hover:bg-white/[0.04] sm:min-h-[240px]">
                        <span className="text-sm font-semibold text-zinc-200">
                          Choose an audio file
                        </span>
                        <span className="mt-2 text-center text-xs leading-relaxed text-zinc-500">
                          WAV, MP3, M4A, and other common formats
                        </span>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm,.flac"
                          className="sr-only"
                          onChange={handleAudioFileChange}
                        />
                      </label>
                    )}
                  </div>
                ) : (
                  <div ref={mainRecorderRef}>
                    <MusaiMicCapturePanel
                      selectId="musai-mic-tuning"
                      micDevices={micDevices}
                      selectedMicId={selectedMicId}
                      onMicChange={setSelectedMicId}
                      onMicRefresh={refreshMicDevices}
                      isRecording={isRecording}
                      hasSavedClip={!!recordedBlob}
                      onDiscardClip={() => {
                        setRecordedBlob(null);
                        resetSession();
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
              </div>

              {message && status === "error" ? (
                <p
                  className="musai-glass-inset mt-5 border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-center text-sm leading-relaxed text-rose-100/90"
                  role="alert"
                >
                  {message}
                </p>
              ) : null}

              <button
                type="button"
                disabled={!canAnalyze}
                onClick={() => void analyze()}
                className={`musai-btn-primary mt-8 ${
                  inputMode === "record" && recordedBlob
                    ? "ring-1 ring-emerald-300/20"
                    : ""
                }`}
              >
                {status === "loading" ? "Working…" : "Analyze"}
              </button>
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
