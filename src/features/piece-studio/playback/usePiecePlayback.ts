"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPieceInstrument,
  getPieceAudioContext,
  resumePieceAudio,
  suspendPieceAudio,
  type PieceInstrument,
  type PieceInstrumentId,
} from "@/features/piece-studio/playback/pieceInstrument";
import {
  createPieceMetronome,
  type PieceMetronome,
} from "@/features/piece-studio/playback/pieceMetronome";
import { planScheduledNotes } from "@/features/piece-studio/playback/playbackSchedule";
import {
  buildPlaybackTimeline,
  clampPlaybackTime,
  loopBoundsSec,
  measureAtSeconds,
  measureByNumber,
  snapToMeasureStart,
  type PlaybackTimeline,
} from "@/features/piece-studio/playback/playbackTimeline";
import type { MusaiScoreV1 } from "@/features/piece-studio/score/musaiScore";
import type { PiecePlaybackTimeListener } from "@/features/piece-studio/playback/playbackTime";

const LOOKAHEAD_SEC = 1.2;

export type { PiecePlaybackTimeListener } from "@/features/piece-studio/playback/playbackTime";

export type PieceInstrumentStatus = "idle" | "loading" | "ready" | "error";

/** Student-facing speed presets. Tempo changes reschedule notes — pitch stays. */
export type PieceSpeedPreset = "slow" | "normal";

export type PieceLoopRange = {
  fromMeasure: number;
  toMeasure: number;
};

/**
 * Transport for Listen view. Score time is kept in refs and pushed to
 * subscribers every animation frame — React state only flips for play/pause
 * and other infrequent UI, so the workspace does not re-render at 60fps.
 *
 * Speed changes only rescale note *timing* (MIDI samples keep concert pitch).
 */
export function usePiecePlayback(
  score: MusaiScoreV1 | null,
  options: {
    instrumentId?: PieceInstrumentId;
    /** When false, skip loading smplr samples (Score / Practise stay light). */
    loadInstrument?: boolean;
  } = {},
) {
  const instrumentId = options.instrumentId ?? "piano";
  const loadInstrument = options.loadInstrument ?? true;
  const timeline = useMemo(
    () => (score ? buildPlaybackTimeline(score) : null),
    [score],
  );
  const [playing, setPlaying] = useState(false);
  const [bpmOverride, setBpmOverride] = useState<number | null>(null);
  const [speedPreset, setSpeedPresetState] = useState<PieceSpeedPreset>("normal");
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [loop, setLoopState] = useState<PieceLoopRange | null>(null);
  const [instrumentStatus, setInstrumentStatus] =
    useState<PieceInstrumentStatus>("idle");
  const baseBpm = timeline?.baseBpm ?? 100;
  const bpm =
    bpmOverride ??
    (speedPreset === "slow" ? Math.round(baseBpm * 0.5) : baseBpm);

  const playingRef = useRef(false);
  const pausePosRef = useRef(0);
  const currentSecRef = useRef(0);
  const originAudioRef = useRef(0);
  const originScoreRef = useRef(0);
  const bpmRef = useRef(100);
  const baseBpmRef = useRef(100);
  const timelineRef = useRef<PlaybackTimeline | null>(null);
  const instrumentRef = useRef<PieceInstrument | null>(null);
  const metronomeRef = useRef<PieceMetronome | null>(null);
  const metronomeOnRef = useRef(false);
  const loopRef = useRef<PieceLoopRange | null>(null);
  const startedClicksRef = useRef(new Set<number>());
  const instrumentIdRef = useRef(instrumentId);
  const loadGenRef = useRef(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const scheduledUntilRef = useRef(-1);
  const startedNotesRef = useRef(new Set<number>());
  const timeListenersRef = useRef(new Set<PiecePlaybackTimeListener>());
  /** Blocks RAF from scheduling between silence and re-arm after seek/tempo. */
  const transportLockRef = useRef(false);

  useEffect(() => {
    instrumentIdRef.current = instrumentId;
    metronomeOnRef.current = metronomeOn;
    loopRef.current = loop;
  }, [instrumentId, metronomeOn, loop]);

  const publishTime = useCallback((t: number) => {
    currentSecRef.current = t;
    timeListenersRef.current.forEach((listener) => listener(t));
  }, []);

  const subscribeTime = useCallback((listener: PiecePlaybackTimeListener) => {
    timeListenersRef.current.add(listener);
    return () => {
      timeListenersRef.current.delete(listener);
    };
  }, []);

  const getCurrentSec = useCallback(() => currentSecRef.current, []);

  useEffect(() => {
    timelineRef.current = timeline;
    const resetTransport = () => {
      pausePosRef.current = 0;
      playingRef.current = false;
      startedNotesRef.current.clear();
      startedClicksRef.current.clear();
      scheduledUntilRef.current = -1;
      instrumentRef.current?.allOff();
      metronomeRef.current?.silence();
      publishTime(0);
      setPlaying(false);
      setLoopState(null);
      setBpmOverride(null);
      setSpeedPresetState("normal");
      setMetronomeOn(false);
    };
    if (!timeline) {
      const id = window.setTimeout(resetTransport, 0);
      return () => window.clearTimeout(id);
    }
    baseBpmRef.current = timeline.baseBpm;
    const id = window.setTimeout(resetTransport, 0);
    return () => window.clearTimeout(id);
  }, [timeline, publishTime]);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  /** Load sampled instrument only while Listen needs audio (not on Score/Practise). */
  useEffect(() => {
    if (!loadInstrument || !timeline || timeline.durationSec <= 0) {
      return;
    }
    const ctx = getPieceAudioContext();
    const gen = ++loadGenRef.current;
    let cancelled = false;
    const timers: number[] = [];

    const setStatus = (status: PieceInstrumentStatus) => {
      const id = window.setTimeout(() => {
        if (!cancelled && loadGenRef.current === gen) {
          setInstrumentStatus(status);
        }
      }, 0);
      timers.push(id);
    };

    if (!ctx) {
      setStatus("error");
      return () => {
        cancelled = true;
        timers.forEach((id) => window.clearTimeout(id));
      };
    }
    ctxRef.current = ctx;
    if (!metronomeRef.current) metronomeRef.current = createPieceMetronome(ctx);
    setStatus("loading");

    void (async () => {
      try {
        const existing = instrumentRef.current;
        if (existing && existing.id === instrumentId) {
          await existing.ready;
          if (!cancelled && loadGenRef.current === gen) {
            setStatus("ready");
          }
          return;
        }
        existing?.dispose();
        instrumentRef.current = null;
        const inst = await createPieceInstrument(ctx, instrumentId);
        if (cancelled || loadGenRef.current !== gen) {
          inst.dispose();
          return;
        }
        instrumentRef.current = inst;
        setStatus("ready");
      } catch {
        if (!cancelled && loadGenRef.current === gen) {
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [timeline, instrumentId, loadInstrument]);

  const rate = () => bpmRef.current / Math.max(1, baseBpmRef.current);

  const scoreTimeNow = useCallback((audioNow: number) => {
    if (!playingRef.current) return pausePosRef.current;
    return (
      originScoreRef.current + (audioNow - originAudioRef.current) * rate()
    );
  }, []);

  const silence = useCallback(() => {
    instrumentRef.current?.allOff();
    metronomeRef.current?.silence();
    startedNotesRef.current.clear();
    startedClicksRef.current.clear();
    scheduledUntilRef.current = -1;
  }, []);

  const scheduleMetronome = useCallback(
    (fromSec: number, audioNow: number, until: number) => {
      if (!metronomeOnRef.current) return;
      const tl = timelineRef.current;
      const metro = metronomeRef.current;
      if (!tl || !metro) return;
      const r = rate();
      const beats = tl.beats;
      // Beats are sorted by tSec — skip the past with a binary search.
      let lo = 0;
      let hi = beats.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (beats[mid]!.tSec < fromSec - 0.001) lo = mid + 1;
        else hi = mid;
      }
      for (let index = lo; index < beats.length; index++) {
        const beat = beats[index]!;
        if (beat.tSec > until) break;
        if (startedClicksRef.current.has(index)) continue;
        const when = audioNow + (beat.tSec - fromSec) / r;
        metro.click(when, beat.beatIndex === 0);
        startedClicksRef.current.add(index);
      }
    },
    [],
  );

  const schedule = useCallback(
    (fromSec: number, audioNow: number) => {
      const tl = timelineRef.current;
      const inst = instrumentRef.current;
      if (!tl || !inst) return;
      const r = rate();
      const until = fromSec + LOOKAHEAD_SEC * r + 0.05;
      const loopRange = loopRef.current
        ? loopBoundsSec(
            tl.measures,
            loopRef.current.fromMeasure,
            loopRef.current.toMeasure,
          )
        : null;
      const noteUntil =
        loopRange != null ? Math.min(until, loopRange.endSec + 0.001) : until;

      const planned = planScheduledNotes({
        notes: tl.notes,
        fromSec,
        untilSec: noteUntil,
        rate: r,
        audioNow,
        started: startedNotesRef.current,
        loopEndSec: loopRange?.endSec ?? null,
      });
      for (const attack of planned) {
        const note = tl.notes[attack.index]!;
        const armed = inst.noteOn(
          attack.midi,
          attack.when,
          note.velocity,
          attack.durationSec,
        );
        // Only de-dupe attacks that actually entered the instrument queue.
        // Failed arms (samples still warming) must be retried on the next tick.
        if (armed) {
          startedNotesRef.current.add(attack.index);
        }
      }
      scheduleMetronome(fromSec, audioNow, noteUntil);
      scheduledUntilRef.current = until;
    },
    [scheduleMetronome],
  );

  const seek = useCallback(
    (next: number) => {
      const tl = timelineRef.current;
      const duration = tl?.durationSec ?? 0;
      const t = clampPlaybackTime(next, duration);
      pausePosRef.current = t;
      publishTime(t);
      const ctx = ctxRef.current;
      transportLockRef.current = true;
      try {
        // Re-anchor before silence so a concurrent RAF tick cannot schedule
        // from the previous score position into smplr’s queue.
        if (playingRef.current && ctx) {
          originAudioRef.current = ctx.currentTime;
          originScoreRef.current = t;
        }
        silence();
        if (playingRef.current && ctx) {
          originAudioRef.current = ctx.currentTime;
          originScoreRef.current = t;
          schedule(t, ctx.currentTime);
        }
      } finally {
        transportLockRef.current = false;
      }
    },
    [publishTime, schedule, silence],
  );

  /** Snap to the measure containing this score time (section controls). */
  const seekToMeasureAt = useCallback(
    (tSec: number) => {
      const tl = timelineRef.current;
      if (!tl) {
        seek(tSec);
        return;
      }
      seek(snapToMeasureStart(tl.measures, tSec));
    },
    [seek],
  );

  const seekToMeasure = useCallback(
    (measureNumber: number) => {
      const tl = timelineRef.current;
      const m = tl ? measureByNumber(tl.measures, measureNumber) : null;
      if (!m) return;
      seek(m.startSec);
    },
    [seek],
  );

  const pause = useCallback(() => {
    const ctx = ctxRef.current;
    const t = ctx ? scoreTimeNow(ctx.currentTime) : pausePosRef.current;
    const duration = timelineRef.current?.durationSec ?? 0;
    pausePosRef.current = clampPlaybackTime(t, duration);
    publishTime(pausePosRef.current);
    playingRef.current = false;
    setPlaying(false);
    silence();
  }, [publishTime, scoreTimeNow, silence]);

  const play = useCallback(async () => {
    const tl = timelineRef.current;
    if (!tl || tl.durationSec <= 0) return;
    const ctx = await resumePieceAudio();
    if (!ctx) return;
    ctxRef.current = ctx;
    if (!metronomeRef.current) metronomeRef.current = createPieceMetronome(ctx);

    let inst = instrumentRef.current;
    if (!inst || inst.id !== instrumentIdRef.current) {
      setInstrumentStatus("loading");
      try {
        inst?.dispose();
        inst = await createPieceInstrument(ctx, instrumentIdRef.current);
        instrumentRef.current = inst;
        setInstrumentStatus("ready");
      } catch {
        setInstrumentStatus("error");
        return;
      }
    } else {
      try {
        await inst.ready;
      } catch {
        setInstrumentStatus("error");
        return;
      }
    }

    let t = pausePosRef.current;
    const loopRange = loopRef.current
      ? loopBoundsSec(
          tl.measures,
          loopRef.current.fromMeasure,
          loopRef.current.toMeasure,
        )
      : null;
    if (loopRange) {
      if (t < loopRange.startSec - 0.02 || t >= loopRange.endSec - 0.02) {
        t = loopRange.startSec;
      }
    } else if (t >= tl.durationSec - 0.02) {
      t = 0;
    }
    pausePosRef.current = t;
    transportLockRef.current = true;
    try {
      // Clear any stale queue before arming the full remaining sequence.
      silence();
      originAudioRef.current = ctx.currentTime;
      originScoreRef.current = t;
      playingRef.current = true;
      publishTime(t);
      setPlaying(true);
      schedule(t, ctx.currentTime);
    } finally {
      transportLockRef.current = false;
    }
  }, [publishTime, schedule, silence]);

  const restart = useCallback(() => {
    const tl = timelineRef.current;
    const loopRange =
      loopRef.current && tl
        ? loopBoundsSec(
            tl.measures,
            loopRef.current.fromMeasure,
            loopRef.current.toMeasure,
          )
        : null;
    const t = loopRange?.startSec ?? 0;
    pausePosRef.current = t;
    publishTime(t);
    transportLockRef.current = true;
    try {
      if (playingRef.current && ctxRef.current) {
        originAudioRef.current = ctxRef.current.currentTime;
        originScoreRef.current = t;
      }
      silence();
      const ctx = ctxRef.current;
      if (playingRef.current && ctx) {
        originAudioRef.current = ctx.currentTime;
        originScoreRef.current = t;
        schedule(t, ctx.currentTime);
      }
    } finally {
      transportLockRef.current = false;
    }
  }, [publishTime, schedule, silence]);

  const applyTempo = useCallback(
    (bpmNext: number) => {
      const ctx = ctxRef.current;
      const t = ctx ? scoreTimeNow(ctx.currentTime) : pausePosRef.current;
      bpmRef.current = bpmNext;
      pausePosRef.current = t;
      publishTime(t);
      if (playingRef.current && ctx) {
        transportLockRef.current = true;
        try {
          originAudioRef.current = ctx.currentTime;
          originScoreRef.current = t;
          silence();
          originAudioRef.current = ctx.currentTime;
          originScoreRef.current = t;
          schedule(t, ctx.currentTime);
        } finally {
          transportLockRef.current = false;
        }
      }
    },
    [publishTime, schedule, scoreTimeNow, silence],
  );

  const setBpm = useCallback(
    (next: number) => {
      const bpmNext = Math.max(40, Math.min(208, Math.round(next)));
      setBpmOverride(bpmNext);
      const ratio = bpmNext / Math.max(1, baseBpmRef.current);
      setSpeedPresetState(ratio <= 0.6 ? "slow" : "normal");
      applyTempo(bpmNext);
    },
    [applyTempo],
  );

  const setSpeedPreset = useCallback(
    (preset: PieceSpeedPreset) => {
      setSpeedPresetState(preset);
      const next =
        preset === "slow"
          ? Math.round(baseBpmRef.current * 0.5)
          : baseBpmRef.current;
      setBpmOverride(null);
      applyTempo(next);
    },
    [applyTempo],
  );

  const setLoop = useCallback((next: PieceLoopRange | null) => {
    const tl = timelineRef.current;
    if (!next || !tl || tl.measures.length === 0) {
      setLoopState(null);
      return;
    }
    const max = tl.measures.length;
    const from = Math.max(1, Math.min(max, Math.round(next.fromMeasure)));
    const to = Math.max(from, Math.min(max, Math.round(next.toMeasure)));
    setLoopState({ fromMeasure: from, toMeasure: to });
  }, []);

  const loopCurrentMeasure = useCallback(() => {
    const tl = timelineRef.current;
    if (!tl) return;
    const m = measureAtSeconds(tl.measures, currentSecRef.current);
    if (!m) return;
    setLoop({ fromMeasure: m.number, toMeasure: m.number });
  }, [setLoop]);

  const toggleMetronome = useCallback(() => {
    setMetronomeOn((on) => {
      const next = !on;
      metronomeOnRef.current = next;
      if (!next) {
        metronomeRef.current?.silence();
        startedClicksRef.current.clear();
      } else if (playingRef.current && ctxRef.current) {
        startedClicksRef.current.clear();
        schedule(
          scoreTimeNow(ctxRef.current.currentTime),
          ctxRef.current.currentTime,
        );
      }
      return next;
    });
  }, [schedule, scoreTimeNow]);

  const toggle = useCallback(() => {
    if (playingRef.current) pause();
    else void play();
  }, [pause, play]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const ctx = ctxRef.current;
      const tl = timelineRef.current;
      if (!ctx || !tl || !playingRef.current) return;
      if (transportLockRef.current) {
        raf = window.requestAnimationFrame(tick);
        return;
      }
      let t = scoreTimeNow(ctx.currentTime);
      const loopRange = loopRef.current
        ? loopBoundsSec(
            tl.measures,
            loopRef.current.fromMeasure,
            loopRef.current.toMeasure,
          )
        : null;

      if (loopRange && t >= loopRange.endSec - 0.02) {
        t = loopRange.startSec;
        pausePosRef.current = t;
        originAudioRef.current = ctx.currentTime;
        originScoreRef.current = t;
        silence();
        publishTime(t);
        schedule(t, ctx.currentTime);
        raf = window.requestAnimationFrame(tick);
        return;
      }

      if (!loopRange && t >= tl.durationSec) {
        pausePosRef.current = tl.durationSec;
        publishTime(tl.durationSec);
        playingRef.current = false;
        setPlaying(false);
        silence();
        return;
      }
      pausePosRef.current = t;
      publishTime(t);
      if (t > scheduledUntilRef.current - 0.12) {
        schedule(t, ctx.currentTime);
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [playing, publishTime, schedule, scoreTimeNow, silence]);

  useEffect(() => {
    const listeners = timeListenersRef.current;
    return () => {
      playingRef.current = false;
      loadGenRef.current += 1;
      instrumentRef.current?.dispose();
      instrumentRef.current = null;
      metronomeRef.current?.silence();
      metronomeRef.current = null;
      listeners.clear();
      suspendPieceAudio();
    };
  }, []);

  const measureCount = timeline?.measures.length ?? 0;
  const getCurrentMeasure = useCallback(() => {
    const tl = timelineRef.current;
    if (!tl) return 1;
    return measureAtSeconds(tl.measures, currentSecRef.current)?.number ?? 1;
  }, []);
  const instrumentStatusForUi: PieceInstrumentStatus =
    !loadInstrument || !timeline || timeline.durationSec <= 0
      ? "idle"
      : instrumentStatus;

  return {
    timeline,
    playing,
    getCurrentSec,
    subscribeTime,
    durationSec: timeline?.durationSec ?? 0,
    bpm,
    baseBpm,
    speedPreset,
    setSpeedPreset,
    setBpm,
    metronomeOn,
    toggleMetronome,
    loop,
    setLoop,
    loopCurrentMeasure,
    measureCount,
    /** Prefer getCurrentMeasure during playback — avoids reading time refs in render. */
    currentMeasure: 1,
    getCurrentMeasure,
    play,
    pause,
    toggle,
    restart,
    seek,
    seekToMeasureAt,
    seekToMeasure,
    instrumentStatus: instrumentStatusForUi,
    ready:
      Boolean(timeline && timeline.durationSec > 0) &&
      instrumentStatusForUi === "ready",
    scoreReady: Boolean(timeline && timeline.durationSec > 0),
  };
}
