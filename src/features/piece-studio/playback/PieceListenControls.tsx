"use client";

import { animate } from "animejs";
import { useEffect, useRef, useState } from "react";
import {
  formatPieceClock,
  PIECE_TEMPO_MAX_BPM,
  PIECE_TEMPO_MIN_BPM,
} from "@/features/piece-studio/playback/playbackTimeline";
import { PIECE_CLICK_LEVEL_DEFAULT } from "@/features/piece-studio/playback/pieceMetronome";
import type { PiecePlaybackTimeListener } from "@/features/piece-studio/playback/playbackTime";
import {
  PIECE_SPEED_PRESETS,
  type PieceSpeedPreset,
} from "@/features/piece-studio/playback/pieceSpeed";
import type {
  PieceInstrumentStatus,
  PieceLoopRange,
} from "@/features/piece-studio/playback/usePiecePlayback";
import { MUSAI_DUR, MUSAI_EASE, prefersReducedMotion } from "@/lib/motion";

const UI_TIME_MS = 100;

function progressRatio(currentSec: number, durationSec: number): number {
  if (!(durationSec > 0) || !Number.isFinite(currentSec)) return 0;
  return Math.min(100, Math.max(0, (currentSec / durationSec) * 100));
}

function IconPlay({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M8.4 5.55a.9.9 0 0 1 1.37-.77l9.05 5.45a.9.9 0 0 1 0 1.54l-9.05 5.45a.9.9 0 0 1-1.37-.77V5.55z" />
    </svg>
  );
}

function IconPause({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <rect x="6.75" y="5.5" width="3.4" height="13" rx="1.2" />
      <rect x="13.85" y="5.5" width="3.4" height="13" rx="1.2" />
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
      strokeWidth={1.85}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4.6 12a7.4 7.4 0 1 0 2-5.15" />
      <path d="M4.6 4.9v4.2H8.8" />
    </svg>
  );
}

function IconMore({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <circle cx="6" cy="12" r="1.45" />
      <circle cx="12" cy="12" r="1.45" />
      <circle cx="18" cy="12" r="1.45" />
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

function IconLoop({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.85}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17.2 7.2H9.2a3.4 3.4 0 0 0-3.4 3.4v.6" />
      <path d="M6.8 16.8h8a3.4 3.4 0 0 0 3.4-3.4v-.6" />
      <path d="M15 5.1 17.2 7.2 15 9.3" />
      <path d="M9 18.9 6.8 16.8 9 14.7" />
    </svg>
  );
}

/**
 * Listen transport — compact secondary chrome under the score.
 * Position lives on the green playhead; tap a note to start from there.
 * Opening options pauses so tempo/speed edits cannot re-attack notes.
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
  clickLevel = PIECE_CLICK_LEVEL_DEFAULT,
  loop,
  measureCount,
  unavailable,
  instrumentStatus = "ready",
  sampleName = "piano",
  subscribeTime,
  getCurrentSec,
  onToggle,
  onPause,
  onRestart,
  onBpm,
  onSpeedPreset,
  onToggleMetronome,
  onClickLevel,
  onPreviewClick,
  onLoopPress,
  loopPick = null,
}: {
  ready: boolean;
  playing: boolean;
  currentSec?: number;
  durationSec: number;
  bpm: number;
  baseBpm: number;
  speedPreset: PieceSpeedPreset | null;
  metronomeOn: boolean;
  /** 0 soft, 100 loud. Shown only while Click is on. */
  clickLevel?: number;
  loop: PieceLoopRange | null;
  measureCount: number;
  unavailable: string | null;
  instrumentStatus?: PieceInstrumentStatus;
  /** Sound named in the load-error line. */
  sampleName?: string;
  subscribeTime?: (listener: PiecePlaybackTimeListener) => () => void;
  getCurrentSec?: () => number;
  onToggle: () => void;
  /** Pause without toggling — used when opening playback options. */
  onPause: () => void;
  onRestart: () => void;
  onBpm: (bpm: number) => void;
  onSpeedPreset: (preset: PieceSpeedPreset) => void;
  onToggleMetronome: () => void;
  onClickLevel?: (level: number) => void;
  onPreviewClick?: () => void;
  /** Starts a start-bar / end-bar pick on the score, or clears the current loop. */
  onLoopPress: () => void;
  loopPick?: "start" | "end" | null;
}) {
  void baseBpm;
  const [liveSec, setLiveSec] = useState(currentSec);
  const [moreOpen, setMoreOpen] = useState(false);
  const [draftBpm, setDraftBpm] = useState(bpm);
  const bpmDraggingRef = useRef(false);
  const playBtnRef = useRef<HTMLButtonElement>(null);
  const playGlyphRef = useRef<HTMLSpanElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const morePanelRef = useRef<HTMLDivElement>(null);
  const displaySec = subscribeTime ? liveSec : currentSec;

  useEffect(() => {
    if (!bpmDraggingRef.current) setDraftBpm(bpm);
  }, [bpm]);

  useEffect(() => {
    if (!subscribeTime) return;
    let cancelled = false;

    if (playing) {
      let raf = 0;
      const tick = () => {
        if (cancelled) return;
        setLiveSec(getCurrentSec?.() ?? 0);
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
      if (cancelled) return;
      lastUi = performance.now();
      setLiveSec(t);
    };
    const boot = window.setTimeout(() => {
      flush(getCurrentSec?.() ?? 0);
    }, 0);
    const unsub = subscribeTime((t) => {
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

  useEffect(() => {
    if (!moreOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const t = event.target;
      if (!(t instanceof Node)) return;
      if (moreBtnRef.current?.contains(t)) return;
      if (morePanelRef.current?.contains(t)) return;
      if (
        loopPick &&
        t instanceof Element &&
        t.closest(".musai-piece-score-viewer, .musai-piece-osmd-wrap")
      ) {
        return;
      }
      setMoreOpen(false);
    };
    // Capture so outside taps close before score seek / other handlers run.
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [moreOpen, loopPick]);

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
  const loopActive = loop != null;
  const loopCue =
    loopPick === "start"
      ? "Tap the first bar"
      : loopPick === "end"
        ? "Tap the last bar"
        : loop
          ? loop.fromMeasure === loop.toMeasure
            ? `Bar ${loop.fromMeasure}`
            : `Bars ${loop.fromMeasure}–${loop.toMeasure}`
          : null;

  const handleToggle = () => {
    // Pause/play first — button animation must not delay the cut.
    onToggle();
    const btn = playBtnRef.current;
    if (btn && !prefersReducedMotion()) {
      animate(btn, {
        scale: [0.94, 1],
        duration: MUSAI_DUR.micro,
        ease: MUSAI_EASE.out,
      });
    }
  };

  const openOptions = () => {
    // Pause while editing so tempo/speed cannot re-attack the current note.
    if (playing) onPause();
    setMoreOpen(true);
  };

  const closeOptions = () => {
    setMoreOpen(false);
  };

  const commitBpm = (value: number) => {
    bpmDraggingRef.current = false;
    setDraftBpm(value);
    onBpm(value);
  };

  return (
    <div
      className="musai-piece-dock musai-piece-listen"
      data-testid="piece-listen-transport"
      data-more={moreOpen ? "true" : "false"}
      data-playing={playing ? "true" : "false"}
    >
      <div className="musai-piece-listen__shell">
        <div className="musai-piece-listen__transport">
          <div className="musai-piece-listen__cluster">
          <button
            type="button"
            className="musai-pressable musai-piece-listen__icon-btn musai-piece-listen__icon-btn--restart"
            onClick={onRestart}
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
            <span ref={playGlyphRef} className="musai-piece-listen__play-glyph">
              {playing ? (
                <IconPause className="musai-piece-listen__glyph musai-piece-listen__glyph--pause" />
              ) : (
                <IconPlay className="musai-piece-listen__glyph musai-piece-listen__glyph--play" />
              )}
            </span>
          </button>
          </div>

          <div
            className="musai-piece-listen__timeline"
            data-testid="piece-listen-clock"
            aria-label={`${formatPieceClock(displaySec)} of ${formatPieceClock(durationSec)}`}
          >
            <span
              className="musai-piece-listen__time"
              data-testid="piece-listen-time-current"
            >
              {formatPieceClock(displaySec)}
            </span>
            <span className="musai-piece-listen__track" aria-hidden>
              <span
                className="musai-piece-listen__track-fill"
                style={{ width: `${progressRatio(displaySec, durationSec)}%` }}
              />
            </span>
            <span
              className="musai-piece-listen__time musai-piece-listen__time--total"
              data-testid="piece-listen-time-total"
            >
              {formatPieceClock(durationSec)}
            </span>
          </div>

          <div className="musai-piece-listen__more-wrap musai-piece-listen__cluster musai-piece-listen__cluster--end">
            <button
              ref={moreBtnRef}
              type="button"
              className="musai-pressable musai-piece-listen__more"
              data-active={moreOpen}
              aria-expanded={moreOpen}
              aria-controls="piece-listen-options"
              data-testid="piece-listen-more"
              aria-label="Playback options"
              title="Playback options"
              onClick={() => {
                if (moreOpen) closeOptions();
                else openOptions();
              }}
            >
              <IconMore className="musai-piece-listen__glyph musai-piece-listen__glyph--more" />
            </button>
          </div>
        </div>

        {sampleError ? (
          <p className="musai-piece-listen__status" role="status">
            Couldn’t load {sampleName} samples.
          </p>
        ) : null}
      </div>

      {moreOpen ? (
        <div
          ref={morePanelRef}
          id="piece-listen-options"
          className="musai-piece-listen__popover"
          data-testid="piece-listen-options"
          role="dialog"
          aria-label="Playback options"
        >
          <div className="musai-piece-listen__toolbar">
            <div className="musai-piece-listen__opt">
              <span className="musai-piece-listen__opt-label">Speed</span>
              <div className="musai-piece-listen__seg" role="group" aria-label="Speed">
                {PIECE_SPEED_PRESETS.map((speed) => (
                  <button
                    key={speed.id}
                    type="button"
                    className="musai-pressable musai-piece-listen__seg-btn"
                    data-active={speedPreset === speed.id}
                    disabled={!canControl}
                    aria-pressed={speedPreset === speed.id}
                    aria-label={speed.aria}
                    onClick={() => onSpeedPreset(speed.id)}
                  >
                    {speed.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="musai-piece-listen__tempo">
              <span className="musai-piece-listen__opt-label">Tempo</span>
              <input
                type="range"
                min={PIECE_TEMPO_MIN_BPM}
                max={PIECE_TEMPO_MAX_BPM}
                step={1}
                value={draftBpm}
                disabled={!canControl}
                aria-label={`Tempo ${draftBpm}`}
                onPointerDown={() => {
                  bpmDraggingRef.current = true;
                }}
                onChange={(e) => {
                  bpmDraggingRef.current = true;
                  setDraftBpm(Number(e.target.value));
                }}
                onPointerUp={(e) => {
                  commitBpm(Number((e.target as HTMLInputElement).value));
                }}
                onBlur={(e) => {
                  if (bpmDraggingRef.current) {
                    commitBpm(Number(e.target.value));
                  }
                }}
              />
              <span className="musai-piece-listen__tempo-readout" aria-hidden>
                {draftBpm}
              </span>
            </label>

            <div className="musai-piece-listen__actions">
              <button
                type="button"
                className="musai-pressable musai-piece-listen__opt-btn"
                data-active={metronomeOn}
                disabled={!canControl}
                aria-pressed={metronomeOn}
                data-testid="piece-listen-metronome"
                aria-label={metronomeOn ? "Metronome on" : "Metronome off"}
                onClick={onToggleMetronome}
              >
                <IconMetronome className="musai-piece-listen__glyph" />
                Click
              </button>
              {metronomeOn ? (
                <label className="musai-piece-listen__click">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={clickLevel}
                    disabled={!canControl}
                    aria-label={`Click volume ${clickLevel}`}
                    data-testid="piece-listen-click-volume"
                    onChange={(e) => onClickLevel?.(Number(e.target.value))}
                    onPointerUp={() => {
                      onPreviewClick?.();
                    }}
                  />
                </label>
              ) : null}

              {measureCount > 0 ? (
                <button
                  type="button"
                  className="musai-pressable musai-piece-listen__opt-btn"
                  data-active={loopPick != null || loopActive}
                  disabled={!canControl}
                  data-testid="piece-listen-loop"
                  aria-pressed={loopPick != null || loopActive}
                  aria-label={
                    loopPick === "start"
                      ? "Choosing the first bar"
                      : loopPick === "end"
                        ? "Choosing the last bar"
                        : loopActive
                          ? "Clear loop"
                          : "Loop"
                  }
                  onClick={onLoopPress}
                >
                  <IconLoop className="musai-piece-listen__glyph" />
                  Loop
                </button>
              ) : null}
            </div>
            {loopCue ? (
              <p className="musai-piece-listen__loop-hint" role="status">
                {loopCue}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
