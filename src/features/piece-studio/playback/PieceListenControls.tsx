"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { formatPieceClock } from "@/features/piece-studio/playback/playbackTimeline";
import type { PiecePlaybackTimeListener } from "@/features/piece-studio/playback/playbackTime";
import type {
  PieceInstrumentStatus,
  PieceLoopRange,
  PieceSpeedPreset,
} from "@/features/piece-studio/playback/usePiecePlayback";

const UI_TIME_MS = 100;

function IconPlay({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M8.2 5.4a1 1 0 0 1 1.52-.86l10.1 6.1a1 1 0 0 1 0 1.72l-10.1 6.1A1 1 0 0 1 8 17.6V6.4a1 1 0 0 1 .2-1z" />
    </svg>
  );
}

function IconPause({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <rect x="6.5" y="5" width="3.6" height="14" rx="1.1" />
      <rect x="13.9" y="5" width="3.6" height="14" rx="1.1" />
    </svg>
  );
}

function IconRestart({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4.5 12a7.5 7.5 0 1 0 2.1-5.2" />
      <path d="M4.5 4.8v4.4H9" />
    </svg>
  );
}

function IconMetronome({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9.2 20.5h5.6l2.4-14.2a1 1 0 0 0-1-1.2H7.8a1 1 0 0 0-1 1.2L9.2 20.5z" />
      <path d="M12 5.1V3.4" />
      <path d="M10.2 12.5 15 8.8" />
    </svg>
  );
}

/**
 * Listen transport — familiar play/pause/restart + scrubber, with secondary
 * speed / tempo / metronome / section tools grouped in one strip.
 */
export function PieceListenControls({
  ready,
  playing,
  currentSec = 0,
  durationSec,
  bpm,
  baseBpm,
  speedPreset,
  metronomeOn,
  loop,
  measureCount,
  unavailable,
  instrumentStatus = "ready",
  subscribeTime,
  getCurrentSec,
  onToggle,
  onRestart,
  onSeek,
  onBpm,
  onSpeedPreset,
  onToggleMetronome,
  onLoopChange,
  onLoopCurrentMeasure,
  onSeekToMeasure,
}: {
  ready: boolean;
  playing: boolean;
  currentSec?: number;
  durationSec: number;
  bpm: number;
  baseBpm: number;
  speedPreset: PieceSpeedPreset;
  metronomeOn: boolean;
  loop: PieceLoopRange | null;
  measureCount: number;
  unavailable: string | null;
  instrumentStatus?: PieceInstrumentStatus;
  subscribeTime?: (listener: PiecePlaybackTimeListener) => () => void;
  getCurrentSec?: () => number;
  onToggle: () => void;
  onRestart: () => void;
  onSeek: (sec: number) => void;
  onBpm: (bpm: number) => void;
  onSpeedPreset: (preset: PieceSpeedPreset) => void;
  onToggleMetronome: () => void;
  onLoopChange: (loop: PieceLoopRange | null) => void;
  onLoopCurrentMeasure: () => void;
  onSeekToMeasure: (measureNumber: number) => void;
}) {
  void baseBpm;
  const [liveSec, setLiveSec] = useState(currentSec);
  const [scrubSec, setScrubSec] = useState<number | null>(null);
  const [sectionOpen, setSectionOpen] = useState(false);
  const scrubbingRef = useRef(false);
  const displaySec =
    scrubSec != null ? scrubSec : subscribeTime ? liveSec : currentSec;

  useEffect(() => {
    if (!subscribeTime) return;
    let lastUi = 0;
    let trailing: number | null = null;
    let cancelled = false;
    const flush = (t: number) => {
      if (cancelled || scrubbingRef.current) return;
      lastUi = performance.now();
      setLiveSec(t);
    };
    const boot = window.setTimeout(() => {
      flush(getCurrentSec?.() ?? 0);
    }, 0);
    const unsub = subscribeTime((t) => {
      if (scrubbingRef.current) return;
      const now = performance.now();
      if (now - lastUi >= UI_TIME_MS) {
        if (trailing != null) {
          window.clearTimeout(trailing);
          trailing = null;
        }
        flush(t);
        return;
      }
      if (trailing != null) window.clearTimeout(trailing);
      trailing = window.setTimeout(() => {
        trailing = null;
        flush(getCurrentSec?.() ?? t);
      }, UI_TIME_MS);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(boot);
      unsub();
      if (trailing != null) window.clearTimeout(trailing);
    };
  }, [subscribeTime, getCurrentSec]);

  if (unavailable) {
    return (
      <div className="musai-piece-dock">
        <p className="musai-piece-dock__copy">{unavailable}</p>
      </div>
    );
  }

  const loadingSamples = instrumentStatus === "loading";
  const sampleError = instrumentStatus === "error";
  const canControl = ready && !loadingSamples && !sampleError;
  const seekMax = Math.max(durationSec, 0.01);
  const loopActive = loop != null;
  const progress = durationSec > 0 ? Math.min(1, displaySec / durationSec) : 0;

  const commitSeek = (value: number) => {
    scrubbingRef.current = false;
    setScrubSec(null);
    onSeek(value);
  };

  return (
    <div
      className="musai-piece-dock musai-piece-listen"
      data-testid="piece-listen-transport"
    >
      <div className="musai-piece-listen__transport">
        <div className="musai-piece-listen__transport-btns">
          <button
            type="button"
            className="musai-pressable musai-piece-listen__icon-btn musai-piece-listen__icon-btn--play"
            onClick={onToggle}
            disabled={!canControl}
            data-testid="piece-listen-play"
            aria-label={playing ? "Pause" : "Play"}
          >
            {loadingSamples ? (
              <span className="musai-piece-listen__loading-dot" aria-hidden />
            ) : playing ? (
              <IconPause className="musai-piece-listen__glyph" />
            ) : (
              <IconPlay className="musai-piece-listen__glyph musai-piece-listen__glyph--play" />
            )}
          </button>

          <button
            type="button"
            className="musai-pressable musai-piece-listen__icon-btn"
            onClick={onRestart}
            disabled={!canControl}
            data-testid="piece-listen-restart"
            aria-label="Restart"
          >
            <IconRestart className="musai-piece-listen__glyph" />
          </button>
        </div>

        <div className="musai-piece-listen__scrub">
          <label className="musai-piece-listen__seek">
            <span className="sr-only">Seek</span>
            <input
              type="range"
              min={0}
              max={seekMax}
              step={0.01}
              value={Math.min(displaySec, seekMax)}
              disabled={!canControl}
              aria-label="Seek"
              data-testid="piece-listen-seek"
              style={{ "--musai-listen-progress": `${progress * 100}%` } as CSSProperties}
              onPointerDown={() => {
                scrubbingRef.current = true;
                setScrubSec(displaySec);
              }}
              onChange={(e) => setScrubSec(Number(e.target.value))}
              onPointerUp={(e) => {
                commitSeek(Number((e.target as HTMLInputElement).value));
              }}
              onKeyUp={(e) => {
                if (
                  e.key === "ArrowLeft" ||
                  e.key === "ArrowRight" ||
                  e.key === "Home" ||
                  e.key === "End"
                ) {
                  commitSeek(Number((e.target as HTMLInputElement).value));
                }
              }}
              onBlur={(e) => {
                if (scrubbingRef.current) {
                  commitSeek(Number(e.target.value));
                }
              }}
            />
          </label>
          <p className="musai-piece-listen__clock" aria-live="off">
            <span data-testid="piece-listen-time-current">
              {formatPieceClock(displaySec)}
            </span>
            <span className="musai-piece-listen__clock-sep" aria-hidden>
              /
            </span>
            <span data-testid="piece-listen-time-total">
              {formatPieceClock(durationSec)}
            </span>
          </p>
        </div>
      </div>

      <div
        className="musai-piece-listen__secondary"
        data-testid="piece-listen-options"
      >
        <div className="musai-piece-listen__group" role="group" aria-label="Speed">
          <span className="musai-piece-listen__group-label">Speed</span>
          <div className="musai-piece-listen__seg">
            <button
              type="button"
              className="musai-pressable musai-piece-listen__seg-btn"
              data-active={speedPreset === "slow"}
              disabled={!canControl}
              aria-pressed={speedPreset === "slow"}
              onClick={() => onSpeedPreset("slow")}
            >
              ½
            </button>
            <button
              type="button"
              className="musai-pressable musai-piece-listen__seg-btn"
              data-active={speedPreset === "normal"}
              disabled={!canControl}
              aria-pressed={speedPreset === "normal"}
              onClick={() => onSpeedPreset("normal")}
            >
              1×
            </button>
          </div>
        </div>

        <div className="musai-piece-listen__group" role="group" aria-label="Tempo">
          <span className="musai-piece-listen__group-label">Tempo</span>
          <label className="musai-piece-listen__tempo">
            <span className="sr-only">Tempo</span>
            <input
              type="range"
              min={40}
              max={208}
              step={1}
              value={bpm}
              disabled={!canControl}
              aria-label={`Tempo ${bpm}`}
              onChange={(e) => onBpm(Number(e.target.value))}
            />
            <span className="musai-piece-listen__tempo-readout" aria-hidden>
              {bpm}
              <span> bpm</span>
            </span>
          </label>
        </div>

        <div className="musai-piece-listen__group" role="group" aria-label="Metronome">
          <span className="musai-piece-listen__group-label">Click</span>
          <button
            type="button"
            className="musai-pressable musai-piece-listen__icon-btn musai-piece-listen__icon-btn--tool"
            data-active={metronomeOn}
            disabled={!canControl}
            aria-pressed={metronomeOn}
            data-testid="piece-listen-metronome"
            aria-label={metronomeOn ? "Metronome on" : "Metronome off"}
            onClick={onToggleMetronome}
          >
            <IconMetronome className="musai-piece-listen__glyph" />
          </button>
        </div>

        {measureCount > 0 ? (
          <div className="musai-piece-listen__group" role="group" aria-label="Section">
            <span className="musai-piece-listen__group-label">Section</span>
            <button
              type="button"
              className="musai-pressable musai-piece-listen__section-btn"
              data-active={sectionOpen || loopActive}
              disabled={!canControl}
              aria-expanded={sectionOpen}
              aria-controls="piece-listen-section"
              data-testid="piece-listen-section-toggle"
              onClick={() => setSectionOpen((open) => !open)}
            >
              {loopActive
                ? loop.fromMeasure === loop.toMeasure
                  ? `Bar ${loop.fromMeasure}`
                  : `${loop.fromMeasure}–${loop.toMeasure}`
                : "Select"}
            </button>
          </div>
        ) : null}
      </div>

      {sectionOpen && measureCount > 0 ? (
        <div
          id="piece-listen-section"
          className="musai-piece-listen__section"
          data-testid="piece-listen-section"
        >
          <div className="musai-piece-listen__section-row">
            <label>
              <span className="sr-only">From bar</span>
              <input
                type="number"
                min={1}
                max={measureCount}
                value={loop?.fromMeasure ?? 1}
                disabled={!canControl}
                aria-label="From bar"
                onChange={(e) => {
                  const from = Number(e.target.value);
                  const to = loop?.toMeasure ?? from;
                  onLoopChange({
                    fromMeasure: from,
                    toMeasure: Math.max(from, to),
                  });
                }}
              />
            </label>
            <span className="musai-piece-listen__section-sep" aria-hidden>
              –
            </span>
            <label>
              <span className="sr-only">To bar</span>
              <input
                type="number"
                min={1}
                max={measureCount}
                value={loop?.toMeasure ?? 1}
                disabled={!canControl}
                aria-label="To bar"
                onChange={(e) => {
                  const to = Number(e.target.value);
                  const from = loop?.fromMeasure ?? 1;
                  onLoopChange({
                    fromMeasure: Math.min(from, to),
                    toMeasure: to,
                  });
                }}
              />
            </label>
            <button
              type="button"
              className="musai-pressable musai-piece-listen__section-action"
              disabled={!canControl}
              onClick={() => onSeekToMeasure(loop?.fromMeasure ?? 1)}
            >
              Go
            </button>
            <button
              type="button"
              className="musai-pressable musai-piece-listen__section-action"
              disabled={!canControl}
              onClick={onLoopCurrentMeasure}
            >
              This bar
            </button>
            {loopActive ? (
              <button
                type="button"
                className="musai-pressable musai-piece-listen__section-action"
                disabled={!canControl}
                onClick={() => onLoopChange(null)}
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {loadingSamples ? (
        <p className="musai-piece-listen__status" role="status">
          Loading piano…
        </p>
      ) : null}
      {sampleError ? (
        <p className="musai-piece-listen__status" role="status">
          Couldn’t load piano samples.
        </p>
      ) : null}
    </div>
  );
}
