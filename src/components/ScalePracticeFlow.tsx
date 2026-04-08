"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioActivityVisualizer } from "@/components/AudioActivityVisualizer";
import { ScaleGuidePanel } from "@/components/ScaleGuidePanel";
import { ScalePracticeInfoProvider } from "@/components/scalePracticeInfoContext";
import { analyzeScalePerformance } from "@/lib/analyzeScalePerformance";
import { bufferToMono } from "@/lib/analyzePitch";
import { createAudioContext } from "@/lib/audioContext";
import { buildScalePracticeSession } from "@/lib/buildScalePracticeSession";
import { getMicStream } from "@/lib/micStream";
import { pickRecorderMime } from "@/lib/mediaRecorderMime";
import { persistScalePracticeSession } from "@/lib/scalePracticeSession";
import type { ScaleKind } from "@/lib/scales";
import { buildScalePracticeGuideModel } from "@/lib/scalePracticeGuide";
import {
  buildExerciseScaleMidis,
  defaultRootMidiForTonic,
  describeRootChoice,
  tonicOptionsForViolin,
  validateScaleMidisInViolinRange,
  violinRootsForTonic,
} from "@/lib/scales";

type CaptureMode = "record" | "upload";

const pill =
  "flex-1 rounded-full py-2.5 text-sm font-medium transition-colors duration-200";

export function ScalePracticeFlow() {
  const router = useRouter();
  const [tonicPc, setTonicPc] = useState(7);
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

  const [captureMode, setCaptureMode] = useState<CaptureMode>("record");
  const [file, setFile] = useState<File | null>(null);
  const [uploadProcessing, setUploadProcessing] = useState(false);
  const uploadTokenRef = useRef(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState("");

  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const discardRecordingRef = useRef(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
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
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      stopStream();
    };
  }, [clearRecordTimer, stopStream]);

  const expectedMidis = useMemo(
    () => buildExerciseScaleMidis(rootMidi, scaleKind, octaveSpan),
    [octaveSpan, rootMidi, scaleKind],
  );

  const guideModel = useMemo(
    () => buildScalePracticeGuideModel(tonicPc, scaleKind, rootMidi, octaveSpan),
    [octaveSpan, rootMidi, scaleKind, tonicPc],
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
    setRecordSeconds(0);
    try {
      const stream = await getMicStream(
        selectedMicId.trim() === "" ? null : selectedMicId,
      );
      streamRef.current = stream;
      chunksRef.current = [];
      void refreshMicDevices();

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
        setMessage("Recording failed. Try again or upload a file.");
        setStatus("error");
      };
      recorder.onstop = () => {
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
          setMessage("Almost no audio captured. Check the mic input.");
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
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setMessage("Microphone blocked. Allow access or use upload.");
      } else {
        setMessage("Could not open the microphone.");
      }
      setStatus("error");
    }
  }, [clearRecordTimer, refreshMicDevices, selectedMicId, stopStream]);

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
        "This range leaves the violin span. Open “Range options” and choose a lower start or one octave.",
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

      const analysis = analyzeScalePerformance({
        mono,
        sampleRateHz,
        expectedMidis,
      });

      const session = buildScalePracticeSession({
        tonicPitchClass: tonicPc,
        scaleKind,
        rootMidi,
        octaveSpan,
        audioSourceType: captureMode === "record" ? "recorded" : "uploaded",
        sampleRateHz,
        analysis,
      });
      persistScalePracticeSession(session);
      setStatus("idle");
      router.push("/practice/scale/results");
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
    recordedBlob,
    rootMidi,
    router,
    scaleKind,
    tonicPc,
  ]);

  const canAnalyze =
    status !== "loading" &&
    !uploadProcessing &&
    (captureMode === "upload" ? !!file : !!recordedBlob);

  const captureCard =
    "relative overflow-hidden rounded-3xl border border-white/[0.1] bg-white/[0.035] shadow-[0_12px_40px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl";

  return (
    <ScalePracticeInfoProvider>
    <div className="w-full max-w-[min(1000px,100%)] space-y-16 sm:space-y-24">

      {status === "loading" ? (
        <div
          className={`${captureCard} flex flex-col items-center px-6 py-12`}
          role="status"
          aria-live="polite"
        >
          <AudioActivityVisualizer variant="prominent" />
          <p className="mt-8 text-sm font-medium text-zinc-300">
            Analysing your scale…
          </p>
        </div>
      ) : null}

      <div
        className={`space-y-16 sm:space-y-24 ${status === "loading" ? "pointer-events-none opacity-35" : ""}`}
      >
        <section className="space-y-8">
          <div className="flex flex-wrap justify-center gap-2 sm:gap-2.5">
            {tonicOptionsForViolin().map((t) => (
              <button
                key={t.pitchClass}
                type="button"
                onClick={() => setTonicPc(t.pitchClass)}
                className={`rounded-full px-3.5 py-2 text-sm font-medium transition ${
                  tonicPc === t.pitchClass
                    ? "bg-white text-zinc-950 shadow-md shadow-black/20"
                    : "bg-black/30 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex justify-center">
            <div className="inline-flex w-full max-w-[300px] rounded-full border border-white/[0.1] bg-black/25 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm">
              <button
                type="button"
                onClick={() => setScaleKind("major")}
                className={`${pill} ${
                  scaleKind === "major"
                    ? "bg-white text-zinc-950 shadow-md shadow-black/20"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Major
              </button>
              <button
                type="button"
                onClick={() => setScaleKind("natural_minor")}
                className={`${pill} ${
                  scaleKind === "natural_minor"
                    ? "bg-white text-zinc-950 shadow-md shadow-black/20"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Natural minor
              </button>
            </div>
          </div>
          <div className="flex justify-center">
            <div className="inline-flex w-full max-w-[240px] rounded-full border border-white/[0.08] bg-black/15 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm">
              <button
                type="button"
                onClick={() => setAdvSpan(1)}
                className={`flex-1 rounded-full py-2 text-xs font-semibold transition ${
                  octaveSpan === 1
                    ? "bg-white text-zinc-950 shadow-md shadow-black/20"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                1 octave
              </button>
              <button
                type="button"
                onClick={() => setAdvSpan(2)}
                className={`flex-1 rounded-full py-2 text-xs font-semibold transition ${
                  octaveSpan === 2
                    ? "bg-white text-zinc-950 shadow-md shadow-black/20"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                2 octaves
              </button>
            </div>
          </div>
        </section>

        <section className="pt-6">
          <ScaleGuidePanel
            guide={guideModel}
            exerciseMidis={expectedMidis}
            tonicPitchClass={tonicPc}
            scaleKind={scaleKind}
          />
        </section>

        <details className="mx-auto max-w-md text-center opacity-70 hover:opacity-100 transition-opacity">
          <summary className="cursor-pointer list-none text-[11px] text-zinc-600 transition hover:text-zinc-400 [&::-webkit-details-marker]:hidden">
            <span className="border-b border-dotted border-zinc-600 pb-0.5">
              Range options
            </span>
          </summary>
          <div className="mt-5 space-y-4 rounded-2xl border border-white/[0.08] bg-black/25 px-4 py-5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <label className="block">
              <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                Starting pitch
              </span>
              <select
                value={rootMidi}
                onChange={(e) => setAdvRoot(Number(e.target.value))}
                className="w-full cursor-pointer rounded-xl border border-white/15 bg-black/35 py-2.5 pl-3 pr-10 text-sm text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm focus:border-sky-400/45 focus:outline-none focus:ring-1 focus:ring-sky-400/30"
              >
                {violinRootsForTonic(tonicPc).map((m) => (
                  <option key={m} value={m}>
                    {describeRootChoice(m)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                setAdvRoot(null);
                setAdvSpan(null);
              }}
              className="w-full rounded-xl border border-white/[0.1] py-2 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-200"
            >
              Reset to suggested range
            </button>
          </div>
        </details>

        <section className={captureCard}>
          <div className="px-5 py-7 sm:px-8 sm:py-9">
            <h3 className="text-center text-sm font-semibold tracking-tight text-white">
              Your take
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-center text-xs text-zinc-500">
              Record once: play up to the top note, then come back down.
            </p>
            <div className="mb-6 mt-6 flex justify-center">
            <div className="inline-flex w-full max-w-[280px] rounded-full border border-white/[0.1] bg-black/25 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm">
              <button
                type="button"
                onClick={() => setCaptureMode("record")}
                className={`${pill} ${
                  captureMode === "record"
                    ? "bg-white text-zinc-950 shadow-md shadow-black/20"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Record
              </button>
              <button
                type="button"
                onClick={() => setCaptureMode("upload")}
                className={`${pill} ${
                  captureMode === "upload"
                    ? "bg-white text-zinc-950 shadow-md shadow-black/20"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Upload
              </button>
            </div>
          </div>

          {captureMode === "upload" ? (
            <div
              className={`overflow-hidden rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-[border-color,background-color,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                uploadProcessing
                  ? "border border-sky-400/30 bg-gradient-to-b from-sky-500/[0.09] to-white/[0.02] shadow-[0_0_48px_rgba(56,189,248,0.12),inset_0_1px_0_rgba(255,255,255,0.08)]"
                  : file
                    ? "border border-emerald-500/20 bg-white/[0.045] shadow-[0_0_32px_rgba(16,185,129,0.06),inset_0_1px_0_rgba(255,255,255,0.07)]"
                    : "border border-dashed border-white/[0.14] bg-white/[0.03] hover:border-sky-400/35 hover:bg-white/[0.05]"
              }`}
            >
              {file ? (
                <div className="relative min-h-[268px]">
                  <div
                    className={`absolute inset-0 flex flex-col items-center justify-center px-4 py-10 transition-[opacity,transform,filter] duration-[550ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:duration-200 motion-reduce:transition-opacity ${
                      uploadProcessing
                        ? "z-10 translate-y-0 opacity-100"
                        : "pointer-events-none z-0 translate-y-2 opacity-0 blur-[1px] motion-reduce:blur-none"
                    }`}
                    aria-hidden={!uploadProcessing}
                    aria-busy={uploadProcessing}
                    aria-label="Processing selected audio file"
                  >
                    <AudioActivityVisualizer variant="compact" className="mb-2" />
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
                    className={`group flex cursor-pointer flex-col items-center justify-center px-4 py-10 transition-[opacity,transform,filter] duration-[550ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:duration-200 motion-reduce:transition-opacity ${
                      uploadProcessing
                        ? "pointer-events-none relative z-0 min-h-[268px] -translate-y-2 opacity-0 blur-[1px] motion-reduce:blur-none"
                        : "relative z-10 min-h-[268px] translate-y-0 opacity-100"
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
                    <span className="mt-4 text-sm font-semibold text-emerald-200/95">
                      Audio ready
                    </span>
                    <span className="mt-2 max-w-full truncate px-2 text-center text-xs text-zinc-400">
                      {file.name}
                    </span>
                    <span className="mt-3 text-center text-[11px] text-zinc-500">
                      Tap to replace this file
                    </span>
                    <input
                      type="file"
                      accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm,.flac"
                      className="sr-only"
                      onChange={handleFileChange}
                    />
                  </label>
                </div>
              ) : (
                <label className="flex cursor-pointer flex-col items-center justify-center px-4 py-10 transition-colors duration-300 hover:bg-white/[0.04]">
                  <span className="text-sm font-semibold text-zinc-200">
                    Choose an audio file
                  </span>
                  <span className="mt-2 text-center text-xs leading-relaxed text-zinc-500">
                    WAV, MP3, M4A, and other common formats
                  </span>
                  <input
                    type="file"
                    accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm,.flac"
                    className="sr-only"
                    onChange={handleFileChange}
                  />
                </label>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/[0.1] bg-black/20 px-4 py-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm sm:px-6 sm:py-10">
              <details className="mx-auto mb-6 w-full max-w-sm">
                <summary className="cursor-pointer list-none text-center text-xs text-zinc-500 transition hover:text-zinc-400 [&::-webkit-details-marker]:hidden">
                  <span className="border-b border-dotted border-zinc-600">
                    Microphone
                  </span>
                </summary>
                <label htmlFor="musai-scale-mic-select" className="sr-only">
                  Microphone
                </label>
                <select
                  id="musai-scale-mic-select"
                  value={selectedMicId}
                  onChange={(e) => setSelectedMicId(e.target.value)}
                  onFocus={() => void refreshMicDevices()}
                  disabled={isRecording}
                  className="mt-3 w-full cursor-pointer rounded-xl border border-white/15 bg-black/35 py-2.5 pl-3 pr-10 text-sm text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm focus:border-sky-400/45 focus:outline-none focus:ring-1 focus:ring-sky-400/30 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <option value="">System default</option>
                  {micDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label?.trim() || `Audio input ${d.deviceId.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
              </details>

              <div className="flex flex-col items-center gap-3 py-2">
                {!isRecording ? (
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
                ) : (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="rounded-full border border-white/20 bg-black/40 px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-black/55"
                  >
                    Stop · {recordSeconds}s
                  </button>
                )}
                <p className="text-center text-xs font-medium text-zinc-500">
                  {recordedBlob ? "Recording ready" : "Tap the button to record"}
                </p>
              </div>
            </div>
          )}

          {message && status === "error" ? (
            <p className="mt-4 text-center text-sm text-rose-300/95">
              {message}
            </p>
          ) : null}

          <button
            type="button"
            disabled={!canAnalyze}
            onClick={() => void runAnalyze()}
            className="mt-6 w-full rounded-full border border-emerald-400/25 bg-gradient-to-b from-emerald-400 to-emerald-600 py-3.5 text-sm font-semibold text-zinc-950 shadow-[0_8px_28px_rgba(16,185,129,0.3)] transition enabled:hover:from-emerald-300 enabled:hover:to-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Analyse scale
          </button>
          </div>
        </section>
      </div>
    </div>
    </ScalePracticeInfoProvider>
  );
}
