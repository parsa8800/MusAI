import type { PieceCoachIssueView } from "@/features/piece-studio/feedback/visual/pieceCoachIssueView";
import type { PieceScoreHighlight } from "@/features/piece-studio/score/OsmdScoreAdapter";

/** Notes closer than this are one run. A rest or a correct note stays a gap. */
const TOUCH_WHOLE_NOTES = 0.02;

/** One staff rectangle and the rhythm issues it covers. */
export function rhythmRunsFromIssues(
  issues: readonly PieceCoachIssueView[],
): PieceCoachIssueView[][] {
  const rhythm = issues
    .filter((issue) => issue.category === "rhythm")
    .slice()
    .sort(
      (a, b) =>
        a.startWholeNotes - b.startWholeNotes ||
        (a.noteIndex ?? 0) - (b.noteIndex ?? 0),
    );
  const runs: PieceCoachIssueView[][] = [];
  for (const issue of rhythm) {
    const run = runs[runs.length - 1];
    const prev = run?.[run.length - 1];
    if (prev && issue.startWholeNotes <= prev.endWholeNotes + TOUCH_WHOLE_NOTES) {
      run.push(issue);
    } else {
      runs.push([issue]);
    }
  }
  return runs;
}

/** The rectangle that contains this issue, or null when the id is not rhythm. */
export function rhythmRunForIssueId(
  issues: readonly PieceCoachIssueView[],
  id: string | null,
): PieceCoachIssueView[] | null {
  if (!id) return null;
  return (
    rhythmRunsFromIssues(issues).find((run) =>
      run.some((issue) => issue.id === id),
    ) ?? null
  );
}

export type RhythmNoteInfo = {
  label: string;
  durationQuarters: number;
  absoluteOnsetQuarters?: number;
};

export type RhythmHighlightExplanation = {
  place: string | null;
  /** One line when that is enough */
  line?: string;
  /** Short tips without trailing full stops */
  bullets?: string[];
};

/** "G4" → "G", "F#4" → "F#". Keep the octave when the stretch has two of the same name. */
export function rhythmPitchName(label: string, showOctave: boolean): string {
  const match = /^([A-Ga-g])([#b]*)(-?\d+)$/.exec(label.trim());
  if (!match) return label.trim();
  const name = `${match[1]!.toUpperCase()}${match[2] ?? ""}`;
  return showOctave ? `${name}${match[3]}` : name;
}

export function britishNoteLength(durationQuarters: number): string {
  if (!(durationQuarters > 0)) return "crotchet";
  if (durationQuarters <= 0.375) return "semiquaver";
  if (durationQuarters <= 0.75) return "quaver";
  if (durationQuarters <= 1.5) return "crotchet";
  if (durationQuarters <= 3) return "minim";
  return "semibreve";
}

function pluralLength(name: string): string {
  if (name.endsWith("s")) return name;
  return `${name}s`;
}

function joinNoteNames(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function noteInfoAt(
  notes: ReadonlyMap<number, RhythmNoteInfo> | undefined,
  index: number,
): RhythmNoteInfo | null {
  return notes?.get(index) ?? null;
}

function issueShape(
  issue: PieceCoachIssueView,
): "short" | "long" | "late" | "early" {
  if (issue.kind === "late") return "late";
  if (issue.kind === "early") return "early";
  const text = `${issue.what} ${issue.practise} ${issue.coach}`;
  if (/too long|ran long/i.test(text)) return "long";
  return "short";
}

function runShape(
  run: readonly PieceCoachIssueView[],
): "short" | "long" | "late" {
  const votes = { short: 0, long: 0, late: 0 };
  for (const issue of run) {
    const shape = issueShape(issue);
    if (shape === "late") votes.late += 1;
    else if (shape === "long") votes.long += 1;
    else votes.short += 1;
  }
  if (votes.late >= votes.short && votes.late >= votes.long) return "late";
  if (votes.long > votes.short) return "long";
  return "short";
}

function barLabel(measure: string): string {
  return `Bar ${measure}`;
}

/** Place for a whole highlighted stretch: one bar, or the bar range it covers. */
export function rhythmHighlightPlace(
  run: readonly PieceCoachIssueView[],
): string | null {
  const measures: string[] = [];
  for (const issue of run) {
    const measure = issue.measure?.trim();
    if (!measure || measure === "?") continue;
    if (!measures.includes(measure)) measures.push(measure);
  }
  if (measures.length === 0) return null;
  if (measures.length === 1) return barLabel(measures[0]!);
  const nums = measures.map((measure) => Number(measure));
  if (nums.every((num) => Number.isFinite(num))) {
    const sorted = [...nums].sort((a, b) => a - b);
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    return first === last ? barLabel(String(first)) : `Bar ${first} to ${last}`;
  }
  return `Bar ${measures[0]} to ${measures[measures.length - 1]}`;
}

/** Every note the blue rectangle covers, not just the one that triggered a flag. */
function notesInHighlightRun(
  run: readonly PieceCoachIssueView[],
  notes: ReadonlyMap<number, RhythmNoteInfo> | undefined,
): Array<{ index: number; info: RhythmNoteInfo }> {
  if (!notes || notes.size === 0) return [];
  const runStart = Math.min(...run.map((issue) => issue.startWholeNotes));
  const runEnd = Math.max(...run.map((issue) => issue.endWholeNotes));
  const inSpan: Array<{ index: number; info: RhythmNoteInfo }> = [];
  for (const [index, info] of notes) {
    const onsetQ = info.absoluteOnsetQuarters;
    if (onsetQ == null || !(info.durationQuarters > 0)) continue;
    const noteStart = onsetQ / 4;
    const noteEnd = noteStart + info.durationQuarters / 4;
    if (noteEnd <= runStart + 1e-4 || noteStart >= runEnd - 1e-4) continue;
    inSpan.push({ index, info });
  }
  if (inSpan.length > 0) {
    return withTouchingPartners(
      inSpan.sort((a, b) => a.index - b.index),
      run,
      notes,
    );
  }
  const seen = new Set<number>();
  const out: Array<{ index: number; info: RhythmNoteInfo }> = [];
  for (const issue of run) {
    if (issue.noteIndex == null) continue;
    if (seen.has(issue.noteIndex)) continue;
    const info = noteInfoAt(notes, issue.noteIndex);
    if (!info) continue;
    seen.add(issue.noteIndex);
    out.push({ index: issue.noteIndex, info });
  }
  const min = Math.min(...out.map((item) => item.index));
  const max = Math.max(...out.map((item) => item.index));
  for (let i = min; i <= max; i++) {
    if (seen.has(i)) continue;
    const info = noteInfoAt(notes, i);
    if (!info) continue;
    out.push({ index: i, info });
  }
  return withTouchingPartners(out.sort((a, b) => a.index - b.index), run, notes);
}

/** Include the next written note when it shares the same rhythm fix (e.g. two crotchets). */
function withTouchingPartners(
  items: Array<{ index: number; info: RhythmNoteInfo }>,
  run: readonly PieceCoachIssueView[],
  notes: ReadonlyMap<number, RhythmNoteInfo>,
): Array<{ index: number; info: RhythmNoteInfo }> {
  const shape = runShape(run);
  if (shape !== "short" && shape !== "long") return items;
  const last = items[items.length - 1];
  if (!last) return items;
  const next = noteInfoAt(notes, last.index + 1);
  if (!next || items.some((item) => item.index === last.index + 1)) {
    return items;
  }
  const lastOnset = last.info.absoluteOnsetQuarters;
  const nextOnset = next.absoluteOnsetQuarters;
  if (lastOnset == null || nextOnset == null) return items;
  const lastEnd = lastOnset / 4 + last.info.durationQuarters / 4;
  const nextStart = nextOnset / 4;
  if (Math.abs(nextStart - lastEnd) > 0.02) return items;
  return [...items, { index: last.index + 1, info: next }];
}

function displayPitchNames(
  items: readonly { info: RhythmNoteInfo }[],
): string[] {
  const counts = new Map<string, Set<string>>();
  for (const item of items) {
    const plain = rhythmPitchName(item.info.label, false);
    const full = rhythmPitchName(item.info.label, true);
    const seen = counts.get(plain) ?? new Set<string>();
    seen.add(full);
    counts.set(plain, seen);
  }
  const showOctave = new Set<string>();
  for (const [plain, full] of counts) {
    if (full.size > 1) showOctave.add(plain);
  }
  return items.map((item) =>
    rhythmPitchName(
      item.info.label,
      showOctave.has(rhythmPitchName(item.info.label, false)),
    ),
  );
}

function highlightGroupLabel(
  items: readonly { info: RhythmNoteInfo }[],
  length: string,
): string {
  const names = displayPitchNames(items);
  const lengths = pluralLength(length);
  const count = items.length;
  const onePitch =
    names.length > 0 && names.every((name) => name === names[0]);
  if (count >= 2 && onePitch) {
    const pitch = names[0]!;
    return count === 2
      ? `Both ${pitch} ${lengths}`
      : `All ${count} ${pitch} ${lengths}`;
  }
  const unique: string[] = [];
  for (const name of names) {
    if (!unique.includes(name)) unique.push(name);
  }
  const who = joinNoteNames(unique);
  if (count <= 1) return who || `the ${length}`;
  return `The ${who} ${lengths}`;
}

function commonLengthName(
  items: readonly { info: RhythmNoteInfo }[],
): string | null {
  if (items.length === 0) return null;
  const counts = new Map<string, number>();
  for (const item of items) {
    const name = britishNoteLength(item.info.durationQuarters);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

function rhythmHighlightBody(
  run: readonly PieceCoachIssueView[],
  notes?: ReadonlyMap<number, RhythmNoteInfo>,
): Pick<RhythmHighlightExplanation, "line" | "bullets"> {
  const items = notesInHighlightRun(run, notes);
  const length = commonLengthName(items) ?? "crotchet";
  const lengths = pluralLength(length);
  const group = highlightGroupLabel(items, length);
  const shape = runShape(run);

  if (shape === "late") {
    if (items.length >= 2) {
      return { line: `Start the ${lengths} with the beat` };
    }
    return { line: `Start ${group} with the beat` };
  }

  if (shape === "long") {
    if (items.length >= 2) {
      return {
        bullets: [
          `${group} ran long`,
          length === "quaver"
            ? "Give each quaver half a beat"
            : `Play them as shorter ${lengths}`,
        ],
      };
    }
    return { line: `Play ${group} as a shorter ${length}` };
  }

  if (items.length >= 2) {
    const fix =
      length === "quaver"
        ? "Give each quaver half a beat"
        : `Hold each ${length} for a full beat`;
    return {
      bullets: [`${group} were cut short`, fix],
    };
  }
  if (group) {
    return { line: `Hold ${group} as a ${length} for a full beat` };
  }
  return { line: `Hold each ${length} for a full beat` };
}

/**
 * Teacher copy for the whole highlighted stretch.
 */
export function rhythmHighlightExplanation(
  run: readonly PieceCoachIssueView[],
  notes?: ReadonlyMap<number, RhythmNoteInfo>,
): RhythmHighlightExplanation {
  return {
    place: rhythmHighlightPlace(run),
    ...rhythmHighlightBody(run, notes),
  };
}

/**
 * Staff rectangle over rhythm-wrong notes.
 * Notes that sit against each other share one rectangle.
 * Pitch stays on the notehead, so pitch issues are left out of this list.
 */
export function rhythmHighlightsFromIssues(
  issues: readonly PieceCoachIssueView[],
  selectedId: string | null,
): PieceScoreHighlight[] {
  return rhythmRunsFromIssues(issues).map((run) => {
    const selected = run.find((issue) => issue.id === selectedId);
    const anchor = selected ?? run[0]!;
    return {
      id: anchor.id,
      startWholeNotes: Math.min(...run.map((issue) => issue.startWholeNotes)),
      endWholeNotes: Math.max(...run.map((issue) => issue.endWholeNotes)),
      label: anchor.where || anchor.label || "Rhythm",
      source: anchor.source,
      visualTone: "rhythm" as const,
      visualStyle: "heat" as const,
      emphasis: selected ? ("focus" as const) : ("related" as const),
    };
  });
}
