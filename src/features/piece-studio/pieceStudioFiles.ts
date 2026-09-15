import type { PieceFeedbackReportV1 } from "@/features/piece-studio/feedback/pieceFeedbackTypes";
import { MUSAI_PIECE_FILES_DB } from "@/features/piece-studio/pieceStudioStorage";
import type { MusaiScoreV1 } from "@/features/piece-studio/score/musaiScore";

const FILE_STORE = "files";
const SCORE_STORE = "scores";
const XML_STORE = "musicxml";
const RECORDING_STORE = "recordings";
const FEEDBACK_STORE = "feedback";
/** Bump when adding stores — upgrades recreate any missing object stores. */
const DB_VERSION = 6;
const fileMemory = new Map<string, Blob>();
const scoreMemory = new Map<string, MusaiScoreV1>();
const xmlMemory = new Map<string, string>();
const recordingMemory = new Map<string, Record<string, Blob>>();
const feedbackMemory = new Map<string, Record<string, PieceFeedbackReportV1>>();

function ensurePieceStores(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(FILE_STORE)) {
    db.createObjectStore(FILE_STORE);
  }
  if (!db.objectStoreNames.contains(SCORE_STORE)) {
    db.createObjectStore(SCORE_STORE);
  }
  if (!db.objectStoreNames.contains(XML_STORE)) {
    db.createObjectStore(XML_STORE);
  }
  if (!db.objectStoreNames.contains(RECORDING_STORE)) {
    db.createObjectStore(RECORDING_STORE);
  }
  if (!db.objectStoreNames.contains(FEEDBACK_STORE)) {
    db.createObjectStore(FEEDBACK_STORE);
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(MUSAI_PIECE_FILES_DB, DB_VERSION);
    req.onupgradeneeded = () => {
      ensurePieceStores(req.result);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

function idbWriteFailed(where: string, err: unknown): void {
  if (process.env.NODE_ENV !== "production") {
    console.error(`[piece-files] ${where} IndexedDB write failed; memory kept`, err);
  }
}

export async function savePieceOriginalFile(
  pieceId: string,
  blob: Blob,
): Promise<void> {
  // Always mirror in memory so soft navigations after “Use this score” work
  // even when IndexedDB is slow or unavailable.
  fileMemory.set(pieceId, blob);
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(FILE_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
      tx.objectStore(FILE_STORE).put(blob, pieceId);
    });
    db.close();
  } catch (err) {
    idbWriteFailed("savePieceOriginalFile", err);
  }
}

export async function readPieceOriginalFile(
  pieceId: string,
): Promise<Blob | null> {
  const cached = fileMemory.get(pieceId);
  if (cached) return cached;
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(FILE_STORE, "readonly");
      const req = tx.objectStore(FILE_STORE).get(pieceId);
      req.onsuccess = () => {
        const value = req.result;
        resolve(value instanceof Blob ? value : null);
      };
      req.onerror = () => reject(req.error ?? new Error("IndexedDB read failed"));
    });
    db.close();
    if (blob) fileMemory.set(pieceId, blob);
    return blob;
  } catch {
    return fileMemory.get(pieceId) ?? null;
  }
}

export async function savePieceStructuredScore(
  pieceId: string,
  score: MusaiScoreV1,
): Promise<void> {
  scoreMemory.set(pieceId, score);
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SCORE_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
      tx.objectStore(SCORE_STORE).put(score, pieceId);
    });
    db.close();
  } catch (err) {
    idbWriteFailed("savePieceStructuredScore", err);
  }
}

export async function readPieceStructuredScore(
  pieceId: string,
): Promise<MusaiScoreV1 | null> {
  const cached = scoreMemory.get(pieceId);
  if (cached && cached.schemaVersion === 1) return cached;
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    const score = await new Promise<MusaiScoreV1 | null>((resolve, reject) => {
      const tx = db.transaction(SCORE_STORE, "readonly");
      const req = tx.objectStore(SCORE_STORE).get(pieceId);
      req.onsuccess = () => {
        const value = req.result as MusaiScoreV1 | undefined;
        resolve(value && value.schemaVersion === 1 ? value : null);
      };
      req.onerror = () => reject(req.error ?? new Error("IndexedDB read failed"));
    });
    db.close();
    if (score) scoreMemory.set(pieceId, score);
    return score;
  } catch {
    const fallback = scoreMemory.get(pieceId);
    return fallback && fallback.schemaVersion === 1 ? fallback : null;
  }
}

export async function savePieceRecognizedMusicXml(
  pieceId: string,
  musicXml: string,
): Promise<void> {
  const trimmed = musicXml.trim();
  if (!trimmed) {
    throw new Error("Recognized MusicXML is empty.");
  }
  xmlMemory.set(pieceId, trimmed);
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    if (!db.objectStoreNames.contains(XML_STORE)) {
      db.close();
      throw new Error("musicxml object store missing");
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(XML_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
      tx.objectStore(XML_STORE).put(trimmed, pieceId);
    });
    db.close();
  } catch (err) {
    idbWriteFailed("savePieceRecognizedMusicXml", err);
  }
}

export async function readPieceRecognizedMusicXml(
  pieceId: string,
): Promise<string | null> {
  const cached = xmlMemory.get(pieceId);
  if (typeof cached === "string" && cached.trim()) return cached;
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    const xml = await new Promise<string | null>((resolve, reject) => {
      if (!db.objectStoreNames.contains(XML_STORE)) {
        resolve(null);
        return;
      }
      const tx = db.transaction(XML_STORE, "readonly");
      const req = tx.objectStore(XML_STORE).get(pieceId);
      req.onsuccess = () => {
        const value = req.result;
        resolve(typeof value === "string" && value.trim() ? value : null);
      };
      req.onerror = () => reject(req.error ?? new Error("IndexedDB read failed"));
    });
    db.close();
    if (xml) xmlMemory.set(pieceId, xml);
    return xml;
  } catch {
    const fallback = xmlMemory.get(pieceId);
    return typeof fallback === "string" && fallback.trim() ? fallback : null;
  }
}

export async function savePieceAttemptRecording(
  pieceId: string,
  attemptId: string,
  blob: Blob,
): Promise<void> {
  const current = (await readPieceRecordings(pieceId)) ?? {};
  current[attemptId] = blob;
  if (typeof indexedDB === "undefined") {
    recordingMemory.set(pieceId, current);
    return;
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(RECORDING_STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
    tx.objectStore(RECORDING_STORE).put(current, pieceId);
  });
  db.close();
}

export async function readPieceAttemptRecording(
  pieceId: string,
  attemptId: string,
): Promise<Blob | null> {
  const all = await readPieceRecordings(pieceId);
  return all?.[attemptId] ?? null;
}

async function readPieceRecordings(
  pieceId: string,
): Promise<Record<string, Blob> | null> {
  if (typeof indexedDB === "undefined") {
    return recordingMemory.get(pieceId) ?? null;
  }
  const db = await openDb();
  const value = await new Promise<Record<string, Blob> | null>((resolve, reject) => {
    if (!db.objectStoreNames.contains(RECORDING_STORE)) {
      resolve(null);
      return;
    }
    const tx = db.transaction(RECORDING_STORE, "readonly");
    const req = tx.objectStore(RECORDING_STORE).get(pieceId);
    req.onsuccess = () => {
      const raw = req.result;
      if (!raw || typeof raw !== "object") {
        resolve(null);
        return;
      }
      resolve(raw as Record<string, Blob>);
    };
    req.onerror = () => reject(req.error ?? new Error("IndexedDB read failed"));
  });
  db.close();
  return value;
}

function isFeedbackReport(value: unknown): value is PieceFeedbackReportV1 {
  if (!value || typeof value !== "object") return false;
  const report = value as PieceFeedbackReportV1;
  return (
    report.schemaVersion === 1 &&
    typeof report.pieceId === "string" &&
    typeof report.attemptId === "string" &&
    Array.isArray(report.skills) &&
    Array.isArray(report.events)
  );
}

async function readPieceFeedbackMap(
  pieceId: string,
): Promise<Record<string, PieceFeedbackReportV1> | null> {
  if (typeof indexedDB === "undefined") {
    return feedbackMemory.get(pieceId) ?? null;
  }
  const db = await openDb();
  const value = await new Promise<Record<string, PieceFeedbackReportV1> | null>(
    (resolve, reject) => {
      if (!db.objectStoreNames.contains(FEEDBACK_STORE)) {
        resolve(null);
        return;
      }
      const tx = db.transaction(FEEDBACK_STORE, "readonly");
      const req = tx.objectStore(FEEDBACK_STORE).get(pieceId);
      req.onsuccess = () => {
        const raw = req.result;
        if (!raw || typeof raw !== "object") {
          resolve(null);
          return;
        }
        const next: Record<string, PieceFeedbackReportV1> = {};
        for (const [attemptId, report] of Object.entries(
          raw as Record<string, unknown>,
        )) {
          if (isFeedbackReport(report)) next[attemptId] = report;
        }
        resolve(next);
      };
      req.onerror = () => reject(req.error ?? new Error("IndexedDB read failed"));
    },
  );
  db.close();
  return value;
}

async function writePieceFeedbackMap(
  pieceId: string,
  reports: Record<string, PieceFeedbackReportV1>,
): Promise<void> {
  if (typeof indexedDB === "undefined") {
    feedbackMemory.set(pieceId, reports);
    return;
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FEEDBACK_STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
    tx.objectStore(FEEDBACK_STORE).put(reports, pieceId);
  });
  db.close();
}

export async function savePieceFeedbackReport(
  pieceId: string,
  report: PieceFeedbackReportV1,
): Promise<void> {
  const current = (await readPieceFeedbackMap(pieceId)) ?? {};
  current[report.attemptId] = report;
  await writePieceFeedbackMap(pieceId, current);
}

export async function readPieceFeedbackReport(
  pieceId: string,
  attemptId: string,
): Promise<PieceFeedbackReportV1 | null> {
  const all = await readPieceFeedbackMap(pieceId);
  return all?.[attemptId] ?? null;
}

export async function readPieceFeedbackHistory(
  pieceId: string,
): Promise<PieceFeedbackReportV1[]> {
  const all = await readPieceFeedbackMap(pieceId);
  if (!all) return [];
  return Object.values(all);
}

export async function removePieceFeedbackReport(
  pieceId: string,
  attemptId: string,
): Promise<void> {
  const current = (await readPieceFeedbackMap(pieceId)) ?? {};
  if (!(attemptId in current)) return;
  delete current[attemptId];
  await writePieceFeedbackMap(pieceId, current);
}

export async function removePieceAttemptRecording(
  pieceId: string,
  attemptId: string,
): Promise<void> {
  const current = (await readPieceRecordings(pieceId)) ?? {};
  if (!(attemptId in current)) return;
  delete current[attemptId];
  if (typeof indexedDB === "undefined") {
    recordingMemory.set(pieceId, current);
    return;
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(RECORDING_STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
    tx.objectStore(RECORDING_STORE).put(current, pieceId);
  });
  db.close();
}

export async function removePieceOriginalFile(pieceId: string): Promise<void> {
  fileMemory.delete(pieceId);
  scoreMemory.delete(pieceId);
  xmlMemory.delete(pieceId);
  recordingMemory.delete(pieceId);
  feedbackMemory.delete(pieceId);
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const names = [FILE_STORE, SCORE_STORE];
    if (db.objectStoreNames.contains(XML_STORE)) names.push(XML_STORE);
    if (db.objectStoreNames.contains(RECORDING_STORE)) names.push(RECORDING_STORE);
    if (db.objectStoreNames.contains(FEEDBACK_STORE)) names.push(FEEDBACK_STORE);
    const tx = db.transaction(names, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
    tx.objectStore(FILE_STORE).delete(pieceId);
    tx.objectStore(SCORE_STORE).delete(pieceId);
    if (db.objectStoreNames.contains(XML_STORE)) {
      tx.objectStore(XML_STORE).delete(pieceId);
    }
    if (db.objectStoreNames.contains(RECORDING_STORE)) {
      tx.objectStore(RECORDING_STORE).delete(pieceId);
    }
    if (db.objectStoreNames.contains(FEEDBACK_STORE)) {
      tx.objectStore(FEEDBACK_STORE).delete(pieceId);
    }
  });
  db.close();
}

/** Drop reconstructed digital score data while keeping the original upload. */
export async function clearPieceDigitalScore(pieceId: string): Promise<void> {
  scoreMemory.delete(pieceId);
  xmlMemory.delete(pieceId);
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const names = [SCORE_STORE];
    if (db.objectStoreNames.contains(XML_STORE)) names.push(XML_STORE);
    const tx = db.transaction(names, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
    tx.objectStore(SCORE_STORE).delete(pieceId);
    if (db.objectStoreNames.contains(XML_STORE)) {
      tx.objectStore(XML_STORE).delete(pieceId);
    }
  });
  db.close();
}

export function clearPieceFileMemory(): void {
  fileMemory.clear();
  scoreMemory.clear();
  xmlMemory.clear();
  recordingMemory.clear();
  feedbackMemory.clear();
}
