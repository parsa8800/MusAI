import type { MusaiScoreV1, ScoreMeasure } from "@/features/piece-studio/score/musaiScore";

export type RecognitionAssessment = {
  /** Subtle student-facing prompts (no jargon). */
  hints: string[];
  /** 0-based measure to highlight when confidence is uncertain. */
  focusMeasureIndex: number | null;
};

/**
 * Lightweight checks after a page is turned into a digital score.
 * Heuristics for the student — not a vendor confidence score.
 */
export function assessRecognition(score: MusaiScoreV1): RecognitionAssessment {
  const part = score.parts[0];
  const measures = part?.measures ?? [];
  const measureCount = measures.length;

  let notes = 0;
  let emptyMeasureIndex: number | null = null;
  let sparseMeasureIndex: number | null = null;
  let sparseCount = 0;

  measures.forEach((measure, index) => {
    let measureNotes = 0;
    let measureRests = 0;
    for (const event of measure.events) {
      if (event.kind === "note") {
        notes += 1;
        measureNotes += 1;
      } else if (event.kind === "rest") {
        measureRests += 1;
      }
    }
    if (measureNotes === 0 && measureRests === 0 && emptyMeasureIndex == null) {
      emptyMeasureIndex = index;
    } else if (measureNotes === 0 && measureRests > 0) {
      sparseCount += 1;
      if (sparseMeasureIndex == null) sparseMeasureIndex = index;
    }
  });

  if (measureCount === 0 || notes === 0) {
    return {
      hints: ["Check this section"],
      focusMeasureIndex: 0,
    };
  }

  if (emptyMeasureIndex != null) {
    return {
      hints: ["Check this section"],
      focusMeasureIndex: emptyMeasureIndex,
    };
  }

  if (sparseCount >= 2 && sparseMeasureIndex != null) {
    return {
      hints: ["Check this section"],
      focusMeasureIndex: sparseMeasureIndex,
    };
  }

  if (measureCount >= 4 && notes / measureCount < 1.2) {
    return {
      hints: ["Check this section"],
      focusMeasureIndex: Math.min(1, measureCount - 1),
    };
  }

  if (measureCount === 1 && notes <= 2) {
    return {
      hints: ["Check this section"],
      focusMeasureIndex: 0,
    };
  }

  // Confident enough — let the side-by-side compare do the work.
  return { hints: [], focusMeasureIndex: null };
}

/** @deprecated Prefer assessRecognition — kept for call sites that only need strings. */
export function assessRecognitionHints(score: MusaiScoreV1): string[] {
  return assessRecognition(score).hints;
}

/** Absolute whole-note span for a measure (for score overlay highlight). */
export function measureWholeNoteSpan(
  score: MusaiScoreV1,
  measureIndex: number,
): { startWholeNotes: number; endWholeNotes: number } | null {
  const measures = score.parts[0]?.measures ?? [];
  if (measureIndex < 0 || measureIndex >= measures.length) return null;

  let startQ = 0;
  for (let i = 0; i < measureIndex; i++) {
    startQ += measureDurationQuarters(measures[i]!);
  }
  const dur = Math.max(measureDurationQuarters(measures[measureIndex]!), 1);
  return {
    startWholeNotes: startQ / 4,
    endWholeNotes: (startQ + dur) / 4,
  };
}

function measureDurationQuarters(measure: ScoreMeasure): number {
  let maxEnd = 0;
  for (const event of measure.events) {
    if (event.kind === "note" || event.kind === "rest") {
      maxEnd = Math.max(maxEnd, event.onsetQuarters + event.durationQuarters);
    }
  }
  if (maxEnd > 0) return maxEnd;
  const beats = measure.time?.beats ?? 4;
  const beatType = measure.time?.beatType ?? 4;
  return beats * (4 / Math.max(1, beatType));
}
