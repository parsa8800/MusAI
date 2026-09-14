import { createAudioContext } from "@/lib/audioContext";

export type PieceInstrumentId = "piano" | "violin";

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
 */
function wrapSmplrInstrument(
  id: PieceInstrumentId,
  ctx: AudioContext,
  inst: SmplrLike,
  scheduler: SmplrScheduler | null,
): PieceInstrument {
  // Key by stopId so repeated pitches in one lookahead window stay independent.
  const voices = new Map<string, { stop: SmplrStop }>();
  let seq = 0;
  const ready = Promise.resolve(inst.ready).then(() => undefined);

  const noteOn = (
    midi: number,
    when: number,
    velocity: number,
    durationSec: number,
  ): boolean => {
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

  const allOff = (when = ctx.currentTime) => {
    // Drop any not-yet-dispatched scheduler entries, then release sounding voices.
    try {
      scheduler?.stop();
    } catch {
      /* ignore */
    }
    for (const voice of voices.values()) {
      try {
        voice.stop(when);
      } catch {
        /* ignore */
      }
    }
    voices.clear();
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
    },
  };
}

/**
 * Sampled instruments for Listen. Piano uses Splendid Grand (Steinway samples).
 * Violin uses a GM soundfont sample set until a dedicated patch lands.
 *
 * Both share a Scheduler whose lookahead matches MusAI’s schedule window so
 * seek→play arms the full remaining sequence instead of only the first note.
 */
export async function createPieceInstrument(
  ctx: AudioContext,
  id: PieceInstrumentId = "piano",
): Promise<PieceInstrument> {
  const { Scheduler, Soundfont, SplendidGrandPiano } = await import("smplr");
  // Slightly beyond MusAI LOOKAHEAD_SEC (1.2s) so the whole window dispatches
  // into Web Audio immediately and is not held as cancellable queue entries.
  const scheduler = Scheduler(ctx, {
    lookaheadMs: 1600,
    intervalMs: 40,
  });

  if (id === "violin") {
    const violin = Soundfont(ctx, {
      instrument: "violin",
      kit: "FluidR3_GM",
      volume: 100,
      scheduler,
    }) as unknown as SmplrLike;
    const wrapped = wrapSmplrInstrument("violin", ctx, violin, scheduler);
    await wrapped.ready;
    return wrapped;
  }

  const piano = SplendidGrandPiano(ctx, {
    volume: 100,
    velocity: 92,
    decayTime: 0.55,
    scheduler,
  }) as unknown as SmplrLike;
  const wrapped = wrapSmplrInstrument("piano", ctx, piano, scheduler);
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
