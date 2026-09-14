export const PIECE_STUDIO_MAX_ATTEMPTS = 24;

import {
  getPieceWorkspaceById,
  upsertPieceWorkspace,
} from "@/features/piece-studio/pieceStudioCatalog";
import {
  removePieceAttemptRecording,
  removePieceFeedbackReport,
  savePieceAttemptRecording,
  savePieceFeedbackReport,
} from "@/features/piece-studio/pieceStudioFiles";
import type { PieceFeedbackReportV1 } from "@/features/piece-studio/feedback/pieceFeedbackTypes";
import type { PieceAttemptV1, PieceWorkspaceV1 } from "@/features/piece-studio/pieceStudioTypes";

export function personalBestFromAttempts(
  attempts: readonly PieceAttemptV1[],
): number | null {
  let best: number | null = null;
  for (const take of attempts) {
    if (typeof take.score0to100 !== "number") continue;
    if (best == null || take.score0to100 > best) best = take.score0to100;
  }
  return best;
}

/** Keep the higher of a stored all-time best and the current attempt window. */
export function mergePersonalBest(
  stored: number | null | undefined,
  fromAttempts: number | null,
): number | null {
  if (stored == null) return fromAttempts;
  if (fromAttempts == null) return stored;
  return Math.max(stored, fromAttempts);
}

export function progressFromPersonalBest(best: number | null): number {
  if (best == null) return 0;
  return Math.max(0, Math.min(100, Math.round(best)));
}

export function latestAttempt(
  attempts: readonly PieceAttemptV1[],
): PieceAttemptV1 | null {
  return attempts.length > 0 ? attempts[attempts.length - 1]! : null;
}

export function latestScoreFromAttempts(
  attempts: readonly PieceAttemptV1[],
): number | null {
  const last = latestAttempt(attempts);
  return typeof last?.score0to100 === "number" ? last.score0to100 : null;
}

/** Latest minus previous scored take. Positive = improved. */
export function scoreDeltaFromPrevious(
  attempts: readonly PieceAttemptV1[],
): number | null {
  if (attempts.length < 2) return null;
  const latest = attempts[attempts.length - 1]!;
  if (typeof latest.score0to100 !== "number") return null;
  for (let i = attempts.length - 2; i >= 0; i--) {
    const prev = attempts[i]!;
    if (typeof prev.score0to100 === "number") {
      return latest.score0to100 - prev.score0to100;
    }
  }
  return null;
}

export function attemptCountForPiece(piece: PieceWorkspaceV1): number {
  const lifetime = piece.lifetimeAttemptCount;
  if (typeof lifetime === "number" && lifetime >= piece.attempts.length) {
    return lifetime;
  }
  return piece.attempts.length;
}

export async function appendPieceAttempt(input: {
  pieceId: string;
  attempt: Omit<PieceAttemptV1, "attemptNumber">;
  recording?: Blob | null;
  report?: PieceFeedbackReportV1 | null;
  now?: Date;
}): Promise<PieceWorkspaceV1 | null> {
  const current = getPieceWorkspaceById(input.pieceId);
  if (!current) return null;
  const nowIso = (input.now ?? new Date()).toISOString();
  const priorLifetime =
    typeof current.lifetimeAttemptCount === "number" &&
    current.lifetimeAttemptCount >= current.attempts.length
      ? current.lifetimeAttemptCount
      : current.attempts.length;
  const attemptNumber = priorLifetime + 1;
  const attempt: PieceAttemptV1 = {
    ...input.attempt,
    attemptNumber,
    hasRecording: Boolean(input.recording && input.recording.size > 0),
  };
  if (attempt.hasRecording && input.recording) {
    await savePieceAttemptRecording(
      input.pieceId,
      attempt.attemptId,
      input.recording,
    );
  }
  if (input.report) {
    await savePieceFeedbackReport(input.pieceId, input.report);
  }
  let attempts = [...current.attempts, attempt];
  if (attempts.length > PIECE_STUDIO_MAX_ATTEMPTS) {
    const dropped = attempts.slice(0, attempts.length - PIECE_STUDIO_MAX_ATTEMPTS);
    attempts = attempts.slice(attempts.length - PIECE_STUDIO_MAX_ATTEMPTS);
    for (const old of dropped) {
      if (old.hasRecording) {
        await removePieceAttemptRecording(input.pieceId, old.attemptId);
      }
      await removePieceFeedbackReport(input.pieceId, old.attemptId);
    }
  }
  const windowBest = personalBestFromAttempts(attempts);
  const personalBestScore = mergePersonalBest(
    current.personalBestScore,
    windowBest,
  );
  const next: PieceWorkspaceV1 = {
    ...current,
    attempts,
    lifetimeAttemptCount: attemptNumber,
    personalBestScore,
    progressPercent: progressFromPersonalBest(personalBestScore),
    lastPractisedAt: nowIso,
    lastOpenedAt: nowIso,
    lastView: "practise",
  };
  upsertPieceWorkspace(next);
  return next;
}
