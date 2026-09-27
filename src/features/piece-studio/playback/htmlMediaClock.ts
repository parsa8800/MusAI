import type { PiecePlaybackTimeListener } from "@/features/piece-studio/playback/playbackTime";

export type PiecePlayheadClock = {
  subscribeTime: (listener: PiecePlaybackTimeListener) => () => void;
  getCurrentSec: () => number;
};

/** Map take audio time onto score time. Duration is 0 until metadata loads. */
export type TakeClockMap = (
  audioSec: number,
  audioDurationSec: number,
) => number;

/**
 * Drive the shared score playhead from an HTML media element (attempt replay).
 * Same rAF + currentTime contract as Listen — not a second pointer.
 * `toScoreSec` keeps the bar on the written notes when the take's tempo
 * does not match the score.
 */
export function createHtmlMediaClock(
  media: HTMLMediaElement,
  toScoreSec?: TakeClockMap,
): PiecePlayheadClock & { dispose: () => void } {
  const listeners = new Set<PiecePlaybackTimeListener>();
  let raf = 0;
  let lastAudio = Number.isFinite(media.currentTime) ? media.currentTime : 0;

  const readAudio = () => {
    const t = media.currentTime;
    return Number.isFinite(t) && t >= 0 ? t : lastAudio;
  };

  const read = () => {
    const audio = readAudio();
    lastAudio = audio;
    if (!toScoreSec) return audio;
    const dur = media.duration;
    const audioDur = Number.isFinite(dur) && dur > 0 ? dur : 0;
    const mapped = toScoreSec(audio, audioDur);
    return Number.isFinite(mapped) && mapped >= 0 ? mapped : 0;
  };

  const publish = (tSec: number) => {
    const next = Number.isFinite(tSec) && tSec >= 0 ? tSec : 0;
    listeners.forEach((listener) => listener(next));
  };

  const stopTick = () => {
    if (raf) {
      window.cancelAnimationFrame(raf);
      raf = 0;
    }
  };

  const tick = () => {
    publish(read());
    if (!media.paused && !media.ended) {
      raf = window.requestAnimationFrame(tick);
    } else {
      raf = 0;
    }
  };

  const startTick = () => {
    if (raf) return;
    raf = window.requestAnimationFrame(tick);
  };

  const onPlay = () => startTick();
  const onPause = () => {
    stopTick();
    publish(read());
  };
  const onSeeked = () => publish(read());
  const onTimeUpdate = () => {
    if (media.paused || media.ended) publish(read());
  };

  media.addEventListener("play", onPlay);
  media.addEventListener("playing", onPlay);
  media.addEventListener("pause", onPause);
  media.addEventListener("ended", onPause);
  media.addEventListener("seeked", onSeeked);
  media.addEventListener("timeupdate", onTimeUpdate);

  if (!media.paused && !media.ended) startTick();
  else publish(read());

  return {
    subscribeTime: (listener) => {
      listeners.add(listener);
      listener(read());
      return () => {
        listeners.delete(listener);
      };
    },
    getCurrentSec: read,
    dispose: () => {
      stopTick();
      listeners.clear();
      media.removeEventListener("play", onPlay);
      media.removeEventListener("playing", onPlay);
      media.removeEventListener("pause", onPause);
      media.removeEventListener("ended", onPause);
      media.removeEventListener("seeked", onSeeked);
      media.removeEventListener("timeupdate", onTimeUpdate);
    },
  };
}

export function seekHtmlMedia(media: HTMLMediaElement, tSec: number): void {
  const duration = media.duration;
  if (!Number.isFinite(duration) || duration <= 0) return;
  const next = Math.max(0, Math.min(duration, tSec));
  if (!Number.isFinite(next)) return;
  media.currentTime = next;
}
