import type { OpenString, OpenStringId } from "@/lib/instrument/types";

export const OPEN_STRINGS: Record<OpenStringId, OpenString> = {
  C: { id: "C", pitchClass: 0, midi: 48 },
  G: { id: "G", pitchClass: 7, midi: 55 },
  D: { id: "D", pitchClass: 2, midi: 62 },
  A: { id: "A", pitchClass: 9, midi: 69 },
  E: { id: "E", pitchClass: 4, midi: 76 },
};

export function openStringById(id: OpenStringId): OpenString {
  return OPEN_STRINGS[id];
}
