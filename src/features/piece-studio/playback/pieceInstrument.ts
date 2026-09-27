import { createAudioContext } from "@/lib/audioContext";
import { attachPieceSourceCut } from "@/features/piece-studio/playback/pieceListenCut";

export type PieceInstrumentId = "piano" | "violin" | "viola";

export type PieceInstrument = {
  id: PieceInstrumentId;
  /** Resolves when samples are ready enough to schedule notes. */
  ready: Promise<void>;
  /**
   * Schedule a note with an explicit hold duration (audio seconds).
   * Prefer duration over a later noteOff — smplr’s StopFn cancels notes that
   * have not started yet, which breaks lookahead scheduling.
   * @returns false when the attack could not be armed (caller should retry).
   */
  noteOn: (
    midi: number,
    when: number,
    velocity: number,
    durationSec: number,
  ) => boolean;
  /** Instant mute + cancel queue (pause / seek / restart). */
  allOff: (when?: number) => void;
  dispose: () => void;
};

type SmplrStop = (time?: number) => void;

type SmplrLike = {
  ready: Promise<unknown>;
  start: (opts: {
    note: number;
    time?: number;
    duration?: number;
    velocity?: number;
    stopId?: string | number;
  }) => SmplrStop;
  stop: (target?: { stopId?: string | number; time?: number } | string | number) => void;
  output?: { disconnect?: () => void };
  disconnect?: () => void;
};

type SmplrScheduler = {
  stop: () => void;
};

function velocityMidi(velocity01: number): number {
  return Math.round(Math.max(1, Math.min(127, velocity01 * 127)));
}

/**
 * Wrap a smplr instrument behind the Piece Studio note API so we can swap
 * piano / violin (and more) without touching transport scheduling.
 *
 * Important: MusAI schedules ~1.2s ahead. smplr’s default scheduler only looks
 * 200ms ahead — StopFn / allOff then wipe the rest of the queue (“first note
 * only” after seek). Pass a shared Scheduler with a matching lookahead.
 *
 * `bus` is a GainNode we own between the instrument and the destination so
 * pause/seek can mute instantly — smplr’s Voice.stop always fades over
 * ampRelease (~decayTime), which feels sluggish as a transport pause.
 *
 * Duration-scheduled notes ignore a later stop(), so `silenceSources` also
 * disconnects every buffer source this context has started.
 */
function wrapSmplrInstrument(
  id: PieceInstrumentId,
  ctx: AudioContext,
  inst: SmplrLike,
  scheduler: SmplrScheduler | null,
  bus: GainNode,
  silenceSources: () => void,
): PieceInstrument {
  // Key by stopId so repeated pitches in one lookahead window stay independent.
  const voices = new Map<string, { stop: SmplrStop }>();
  let seq = 0;
  let muted = false;
  const ready = Promise.resolve(inst.ready).then(() => undefined);

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
    unmute();
    const stopId = `${id}-${midi}-${++seq}`;
    const duration = Math.max(0.05, durationSec);
    try {
      const stop = inst.start({
        note: midi,
        time: when,
        duration,
        velocity: velocityMidi(velocity),
        stopId,
      });
      voices.set(stopId, { stop });
      return true;
    } catch {
      /* sample may still be warming — skip this attack */
      return false;
    }
  };

  const allOff = (_when = ctx.currentTime) => {
    const now = ctx.currentTime;
    // Close the bus first so a render between mute and disconnect stays quiet.
    try {
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(0, now);
      muted = true;
    } catch {
      /* ignore */
    }
    // Drop sources that already have a stop time locked in. Their StopFn is a
    // no-op, and the browser will not move that stop earlier.
    try {
      silenceSources();
    } catch {
      /* ignore */
    }
    try {
      scheduler?.stop();
    } catch {
      /* ignore */
    }
    const pending = [...voices.values()];
    voices.clear();
    for (const voice of pending) {
      try {
        voice.stop();
      } catch {
        /* ignore */
      }
    }
    try {
      inst.stop();
    } catch {
      /* ignore */
    }
  };

  return {
    id,
    ready,
    noteOn,
    allOff,
    dispose: () => {
      allOff();
      try {
        scheduler?.stop();
      } catch {
        /* ignore */
      }
      try {
        inst.disconnect?.();
        inst.output?.disconnect?.();
      } catch {
        /* ignore */
      }
      try {
        bus.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Sampled Listen instrument. Always the Splendid Grand (Steinway samples).
 * GM violin and viola kits are not realistic enough for this player.
 *
 * The Scheduler lookahead matches MusAI’s schedule window so seek→play arms
 * the full remaining sequence instead of only the first note.
 */
export async function createPieceInstrument(
  ctx: AudioContext,
  _id: PieceInstrumentId = "piano",
): Promise<PieceInstrument> {
  const { silenceAll } = attachPieceSourceCut(ctx);
  const { Scheduler, SplendidGrandPiano } = await import("smplr");
  // Slightly beyond MusAI LOOKAHEAD_SEC (1.2s) so the whole window dispatches
  // into Web Audio immediately and is not held as cancellable queue entries.
  const scheduler = Scheduler(ctx, {
    lookaheadMs: 1600,
    intervalMs: 40,
  });

  const bus = ctx.createGain();
  bus.gain.value = 1;
  bus.connect(ctx.destination);

  const piano = SplendidGrandPiano(ctx, {
    volume: 100,
    velocity: 92,
    // Short natural release; transport mute bus handles instant pause cuts.
    decayTime: 0.08,
    scheduler,
    destination: bus,
  }) as unknown as SmplrLike;
  const wrapped = wrapSmplrInstrument(
    "piano",
    ctx,
    piano,
    scheduler,
    bus,
    silenceAll,
  );
  await wrapped.ready;
  return wrapped;
}

let sharedCtx: AudioContext | null = null;

export function getPieceAudioContext(): AudioContext | null {
  if (!sharedCtx) sharedCtx = createAudioContext();
  return sharedCtx;
}

export async function resumePieceAudio(): Promise<AudioContext | null> {
  const ctx = getPieceAudioContext();
  if (!ctx) return null;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return ctx;
    }
  }
  return ctx;
}

/** Soft-release the shared context when leaving Piece Listen (keeps it reusable). */
export function suspendPieceAudio(): void {
  if (!sharedCtx || sharedCtx.state !== "running") return;
  try {
    void sharedCtx.suspend();
  } catch {
    /* ignore */
  }
}
