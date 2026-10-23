import {
  collectPitchFrames,
  collectStablePitchRuns,
  DETECTED_NOTE_MATCH_MAX_CENTS,
  DETECTED_NOTE_MAX_SKIP,
  octaveWrappedAbsCents,
  preferFundamentalNearTargetHz,
  type MatchedExpectedSlot,
  type StablePitchRun,
} from "@/lib/analyzePitch";
import { midiToHz } from "@/lib/intonation";
import { getActiveInstrument } from "@/lib/instrument/storage";

/**
 * Shared pitch match for a piece take.
 * Used by numeric performance scoring and PitchAnalyzer so we only run
 * collectPitchFrames / matching once per recording.
 */
export type PiecePitchMatch = {
  slots: Array<number | null>;
  /** Where each written note sits in the recording, including notes shared by one bow. */
  timesSec: Array<number | null>;
  /**
   * Start of a real attack. Notes that only continue an earlier bow are null,
   * so rhythm does not treat that bow as several late or short notes.
   */
  attackSec: Array<number | null>;
  /** When the bow on that note stops. Only the last note of a shared bow is set. */
  endSec?: Array<number | null>;
  durationSec: number;
};

function timesFromMatchedSlots(
  runs: StablePitchRun[],
  expectedMidis: readonly number[],
  slots: Array<number | null>,
): Array<number | null> {
  const used = new Array(runs.length).fill(false);
  return slots.map((hz, i) => {
    if (hz == null) return null;
    const target = midiToHz(expectedMidis[i]!);
    for (let r = 0; r < runs.length; r++) {
      if (used[r]) continue;
      if (preferFundamentalNearTargetHz(runs[r]!.medianHz, target) === hz) {
        used[r] = true;
        return runs[r]!.timeStartSec;
      }
    }
    return null;
  });
}

function absCents(hz: number, targetHz: number): number {
  if (!(hz > 0) || !(targetHz > 0)) return Infinity;
  return Math.abs(1200 * Math.log2(hz / targetHz));
}

/** Frames this far apart mean the tracker was guessing through silence. */
const SPARSE_RUN_FRAME_GAP_SEC = 0.14;

/**
 * Primary walk floor. Brief flickers and short blips stay out; short real
 * bows can still fill empty slots via {@link runCanFillUnclaimedNote}.
 */
function runIsStableEnough(run: StablePitchRun): boolean {
  const dur = run.timeEndSec - run.timeStartSec;
  if (dur < 0.16) return false;
  const gaps = Math.max(1, run.frameCount - 1);
  return dur / gaps <= SPARSE_RUN_FRAME_GAP_SEC;
}

/**
 * A quaver bow often settles for only a few frames, a little under the
 * flicker floor used while walking the piece. It can still fill a note
 * that nothing else claimed, as long as the frames are packed like a bow
 * and not scattered across a rest.
 */
function runCanFillUnclaimedNote(run: StablePitchRun): boolean {
  if (runIsStableEnough(run)) return true;
  if (run.frameCount < 3) return false;
  const dur = run.timeEndSec - run.timeStartSec;
  if (!(dur >= 0.09)) return false;
  const gaps = Math.max(1, run.frameCount - 1);
  return dur / gaps <= SPARSE_RUN_FRAME_GAP_SEC;
}

/**
 * A later written note has to be this much closer before we leave an earlier
 * one unmatched. Stops a skipped D from swallowing the C♯ that follows, while
 * a note that is merely very flat stays on the note that was written.
 */
const LATER_NOTE_WIN_CENTS = 45;

/** A whole step away is another written note. Piece matching stops before that. */
const MATCH_MAX_CENTS = 150;

/** This many octave-up notes in a row is a real octave change, not one harmonic. */
const OCTAVE_PHRASE_NOTES = 3;

function isOctaveDisplacement(hz: number, midi: number): boolean {
  const raw = absCents(hz, midiToHz(midi));
  if (raw < 600) return false;
  const wrapped = Math.abs(raw - 1200 * Math.round(raw / 1200));
  return wrapped <= DETECTED_NOTE_MATCH_MAX_CENTS;
}

function isOctaveSentinel(slot: MatchedExpectedSlot | null): boolean {
  return slot != null && !Number.isFinite(slot.hz);
}

/**
 * Map pitch runs onto a piece.
 * The same pitch class an octave away does not count, except one isolated
 * note whose tracker locked onto a harmonic. A whole bar an octave away stays
 * unheard. A skipped note stays empty instead of taking the next pitch.
 */
export function matchPieceRunsDetailed(
  runs: readonly StablePitchRun[],
  expectedMidis: readonly number[],
): Array<MatchedExpectedSlot | null> {
  const n = expectedMidis.length;
  const slots: Array<MatchedExpectedSlot | null> = Array.from(
    { length: n },
    () => null,
  );
  if (n === 0 || runs.length === 0) return slots;
  let cursor = 0;

  for (let ri = 0; ri < runs.length; ri++) {
    if (cursor >= n) break;
    const run = runs[ri]!;
    // Shorter than this is a tracker flicker, not a note. A real note can be
    // brief once the pitch has settled, so this stays under a fifth of a second.
    // A long stretch with only a few frames is rest noise, not a bow.
    if (!runIsStableEnough(run)) continue;
    let bestJ = -1;
    let bestCents = Infinity;
    const nearEnd = Math.min(n - 1, cursor + DETECTED_NOTE_MAX_SKIP);
    const farEnd = Math.min(n - 1, cursor + 6);
    const consider = (searchEnd: number) => {
      for (let j = cursor; j <= searchEnd; j++) {
        if (slots[j] != null) continue;
        const cents = absCents(run.medianHz, midiToHz(expectedMidis[j]!));
        if (cents >= MATCH_MAX_CENTS) continue;
        if (bestJ < 0 || cents + LATER_NOTE_WIN_CENTS < bestCents) {
          bestJ = j;
          bestCents = cents;
        }
      }
    };
    consider(nearEnd);
    // A left-out group can be longer than the usual two-note skip. Look
    // further only when nothing nearby is this pitch, and still take the
    // earliest note that fits.
    if (bestJ < 0) consider(farEnd);
    if (bestJ >= 0) {
      slots[bestJ] = { hz: run.medianHz, run };
      cursor = bestJ + 1;
      continue;
    }
    if (cursor >= n) continue;
    let octaveJ = -1;
    const octaveEnd = Math.min(n - 1, cursor + DETECTED_NOTE_MAX_SKIP);
    for (let j = cursor; j <= octaveEnd; j++) {
      if (slots[j] != null) continue;
      if (isOctaveDisplacement(run.medianHz, expectedMidis[j]!)) {
        octaveJ = j;
        break;
      }
    }
    if (octaveJ >= 0) {
      for (let j = cursor; j <= octaveJ; j++) {
        if (slots[j] == null) slots[j] = { hz: Number.NaN, run };
      }
      cursor = octaveJ + 1;
    }
  }

  let i = 0;
  while (i < n) {
    if (!isOctaveSentinel(slots[i] ?? null)) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < n && isOctaveSentinel(slots[j] ?? null)) j += 1;
    if (j - i >= OCTAVE_PHRASE_NOTES) {
      for (let k = i; k < j; k++) slots[k] = null;
    } else {
      for (let k = i; k < j; k++) {
        const slot = slots[k]!;
        slots[k] = { hz: slot.run.medianHz / 2, run: slot.run };
      }
    }
    i = j;
  }
  return slots;
}

/** Pitch window for the instrument chosen in Settings. */
export function activePiecePitchWindow(): { minHz: number; maxHz: number } {
  const pitch = getActiveInstrument().pitch;
  return { minHz: pitch.minHz, maxHz: pitch.practiceMaxHz };
}

export function matchPiecePitch(input: {
  mono: Float32Array;
  sampleRateHz: number;
  expectedMidis: readonly number[];
  /** Written length of each expected note, so one held pitch can cover a repeat. */
  durationQuarters?: readonly number[];
  /** Written onset in quarter notes, so a rest is not treated as more of the same bow. */
  onsetQuarters?: readonly number[];
  minHz?: number;
  maxHz?: number;
}): PiecePitchMatch {
  const durationSec =
    input.mono.length > 0 ? input.mono.length / input.sampleRateHz : 0;
  if (input.expectedMidis.length === 0) {
    return { slots: [], timesSec: [], attackSec: [], endSec: [], durationSec };
  }
  const frames = collectPitchFrames(input.mono, input.sampleRateHz, {
    mode: "piece",
    minHz: input.minHz,
    maxHz: input.maxHz,
  });
  const runs = collectStablePitchRuns(frames);
  let detailed = matchPieceRunsDetailed(runs, input.expectedMidis);
  const durations = input.durationQuarters;
  if (durations && durations.length === input.expectedMidis.length) {
    detailed = refineRepeatedPitchSlots({
      slots: detailed,
      runs,
      expectedMidis: input.expectedMidis,
      durationQuarters: durations,
      onsetQuarters: input.onsetQuarters,
      mono: input.mono,
      sampleRateHz: input.sampleRateHz,
    });
  }
  const slots = detailed.map((slot) => slot?.hz ?? null);
  const timesSec =
    durations && durations.length === input.expectedMidis.length
      ? timesFromDetailedSlots(detailed, durations)
      : timesFromMatchedSlots(runs, input.expectedMidis, slots);
  const attackSec =
    durations && durations.length === input.expectedMidis.length
      ? attacksFromDetailedSlots(detailed)
      : timesSec;
  return {
    slots,
    timesSec,
    attackSec,
    endSec: endsFromDetailedSlots(detailed),
    durationSec,
  };
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/**
 * How far into the next same-pitch note a bow must reach before that note counts.
 * A short bow stays on the note that was played. A long bow, including one that
 * rings past the last written note, covers each repeat it actually holds.
 */
const SAME_PITCH_COVER_FRACTION = 0.42;

function runContinuesEarlierSamePitch(
  slots: readonly (MatchedExpectedSlot | null)[],
  expectedMidis: readonly number[],
  index: number,
): boolean {
  const slot = slots[index];
  if (!slot) return false;
  for (let k = index - 1; k >= 0 && expectedMidis[k] === expectedMidis[index]; k--) {
    if (slots[k]?.run === slot.run) return true;
  }
  return false;
}

/**
 * A repeated written pitch often stays one bow, so the detector hears one run.
 * Share that run forward across the same pitch for as long as the bow lasts.
 * A bow that only gets louder is still the first note. A later pitch that
 * landed on the repeat is moved off, so it can fill the notes that follow.
 */
export function refineRepeatedPitchSlots(input: {
  slots: readonly (MatchedExpectedSlot | null)[];
  runs: readonly StablePitchRun[];
  expectedMidis: readonly number[];
  durationQuarters: readonly number[];
  onsetQuarters?: readonly number[];
  mono?: Float32Array;
  sampleRateHz?: number;
}): Array<MatchedExpectedSlot | null> {
  let detailed = input.slots.map((slot) => slot);
  for (let pass = 0; pass < 3; pass++) {
    detailed = detachReleaseAcrossRests({
      slots: detailed,
      expectedMidis: input.expectedMidis,
      durationQuarters: input.durationQuarters,
      onsetQuarters: input.onsetQuarters,
    });
    detailed = shareSustainedSamePitch({
      slots: detailed,
      expectedMidis: input.expectedMidis,
      durationQuarters: input.durationQuarters,
      onsetQuarters: input.onsetQuarters,
      mono: input.mono,
      sampleRateHz: input.sampleRateHz,
    });
    detailed = fillEmptySlotsFromUnusedRuns({
      slots: detailed,
      runs: input.runs,
      expectedMidis: input.expectedMidis,
      durationQuarters: input.durationQuarters,
      onsetQuarters: input.onsetQuarters,
    });
    detailed = reclaimRunsForEarlierHoles({
      slots: detailed,
      expectedMidis: input.expectedMidis,
      durationQuarters: input.durationQuarters,
      onsetQuarters: input.onsetQuarters,
    });
  }
  return detailed;
}

/**
 * A run parked on a later repeat often belongs on the empty note it
 * actually started on. Pull it back so the playhead does not skip.
 */
/** A gap after the previous note has finished is a rest, not another bow of the same pitch. */
function writtenRestBefore(
  onsetQuarters: readonly number[] | undefined,
  durationQuarters: readonly number[] | undefined,
  index: number,
): boolean {
  if (!onsetQuarters || !durationQuarters || index <= 0) return false;
  const prevEnd =
    (onsetQuarters[index - 1] ?? 0) + (durationQuarters[index - 1] ?? 0);
  return (onsetQuarters[index] ?? prevEnd) > prevEnd + 0.35;
}

export function reclaimRunsForEarlierHoles(input: {
  slots: readonly (MatchedExpectedSlot | null)[];
  expectedMidis: readonly number[];
  durationQuarters?: readonly number[];
  onsetQuarters?: readonly number[];
}): Array<MatchedExpectedSlot | null> {
  const slots = input.slots.map((slot) => slot);
  const n = input.expectedMidis.length;
  for (let i = 0; i < n; i++) {
    if (slots[i]) continue;
    const window = gapAroundSlot(slots, i);
    const target = midiToHz(input.expectedMidis[i]!);
    let bestJ = -1;
    let bestCents = 55;
    for (let j = i + 1; j < n; j++) {
      if (writtenRestBefore(input.onsetQuarters, input.durationQuarters, j)) break;
      const slot = slots[j];
      if (!slot) continue;
      if (
        slot.run.timeStartSec < window.start ||
        slot.run.timeStartSec > window.end
      ) {
        continue;
      }
      const centsHere = octaveWrappedAbsCents(slot.hz, target);
      const centsThere = octaveWrappedAbsCents(
        slot.hz,
        midiToHz(input.expectedMidis[j]!),
      );
      const samePitch = input.expectedMidis[j] === input.expectedMidis[i];
      if (centsHere > 50) continue;
      if (!samePitch && centsHere + 8 >= centsThere) continue;
      // A later phrase often starts on the same pitch after a rest. Do not
      // pull that attack back over the notes in between.
      if (samePitch && writtenPitchChangesBetween(input.expectedMidis, i, j)) {
        continue;
      }
      if (centsHere < bestCents) {
        bestJ = j;
        bestCents = centsHere;
      }
    }
    if (bestJ < 0) continue;
    slots[i] = slots[bestJ]!;
    slots[bestJ] = null;
  }
  return slots;
}

/**
 * A later attack of the same pitch belongs on the next written note when the
 * bow already sounding has reached that far. Otherwise it is the note it
 * landed on.
 */
function relocateLateRepeat(input: {
  slots: Array<MatchedExpectedSlot | null>;
  expectedMidis: readonly number[];
  durationQuarters: readonly number[];
  from: number;
  parkedAt: number;
  secPerQuarter: number;
}): boolean {
  const held = input.slots[input.from];
  const parked = input.slots[input.parkedAt];
  if (!held || !parked || parked.run === held.run) return false;
  if (parked.run.timeStartSec < held.run.timeEndSec - 0.04) return false;
  const midi = input.expectedMidis[input.from];
  let later = -1;
  for (let k = input.parkedAt + 1; k < input.expectedMidis.length; k++) {
    if (input.expectedMidis[k] !== midi) break;
    if (!input.slots[k]) {
      later = k;
      break;
    }
  }
  if (later < 0) return false;
  let durToLater = 0;
  for (let k = input.from; k < later; k++) durToLater += input.durationQuarters[k] ?? 0;
  const laterDur = input.durationQuarters[later] ?? 0;
  const runSec = held.run.timeEndSec - held.run.timeStartSec;
  if (runSec < (durToLater + laterDur * 0.4) * input.secPerQuarter) return false;
  input.slots[later] = parked;
  input.slots[input.parkedAt] = null;
  return true;
}

/** True when the note already on this slot is as close to the written pitch as the held bow. */
function parkedRunBelongsHere(
  held: MatchedExpectedSlot,
  parked: MatchedExpectedSlot,
  midi: number,
): boolean {
  const target = midiToHz(midi);
  const heldCents = octaveWrappedAbsCents(held.hz, target);
  const parkedCents = octaveWrappedAbsCents(parked.hz, target);
  return parkedCents <= heldCents + 8;
}
function windowRms(
  mono: Float32Array,
  sampleRate: number,
  t0: number,
  t1: number,
): number {
  const a = Math.max(0, Math.floor(t0 * sampleRate));
  const b = Math.min(mono.length, Math.floor(t1 * sampleRate));
  if (b - a < 8) return 0;
  let sum = 0;
  for (let i = a; i < b; i++) sum += mono[i]! * mono[i]!;
  return Math.sqrt(sum / (b - a));
}

/**
 * One bow that only gets louder has not started the next written note.
 * A second note dips, or holds, instead of climbing straight through the join.
 */
function bowOnlyGetsLouder(
  mono: Float32Array,
  sampleRate: number,
  boundarySec: number,
): boolean {
  const earlier = windowRms(mono, sampleRate, boundarySec - 0.28, boundarySec - 0.14);
  const before = windowRms(mono, sampleRate, boundarySec - 0.14, boundarySec - 0.02);
  const early = windowRms(mono, sampleRate, boundarySec + 0.02, boundarySec + 0.14);
  const later = windowRms(mono, sampleRate, boundarySec + 0.16, boundarySec + 0.32);
  if (!(before > 0)) return false;
  if (earlier > 0 && before < earlier * 0.85) return false;
  // Mild mid-phrase bloom still counts as covering the repeat. Only a
  // clear climb through the join blocks sharing the bow.
  return early > before * 1.14 && later > early * 1.14;
}

export function shareSustainedSamePitch(input: {
  slots: readonly (MatchedExpectedSlot | null)[];
  expectedMidis: readonly number[];
  durationQuarters: readonly number[];
  onsetQuarters?: readonly number[];
  mono?: Float32Array;
  sampleRateHz?: number;
}): Array<MatchedExpectedSlot | null> {
  const slots = input.slots.map((slot) => slot);
  const n = input.expectedMidis.length;
  const ratios: number[] = [];
  for (let i = 0; i < n; i++) {
    const slot = slots[i];
    if (!slot) continue;
    if (runContinuesEarlierSamePitch(slots, input.expectedMidis, i)) continue;
    if (input.expectedMidis[i + 1] === input.expectedMidis[i]) continue;
    const dur = input.durationQuarters[i] ?? 0;
    if (dur <= 0) continue;
    const target = midiToHz(input.expectedMidis[i]!);
    if (octaveWrappedAbsCents(slot.hz, target) > 40) continue;
    const sec = slot.run.timeEndSec - slot.run.timeStartSec;
    if (sec > 0.05) ratios.push(sec / dur);
  }
  const secPerQuarter = median(ratios);
  if (secPerQuarter == null) return slots;

  for (let i = 0; i < n; i++) {
    const slot = slots[i];
    if (!slot) continue;
    if (runContinuesEarlierSamePitch(slots, input.expectedMidis, i)) continue;
    let coveredDur = input.durationQuarters[i] ?? 0;
    if (coveredDur <= 0) continue;
    const runSec = slot.run.timeEndSec - slot.run.timeStartSec;
    for (let j = i + 1; j < n && input.expectedMidis[j] === input.expectedMidis[i]; j++) {
      if (writtenRestBefore(input.onsetQuarters, input.durationQuarters, j)) break;
      const next = slots[j];
      if (
        next &&
        next.run !== slot.run &&
        parkedRunBelongsHere(slot, next, input.expectedMidis[i]!)
      ) {
        const moved = relocateLateRepeat({
          slots,
          expectedMidis: input.expectedMidis,
          durationQuarters: input.durationQuarters,
          from: i,
          parkedAt: j,
          secPerQuarter,
        });
        if (!moved) break;
      }
      const nextDur = input.durationQuarters[j] ?? 0;
      if (nextDur <= 0) break;
      const needSec =
        (coveredDur + nextDur * SAME_PITCH_COVER_FRACTION) * secPerQuarter;
      if (runSec < needSec) break;
      // A swell in the middle of a phrase is still the first note. At the
      // end of the piece the same bow often just blooms across the last
      // repeats — those notes were played.
      if (
        input.mono &&
        input.sampleRateHz &&
        laterDifferentPitchExists(input.expectedMidis, i) &&
        bowOnlyGetsLouder(
          input.mono,
          input.sampleRateHz,
          slot.run.timeStartSec + coveredDur * secPerQuarter,
        )
      ) {
        break;
      }
      slots[j] = { hz: slot.hz, run: slot.run };
      coveredDur += nextDur;
    }
  }
  return slots;
}

/**
 * A note after a rest should not inherit the previous bow or its release.
 * The next real attack can fill the hole on a later pass.
 */
function detachReleaseAcrossRests(input: {
  slots: readonly (MatchedExpectedSlot | null)[];
  expectedMidis: readonly number[];
  durationQuarters: readonly number[];
  onsetQuarters?: readonly number[];
}): Array<MatchedExpectedSlot | null> {
  if (!input.onsetQuarters) return input.slots.map((slot) => slot);
  const slots = input.slots.map((slot) => slot);
  for (let i = 1; i < slots.length; i++) {
    if (!writtenRestBefore(input.onsetQuarters, input.durationQuarters, i)) continue;
    const here = slots[i];
    const prev = slots[i - 1];
    if (!here || !prev) continue;
    const samePitch =
      input.expectedMidis[i] === input.expectedMidis[i - 1] ||
      Math.abs(here.run.midiCenter - prev.run.midiCenter) < 0.85;
    if (!samePitch) continue;
    if (
      here.run === prev.run ||
      here.run.timeStartSec < prev.run.timeEndSec + 0.45
    ) {
      slots[i] = null;
    }
  }
  return slots;
}

/** A leftover run can only fill a hole it actually sits inside. */
function laterDifferentPitchExists(
  expectedMidis: readonly number[],
  from: number,
): boolean {
  const midi = expectedMidis[from];
  for (let k = from + 1; k < expectedMidis.length; k++) {
    if (expectedMidis[k] !== midi) return true;
  }
  return false;
}

function writtenPitchChangesBetween(
  expectedMidis: readonly number[],
  from: number,
  to: number,
): boolean {
  const midi = expectedMidis[from];
  for (let k = from + 1; k < to; k++) {
    if (expectedMidis[k] !== midi) return true;
  }
  return false;
}

function gapAroundSlot(
  slots: readonly (MatchedExpectedSlot | null)[],
  index: number,
): { start: number; end: number } {
  let start = 0;
  let foundPrev = false;
  for (let k = index - 1; k >= 0; k--) {
    const slot = slots[k];
    if (!slot) continue;
    start = slot.run.timeStartSec - 0.05;
    foundPrev = true;
    break;
  }
  let end = Infinity;
  for (let k = index + 1; k < slots.length; k++) {
    const slot = slots[k];
    if (!slot) continue;
    end = slot.run.timeStartSec + 0.15;
    break;
  }
  if (end === Infinity) end = foundPrev ? start + 2.8 : 2.8;
  return { start, end };
}

/** Runs pushed off a repeated note can still belong to the next written pitch. */
function fillEmptySlotsFromUnusedRuns(input: {
  slots: readonly (MatchedExpectedSlot | null)[];
  runs: readonly StablePitchRun[];
  expectedMidis: readonly number[];
  durationQuarters?: readonly number[];
  onsetQuarters?: readonly number[];
}): Array<MatchedExpectedSlot | null> {
  const slots = input.slots.map((slot) => slot);
  const used = new Set(
    slots.flatMap((slot) => (slot ? [slot.run] : [])),
  );
  const unused = input.runs.filter((run) => !used.has(run));
  const taken = new Set<StablePitchRun>();
  for (let i = 0; i < input.expectedMidis.length; i++) {
    if (slots[i]) continue;
    const target = midiToHz(input.expectedMidis[i]!);
    const window = gapAroundSlot(slots, i);
    const afterRest = writtenRestBefore(
      input.onsetQuarters,
      input.durationQuarters,
      i,
    );
    let prevRunEnd = 0;
    for (let k = i - 1; k >= 0; k--) {
      const prev = slots[k];
      if (!prev) continue;
      prevRunEnd = prev.run.timeEndSec;
      break;
    }
    let best: StablePitchRun | null = null;
    let bestCents = MATCH_MAX_CENTS;
    for (const run of unused) {
      if (taken.has(run)) continue;
      if (!runCanFillUnclaimedNote(run)) continue;
      if (run.timeStartSec < window.start || run.timeStartSec > window.end) {
        continue;
      }
      // A blip buried inside the previous bow is not this note.
      // A short note that carries on past that bow still is.
      if (prevRunEnd > 0 && run.timeEndSec < prevRunEnd - 0.02) continue;
      if (afterRest && run.timeStartSec < prevRunEnd + 0.45) continue;
      const cents = octaveWrappedAbsCents(run.medianHz, target);
      if (cents < bestCents) {
        best = run;
        bestCents = cents;
      }
    }
    if (!best || bestCents >= MATCH_MAX_CENTS) continue;
    slots[i] = {
      hz: best.medianHz,
      run: best,
    };
    taken.add(best);
  }
  return slots;
}

/** Only the bow's first written note gets an attack. Later repeats stay null. */
function attacksFromDetailedSlots(
  slots: readonly (MatchedExpectedSlot | null)[],
): Array<number | null> {
  const attacks: Array<number | null> = slots.map(() => null);
  let i = 0;
  while (i < slots.length) {
    const slot = slots[i];
    if (!slot) {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < slots.length && slots[j]?.run === slot.run) j += 1;
    attacks[i] = slot.run.timeStartSec;
    i = j;
  }
  return attacks;
}

/** The last written note of a bow keeps the moment the sound stops. */
function endsFromDetailedSlots(
  slots: readonly (MatchedExpectedSlot | null)[],
): Array<number | null> {
  const ends: Array<number | null> = slots.map(() => null);
  let i = 0;
  while (i < slots.length) {
    const slot = slots[i];
    if (!slot) {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < slots.length && slots[j]?.run === slot.run) j += 1;
    const end = slot.run.timeEndSec;
    if (end > slot.run.timeStartSec + 0.05) ends[j - 1] = end;
    i = j;
  }
  return ends;
}

function timesFromDetailedSlots(
  slots: readonly (MatchedExpectedSlot | null)[],
  durationQuarters: readonly number[],
): Array<number | null> {
  const times: Array<number | null> = slots.map(() => null);
  let i = 0;
  while (i < slots.length) {
    const slot = slots[i];
    if (!slot) {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < slots.length && slots[j]?.run === slot.run) j += 1;
    let total = 0;
    for (let k = i; k < j; k++) total += durationQuarters[k] ?? 0;
    const span = Math.max(0, slot.run.timeEndSec - slot.run.timeStartSec);
    let acc = 0;
    for (let k = i; k < j; k++) {
      const frac = total > 0 ? acc / total : 0;
      times[k] = slot.run.timeStartSec + frac * span;
      acc += durationQuarters[k] ?? 0;
    }
    i = j;
  }
  return times;
}
