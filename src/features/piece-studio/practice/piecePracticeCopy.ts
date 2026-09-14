import type { PiecePerformanceResult } from "@/features/piece-studio/practice/analyzePiecePerformance";
import {
  attemptCountForPiece,
  latestScoreFromAttempts,
  scoreDeltaFromPrevious,
} from "@/features/piece-studio/practice/piecePracticeAttempts";
import { formatPieceOpened } from "@/features/piece-studio/pieceStudioCatalog";
import type { PieceWorkspaceV1 } from "@/features/piece-studio/pieceStudioTypes";

export function pieceTakeCopy(completedTakes: number): {
  takeNumber: number;
  label: string;
  hint: string;
  ariaLabel: string;
  again: boolean;
} {
  const takeNumber = Math.max(1, completedTakes + 1);
  const again = completedTakes > 0;
  return {
    takeNumber,
    label: `Take ${takeNumber}`,
    hint: again ? "Try again" : "Play this piece",
    /** Matches the visible primary control — keep a11y name aligned with the button. */
    ariaLabel: again ? "Try again" : "Record",
    again,
  };
}

export function pieceAttemptFeedback(
  result: PiecePerformanceResult | null,
  hasDigitalScore: boolean,
): string {
  if (!hasDigitalScore) {
    return "Saved. Add a digital score to check the notes.";
  }
  if (!result || result.notesExpected === 0) {
    return "Saved.";
  }
  if (result.notesHeard === 0) {
    return "Couldn’t hear clear notes — play a little closer to the mic.";
  }
  if (result.score0to100 != null && result.score0to100 >= 88) {
    return "This take sat well in tune.";
  }
  if (result.meanSignedCents > 8) {
    return "A few notes ran sharp.";
  }
  if (result.meanSignedCents < -8) {
    return "A few notes sat flat.";
  }
  if (result.notesMissing > 0) {
    return "Some written notes were missing.";
  }
  return "Saved — try again when you’re ready.";
}

export function formatPieceAttemptWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const startOfDay = (x: Date) =>
    Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  const diffDays = Math.round(
    (startOfDay(now) - startOfDay(d)) / (24 * 60 * 60 * 1000),
  );
  if (diffDays === 0) return `Today · ${hh}:${mm}`;
  if (diffDays === 1) return `Yesterday · ${hh}:${mm}`;
  return `${d.getUTCDate()} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()] ?? ""} · ${hh}:${mm}`;
}

export function formatScoreDelta(delta: number | null): string | null {
  if (delta == null || delta === 0) return null;
  if (delta > 0) return `+${delta} from last take`;
  return `${delta} from last take`;
}

/** Library / progress strip: Best · Latest · Attempts. */
export function formatPieceProgressSummary(piece: PieceWorkspaceV1): string {
  const attempts = attemptCountForPiece(piece);
  if (attempts <= 0) return "Not practised yet";
  const best =
    typeof piece.personalBestScore === "number"
      ? piece.personalBestScore
      : null;
  const latest = latestScoreFromAttempts(piece.attempts);
  const bits: string[] = [];
  if (best != null) bits.push(`Best ${best}%`);
  if (latest != null) bits.push(`Latest ${latest}%`);
  bits.push(attempts === 1 ? "1 attempt" : `${attempts} attempts`);
  return bits.join(" · ");
}

/** @deprecated Prefer pieceLibraryCardModel for structured library cards. */
export function formatPieceLibraryMeta(piece: PieceWorkspaceV1): string {
  const progress = formatPieceProgressSummary(piece);
  if (attemptCountForPiece(piece) <= 0) {
    const when = formatPieceOpened(piece.lastOpenedAt);
    return piece.composer ? `${piece.composer} · ${when}` : when;
  }
  const practised = piece.lastPractisedAt
    ? formatPieceOpened(piece.lastPractisedAt)
    : formatPieceOpened(piece.lastOpenedAt);
  const lead = piece.composer ? `${piece.composer} · ` : "";
  return `${lead}${progress} · ${practised}`;
}

export type PieceLibraryCardState = "check" | "ready" | "practised";

export type PieceLibraryCardModel = {
  title: string;
  composer: string | null;
  state: PieceLibraryCardState;
  /** Quiet status chip (e.g. Review) — null when progress carries the cue. */
  statusLabel: string | null;
  /** @deprecated Prefer bestPercent + progressFill on the card. */
  metaLine: string | null;
  /** Kept for callers; card opens via the whole surface, not this label. */
  actionLabel: "Check" | "Open" | "Continue";
  bestPercent: number | null;
  attempts: number;
  whenLabel: string | null;
  /** 0–100 fill for the quiet progress rail (best score when practised). */
  progressFill: number;
};

/**
 * Structured library-card fields — keep copy short; layout carries hierarchy.
 */
export function pieceLibraryCardModel(
  piece: PieceWorkspaceV1,
  options: { needsCheck: boolean } = { needsCheck: false },
): PieceLibraryCardModel {
  const attempts = attemptCountForPiece(piece);
  const best =
    typeof piece.personalBestScore === "number"
      ? piece.personalBestScore
      : latestScoreFromAttempts(piece.attempts);
  const whenIso = piece.lastPractisedAt ?? piece.lastOpenedAt;
  const whenLabel = whenIso ? formatPieceOpened(whenIso) : null;

  if (options.needsCheck) {
    return {
      title: piece.title,
      composer: piece.composer,
      state: "check",
      statusLabel: "Review",
      metaLine: "Review",
      actionLabel: "Check",
      bestPercent: null,
      attempts: 0,
      whenLabel,
      progressFill: 0,
    };
  }

  if (attempts <= 0) {
    return {
      title: piece.title,
      composer: piece.composer,
      state: "ready",
      statusLabel: null,
      metaLine: null,
      actionLabel: "Open",
      bestPercent: null,
      attempts: 0,
      whenLabel,
      progressFill: 0,
    };
  }

  const fill = Math.max(0, Math.min(100, best ?? piece.progressPercent ?? 0));
  const bestLine = best != null ? `Best ${best}%` : null;
  return {
    title: piece.title,
    composer: piece.composer,
    state: "practised",
    statusLabel: null,
    metaLine: bestLine,
    actionLabel: "Continue",
    bestPercent: best,
    attempts,
    whenLabel,
    progressFill: fill,
  };
}

export function pieceProgressSnapshot(piece: PieceWorkspaceV1): {
  best: number | null;
  latest: number | null;
  attempts: number;
  delta: number | null;
  deltaLabel: string | null;
} {
  const delta = scoreDeltaFromPrevious(piece.attempts);
  return {
    best:
      typeof piece.personalBestScore === "number"
        ? piece.personalBestScore
        : null,
    latest: latestScoreFromAttempts(piece.attempts),
    attempts: attemptCountForPiece(piece),
    delta,
    deltaLabel: formatScoreDelta(delta),
  };
}
