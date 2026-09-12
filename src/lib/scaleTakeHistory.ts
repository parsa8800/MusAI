import type {
  ScalePracticeNoteRow,
  ScalePracticeSessionV1,
} from "@/lib/scalePracticeTypes";
import {
  expectedScaleNoteCount,
  type ScaleExerciseMotion,
  type ScaleKind,
} from "@/lib/scales";

export type ScaleExerciseConfig = {
  scaleId: string;
  octaveSpan: 1 | 2;
  scaleKind: ScaleKind;
  expectedNotesMidi: number[];
};

/** Scale + octave + direction. Major/minor is already in `scaleId`. */
export function exerciseConfigKey(config: ScaleExerciseConfig): string {
  return `${config.scaleId}__${config.octaveSpan}__${inferExerciseMotion(config)}`;
}

export function inferExerciseMotion(
  config: Pick<ScaleExerciseConfig, "expectedNotesMidi" | "octaveSpan" | "scaleKind">,
): ScaleExerciseMotion {
  const midis = config.expectedNotesMidi;
  const n = midis.length;
  if (n >= 3 && midis[0] === midis[n - 1]) return "up_down";

  const descCount = expectedScaleNoteCount(
    config.octaveSpan,
    "descending",
    config.scaleKind,
  );
  const ascCount = expectedScaleNoteCount(
    config.octaveSpan,
    "ascending",
    config.scaleKind,
  );
  if (n >= 2 && midis[0]! > midis[n - 1]!) {
    if (n === descCount || n !== ascCount) return "descending";
    return "descending";
  }
  return "ascending";
}

export function sameScaleExercise(
  a: ScaleExerciseConfig,
  b: ScaleExerciseConfig,
): boolean {
  return exerciseConfigKey(a) === exerciseConfigKey(b);
}

export function filterAttemptsForExercise(
  attempts: ScalePracticeSessionV1[],
  config: ScaleExerciseConfig,
): ScalePracticeSessionV1[] {
  return attempts.filter((attempt) => sameScaleExercise(attempt, config));
}

export function appendAttemptForExercise(
  prev: ScalePracticeSessionV1[],
  session: ScalePracticeSessionV1,
): ScalePracticeSessionV1[] {
  const matching = filterAttemptsForExercise(prev, session);
  const withoutDup = matching.filter((a) => a.sessionId !== session.sessionId);
  return [...withoutDup, session];
}

export function isUnresolvedNote(note: ScalePracticeNoteRow): boolean {
  return note.missingData || note.intonationBucket !== "in_tune";
}

export function countUnresolvedNotes(session: ScalePracticeSessionV1): number {
  return session.notes.filter(isUnresolvedNote).length;
}

function issueDetail(note: ScalePracticeNoteRow): string {
  if (note.missingData) return "wasn't heard";
  if (note.intonationBucket === "sharp") return "too high";
  if (note.intonationBucket === "flat") return "too low";
  return "needs work";
}

function noteName(note: ScalePracticeNoteRow): string {
  return note.expectedNoteLabel.replace(/\d+$/, "") || note.expectedNoteLabel;
}

export type TakeNoteChangeKind = "improved" | "still_needs_work" | "new_issue";

export type TakeNoteChange = {
  noteIndex: number;
  kind: TakeNoteChangeKind;
  label: string;
  line: string;
};

const KIND_LABEL: Record<TakeNoteChangeKind, string> = {
  improved: "Improved",
  still_needs_work: "Still needs work",
  new_issue: "New issue",
};

/**
 * Compare the current take to the previous take in the same exercise.
 * The current take is the source of truth — older issues are not sticky.
 */
export function compareTakeNotes(
  current: ScalePracticeSessionV1,
  previous: ScalePracticeSessionV1 | null,
): TakeNoteChange[] {
  if (!previous || !sameScaleExercise(current, previous)) return [];

  const prevByIndex = new Map(
    previous.notes.map((note) => [note.noteIndex, note]),
  );
  const changes: TakeNoteChange[] = [];

  for (const note of current.notes) {
    const prior = prevByIndex.get(note.noteIndex);
    const nowOpen = isUnresolvedNote(note);
    const wasOpen = prior ? isUnresolvedNote(prior) : false;
    const name = noteName(note);

    let kind: TakeNoteChangeKind | null = null;
    let line = "";
    if (wasOpen && !nowOpen) {
      kind = "improved";
      line = `${name} is now in tune`;
    } else if (wasOpen && nowOpen) {
      kind = "still_needs_work";
      line = `${name} is still ${issueDetail(note)}`;
    } else if (!wasOpen && nowOpen) {
      kind = "new_issue";
      line = `${name} is ${issueDetail(note)}`;
    }
    if (!kind) continue;
    changes.push({
      noteIndex: note.noteIndex,
      kind,
      label: KIND_LABEL[kind],
      line,
    });
  }

  const order: TakeNoteChangeKind[] = [
    "still_needs_work",
    "new_issue",
    "improved",
  ];
  changes.sort(
    (a, b) =>
      order.indexOf(a.kind) - order.indexOf(b.kind) || a.noteIndex - b.noteIndex,
  );
  return changes.slice(0, 5);
}

export type ScaleTakeSummary = {
  sessionId: string;
  takeNumber: number;
  unresolvedCount: number;
  improved: boolean | null;
  isLatest: boolean;
};

export function buildTakeSummaries(
  attempts: ScalePracticeSessionV1[],
): ScaleTakeSummary[] {
  return attempts.map((attempt, index) => {
    const unresolvedCount = countUnresolvedNotes(attempt);
    const previous = index > 0 ? attempts[index - 1]! : null;
    const prevUnresolved = previous ? countUnresolvedNotes(previous) : null;
    return {
      sessionId: attempt.sessionId,
      takeNumber: index + 1,
      unresolvedCount,
      improved:
        prevUnresolved == null ? null : unresolvedCount < prevUnresolved,
      isLatest: index === attempts.length - 1,
    };
  });
}
