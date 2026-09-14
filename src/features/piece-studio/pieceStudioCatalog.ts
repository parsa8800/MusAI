import { MUSAI_PIECE_CATALOG_KEY } from "@/features/piece-studio/pieceStudioStorage";
import {
  emptySkillMap,
  PIECE_FEEDBACK_CATEGORIES,
  type PieceFeedbackSkillMap,
  type PieceFeedbackSkillStatus,
} from "@/features/piece-studio/feedback/pieceFeedbackTypes";
import type {
  PieceAttemptV1,
  PieceRecognitionStatus,
  PieceWorkspaceV1,
  PieceWorkspaceView,
} from "@/features/piece-studio/pieceStudioTypes";
import { PIECE_STUDIO_SCHEMA_VERSION } from "@/features/piece-studio/pieceStudioTypes";

export const PIECE_STUDIO_MAX_PIECES = 24;

function isSourceKind(v: unknown): v is PieceWorkspaceV1["sourceKind"] {
  return (
    v === "musicxml" ||
    v === "midi" ||
    v === "pdf" ||
    v === "image" ||
    v === "audio" ||
    v === "unknown"
  );
}

function isView(v: unknown): v is PieceWorkspaceView {
  return v === "score" || v === "listen" || v === "practise";
}

function isRecognitionStatus(v: unknown): v is PieceRecognitionStatus {
  return v === "none" || v === "ready" || v === "failed";
}

function parseFeedbackSkills(raw: unknown): PieceFeedbackSkillMap | null {
  if (!raw || typeof raw !== "object") return null;
  const map = emptySkillMap();
  let seen = false;
  for (const category of PIECE_FEEDBACK_CATEGORIES) {
    const value = (raw as Record<string, unknown>)[category];
    if (value === "ready" || value === "not_ready") {
      map[category] = value as PieceFeedbackSkillStatus;
      seen = true;
    }
  }
  return seen ? map : null;
}

function parseAttempt(raw: unknown): PieceAttemptV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as PieceAttemptV1;
  if (typeof a.attemptId !== "string" || typeof a.recordedAt !== "string") {
    return null;
  }
  return {
    attemptId: a.attemptId,
    recordedAt: a.recordedAt,
    attemptNumber:
      typeof a.attemptNumber === "number" && a.attemptNumber > 0
        ? a.attemptNumber
        : 0,
    durationSec: typeof a.durationSec === "number" ? a.durationSec : null,
    score0to100: typeof a.score0to100 === "number" ? a.score0to100 : null,
    notesHeard: typeof a.notesHeard === "number" ? a.notesHeard : null,
    notesExpected: typeof a.notesExpected === "number" ? a.notesExpected : null,
    inTunePercent: typeof a.inTunePercent === "number" ? a.inTunePercent : null,
    averageAbsCents:
      typeof a.averageAbsCents === "number" ? a.averageAbsCents : null,
    feedback: typeof a.feedback === "string" ? a.feedback : null,
    progressPercent:
      typeof a.progressPercent === "number" ? a.progressPercent : null,
    hasRecording: Boolean(a.hasRecording),
    feedbackSkills: parseFeedbackSkills(a.feedbackSkills),
  };
}

export function parsePieceWorkspace(raw: unknown): PieceWorkspaceV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as PieceWorkspaceV1;
  if (
    v.schemaVersion !== PIECE_STUDIO_SCHEMA_VERSION ||
    typeof v.pieceId !== "string" ||
    typeof v.slug !== "string" ||
    typeof v.title !== "string" ||
    (v.composer !== null && typeof v.composer !== "string") ||
    !isSourceKind(v.sourceKind) ||
    typeof v.sourceFileName !== "string" ||
    typeof v.sourceMimeType !== "string" ||
    typeof v.importedAt !== "string" ||
    typeof v.lastOpenedAt !== "string" ||
    !isView(v.lastView) ||
    !v.score ||
    typeof v.score !== "object" ||
    !Array.isArray(v.attempts) ||
    typeof v.progressPercent !== "number" ||
    typeof v.hasOriginalFile !== "boolean"
  ) {
    return null;
  }
  return {
    ...v,
    composer: v.composer ?? null,
    score: {
      ...v.score,
      hasStructuredScore: Boolean(v.score.hasStructuredScore),
      noteCount:
        typeof v.score.noteCount === "number" ? v.score.noteCount : null,
      restCount:
        typeof v.score.restCount === "number" ? v.score.restCount : null,
    },
    attempts: v.attempts
      .map((item) => parseAttempt(item))
      .filter((a): a is PieceAttemptV1 => Boolean(a)),
    personalBestScore:
      typeof v.personalBestScore === "number" ? v.personalBestScore : null,
    lifetimeAttemptCount:
      typeof v.lifetimeAttemptCount === "number" && v.lifetimeAttemptCount >= 0
        ? Math.floor(v.lifetimeAttemptCount)
        : undefined,
    lastPractisedAt:
      typeof v.lastPractisedAt === "string" ? v.lastPractisedAt : null,
    recognitionStatus: isRecognitionStatus(v.recognitionStatus)
      ? v.recognitionStatus
      : "none",
    recognitionMessage:
      typeof v.recognitionMessage === "string" ? v.recognitionMessage : null,
    recognitionConfirmed: Boolean(v.recognitionConfirmed),
    recognitionHints: Array.isArray(v.recognitionHints)
      ? v.recognitionHints.filter((h): h is string => typeof h === "string").slice(0, 5)
      : [],
    recognitionFocusMeasure:
      typeof v.recognitionFocusMeasure === "number" &&
      Number.isFinite(v.recognitionFocusMeasure) &&
      v.recognitionFocusMeasure >= 0
        ? Math.floor(v.recognitionFocusMeasure)
        : null,
  };
}

function readCatalogRaw(): PieceWorkspaceV1[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(MUSAI_PIECE_CATALOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => parsePieceWorkspace(item))
      .filter((p): p is PieceWorkspaceV1 => Boolean(p));
  } catch {
    return [];
  }
}

function writeCatalog(pieces: PieceWorkspaceV1[]): void {
  if (typeof localStorage === "undefined") return;
  if (pieces.length === 0) {
    localStorage.removeItem(MUSAI_PIECE_CATALOG_KEY);
    return;
  }
  localStorage.setItem(MUSAI_PIECE_CATALOG_KEY, JSON.stringify(pieces));
}

/** Newest opened first. */
export function listPieceWorkspaces(): PieceWorkspaceV1[] {
  return [...readCatalogRaw()].sort((a, b) =>
    a.lastOpenedAt < b.lastOpenedAt ? 1 : -1,
  );
}

export function getPieceWorkspaceBySlug(
  slug: string,
): PieceWorkspaceV1 | null {
  const normalized = decodeURIComponent(slug).trim().toLowerCase();
  return (
    listPieceWorkspaces().find((p) => p.slug === normalized) ?? null
  );
}

export function getPieceWorkspaceById(
  pieceId: string,
): PieceWorkspaceV1 | null {
  return listPieceWorkspaces().find((p) => p.pieceId === pieceId) ?? null;
}

export function upsertPieceWorkspace(
  piece: PieceWorkspaceV1,
): PieceWorkspaceV1 {
  const others = listPieceWorkspaces().filter((p) => p.pieceId !== piece.pieceId);
  const next = [piece, ...others].slice(0, PIECE_STUDIO_MAX_PIECES);
  writeCatalog(next);
  return piece;
}

export function removePieceWorkspace(pieceId: string): void {
  writeCatalog(listPieceWorkspaces().filter((p) => p.pieceId !== pieceId));
}

export function touchPieceWorkspace(
  pieceId: string,
  lastView?: PieceWorkspaceView,
): PieceWorkspaceV1 | null {
  const current = getPieceWorkspaceById(pieceId);
  if (!current) return null;
  return upsertPieceWorkspace({
    ...current,
    lastOpenedAt: new Date().toISOString(),
    lastView: lastView ?? current.lastView,
  });
}

export function clearPieceCatalog(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(MUSAI_PIECE_CATALOG_KEY);
}

export function formatPieceOpened(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const startOfUtcDay = (x: Date) =>
    Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  const diffDays = Math.round(
    (startOfUtcDay(now) - startOfUtcDay(d)) / (24 * 60 * 60 * 1000),
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()] ?? ""}`;
}
