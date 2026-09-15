"use client";

import { animate } from "animejs";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { formatPieceClock } from "@/features/piece-studio/playback/playbackTimeline";
import type { PiecePlaybackTimeListener } from "@/features/piece-studio/playback/playbackTime";
import type {
  PieceInstrumentStatus,
  PieceLoopRange,
  PieceSpeedPreset,
} from "@/features/piece-studio/playback/usePiecePlayback";
import { MUSAI_DUR, MUSAI_EASE, prefersReducedMotion } from "@/lib/motion";

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

function IconMore({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
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
 * Listen transport — floating playback dock tied to the score width.
 * Speed, tempo, metronome, and section stay behind the options control.
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
  onScrubPreview,
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
  /** Live preview while dragging — updates playhead without re-arming audio. */
  onScrubPreview?: (sec: number) => void;
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [sectionOpen, setSectionOpen] = useState(false);
  const scrubbingRef = useRef(false);
  const scrubRafRef = useRef<number | null>(null);
  const pendingScrubRef = useRef<number | null>(null);
  const playBtnRef = useRef<HTMLButtonElement>(null);
  const playGlyphRef = useRef<HTMLSpanElement>(null);
  const morePanelRef = useRef<HTMLDivElement>(null);
  const displaySec =
    scrubSec != null ? scrubSec : subscribeTime ? liveSec : currentSec;

  useEffect(() => {
    if (!subscribeTime) return;
    let cancelled = false;

    // While playing: rAF clock so the timeline thumb glides continuously
    // (YouTube-style) instead of jumping every ~100ms.
    if (playing) {
      let raf = 0;
      const tick = () => {
        if (cancelled) return;
        if (!scrubbingRef.current) {
          setLiveSec(getCurrentSec?.() ?? 0);
        }
        raf = window.requestAnimationFrame(tick);
      };
      raf = window.requestAnimationFrame(tick);
      return () => {
        cancelled = true;
        window.cancelAnimationFrame(raf);
      };
    }

    let lastUi = 0;
    let trailing: number | null = null;
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
  }, [subscribeTime, getCurrentSec, playing]);

  useEffect(() => {
    return () => {
      if (scrubRafRef.current != null) {
        window.cancelAnimationFrame(scrubRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const glyph = playGlyphRef.current;
    if (!glyph || prefersReducedMotion()) return;
    animate(glyph, {
      opacity: [0.35, 1],
      scale: [0.86, 1],
      duration: MUSAI_DUR.fast,
      ease: MUSAI_EASE.soft,
    });
  }, [playing]);

  useEffect(() => {
    if (!moreOpen) return;
    const panel = morePanelRef.current;
    if (!panel || prefersReducedMotion()) return;
    animate(panel, {
      opacity: [0, 1],
      translateY: [6, 0],
      duration: MUSAI_DUR.base,
      ease: MUSAI_EASE.out,
    });
  }, [moreOpen]);

  if (unavailable) {
    return (
      <div className="musai-piece-dock musai-piece-listen musai-piece-listen--unavailable">
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
  const scrubbing = scrubSec != null;

  const flushScrubPreview = (value: number) => {
    pendingScrubRef.current = value;
    if (scrubRafRef.current != null) return;
    scrubRafRef.current = window.requestAnimationFrame(() => {
      scrubRafRef.current = null;
      const next = pendingScrubRef.current;
      if (next == null) return;
      (onScrubPreview ?? onSeek)(next);
    });
  };

  const commitSeek = (value: number) => {
    scrubbingRef.current = false;
    if (scrubRafRef.current != null) {
      window.cancelAnimationFrame(scrubRafRef.current);
      scrubRafRef.current = null;
    }
    pendingScrubRef.current = null;
    setScrubSec(null);
    setLiveSec(value);
    onSeek(value);
  };

  const handleToggle = () => {
    const btn = playBtnRef.current;
    if (btn && !prefersReducedMotion()) {
      animate(btn, {
        scale: [0.94, 1],
        duration: MUSAI_DUR.micro,
        ease: MUSAI_EASE.out,
      });
    }
    onToggle();
  };

  const handleRestart = () => {
    onRestart();
  };

  return (
    <div
      className="musai-piece-dock musai-piece-listen"
      data-testid="piece-listen-transport"
      data-more={moreOpen ? "true" : "false"}
      data-playing={playing ? "true" : "false"}
      data-scrubbing={scrubbing ? "true" : "false"}
    >
      <div className="musai-piece-listen__shell">
        <div className="musai-piece-listen__transport">
          <button
            type="button"
            className="musai-pressable musai-piece-listen__icon-btn musai-piece-listen__icon-btn--restart"
            onClick={handleRestart}
            disabled={!canControl}
            data-testid="piece-listen-restart"
            aria-label="Restart from beginning"
            title="Restart from beginning"
          >
            <IconRestart className="musai-piece-listen__glyph" />
          </button>

          <button
            ref={playBtnRef}
            type="button"
            className="musai-pressable musai-piece-listen__icon-btn musai-piece-listen__icon-btn--play"
            onClick={handleToggle}
            disabled={!canControl}
            data-testid="piece-listen-play"
            aria-label={playing ? "Pause" : "Play"}
            title={playing ? "Pause" : "Play"}
          >
            {loadingSamples ? (
              <span className="musai-piece-listen__loading-dot" aria-hidden />
            ) : (
              <span ref={playGlyphRef} className="musai-piece-listen__play-glyph">
                {playing ? (
                  <IconPause className="musai-piece-listen__glyph musai-piece-listen__glyph--pause" />
                ) : (
                  <IconPlay className="musai-piece-listen__glyph musai-piece-listen__glyph--play" />
                )}
              </span>
            )}
          </button>

          <div className="musai-piece-listen__timeline">
            <span
              className="musai-piece-listen__time musai-piece-listen__time--elapsed"
              data-testid="piece-listen-time-current"
            >
              {formatPieceClock(displaySec)}
            </span>
            <label className="musai-piece-listen__seek">
              <span className="sr-only">Seek</span>
              <input
                type="range"
                min={0}
                max={seekMax}
                step="any"
                value={Math.min(displaySec, seekMax)}
                disabled={!canControl}
                aria-label="Seek"
                data-testid="piece-listen-seek"
                data-scrubbing={scrubbing ? "true" : "false"}
                style={
                  {
                    "--musai-listen-progress": `${progress * 100}%`,
                  } as CSSProperties
                }
                onPointerDown={() => {
                  scrubbingRef.current = true;
                  setScrubSec(displaySec);
                }}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  scrubbingRef.current = true;
                  setScrubSec(value);
                  flushScrubPreview(value);
                }}
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
            <span
              className="musai-piece-listen__time musai-piece-listen__time--total"
              data-testid="piece-listen-time-total"
            >
              {formatPieceClock(durationSec)}
            </span>
          </div>

          <div className="musai-piece-listen__more-wrap">
            <button
              type="button"
              className="musai-pressable musai-piece-listen__more"
              data-active={moreOpen}
              aria-expanded={moreOpen}
              aria-controls="piece-listen-options"
              data-testid="piece-listen-more"
              aria-label="Playback options"
              title="Playback options"
              onClick={() => {
                setMoreOpen((open) => {
                  if (open) setSectionOpen(false);
                  return !open;
                });
              }}
            >
              <IconMore className="musai-piece-listen__glyph musai-piece-listen__glyph--more" />
            </button>

            {moreOpen ? (
              <div
                ref={morePanelRef}
                id="piece-listen-options"
                className="musai-piece-listen__popover"
                data-testid="piece-listen-options"
                role="dialog"
                aria-label="Playback options"
              >
                <div
                  className="musai-piece-listen__group"
                  role="group"
                  aria-label="Speed"
                >
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

                <div
                  className="musai-piece-listen__group"
                  role="group"
                  aria-label="Tempo"
                >
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

                <div
                  className="musai-piece-listen__group"
                  role="group"
                  aria-label="Metronome"
                >
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
                  <div
                    className="musai-piece-listen__group"
                    role="group"
                    aria-label="Section"
                  >
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
              </div>
            ) : null}
          </div>
        </div>

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
    </div>
  );
}
