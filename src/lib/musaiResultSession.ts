export const MUSAI_INTONATION_RESULT_KEY = "musai-intonation-result-v1";

export type StoredIntonationResult = {
  detectedHz: number;
  targetHz: number;
  cents: number;
  label: string;
  score: number;
  validFrames: number;
  totalFrames: number;
  sampleRateHz: number;
  /** e.g. "A4" — from `formatNoteLabel(midi)` at analysis time */
  targetNoteLabel: string;
};

export function persistIntonationResult(data: StoredIntonationResult): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(MUSAI_INTONATION_RESULT_KEY, JSON.stringify(data));
}

export function readIntonationResult(): StoredIntonationResult | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(MUSAI_INTONATION_RESULT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as StoredIntonationResult;
    if (
      typeof v.detectedHz !== "number" ||
      typeof v.targetHz !== "number" ||
      typeof v.cents !== "number" ||
      typeof v.label !== "string" ||
      typeof v.score !== "number"
    ) {
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

export function clearIntonationResult(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(MUSAI_INTONATION_RESULT_KEY);
}
