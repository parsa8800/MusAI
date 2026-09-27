import type { PieceCoachFocusItemV1 } from "@/features/piece-studio/feedback/pieceCoachContext";
import { coachFocusItemFromEvent } from "@/features/piece-studio/feedback/pieceCoachContext";
import type {
  PieceFeedbackCategory,
  PieceFeedbackEventV1,
  PieceFeedbackKind,
  PieceFeedbackSeverity,
} from "@/features/piece-studio/feedback/pieceFeedbackTypes";
import type {
  MockPieceFeedbackIssue,
  MockPieceVisualStyle,
  MockPieceVisualTone,
} from "@/features/piece-studio/feedback/visual/mockPieceFeedbackPreview";
import {
  pieceFeedbackSpanWholeNotes,
  pieceFeedbackVisualStyle,
} from "@/features/piece-studio/feedback/visual/pieceFeedbackAnnotation";
import type { PieceExpectedNote } from "@/features/piece-studio/score/expectedNotes";

/**
 * Coach Parsa’s render model. Live analysis and sample previews both map here
 * so the panel never reads audio or analyzer internals.
 */
export type PieceCoachIssueView = {
  id: string;
  source: "analysis" | "mock-preview";
  category: PieceFeedbackCategory;
  kind: PieceFeedbackKind;
  severity: PieceFeedbackSeverity | null;
  label: string;
  visualTone: MockPieceVisualTone | null;
  visualStyle: MockPieceVisualStyle | null;
  measure: string;
  beat: number | null;
  noteIndex: number | null;
  startWholeNotes: number;
  endWholeNotes: number;
  improveFirst: string;
  where: string;
  what: string;
  practise: string;
  coach: string;
};

function labelFromFocus(item: PieceCoachFocusItemV1): string {
  if (item.measure) return `Bar ${item.measure}`;
  return pieceCoachCategoryTitle(item.category);
}

export function pieceCoachCategoryTitle(
  category: PieceFeedbackCategory,
): string {
  switch (category) {
    case "pitch":
      return "Pitch";
    case "rhythm":
      return "Rhythm";
    case "tempo":
      return "Tempo";
    case "dynamics":
      return "Dynamics";
    case "consistency":
      return "Consistency";
    default:
      return "Focus";
  }
}

/** Short location line for an issue — omit vague take-wide strings. */
export function pieceCoachUsefulWhere(
  issue: Pick<PieceCoachIssueView, "measure" | "where"> &
    Partial<Pick<PieceCoachIssueView, "beat" | "visualStyle">>,
): string | null {
  return pieceCoachPlaceLine({
    beat: null,
    visualStyle: null,
    ...issue,
  });
}

export const PIECE_FEEDBACK_PANEL_MAX_PER_CATEGORY = 8;

/**
 * Natural place line for the issue card (e.g. “Bar 1 · beat 2”).
 */
export function pieceCoachPlaceLine(
  issue: Pick<PieceCoachIssueView, "measure" | "where" | "beat" | "visualStyle">,
): string | null {
  const where = issue.where?.trim() ?? "";
  let place =
    where && !/^in this take$/i.test(where)
      ? where.replace(/,?\s*beat\s+\d+(\.\d+)?\s*$/i, "").trim() || where
      : issue.measure && issue.measure !== "?"
        ? `Bar ${issue.measure}`
        : null;
  if (!place) return null;
  const noteLevel = issue.visualStyle === "note";
  const beat =
    typeof issue.beat === "number" && Number.isFinite(issue.beat)
      ? Math.round(issue.beat * 10) / 10
      : null;
  if (noteLevel && beat != null && !/\bbeat\b/i.test(place)) {
    place = `${place} · beat ${beat}`;
  }
  return place;
}

function toneFromLiveCategory(
  category: PieceFeedbackCategory,
  kind: PieceFeedbackKind,
): MockPieceVisualTone | null {
  if (category === "pitch") return "pitch";
  if (category === "rhythm") return "rhythm";
  if (category === "dynamics") return "dynamics";
  if (kind === "rushing") return "rushing";
  if (kind === "slowing") return "dragging";
  return null;
}

function noteForFocus(
  item: PieceCoachFocusItemV1,
  notes: readonly PieceExpectedNote[] | undefined,
): PieceExpectedNote | null {
  if (!notes || notes.length === 0) return null;
  if (typeof item.noteIndex === "number") {
    const byIndex = notes.find((note) => note.noteIndex === item.noteIndex);
    if (byIndex) return byIndex;
  }
  if (typeof item.onsetQuarters === "number") {
    return (
      notes.find((note) => note.onsetQuarters === item.onsetQuarters) ?? null
    );
  }
  return null;
}

/** Map structured Coach focus items into the review panel model. */
export function coachIssuesFromFocus(
  focus: readonly PieceCoachFocusItemV1[],
  notes?: readonly PieceExpectedNote[],
): PieceCoachIssueView[] {
  return focus.map((item) => {
    const note = noteForFocus(item, notes);
    const span = pieceFeedbackSpanWholeNotes({
      category: item.category,
      onsetQuarters: item.onsetQuarters ?? note?.onsetQuarters ?? 0,
      durationQuarters: note?.durationQuarters ?? null,
    });
    return {
      id: item.eventId,
      source: "analysis",
      category: item.category,
      kind: item.kind,
      severity: item.severity,
      label: labelFromFocus(item),
      visualTone: toneFromLiveCategory(item.category, item.kind),
      visualStyle: pieceFeedbackVisualStyle(item.category),
      measure: item.measure ?? note?.measure ?? "?",
      beat: item.beat ?? note?.beat ?? null,
      noteIndex: item.noteIndex ?? note?.noteIndex ?? null,
      startWholeNotes: span.startWholeNotes,
      endWholeNotes: span.endWholeNotes,
      improveFirst: item.improveFirst,
      where: item.where,
      what: item.what,
      practise: item.practise,
      coach: item.coach,
    };
  });
}

/** All report events → panel issues (not the truncated coach-focus slice). */
export function coachIssuesFromEvents(
  events: readonly PieceFeedbackEventV1[],
  notes?: readonly PieceExpectedNote[],
): PieceCoachIssueView[] {
  return coachIssuesFromFocus(events.map(coachFocusItemFromEvent), notes);
}

export function coachIssuesFromMock(
  issues: readonly MockPieceFeedbackIssue[],
): PieceCoachIssueView[] {
  return issues.map((issue) => ({
    id: issue.id,
    source: "mock-preview",
    category: issue.category,
    kind: issue.kind,
    severity: null,
    label: issue.label,
    visualTone: issue.visualTone,
    visualStyle: issue.visualStyle,
    measure: issue.measure,
    beat: issue.beat,
    noteIndex: issue.noteIndex ?? null,
    startWholeNotes: issue.startWholeNotes,
    endWholeNotes: issue.endWholeNotes,
    improveFirst: issue.improveFirst,
    where: issue.where,
    what: issue.what,
    practise: issue.practise,
    coach: issue.coach,
  }));
}

export function coachIssueById(
  issues: readonly PieceCoachIssueView[],
  id: string | null,
): PieceCoachIssueView | null {
  if (!id) return issues[0] ?? null;
  return issues.find((issue) => issue.id === id) ?? issues[0] ?? null;
}

/** Stable topic key for the category strip (Pitch, Rhythm, Tempo, …). */
export function pieceCoachTopicKey(issue: PieceCoachIssueView): string {
  // Ahead/behind-the-beat both belong under Tempo — one student-facing topic.
  if (issue.category === "tempo") return "tempo";
  return issue.category;
}

/** Student-facing topic label for the category strip. */
export function pieceCoachTopicLabel(issue: PieceCoachIssueView): string {
  if (issue.category === "tempo") return "Tempo";
  return pieceCoachCategoryTitle(issue.category);
}

export type PieceCoachTopicGroup = {
  key: string;
  label: string;
  issues: PieceCoachIssueView[];
};

/**
 * Group focus items into scan-friendly category topics.
 * Order follows first appearance in the coach focus list.
 */
export function groupPieceCoachTopics(
  issues: readonly PieceCoachIssueView[],
): PieceCoachTopicGroup[] {
  const order: string[] = [];
  const map = new Map<string, PieceCoachIssueView[]>();
  for (const issue of issues) {
    const key = pieceCoachTopicKey(issue);
    const list = map.get(key);
    if (!list) {
      order.push(key);
      map.set(key, [issue]);
    } else {
      list.push(issue);
    }
  }
  return order.map((key) => {
    const group = map.get(key)!;
    return {
      key,
      label: pieceCoachTopicLabel(group[0]!),
      issues: group.slice(0, PIECE_FEEDBACK_PANEL_MAX_PER_CATEGORY),
    };
  });
}

/** Same bar + same kind is one card for passage-level skills, not pitch notes. */
export function pieceCoachCollapseKey(issue: PieceCoachIssueView): string {
  if (pieceFeedbackVisualStyle(issue.category) === "note") {
    return issue.id;
  }
  const place =
    issue.measure && issue.measure !== "?"
      ? issue.measure
      : issue.where.trim().toLowerCase() || issue.id;
  return `${pieceCoachTopicKey(issue)}|${place}|${issue.kind}`;
}

/**
 * Collapse duplicate same-bar / same-kind items for the review panel.
 * Does not change analyzers — presentation only.
 */
export function collapsePieceCoachIssues(
  issues: readonly PieceCoachIssueView[],
): PieceCoachIssueView[] {
  const order: string[] = [];
  const map = new Map<string, PieceCoachIssueView>();
  for (const issue of issues) {
    const key = pieceCoachCollapseKey(issue);
    const existing = map.get(key);
    if (!existing) {
      order.push(key);
      map.set(key, { ...issue });
      continue;
    }
    map.set(key, {
      ...existing,
      startWholeNotes: Math.min(existing.startWholeNotes, issue.startWholeNotes),
      endWholeNotes: Math.max(existing.endWholeNotes, issue.endWholeNotes),
      severity:
        existing.severity === "focus" || issue.severity === "focus"
          ? "focus"
          : existing.severity ?? issue.severity,
    });
  }
  return order.map((key) => map.get(key)!);
}

