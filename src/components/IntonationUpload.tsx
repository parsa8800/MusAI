"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { NoteRing } from "@/components/NoteRing";
import { ReferenceToneHelpButton } from "@/components/ReferenceToneHelpButton";
import { ScoreRing } from "@/components/ScoreRing";
import { createAudioContext } from "@/lib/audioContext";
import { getMicStream } from "@/lib/micStream";
import {
  bufferToMono,
  estimatePitchMedianHz,
} from "@/lib/analyzePitch";
import {
  centsFromTarget,
  formatNoteLabel,
  intonationLabel,
  intonationScore,
  midiToHz,
  verdictSummary,
} from "@/lib/intonation";

type InputMode = "upload" | "record";

function pickRecorderMime(): string | undefined {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/aac",
    "audio/mp4;codecs=mp4a.40.2",
  ];
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

function titleCaseVerdict(label: string): string {
  return label
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function StepShell({
  step,
  title,
  subtitle,
  accent,
  cornerAction,
  children,
}: {
  step: number;
  title: string;
  subtitle?: string;
  accent: "emerald" | "sky" | "violet";
  /** e.g. help (i) control anchored to the step card */
  cornerAction?: ReactNode;
  children: ReactNode;
}) {
  const bar =
    accent === "emerald"
      ? "from-emerald-400/90 to-teal-600/20"
      : accent === "sky"
        ? "from-sky-400/90 to-blue-600/20"
        : "from-violet-400/90 to-purple-600/20";

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/[0.1] bg-white/[0.035] shadow-[0_12px_40px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
      <div
        className={`pointer-events-none absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b ${bar}`}
        aria-hidden
      />
      <div
        className={
          cornerAction
            ? "px-5 pb-14 pt-6 sm:px-7 sm:pb-16 sm:pt-7"
            : "px-5 py-6 sm:px-7 sm:py-7"
        }
      >
        <div className="flex gap-3 pl-0.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] text-xs font-bold tabular-nums text-white ring-1 ring-white/[0.12]">
            {step}
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 className="text-sm font-semibold tracking-tight text-white">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-6">{children}</div>
      </div>
      {cornerAction ? (
        <div className="absolute bottom-3 right-3 z-20 sm:bottom-4 sm:right-4">
          {cornerAction}
        </div>
      ) : null}
    </section>
  );
}

const WAVE_BAR_COUNT = 48;

export function IntonationUpload() {
  const [inputMode, setInputMode] = useState<InputMode>("record");
  const [midi, setMidi] = useState(69);
  const [file, setFile] = useState<File | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const discardRecordingRef = useRef(false);
  const meterCtxRef = useRef<AudioContext | null>(null);
  const meterSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const meterAnalyserRef = useRef<AnalyserNode | null>(null);
  const meterRafRef = useRef<number | null>(null);
  const meterSmoothedRef = useRef<Float32Array | null>(null);
  const meterFrameRef = useRef(0);

  const [waveLevels, setWaveLevels] = useState(() =>
    Array.from({ length: WAVE_BAR_COUNT }, () => 0.08),
  );

  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState("");

  const [status, setStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<{
    detectedHz: number;
    targetHz: number;
    cents: number;
    label: string;
    score: number;
    validFrames: number;
    totalFrames: number;
    sampleRateHz: number;
  } | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const cleanupRecordingMeter = useCallback(() => {
    if (meterRafRef.current != null) {
      cancelAnimationFrame(meterRafRef.current);
      meterRafRef.current = null;
    }
    meterFrameRef.current = 0;
    try {
      meterSourceRef.current?.disconnect();
      meterAnalyserRef.current?.disconnect();
      void meterCtxRef.current?.close();
    } catch {
      /* ignore */
    }
    meterSourceRef.current = null;
    meterAnalyserRef.current = null;
    meterCtxRef.current = null;
    meterSmoothedRef.current = null;
    setWaveLevels(Array.from({ length: WAVE_BAR_COUNT }, () => 0.08));
  }, []);

  const clearRecordTimer = useCallback(() => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
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
      clearRecordTimer();
      cleanupRecordingMeter();
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      stopStream();
    };
  }, [cleanupRecordingMeter, clearRecordTimer, stopStream]);

  const resetSession = useCallback(() => {
    setStatus("idle");
    setResult(null);
    setMessage(null);
  }, []);

  const clearResultOnly = useCallback(() => {
    setResult(null);
    setStatus("idle");
    setMessage(null);
  }, []);

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
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const startRecording = useCallback(async () => {
    setMessage(null);
    setRecordedBlob(null);
    setResult(null);
    setRecordSeconds(0);
    cleanupRecordingMeter();

    try {
      const stream = await getMicStream(
        selectedMicId.trim() === "" ? null : selectedMicId,
      );
      streamRef.current = stream;
      chunksRef.current = [];
      void refreshMicDevices();

      const micTrack = stream.getAudioTracks()[0];
      if (micTrack?.muted) {
        cleanupRecordingMeter();
        stopStream();
        setMessage(
          "The selected microphone is muted in system settings. Unmute it and try again.",
        );
        setStatus("error");
        return;
      }

      try {
        const actx = createAudioContext();
        if (actx) {
          await actx.resume();
          const source = actx.createMediaStreamSource(stream);
          const analyser = actx.createAnalyser();
          analyser.fftSize = 512;
          analyser.smoothingTimeConstant = 0.82;
          source.connect(analyser);
          meterCtxRef.current = actx;
          meterSourceRef.current = source;
          meterAnalyserRef.current = analyser;
          meterSmoothedRef.current = new Float32Array(WAVE_BAR_COUNT).fill(
            0.08,
          );

          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          const barCount = WAVE_BAR_COUNT;
          const perBin = Math.max(1, Math.floor(bufferLength / barCount));

          const tick = () => {
            const a = meterAnalyserRef.current;
            const smooth = meterSmoothedRef.current;
            if (!a || !smooth) return;
            meterRafRef.current = requestAnimationFrame(tick);
            a.getByteFrequencyData(dataArray);
            meterFrameRef.current += 1;
            const next: number[] = [];
            for (let b = 0; b < barCount; b++) {
              let maxv = 0;
              const start = b * perBin;
              const end = Math.min(start + perBin, bufferLength);
              for (let j = start; j < end; j++) {
                maxv = Math.max(maxv, dataArray[j]! / 255);
              }
              const centerDist =
                Math.abs(b - (barCount - 1) / 2) /
                Math.max((barCount - 1) / 2, 1);
              const shaped = maxv * (0.38 + 0.62 * (1 - centerDist * 0.38));
              smooth[b] = smooth[b]! * 0.52 + shaped * 0.48;
              next.push(Math.min(1, smooth[b]! * 2.05 + 0.07));
            }
            if (meterFrameRef.current % 2 === 0) {
              setWaveLevels(next);
            }
          };
          meterRafRef.current = requestAnimationFrame(tick);
        }
      } catch {
        /* level meter optional */
      }

      const mimeType = pickRecorderMime();
      let recorder: MediaRecorder;
      try {
        recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
      } catch {
        recorder = new MediaRecorder(stream);
      }

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
        cleanupRecordingMeter();
        clearRecordTimer();
        setIsRecording(false);
        setRecordSeconds(0);
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
            "No audio was captured. Pick your iPhone or Continuity mic in the list below, or turn off echo cancellation in the browser if the level meter stays flat.",
          );
          setStatus("error");
          return;
        }
        setRecordedBlob(blob);
      };

      recorder.start(100);
      setIsRecording(true);

      recordTimerRef.current = setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      cleanupRecordingMeter();
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setMessage(
          "Microphone access is blocked. Allow it in your browser settings or use upload instead.",
        );
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setMessage(
          "No microphone was found. Connect a mic or choose another input in System Settings.",
        );
      } else {
        setMessage(
          "Could not open the microphone. Try another browser or pick a specific device below.",
        );
      }
      setStatus("error");
    }
  }, [
    cleanupRecordingMeter,
    clearRecordTimer,
    refreshMicDevices,
    selectedMicId,
    stopStream,
  ]);

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
    clearRecordTimer();
  }, [clearRecordTimer]);

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
    setResult(null);

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

      const targetHz = midiToHz(midi);
      const cents = centsFromTarget(medianHz, targetHz);
      const label = intonationLabel(cents);

      setResult({
        detectedHz: medianHz,
        targetHz,
        cents,
        label,
        score: intonationScore(cents),
        validFrames,
        totalFrames,
        sampleRateHz,
      });
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setMessage(
        e instanceof Error
          ? e.message
          : "Could not read that audio. Try another file or format.",
      );
    }
  }, [file, inputMode, midi, recordedBlob]);

  const canAnalyze =
    status !== "loading" &&
    (inputMode === "upload" ? !!file : !!recordedBlob);

  const pill =
    "flex-1 rounded-full py-2.5 text-sm font-medium transition-colors duration-200";

  return (
    <section className="w-full max-w-[440px] space-y-8 sm:space-y-10">
      {status === "loading" && (
        <div className="flex flex-col items-center rounded-3xl border border-white/[0.1] bg-white/[0.035] px-6 py-14 shadow-[0_12px_40px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-xl">
          <div
            className="h-40 w-40 rounded-full border-2 border-white/[0.08] border-t-emerald-400/75 motion-safe:animate-spin motion-reduce:animate-none"
            aria-hidden
          />
          <p className="mt-8 text-sm font-medium text-zinc-400">
            Analyzing your take
          </p>
          <p className="mt-1 text-xs text-zinc-600">This usually takes a moment</p>
        </div>
      )}

      {result && status === "done" && (
        <div className="space-y-6 rounded-3xl border border-white/[0.1] bg-white/[0.04] px-5 py-8 text-center shadow-[0_16px_48px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl sm:px-8 sm:py-10">
          <ScoreRing score={result.score} size={220} label="Match" />

          <div className="space-y-2 px-1">
            <p className="text-xl font-semibold tracking-tight text-white">
              {titleCaseVerdict(result.label)}
            </p>
            <p className="mx-auto max-w-[300px] text-sm leading-relaxed text-zinc-500">
              {verdictSummary(result.label)}
            </p>
          </div>

          <div className="mx-auto flex max-w-xs items-center justify-center gap-5 rounded-2xl border border-white/[0.08] bg-black/15 px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            <span
              className={
                result.cents > 3
                  ? "text-amber-400/95"
                  : result.cents < -3
                    ? "text-sky-400/95"
                    : "text-emerald-400/95"
              }
            >
              {result.cents > 0
                ? "Sharp"
                : result.cents < 0
                  ? "Flat"
                  : "Centered"}
            </span>
            <span className="h-3 w-px bg-white/15" aria-hidden />
            <span className="tabular-nums text-zinc-400">
              {result.cents >= 0 ? "+" : ""}
              {result.cents.toFixed(1)} cents
            </span>
          </div>

          <details className="group w-full max-w-sm rounded-2xl border border-white/[0.1] bg-black/20 text-left shadow-inner transition-colors open:bg-black/25">
            <summary className="cursor-pointer list-none px-4 py-3.5 text-sm font-medium text-zinc-300 marker:hidden [&::-webkit-details-marker]:hidden">
              <span className="flex items-center justify-between gap-2">
                Technical details
                <span className="text-zinc-500 transition group-open:rotate-180">
                  ▼
                </span>
              </span>
            </summary>
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2.5 border-t border-white/[0.08] px-4 py-4 font-mono text-[11px] leading-relaxed text-zinc-500">
              <dt className="text-zinc-600">Target</dt>
              <dd className="text-right text-zinc-400">
                {formatNoteLabel(midi)} at {result.targetHz.toFixed(2)} Hz
              </dd>
              <dt className="text-zinc-600">Detected</dt>
              <dd className="text-right text-zinc-400">
                {result.detectedHz.toFixed(2)} Hz
              </dd>
              <dt className="text-zinc-600">Offset</dt>
              <dd className="text-right text-zinc-400">
                {result.cents >= 0 ? "+" : ""}
                {result.cents.toFixed(2)} cents
              </dd>
              <dt className="text-zinc-600">Model score</dt>
              <dd className="text-right text-zinc-400">{result.score}%</dd>
              <dt className="text-zinc-600">Sample rate</dt>
              <dd className="text-right text-zinc-400">
                {Math.round(result.sampleRateHz)} Hz
              </dd>
              <dt className="text-zinc-600">Windows</dt>
              <dd className="text-right text-zinc-400">
                {result.validFrames} clear of {result.totalFrames} total
              </dd>
            </dl>
          </details>

          <button
            type="button"
            onClick={clearResultOnly}
            className="text-sm font-medium text-zinc-500 underline-offset-4 transition hover:text-emerald-400/90 hover:underline"
          >
            Dismiss results
          </button>
        </div>
      )}

      <div
        className={`${
          result && status === "done"
            ? "space-y-8 border-t border-white/[0.08] pt-10"
            : "space-y-8"
        } ${status === "loading" ? "pointer-events-none opacity-40" : ""}`}
      >
        <StepShell
          step={1}
          title="Choose your target pitch"
          subtitle="Use the ring to pick the note you are practicing against. Slide around the wheel or use the octave controls in the center."
          accent="emerald"
          cornerAction={<ReferenceToneHelpButton />}
        >
          <NoteRing value={midi} onChange={setMidi} />
        </StepShell>

        <StepShell
          step={2}
          title="Capture your playing"
          subtitle="Record in the browser or upload a file. One clear sustained note works best."
          accent="sky"
        >
          <div className="mb-6 flex justify-center">
            <div className="inline-flex w-full max-w-[280px] rounded-full border border-white/[0.1] bg-black/25 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setMode("record")}
              className={`${pill} ${
                inputMode === "record"
                  ? "bg-white text-zinc-950 shadow-md shadow-black/20"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Record
            </button>
            <button
              type="button"
              onClick={() => setMode("upload")}
              className={`${pill} ${
                inputMode === "upload"
                  ? "bg-white text-zinc-950 shadow-md shadow-black/20"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Upload
            </button>
            </div>
          </div>

          {inputMode === "upload" ? (
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.14] bg-white/[0.03] px-4 py-10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:border-sky-400/35 hover:bg-white/[0.05]">
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
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  resetSession();
                }}
              />
            </label>
          ) : (
            <div className="rounded-2xl border border-white/[0.1] bg-black/20 px-4 py-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm sm:px-6 sm:py-10">
              <div className="mx-auto mb-6 w-full max-w-sm">
                <label
                  htmlFor="musai-mic-select"
                  className="mb-2 block text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500"
                >
                  Microphone
                </label>
                <select
                  id="musai-mic-select"
                  value={selectedMicId}
                  onChange={(e) => setSelectedMicId(e.target.value)}
                  onFocus={() => void refreshMicDevices()}
                  disabled={isRecording}
                  className="w-full cursor-pointer rounded-xl border border-white/15 bg-black/35 py-2.5 pl-3 pr-10 text-sm text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm focus:border-sky-400/45 focus:outline-none focus:ring-1 focus:ring-sky-400/30 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <option value="">System default</option>
                  {micDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label?.trim() ||
                        `Audio input ${d.deviceId.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-center text-[10px] leading-relaxed text-zinc-600">
                  iPhone through Continuity appears here after the first time you
                  allow the mic. Choose it if the meter does not move while you
                  play.
                </p>
              </div>

              <div className="relative mx-auto flex min-h-[168px] w-full max-w-[320px] flex-col items-center justify-center">
                <div
                  className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-500 ease-out motion-reduce:transition-none ${
                    isRecording
                      ? "pointer-events-none scale-90 opacity-0"
                      : "opacity-100"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void startRecording()}
                    aria-label="Start recording"
                    className="group relative flex h-[92px] w-[92px] items-center justify-center rounded-full bg-gradient-to-b from-rose-500 via-rose-600 to-rose-800 text-white shadow-[0_8px_32px_rgba(225,29,72,0.45),0_2px_8px_rgba(0,0,0,0.45)] ring-4 ring-rose-500/25 transition hover:scale-[1.04] hover:ring-rose-400/40 active:scale-[0.98] motion-reduce:hover:scale-100"
                  >
                    <span
                      className="absolute inset-[3px] rounded-full bg-gradient-to-b from-white/25 to-transparent opacity-90"
                      aria-hidden
                    />
                    <span className="relative flex h-[22px] w-[22px] rounded-sm bg-white/95 shadow-sm transition group-hover:bg-white" />
                  </button>
                  <p className="mt-5 text-center text-xs font-medium text-zinc-500">
                    Tap the button to record
                  </p>
                </div>

                <div
                  className={`flex w-full flex-col items-center transition-all duration-500 ease-out motion-reduce:transition-none ${
                    isRecording
                      ? "opacity-100"
                      : "pointer-events-none translate-y-3 opacity-0"
                  }`}
                >
                  <div
                    className="flex h-[52px] w-full max-w-[280px] items-end justify-center gap-[2px] px-1 sm:gap-[3px]"
                    aria-hidden
                  >
                    {waveLevels.map((h, i) => (
                      <div
                        key={i}
                        className="w-[2.5px] shrink-0 rounded-full bg-gradient-to-t from-rose-700/90 via-rose-400 to-rose-200/90 shadow-[0_0_6px_rgba(251,113,133,0.3)] transition-[height] duration-100 ease-out motion-reduce:transition-none sm:w-[3px]"
                        style={{
                          height: `${Math.max(10, h * 48)}px`,
                          opacity: 0.35 + h * 0.65,
                        }}
                      />
                    ))}
                  </div>
                  <p className="mt-3 text-xs font-medium uppercase tracking-[0.2em] text-rose-300/90">
                    Listening
                  </p>
                  <p className="mt-1 font-mono text-sm tabular-nums text-zinc-400">
                    {recordSeconds}s
                  </p>
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="mt-6 rounded-full border border-white/25 bg-white/[0.08] px-8 py-2.5 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-sm transition hover:border-rose-400/40 hover:bg-white/[0.12]"
                  >
                    Stop
                  </button>
                </div>
              </div>

              {!isRecording && recordedBlob ? (
                <div className="mt-8 flex flex-col items-center gap-3 border-t border-white/[0.06] pt-6">
                  <span className="text-sm font-semibold text-emerald-400/90">
                    Clip ready
                  </span>
                  <button
                    type="button"
                    className="text-xs font-semibold uppercase tracking-wider text-zinc-500 transition hover:text-zinc-300"
                    onClick={() => {
                      setRecordedBlob(null);
                      resetSession();
                    }}
                  >
                    Discard clip
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {inputMode === "upload" && file && (
            <p className="mt-4 truncate text-center text-xs text-zinc-500">
              {file.name}
            </p>
          )}
        </StepShell>

        <StepShell
          step={3}
          title="Run the analysis"
          subtitle="We compare your pitch to the target you chose in step 1."
          accent="violet"
        >
          <div className="flex justify-center">
            <button
              type="button"
              disabled={!canAnalyze}
              onClick={() => void analyze()}
              className="w-full max-w-sm rounded-full border border-emerald-400/25 bg-gradient-to-b from-emerald-400 to-emerald-600 py-4 text-sm font-semibold text-zinc-950 shadow-[0_8px_28px_rgba(16,185,129,0.35),inset_0_1px_0_rgba(255,255,255,0.35)] transition hover:from-emerald-300 hover:to-emerald-500 disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"
            >
              {status === "loading" ? "Working" : "Analyze intonation"}
            </button>
          </div>
        </StepShell>
      </div>

      {message && status === "error" && (
        <p
          className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.12] px-5 py-4 text-center text-sm leading-relaxed text-rose-100/95 shadow-[0_8px_32px_rgba(0,0,0,0.25)] backdrop-blur-md"
          role="alert"
        >
          {message}
        </p>
      )}
    </section>
  );
}
