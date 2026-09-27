/**
 * Listen schedules notes ahead and gives each one a duration. That duration
 * calls source.stop(endTime) immediately, and the voice then ignores later
 * stop() calls. The browser also rejects stop(now) when the note has not
 * started yet, or when a stop time is already set. Either way the old notes
 * keep sounding after a seek.
 *
 * Disconnecting the source is what actually removes it from the speakers.
 */

export type CutSource = {
  disconnect: () => void;
  stop: (when?: number) => void;
};

const FUTURE_STOP_SEC = 5;

export function silenceScheduledSources(
  sources: Iterable<CutSource>,
  now: number,
): void {
  const later = now + FUTURE_STOP_SEC;
  for (const source of sources) {
    try {
      source.disconnect();
    } catch {
      /* already disconnected */
    }
    try {
      source.stop(now);
    } catch {
      try {
        source.stop(later);
      } catch {
        /* a musical end was already scheduled; disconnect is the cut */
      }
    }
  }
}

type SourceCut = {
  silenceAll: () => void;
};

const cuts = new WeakMap<AudioContext, SourceCut>();

/**
 * Remember every buffer source this context creates so a seek can disconnect
 * them even when the sampler will not cancel them.
 */
export function attachPieceSourceCut(ctx: AudioContext): SourceCut {
  const existing = cuts.get(ctx);
  if (existing) return existing;

  const live = new Set<AudioBufferSourceNode>();
  const original = ctx.createBufferSource.bind(ctx);
  ctx.createBufferSource = () => {
    const source = original();
    live.add(source);
    source.addEventListener("ended", () => {
      live.delete(source);
    });
    return source;
  };

  const cut: SourceCut = {
    silenceAll() {
      const pending = [...live];
      live.clear();
      silenceScheduledSources(pending, ctx.currentTime);
    },
  };
  cuts.set(ctx, cut);
  return cut;
}
