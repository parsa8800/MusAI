"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  WAVEFORM_BAR_PITCH_PX,
  WAVEFORM_BAR_WIDTH_PX,
  WAVEFORM_PLAYHEAD_INSET_PX,
  WAVEFORM_SAMPLE_MS,
  WAVEFORM_UI_COLUMNS,
  clampAmplitude,
  liveWaveformBarX,
  liveWaveformPxPerMs,
  liveWaveformWindow,
  waveformColumnCount,
  waveformColumns,
  waveformMarkerProgress,
  type WaveformLayout,
  type WaveformLiveClock,
  type WaveformMarker,
} from "@/lib/recordingWaveform";

type Props = {
  samples: number[];
  className?: string;
  /** Accessible name — live vs completed take. */
  label?: string;
  /** Newest audio at the right, history scrolling left. */
  live?: boolean;
  /** Shorter well for attempt history. */
  compact?: boolean;
  /**
   * `tape` = compact Scale Studio strip.
   * `timeline` = full-width Piece Studio scrubber (markers supported).
   */
  layout?: WaveformLayout;
  /** Timestamp cues for Piece Studio. Ignored in `tape` layout. */
  markers?: readonly WaveformMarker[];
  /** Duration of the take in ms — required to place markers on a finished timeline. */
  durationMs?: number;
  /** Live sample clock written by the mic analyser (no React redraw per sample). */
  liveClockRef?: RefObject<WaveformLiveClock>;
};

function barHeightPct(value: number): number {
  if (value <= 0.02) return 10;
  return Math.min(100, Math.round(10 + value * 90));
}

function readWaveColor(el: HTMLElement): string {
  const styles = getComputedStyle(el);
  return (
    styles.getPropertyValue("--musai-accent-2").trim() ||
    styles.getPropertyValue("--musai-danger").trim() ||
    "#c45c4a"
  );
}

function paintLiveWaveform(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  clock: WaveformLiveClock,
  now: number,
) {
  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!ctx) return;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const cssW = host.clientWidth;
  const cssH = host.clientHeight;
  if (cssW < 2 || cssH < 2) return;
  const pixelW = Math.round(cssW * dpr);
  const pixelH = Math.round(cssH * dpr);
  if (canvas.width !== pixelW || canvas.height !== pixelH) {
    canvas.width = pixelW;
    canvas.height = pixelH;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  if (clock.samples.length === 0) return;

  const color = readWaveColor(host);
  const playheadX = cssW - WAVEFORM_PLAYHEAD_INSET_PX;
  const pxPerMs = liveWaveformPxPerMs(WAVEFORM_BAR_PITCH_PX, WAVEFORM_SAMPLE_MS);
  const samples = clock.samples;
  const times = clock.times;
  const minH = Math.max(2, cssH * 0.07);
  const maxH = cssH * 0.92;
  const barW = WAVEFORM_BAR_WIDTH_PX;

  ctx.fillStyle = color;
  for (let i = 0; i < samples.length; i++) {
    const sampleTime =
      times[i] ?? now - (samples.length - 1 - i) * WAVEFORM_SAMPLE_MS;
    const x = liveWaveformBarX(now, sampleTime, playheadX, pxPerMs);
    if (x < -barW || x > cssW + barW) continue;
    const amp = clampAmplitude(samples[i]!);
    const h = minH + amp * (maxH - minH);
    const y0 = (cssH - h) / 2;
    const x0 = x - barW / 2;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x0, y0, barW, h, barW);
    } else {
      ctx.rect(x0, y0, barW, h);
    }
    ctx.fill();
  }
}

function LiveWaveformCanvas({
  liveClockRef,
}: {
  liveClockRef: RefObject<WaveformLiveClock>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const host = canvas.parentElement;
    if (!host) return;
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const clock = liveClockRef.current;
      if (!clock) return;
      paintLiveWaveform(canvas, host, clock, now);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [liveClockRef]);

  return (
    <canvas
      className="musai-rec-wave__canvas"
      ref={canvasRef}
      aria-hidden
    />
  );
}

/**
 * Voice Memos–style amplitude history.
 * Live: playhead on the right, previous audio scrolls left (canvas).
 * Frozen: the whole take is mapped across the well.
 * `timeline` layout reserves room for Piece Studio timestamp markers.
 */
export function RecordingWaveformHistory({
  samples,
  className = "",
  label = "Recording volume history",
  live = false,
  compact = false,
  layout = "tape",
  markers = [],
  durationMs = 0,
  liveClockRef,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(WAVEFORM_UI_COLUMNS);
  const useCanvas = Boolean(live && liveClockRef);
  const clockSamples = liveClockRef?.current?.samples;
  const displaySamples =
    samples.length > 0
      ? samples
      : clockSamples && clockSamples.length > 0
        ? clockSamples
        : samples;
  const showMarkers = layout === "timeline" && markers.length > 0 && durationMs > 0;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setColumns(waveformColumnCount(w));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bars = useMemo(
    () =>
      live && !useCanvas
        ? liveWaveformWindow(displaySamples, columns)
        : waveformColumns(displaySamples, columns),
    [columns, displaySamples, live, useCanvas],
  );

  return (
    <div
      ref={wrapRef}
      className={`musai-rec-wave ${compact ? "musai-rec-wave--compact" : ""} ${
        live ? "musai-rec-wave--live" : ""
      } ${className}`.trim()}
      role="img"
      aria-label={label}
      data-live={live ? "true" : "false"}
      data-layout={layout}
    >
      {live ? <span className="musai-rec-wave__playhead" aria-hidden /> : null}
      {useCanvas && liveClockRef ? (
        <LiveWaveformCanvas liveClockRef={liveClockRef} />
      ) : (
        <div className="musai-rec-wave__bars">
          {bars.map((value, i) => (
            <span
              key={i}
              className="musai-rec-wave__bar"
              style={{ height: `${barHeightPct(value)}%` }}
              data-quiet={value <= 0.04 ? "true" : "false"}
            />
          ))}
        </div>
      )}
      {showMarkers ? (
        <div className="musai-rec-wave__markers" aria-hidden>
          {markers.map((marker) => (
            <span
              key={marker.id}
              className="musai-rec-wave__marker"
              style={{
                left: `${waveformMarkerProgress(marker.timeMs, durationMs) * 100}%`,
              }}
              title={marker.label}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
