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

export type RhythmHighlightNote = {
  note: string;
  problem: string;
  fix: string | null;
};

export type RhythmHighlightExplanation = {
  place: string | null;
  notes: RhythmHighlightNote[];
};

function coachLine(text: string): string {
  const clean = text.replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function beatLabel(beat: number): string {
  const rounded = Math.round(beat * 10) / 10;
  const shown = Number.isInteger(rounded) ? String(rounded) : String(rounded);
  return `beat ${shown}`;
}

/** "G4" → "G", "F#4" → "F#". Keep the octave when the run has two of the same name. */
function pitchName(label: string, showOctave: boolean): string {
  const match = /^([A-Ga-g])([#b]*)(-?\d+)$/.exec(label.trim());
  if (!match) return label.trim();
  const name = `${match[1]!.toUpperCase()}${match[2] ?? ""}`;
  return showOctave ? `${name}${match[3]}` : name;
}

function noteNameFor(
  issue: PieceCoachIssueView,
  noteLabels: ReadonlyMap<number, string> | undefined,
  showOctave: ReadonlySet<string>,
): string | null {
  if (!noteLabels || issue.noteIndex == null) return null;
  const raw = noteLabels.get(issue.noteIndex);
  if (!raw) return null;
  const plain = pitchName(raw, false);
  return pitchName(raw, showOctave.has(plain));
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
    return first === last ? barLabel(String(first)) : `Bar ${first}–${last}`;
  }
  return `Bar ${measures[0]}–${measures[measures.length - 1]}`;
}

function issueSpansSeveralBars(run: readonly PieceCoachIssueView[]): boolean {
  const measures = new Set(
    run
      .map((issue) => issue.measure?.trim())
      .filter((measure): measure is string => Boolean(measure && measure !== "?")),
  );
  return measures.size > 1;
}

function octavesNeeded(
  run: readonly PieceCoachIssueView[],
  noteLabels: ReadonlyMap<number, string> | undefined,
): Set<string> {
  const counts = new Map<string, Set<string>>();
  if (!noteLabels) return new Set();
  for (const issue of run) {
    if (issue.noteIndex == null) continue;
    const raw = noteLabels.get(issue.noteIndex);
    if (!raw) continue;
    const plain = pitchName(raw, false);
    const full = pitchName(raw, true);
    const seen = counts.get(plain) ?? new Set<string>();
    seen.add(full);
    counts.set(plain, seen);
  }
  const show = new Set<string>();
  for (const [plain, full] of counts) {
    if (full.size > 1) show.add(plain);
  }
  return show;
}

function repeatedLetters(
  run: readonly PieceCoachIssueView[],
  noteLabels: ReadonlyMap<number, string> | undefined,
  showOctave: ReadonlySet<string>,
): Set<string> {
  const counts = new Map<string, number>();
  for (const issue of run) {
    const name = noteNameFor(issue, noteLabels, showOctave);
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const repeated = new Set<string>();
  for (const [name, count] of counts) {
    if (count > 1) repeated.add(name);
  }
  return repeated;
}

function noteHeading(
  issue: PieceCoachIssueView,
  name: string | null,
  beat: string | null,
  severalBars: boolean,
  repeated: ReadonlySet<string>,
): string {
  const letter =
    name && beat && repeated.has(name) ? `${name} ${beat}` : name;
  const beatName = beat
    ? beat.charAt(0).toUpperCase() + beat.slice(1)
    : null;
  if (severalBars && issue.measure && issue.measure !== "?") {
    const who = letter ?? beatName;
    return who ? `Bar ${issue.measure} ${who}` : `Bar ${issue.measure}`;
  }
  if (letter) return letter;
  if (beatName) return beatName;
  return "This note";
}

/**
 * One note at a time: the letter, what went wrong, then what to try.
 */
export function rhythmHighlightExplanation(
  run: readonly PieceCoachIssueView[],
  noteLabels?: ReadonlyMap<number, string>,
): RhythmHighlightExplanation {
  const severalBars = issueSpansSeveralBars(run);
  const showOctave = octavesNeeded(run, noteLabels);
  const repeated = repeatedLetters(run, noteLabels, showOctave);
  const notes = run.map((issue) => {
    const name = noteNameFor(issue, noteLabels, showOctave);
    const beat =
      typeof issue.beat === "number" && Number.isFinite(issue.beat)
        ? beatLabel(issue.beat)
        : null;
    const problem = coachLine(issue.what);
    const practise = coachLine(issue.practise);
    const fix =
      practise && practise.toLowerCase() !== problem.toLowerCase()
        ? practise
        : null;
    return {
      note: noteHeading(issue, name, beat, severalBars, repeated),
      problem,
      fix,
    };
  });
  const seen = new Set<string>();
  const unique = notes.filter((item) => {
    const key = `${item.note}|${item.problem}|${item.fix ?? ""}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(item.problem || item.fix);
  });
  return {
    place: rhythmHighlightPlace(run),
    notes: unique,
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
