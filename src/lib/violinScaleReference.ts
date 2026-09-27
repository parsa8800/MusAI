import { getInstrument } from "@/lib/instrument/catalog";
import {
  stepReference,
  stringFingerLabel,
  type ScaleStepRef,
} from "@/lib/instrument/fingering";

export type ViolinScaleStepRef = ScaleStepRef;

/** @deprecated Use stepReference(midi, instrument) from @/lib/instrument */
export function violinStepReference(midi: number): ViolinScaleStepRef {
  return stepReference(midi, getInstrument("violin"));
}

/** @deprecated Use stringFingerLabel(midi, instrument) from @/lib/instrument */
export function violinStringFingerLabel(midi: number): string {
  return stringFingerLabel(midi, getInstrument("violin"));
}
