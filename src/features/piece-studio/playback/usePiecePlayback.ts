"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPieceInstrument,
  getPieceAudioContext,
  resumePieceAudio,
  suspendPieceAudio,
  type PieceInstrument,
} from "@/features/piece-studio/playback/pieceInstrument";
import {
  pieceInstrumentIdFor,
  readPieceListenVoice,
  writePieceListenVoice,
  type PieceListenVoice,
} from "@/features/piece-studio/playback/pieceListenVoice";
import type { ListenSoundfont } from "@/lib/instrument";
import {
  createPieceMetronome,
  PIECE_CLICK_LEVEL_DEFAULT,
  type PieceMetronome,
} from "@/features/piece-studio/playback/pieceMetronome";
import { planScheduledNotes } from "@/features/piece-studio/playback/playbackSchedule";
import {
  buildPlaybackTimeline,
  clampPieceTempoBpm,
  clampPlaybackTime,
  loopBoundsSec,
  measureAtSeconds,
  measureByNumber,
  resolvePlayRange,
  snapToMeasureStart,
  type PlaybackTimeline,
} from "@/features/piece-studio/playback/playbackTimeline";
import type { MusaiScoreV1 } from "@/features/piece-studio/score/musaiScore";
import type { PiecePlaybackTimeListener } from "@/features/piece-studio/playback/playbackTime";
import {
  pieceSpeedBpm,
  pieceSpeedPresetForBpm,
  type PieceSpeedPreset,
} from "@/features/piece-studio/playback/pieceSpeed";

const LOOKAHEAD_SEC = 1.2;

export type { PiecePlaybackTimeListener } from "@/features/piece-studio/playback/playbackTime";

export type PieceInstrumentStatus = "idle" | "loading" | "ready" | "error";

export type { PieceSpeedPreset } from "@/features/piece-studio/playback/pieceSpeed";

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
 * Written dynamics are not performed — Listen stays at even volume.
 */
export function usePiecePlayback(
  score: MusaiScoreV1 | null,
  options: {
    /** GM patch used when the listener chooses the player's instrument. */
    stringSoundfont?: ListenSoundfont;
    /** When false, skip loading smplr samples (Score / Practise stay light). */
    loadInstrument?: boolean;
  } = {},
) {
  const stringSoundfont = options.stringSoundfont ?? "violin";
  const loadInstrument = options.loadInstrument ?? true;
  const [voice, setVoiceState] = useState<PieceListenVoice>("piano");
  const [voiceReady, setVoiceReady] = useState(false);
  const instrumentId = pieceInstrumentIdFor(voice, stringSoundfont);

  useEffect(() => {
    setVoiceState(readPieceListenVoice());
    setVoiceReady(true);
  }, []);

  const setVoice = useCallback((next: PieceListenVoice) => {
    writePieceListenVoice(next);
    setVoiceState(next);
  }, []);
  const timeline = useMemo(
    () => (score ? buildPlaybackTimeline(score) : null),
    [score],
  );
  const [playing, setPlaying] = useState(false);
  const [bpmOverride, setBpmOverride] = useState<number | null>(null);
  const [speedPreset, setSpeedPresetState] = useState<PieceSpeedPreset | null>(
    "written",
  );
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [clickLevel, setClickLevelState] = useState(PIECE_CLICK_LEVEL_DEFAULT);
  const [loop, setLoopState] = useState<PieceLoopRange | null>(null);
  const [instrumentStatus, setInstrumentStatus] =
    useState<PieceInstrumentStatus>("idle");
  const baseBpm = timeline?.baseBpm ?? 100;
  const bpm =
    bpmOverride ??
    pieceSpeedBpm(speedPreset ?? "written", baseBpm);

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
  const clickLevelRef = useRef(PIECE_CLICK_LEVEL_DEFAULT);
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
  /**
   * Bumped on every silence(). In-flight RAF ticks and stale schedule() calls
   * from the previous score position abort when their epoch no longer matches.
   */
  const transportGenRef = useRef(0);
  /** True while the Listen scrubber is dragging — freeze clock to preview time. */
  const scrubbingRef = useRef(false);
  /** One-shot section end (Practise Listen). Null during normal Listen play. */
  const rangeEndRef = useRef<number | null>(null);

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
  const getPlaying = useCallback(() => playingRef.current, []);

  const ensureMetronome = useCallback((ctx: AudioContext) => {
    if (!metronomeRef.current) {
      metronomeRef.current = createPieceMetronome(ctx);
    }
    metronomeRef.current.setLevel(clickLevelRef.current);
    return metronomeRef.current;
  }, []);

  useEffect(() => {
    timelineRef.current = timeline;
    const resetTransport = () => {
      pausePosRef.current = 0;
      playingRef.current = false;
      startedNotesRef.current.clear();
      startedClicksRef.current.clear();
      scheduledUntilRef.current = -1;
      rangeEndRef.current = null;
      instrumentRef.current?.allOff();
      metronomeRef.current?.silence();
      publishTime(0);
      setPlaying(false);
      setLoopState(null);
      setBpmOverride(null);
      setSpeedPresetState("written");
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

  /** Load the piano when the score page can play. */
  useEffect(() => {
    if (!voiceReady || !loadInstrument || !timeline || timeline.durationSec <= 0) {
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
    ensureMetronome(ctx);
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
  }, [timeline, instrumentId, loadInstrument, voiceReady, ensureMetronome]);

  const rate = () => bpmRef.current / Math.max(1, baseBpmRef.current);

  const scoreTimeNow = useCallback((audioNow: number) => {
    if (!playingRef.current) return pausePosRef.current;
    return (
      originScoreRef.current + (audioNow - originAudioRef.current) * rate()
    );
  }, []);

  const silence = useCallback(() => {
    transportGenRef.current += 1;
    instrumentRef.current?.allOff();
    metronomeRef.current?.silence();
    startedNotesRef.current.clear();
    startedClicksRef.current.clear();
    scheduledUntilRef.current = -1;
  }, []);

  const scheduleMetronome = useCallback(
    (
      fromSec: number,
      audioNow: number,
      until: number,
      epoch = transportGenRef.current,
    ) => {
      if (epoch !== transportGenRef.current) return;
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
        if (epoch !== transportGenRef.current) return;
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
    (fromSec: number, audioNow: number, epoch = transportGenRef.current) => {
      if (epoch !== transportGenRef.current) return;
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
      const rangeEnd = rangeEndRef.current;
      const cap =
        loopRange != null
          ? loopRange.endSec + 0.001
          : rangeEnd != null
            ? rangeEnd + 0.001
            : null;
      const noteUntil = cap != null ? Math.min(until, cap) : until;

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
        if (epoch !== transportGenRef.current) return;
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
      if (epoch !== transportGenRef.current) return;
      scheduleMetronome(fromSec, audioNow, noteUntil, epoch);
      scheduledUntilRef.current = until;
    },
    [scheduleMetronome],
  );

  /**
   * Live scrub preview (YouTube-style): move the playhead immediately without
   * re-arming audio on every pointer move. `seek` commits audio on release.
   */
  const scrubPreview = useCallback(
    (next: number) => {
      const tl = timelineRef.current;
      const duration = tl?.durationSec ?? 0;
      const t = clampPlaybackTime(next, duration);
      scrubbingRef.current = true;
      pausePosRef.current = t;
      publishTime(t);
      const ctx = ctxRef.current;
      if (!playingRef.current || !ctx) return;
      transportLockRef.current = true;
      try {
        // Keep transport “playing” but mute until scrub commits — otherwise RAF
        // would keep advancing past the dragged playhead.
        silence();
        originAudioRef.current = ctx.currentTime;
        originScoreRef.current = t;
      } finally {
        transportLockRef.current = false;
      }
    },
    [publishTime, silence],
  );

  const seek = useCallback(
    (next: number) => {
      const tl = timelineRef.current;
      const duration = tl?.durationSec ?? 0;
      const t = clampPlaybackTime(next, duration);
      scrubbingRef.current = false;
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
          schedule(t, ctx.currentTime, transportGenRef.current);
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
    // Capture score time while still playing — scoreTimeNow freezes after.
    const t = ctx ? scoreTimeNow(ctx.currentTime) : pausePosRef.current;
    const duration = timelineRef.current?.durationSec ?? 0;
    const frozen = clampPlaybackTime(t, duration);
    // Cut audio before React state so pause feels immediate.
    // playingRef first so the RAF tick cannot re-arm notes during silence().
    playingRef.current = false;
    silence();
    pausePosRef.current = frozen;
    publishTime(frozen);
    setPlaying(false);
  }, [publishTime, scoreTimeNow, silence]);

  const armTransport = useCallback(
    (ctx: AudioContext, t: number) => {
      transportLockRef.current = true;
      try {
        silence();
        originAudioRef.current = ctx.currentTime;
        originScoreRef.current = t;
        playingRef.current = true;
        publishTime(t);
        setPlaying(true);
        schedule(t, ctx.currentTime, transportGenRef.current);
      } finally {
        transportLockRef.current = false;
      }
    },
    [publishTime, schedule, silence],
  );

  const play = useCallback(async (opts?: { keepRange?: boolean }) => {
    if (!opts?.keepRange) rangeEndRef.current = null;
    const tl = timelineRef.current;
    if (!tl || tl.durationSec <= 0) return;

    let t = pausePosRef.current;
    const loopRange = loopRef.current
      ? loopBoundsSec(
          tl.measures,
          loopRef.current.fromMeasure,
          loopRef.current.toMeasure,
        )
      : null;
    if (rangeEndRef.current == null && loopRange) {
      if (t < loopRange.startSec - 0.02 || t >= loopRange.endSec - 0.02) {
        t = loopRange.startSec;
      }
    } else if (rangeEndRef.current == null && t >= tl.durationSec - 0.02) {
      t = 0;
    }
    pausePosRef.current = t;

    // Fast path: context running + instrument ready — arm without awaiting.
    const warmCtx = ctxRef.current;
    const warmInst = instrumentRef.current;
    if (
      warmCtx &&
      warmCtx.state === "running" &&
      warmInst &&
      warmInst.id === instrumentIdRef.current
    ) {
      ensureMetronome(warmCtx);
      armTransport(warmCtx, t);
      return;
    }

    const ctx = await resumePieceAudio();
    if (!ctx) return;
    ctxRef.current = ctx;
    ensureMetronome(ctx);

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

    // Position may have changed while we waited for samples.
    t = pausePosRef.current;
    armTransport(ctx, t);
  }, [armTransport, ensureMetronome]);

  /**
   * End a playhead drag. When `resume` is true (transport was playing before
   * the drag), re-arm audio from the new score time — never during the drag.
   */
  const commitScrub = useCallback(
    (next: number, resume: boolean) => {
      const tl = timelineRef.current;
      const duration = tl?.durationSec ?? 0;
      const t = clampPlaybackTime(next, duration);
      scrubbingRef.current = false;
      pausePosRef.current = t;
      publishTime(t);
      if (!resume) return;

      const ctx = ctxRef.current;
      if (
        ctx &&
        ctx.state === "running" &&
        instrumentRef.current?.id === instrumentIdRef.current
      ) {
        armTransport(ctx, t);
        return;
      }
      void play();
    },
    [armTransport, play, publishTime],
  );

  const playRange = useCallback(
    async (startSec: number, endSec: number) => {
      const tl = timelineRef.current;
      if (!tl || tl.durationSec <= 0) return;
      const span = resolvePlayRange(startSec, endSec, tl.durationSec);
      if (!span) return;
      loopRef.current = null;
      setLoopState(null);
      rangeEndRef.current = span.endSec;
      pausePosRef.current = span.startSec;
      await play({ keepRange: true });
    },
    [play],
  );

  /**
   * Hard restart: fully stop audio first, then optionally start from the
   * section/piece beginning. Re-arming in-place left the previous attack
   * bleeding into the new first note (same-pitch spam on Twinkle, etc.).
   */
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
    const wasPlaying = playingRef.current;
    transportLockRef.current = true;
    try {
      silence();
      pausePosRef.current = t;
      publishTime(t);
      playingRef.current = false;
      setPlaying(false);
    } finally {
      transportLockRef.current = false;
    }
    if (wasPlaying) {
      void play();
    }
  }, [play, publishTime, silence]);

  /**
   * Tempo / speed changes only update the rate while paused. Live re-arm on
   * every slider tick was re-attacking the current note and causing spam.
   * Listen UI pauses while options are open so this stays a quiet write.
   */
  const applyTempo = useCallback(
    (bpmNext: number) => {
      const ctx = ctxRef.current;
      const t = ctx ? scoreTimeNow(ctx.currentTime) : pausePosRef.current;
      bpmRef.current = bpmNext;
      pausePosRef.current = t;
      publishTime(t);
      if (playingRef.current) {
        // Cut audio; keep transport paused so the next Play uses the new rate.
        transportLockRef.current = true;
        try {
          silence();
          playingRef.current = false;
          setPlaying(false);
        } finally {
          transportLockRef.current = false;
        }
      }
    },
    [publishTime, scoreTimeNow, silence],
  );

  /**
   * Seek to a score time from a Listen tap/drag commit.
   * Hard-cuts audio first. Only auto-plays when already playing — while
   * paused, just move the playhead so they can place it without starting.
   */
  const seekAndPlay = useCallback(
    (next: number) => {
      const tl = timelineRef.current;
      const duration = tl?.durationSec ?? 0;
      const t = clampPlaybackTime(next, duration);
      const wasPlaying = playingRef.current;
      transportLockRef.current = true;
      try {
        silence();
        pausePosRef.current = t;
        publishTime(t);
        playingRef.current = false;
        setPlaying(false);
      } finally {
        transportLockRef.current = false;
      }
      if (wasPlaying) {
        void play();
      }
    },
    [play, publishTime, silence],
  );

  const setBpm = useCallback(
    (next: number) => {
      const bpmNext = clampPieceTempoBpm(next);
      setBpmOverride(bpmNext);
      setSpeedPresetState(pieceSpeedPresetForBpm(bpmNext, baseBpmRef.current));
      applyTempo(bpmNext);
    },
    [applyTempo],
  );

  const setSpeedPreset = useCallback(
    (preset: PieceSpeedPreset) => {
      setSpeedPresetState(preset);
      const next = clampPieceTempoBpm(
        pieceSpeedBpm(preset, baseBpmRef.current),
      );
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

  const setClickLevel = useCallback((next: number) => {
    const level = Math.max(0, Math.min(100, Math.round(next)));
    clickLevelRef.current = level;
    setClickLevelState(level);
    metronomeRef.current?.setLevel(level);
  }, []);

  const previewClick = useCallback(async () => {
    const ctx = ctxRef.current ?? (await resumePieceAudio());
    if (!ctx) return;
    if (ctx.state !== "running") {
      try {
        await ctx.resume();
      } catch {
        return;
      }
    }
    ctxRef.current = ctx;
    ensureMetronome(ctx).click(ctx.currentTime, true);
  }, [ensureMetronome]);

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
      if (transportLockRef.current || scrubbingRef.current) {
        raf = window.requestAnimationFrame(tick);
        return;
      }
      let t = scoreTimeNow(ctx.currentTime);
      const rangeEnd = rangeEndRef.current;
      if (rangeEnd != null && t >= rangeEnd - 0.02) {
        pausePosRef.current = rangeEnd;
        publishTime(rangeEnd);
        playingRef.current = false;
        setPlaying(false);
        silence();
        return;
      }
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
        schedule(t, ctx.currentTime, transportGenRef.current);
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
      const epoch = transportGenRef.current;
      if (t > scheduledUntilRef.current - 0.12) {
        schedule(t, ctx.currentTime, epoch);
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
  const measureNumberAt = useCallback((tSec: number) => {
    const tl = timelineRef.current;
    if (!tl) return null;
    return measureAtSeconds(tl.measures, tSec)?.number ?? null;
  }, []);
  const instrumentStatusForUi: PieceInstrumentStatus =
    !loadInstrument || !timeline || timeline.durationSec <= 0
      ? "idle"
      : instrumentStatus;

  return {
    timeline,
    playing,
    getCurrentSec,
    getPlaying,
    subscribeTime,
    durationSec: timeline?.durationSec ?? 0,
    bpm,
    baseBpm,
    speedPreset,
    setSpeedPreset,
    voice,
    setVoice,
    setBpm,
    metronomeOn,
    clickLevel,
    toggleMetronome,
    setClickLevel,
    previewClick,
    loop,
    setLoop,
    loopCurrentMeasure,
    measureCount,
    /** Prefer getCurrentMeasure during playback — avoids reading time refs in render. */
    currentMeasure: 1,
    getCurrentMeasure,
    measureNumberAt,
    play,
    playRange,
    pause,
    toggle,
    restart,
    seek,
    seekAndPlay,
    scrubPreview,
    commitScrub,
    seekToMeasureAt,
    seekToMeasure,
    instrumentStatus: instrumentStatusForUi,
    ready:
      Boolean(timeline && timeline.durationSec > 0) &&
      instrumentStatusForUi === "ready",
    scoreReady: Boolean(timeline && timeline.durationSec > 0),
  };
}
