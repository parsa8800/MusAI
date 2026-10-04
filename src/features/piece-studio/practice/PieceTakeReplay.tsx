"use client";

import { useEffect, useState, type RefObject } from "react";
import { tapFeedback } from "@/lib/motion";

function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec + 0.0001));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function mediaDurationSec(media: HTMLAudioElement | null): number {
  const d = media?.duration;
  return typeof d === "number" && Number.isFinite(d) && d > 0 ? d : 0;
}

/**
 * Play the latest submitted take. Hidden `<audio>` drives the score playhead.
 */
export function PieceTakeReplay({
  src,
  durationSec,
  takeNumber,
  audioRef,
}: {
  src: string;
  durationSec: number | null;
  takeNumber: number | null;
  audioRef: RefObject<HTMLAudioElement | null>;
}) {
  const [playing, setPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [mediaSec, setMediaSec] = useState(0);
  const [failed, setFailed] = useState(false);

  const totalSec =
    mediaSec > 0
      ? mediaSec
      : typeof durationSec === "number" && durationSec > 0
        ? durationSec
        : 0;
  useEffect(() => {
    setPlaying(false);
    setCurrentSec(0);
    setMediaSec(0);
    setFailed(false);
  }, [src]);

  const syncFromMedia = (el: HTMLAudioElement) => {
    const nextDur = mediaDurationSec(el);
    if (nextDur > 0) setMediaSec(nextDur);
    const t = el.currentTime;
    setCurrentSec(Number.isFinite(t) && t > 0 ? t : 0);
    setPlaying(!el.paused && !el.ended);
  };

  const onToggle = () => {
    const el = audioRef.current;
    if (!el || failed) return;
    tapFeedback("medium");
    if (!el.paused && !el.ended) {
      el.pause();
      setPlaying(false);
      return;
    }
    const dur = mediaDurationSec(el) || totalSec;
    if (el.ended || (dur > 0 && el.currentTime >= dur - 0.05)) {
      el.currentTime = 0;
    }
    void el.play().then(
      () => setPlaying(true),
      () => {
        setPlaying(false);
        setFailed(true);
      },
    );
  };

  if (failed) {
    return (
      <p className="musai-piece-take__fail" role="status">
        Couldn’t play last take
      </p>
    );
  }

  return (
    <div className="musai-piece-take" data-testid="piece-take-replay">
      <audio
        ref={audioRef}
        className="musai-piece-take__audio"
        src={src}
        preload="auto"
        playsInline
        data-testid="piece-practise-take-audio"
        aria-hidden
        onLoadedMetadata={(event) => syncFromMedia(event.currentTarget)}
        onDurationChange={(event) => syncFromMedia(event.currentTarget)}
        onTimeUpdate={(event) => syncFromMedia(event.currentTarget)}
        onPlay={(event) => syncFromMedia(event.currentTarget)}
        onPause={(event) => syncFromMedia(event.currentTarget)}
        onEnded={(event) => {
          event.currentTarget.currentTime = 0;
          setPlaying(false);
          setCurrentSec(0);
        }}
        onError={() => {
          setPlaying(false);
          setFailed(true);
        }}
      />
      <button
        type="button"
        className="musai-pressable musai-piece-take__play"
        aria-pressed={playing}
        aria-label={playing ? "Pause last take" : "Play last take"}
        data-take-number={takeNumber ?? 0}
        onClick={onToggle}
      >
        <span className="musai-piece-take__icon" aria-hidden>
          {playing ? (
            <svg viewBox="0 0 24 24" className="musai-piece-take__glyph">
              <rect x="6" y="5" width="4.5" height="14" rx="1" />
              <rect x="13.5" y="5" width="4.5" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="musai-piece-take__glyph">
              <path d="M8 5.5v13l11-6.5-11-6.5Z" />
            </svg>
          )}
        </span>
        <span className="musai-piece-take__title">
          {playing ? "Pause" : "Last take"}
        </span>
        {playing && (totalSec > 0 || currentSec > 0) ? (
          <span className="musai-piece-take__clock">
            {formatClock(currentSec)}
            {totalSec > 0 ? ` / ${formatClock(totalSec)}` : ""}
          </span>
        ) : null}
      </button>
    </div>
  );
}
