"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import type { MusaiCaptureMode } from "@/components/MusaiCaptureDock";
import { analyzePieceTake } from "@/features/piece-studio/practice/analyzePieceTake";
import { skillMapFromReport } from "@/features/piece-studio/feedback/pieceFeedbackTypes";
import { appendPieceAttempt } from "@/features/piece-studio/practice/piecePracticeAttempts";
import { pieceAttemptFeedback } from "@/features/piece-studio/practice/piecePracticeCopy";
import { expectedMidisFromScore } from "@/features/piece-studio/practice/pieceExpectedNotes";
import { readPieceFeedbackHistory } from "@/features/piece-studio/pieceStudioFiles";
import type { MusaiScoreV1 } from "@/features/piece-studio/score/musaiScore";
import { useSyncedRecorderUi } from "@/hooks/useSyncedRecorderUi";
import { createAudioContext } from "@/lib/audioContext";
import { bufferToMono } from "@/lib/analyzePitch";
import { describeMicOpenError, getMicStream } from "@/lib/micStream";
import { createMediaRecorder, startMediaRecorder } from "@/lib/mediaRecorderMime";
import { tapFeedback } from "@/lib/motion";

function newAttemptId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `take-${Date.now().toString(36)}`;
}

export function usePiecePracticeCapture(input: {
  pieceId: string;
  structured: MusaiScoreV1 | null | undefined;
  onSaved: () => void;
}) {
  const { pieceId, structured, onSaved } = input;
  const structuredRef = useRef(structured);
  structuredRef.current = structured;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const selectId = useId();
  const [captureMode, setCaptureModeState] = useState<MusaiCaptureMode>("record");
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProcessing, setUploadProcessing] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mainRecorderRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRecordingRef = useRef(false);
  const uploadTokenRef = useRef(0);
  const analyzeTokenRef = useRef(0);

  const {
    elapsedLabel,
    lastTakeLabel,
    levelBars,
    waveformSamples,
    waveformLiveRef,
    resetTakeUi,
  } = useSyncedRecorderUi(isRecording, streamRef);

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

  const resetCaptureSession = useCallback(() => {
    setMessage(null);
    setStatus("idle");
  }, []);

  const runAnalyze = useCallback(
    async (blobOverride?: Blob | null, fileOverride?: File | null) => {
      const activeBlob = blobOverride ?? recordedBlob;
      const activeFile = fileOverride ?? file;
      const hasFile = captureMode === "upload" && activeFile;
      const hasRec = captureMode === "record" && activeBlob;
      const source = hasFile ? activeFile! : hasRec ? activeBlob! : null;
      if (!source) {
        setMessage(
          captureMode === "upload"
            ? "Choose an audio file first."
            : "Record this piece first.",
        );
        setStatus("error");
        return;
      }

      const token = ++analyzeTokenRef.current;
      setStatus("loading");
      setMessage(null);

      let ctx: AudioContext | null = null;
      try {
        ctx = createAudioContext();
        if (!ctx) {
          setStatus("error");
          setMessage("This browser cannot decode audio. Try Chrome or Safari.");
          return;
        }
        const raw = await source.arrayBuffer();
        if (token !== analyzeTokenRef.current) return;
        const audioBuffer = await ctx.decodeAudioData(raw.slice(0));
        const mono = bufferToMono(audioBuffer);
        const durationSec = audioBuffer.duration;
        const sampleRateHz = audioBuffer.sampleRate;
        await ctx.close();
        ctx = null;

        // Let “Listening…” paint before pitch DSP (still sync — no worker yet).
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve());
        });
        if (token !== analyzeTokenRef.current) return;

        const expected = expectedMidisFromScore(structuredRef.current ?? null);
        const hasDigitalScore = expected.length > 0;
        const attemptId = newAttemptId();
        const history = await readPieceFeedbackHistory(pieceId).catch(() => []);
        if (token !== analyzeTokenRef.current) return;
        const { performance: result, report } = analyzePieceTake({
          pieceId,
          attemptId,
          score: structuredRef.current ?? null,
          mono,
          sampleRateHz,
          durationSec,
          history,
        });

        if (token !== analyzeTokenRef.current) return;

        const saved = await appendPieceAttempt({
          pieceId,
          recording: source,
          report,
          attempt: {
            attemptId,
            recordedAt: new Date().toISOString(),
            durationSec: result?.durationSec ?? durationSec,
            score0to100: result?.score0to100 ?? null,
            notesHeard: result?.notesHeard ?? null,
            notesExpected: result?.notesExpected ?? (hasDigitalScore ? expected.length : null),
            inTunePercent: result?.inTunePercent ?? null,
            averageAbsCents: result?.averageAbsCents ?? null,
            feedback: pieceAttemptFeedback(result, hasDigitalScore),
            progressPercent: result?.score0to100 ?? null,
            hasRecording: true,
            feedbackSkills: skillMapFromReport(report),
          },
        });
        if (token !== analyzeTokenRef.current) return;
        if (!saved) {
          setStatus("error");
          setMessage("Couldn’t save that take. Try again.");
          return;
        }
        setStatus("idle");
        setMessage(null);
        tapFeedback("medium");
        onSavedRef.current();
      } catch (err) {
        if (token !== analyzeTokenRef.current) return;
        setStatus("error");
        setMessage(
          err instanceof Error
            ? err.message
            : "Could not listen to that take. Try again.",
        );
      } finally {
        if (ctx) {
          void ctx.close().catch(() => {});
        }
      }
    },
    [captureMode, file, pieceId, recordedBlob],
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
        void runAnalyze(blob, null);
      };
      startMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err) {
      stopStream();
      setMessage(describeMicOpenError(err));
      setStatus("error");
    }
  }, [
    refreshMicDevices,
    resetCaptureSession,
    resetTakeUi,
    runAnalyze,
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
  }, []);

  const discardRecording = useCallback(() => {
    if (!isRecording) return;
    discardRecordingRef.current = true;
    stopRecording();
  }, [isRecording, stopRecording]);

  const setCaptureMode = useCallback(
    (mode: MusaiCaptureMode) => {
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
    (e: ChangeEvent<HTMLInputElement>) => {
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

  useEffect(() => {
    return () => {
      discardRecordingRef.current = true;
      analyzeTokenRef.current += 1;
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      stopStream();
    };
  }, [stopStream]);

  return {
    selectId,
    captureMode,
    setCaptureMode,
    isRecording,
    recordedBlob,
    file,
    uploadProcessing,
    fileInputRef,
    handleFileChange,
    mainRecorderRef,
    micDevices,
    selectedMicId,
    setSelectedMicId,
    refreshMicDevices,
    startRecording,
    stopRecording,
    discardRecording,
    streamRef,
    elapsedLabel,
    lastTakeLabel,
    levelBars,
    waveformSamples,
    waveformLiveRef,
    message,
    status,
    analysing: status === "loading" || uploadProcessing,
  };
}
