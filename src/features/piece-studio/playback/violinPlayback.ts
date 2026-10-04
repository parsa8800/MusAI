import type { PieceInstrument } from "@/features/piece-studio/playback/pieceInstrument";
import {
  VIOLIN_SAMPLE_NOTES,
  violinSampleBuffers,
} from "@/features/piece-studio/playback/violinSamples";

const STEP_MIDI: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** Past the bow catch. That scrape is the “k” at the start of each recording. */
export const VIOLIN_SKIP_SEC = 0.07;
/** Fade in so the skipped start does not click. */
export const VIOLIN_ATTACK_SEC = 0.04;
/** Exponential tail. Most of it is quiet, so notes stay separate without a tick. */
export const VIOLIN_RELEASE_SEC = 0.1;

export function violinNoteMidi(name: string): number {
  const step = STEP_MIDI[name[0] ?? ""];
  const octave = Number(name.slice(1));
  if (step == null || !Number.isFinite(octave)) {
    throw new Error(`Unknown violin sample note ${name}`);
  }
  return (octave + 1) * 12 + step;
}

export function nearestViolinRoot(midi: number, roots: readonly number[]): number {
  let best = roots[0] ?? midi;
  let bestDistance = Math.abs(midi - best);
  for (const root of roots) {
    const distance = Math.abs(midi - root);
    if (distance < bestDistance) {
      best = root;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * When the fade begins, in seconds after the attack.
 * Short notes still get a soft entrance instead of a chopped accent.
 */
export function violinReleaseDelay(durationSec: number): number {
  return Math.max(
    VIOLIN_ATTACK_SEC + 0.03,
    durationSec - VIOLIN_RELEASE_SEC * 0.4,
  );
}

function velocityMidi(velocity01: number): number {
  return Math.round(Math.max(1, Math.min(127, velocity01 * 127)));
}

/** Match the previous sampler loudness (voice gain × channel gain). */
function violinPeakGain(velocity01: number): number {
  const vel = velocityMidi(velocity01);
  const voice = (vel * vel) / 16129;
  const channel = (100 * 100) / 16129;
  return voice * channel;
}

/**
 * Solo-violin Listen voice.
 * smplr starts each sample at full volume, so the bow catch speaks as a “k”,
 * and a short note is mostly that catch. This skips it and fades both ends.
 */
export async function createViolinPieceInstrument(
  ctx: AudioContext,
  bus: GainNode,
  silenceSources: () => void,
): Promise<PieceInstrument> {
  const urls = violinSampleBuffers();
  const loaded = await Promise.all(
    VIOLIN_SAMPLE_NOTES.map(async (name) => {
      const response = await fetch(urls[name]);
      if (!response.ok) {
        throw new Error(`Violin sample ${name} failed to load`);
      }
      const audio = await response.arrayBuffer();
      const buffer = await ctx.decodeAudioData(audio.slice(0));
      return [violinNoteMidi(name), buffer] as const;
    }),
  );
  const buffers = new Map(loaded);
  const roots = [...buffers.keys()].sort((a, b) => a - b);

  let muted = false;

  const unmute = () => {
    if (!muted) return;
    const now = ctx.currentTime;
    try {
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(1, now);
    } catch {
      /* ignore */
    }
    muted = false;
  };

  const noteOn = (
    midi: number,
    when: number,
    velocity: number,
    durationSec: number,
  ): boolean => {
    const root = nearestViolinRoot(midi, roots);
    const buffer = buffers.get(root);
    if (!buffer || !Number.isFinite(when)) return false;
    unmute();
    try {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.detune.value = (midi - root) * 100;

      const level = violinPeakGain(velocity);
      const env = ctx.createGain();
      const attackEnd = when + VIOLIN_ATTACK_SEC;
      const releaseAt = when + violinReleaseDelay(durationSec);
      const stopAt = releaseAt + VIOLIN_RELEASE_SEC;
      env.gain.setValueAtTime(0, when);
      env.gain.linearRampToValueAtTime(level, attackEnd);
      env.gain.setValueAtTime(level, Math.max(attackEnd, releaseAt));
      env.gain.exponentialRampToValueAtTime(Math.max(0.0008, level * 0.001), stopAt);

      source.connect(env);
      env.connect(bus);
      source.start(when, Math.min(VIOLIN_SKIP_SEC, Math.max(0, buffer.duration - 0.2)));
      source.stop(stopAt + 0.02);
      source.onended = () => {
        try {
          source.disconnect();
          env.disconnect();
        } catch {
          /* already cut */
        }
      };
      return true;
    } catch {
      return false;
    }
  };

  const allOff = () => {
    const now = ctx.currentTime;
    try {
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(0, now);
      muted = true;
    } catch {
      /* ignore */
    }
    try {
      silenceSources();
    } catch {
      /* ignore */
    }
  };

  return {
    id: "violin",
    ready: Promise.resolve(),
    noteOn,
    allOff,
    dispose: () => {
      allOff();
      try {
        bus.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}
