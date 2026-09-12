"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Browser speech → text for coach draft. Unsupported browsers simply hide the mic.
 */
export function useCoachSpeechInput(opts: {
  disabled?: boolean;
  onTranscript: (text: string) => void;
}) {
  const { disabled = false, onTranscript } = opts;
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const baseRef = useRef("");
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    setSupported(Boolean(getSpeechRecognitionCtor()));
  }, []);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec) {
      setListening(false);
      return;
    }
    try {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.stop();
    } catch {
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    }
    recRef.current = null;
    setListening(false);
  }, []);

  useEffect(() => {
    if (disabled && listening) stop();
  }, [disabled, listening, stop]);

  useEffect(() => () => stop(), [stop]);

  const start = useCallback(
    (currentDraft: string) => {
      if (disabled) return;
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) return;

      stop();
      baseRef.current = currentDraft.trim() ? `${currentDraft.trim()} ` : "";

      const rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang =
        typeof navigator !== "undefined" && navigator.language
          ? navigator.language
          : "en-US";

      rec.onresult = (event) => {
        let chunk = "";
        for (let i = 0; i < event.results.length; i += 1) {
          const row = event.results[i];
          if (!row) continue;
          chunk += row[0]?.transcript ?? "";
        }
        const next = `${baseRef.current}${chunk}`.replace(/\s+/g, " ").trimStart();
        onTranscriptRef.current(next);
      };

      rec.onerror = () => {
        setListening(false);
        recRef.current = null;
      };

      rec.onend = () => {
        setListening(false);
        recRef.current = null;
      };

      try {
        rec.start();
        recRef.current = rec;
        setListening(true);
      } catch {
        setListening(false);
        recRef.current = null;
      }
    },
    [disabled, stop],
  );

  const toggle = useCallback(
    (currentDraft: string) => {
      if (listening) stop();
      else start(currentDraft);
    },
    [listening, start, stop],
  );

  return { supported, listening, toggle, stop };
}
