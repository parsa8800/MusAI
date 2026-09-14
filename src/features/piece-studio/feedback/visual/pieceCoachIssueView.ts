import type { PieceCoachFocusItemV1 } from "@/features/piece-studio/feedback/pieceCoachContext";
import type {
  PieceFeedbackCategory,
  PieceFeedbackKind,
  PieceFeedbackSeverity,
} from "@/features/piece-studio/feedback/pieceFeedbackTypes";
import type {
  MockPieceFeedbackIssue,
  MockPieceVisualStyle,
  MockPieceVisualTone,
} from "@/features/piece-studio/feedback/visual/mockPieceFeedbackPreview";

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

/** Short location line for the focus card — omit vague take-wide strings. */
export function pieceCoachUsefulWhere(
  issue: Pick<PieceCoachIssueView, "measure" | "where">,
): string | null {
  if (issue.measure && issue.measure !== "?") {
    return `Bar ${issue.measure}`;
  }
  const where = issue.where?.trim() ?? "";
  if (!where || /^in this take$/i.test(where)) return null;
  return where;
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

/** Map structured Coach focus items into the review panel model. */
export function coachIssuesFromFocus(
  focus: readonly PieceCoachFocusItemV1[],
): PieceCoachIssueView[] {
  return focus.map((item) => {
    const onset = item.onsetQuarters ?? 0;
    const startWholeNotes = onset / 4;
    return {
      id: item.eventId,
      source: "analysis",
      category: item.category,
      kind: item.kind,
      severity: item.severity,
      label: labelFromFocus(item),
      visualTone: toneFromLiveCategory(item.category, item.kind),
      visualStyle: item.category === "pitch" || item.category === "rhythm"
        ? "note"
        : "heat",
      measure: item.measure ?? "?",
      beat: item.beat,
      startWholeNotes,
      endWholeNotes: startWholeNotes + 0.25,
      improveFirst: item.improveFirst,
      where: item.where,
      what: item.what,
      practise: item.practise,
      coach: item.coach,
    };
  });
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
