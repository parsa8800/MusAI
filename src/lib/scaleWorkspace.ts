import {
  scaleDisplayLabel,
  scaleIdFor,
  type ScaleKind,
} from "@/lib/scales";

export type ScaleWorkspaceIdentity = {
  scaleId: string;
  scaleLabel: string;
  scaleKind: ScaleKind;
  tonicPitchClass: number;
  octaveSpan: 1 | 2;
  progressKey: string;
  slug: string;
};

/** Journey key: scale + octave (range/root is settings within the page). */
export function progressKeyFor(
  scaleId: string,
  octaveSpan: 1 | 2,
): string {
  return `${scaleId}__${octaveSpan}`;
}

export function scaleWorkspaceSlug(
  scaleId: string,
  octaveSpan: 1 | 2,
): string {
  return `${scaleId.replace(/_/g, "-").toLowerCase()}-${octaveSpan}oct`;
}

export function scaleWorkspaceHref(
  scaleId: string,
  octaveSpan: 1 | 2,
  rootMidi?: number,
): string {
  const base = `/practice/scale/${scaleWorkspaceSlug(scaleId, octaveSpan)}`;
  if (typeof rootMidi === "number" && Number.isFinite(rootMidi)) {
    return `${base}?root=${Math.round(rootMidi)}`;
  }
  return base;
}

export function workspaceTitle(
  scaleLabel: string,
  octaveSpan: 1 | 2,
): string {
  return `${scaleLabel} · ${octaveSpan === 2 ? "2 octaves" : "1 octave"}`;
}

/** Resolve a URL slug to a workspace identity, or null if unknown. */
export function parseScaleWorkspaceSlug(
  slug: string,
): ScaleWorkspaceIdentity | null {
  const normalized = slug.trim().toLowerCase();
  for (let pc = 0; pc < 12; pc++) {
    for (const kind of ["major", "natural_minor"] as const) {
      const scaleId = scaleIdFor(pc, kind);
      for (const span of [1, 2] as const) {
        if (scaleWorkspaceSlug(scaleId, span) === normalized) {
          return {
            scaleId,
            scaleLabel: scaleDisplayLabel(pc, kind),
            scaleKind: kind,
            tonicPitchClass: pc,
            octaveSpan: span,
            progressKey: progressKeyFor(scaleId, span),
            slug: scaleWorkspaceSlug(scaleId, span),
          };
        }
      }
    }
  }
  return null;
}

export function identityFromSelection(
  tonicPitchClass: number,
  scaleKind: ScaleKind,
  octaveSpan: 1 | 2,
): ScaleWorkspaceIdentity {
  const scaleId = scaleIdFor(tonicPitchClass, scaleKind);
  return {
    scaleId,
    scaleLabel: scaleDisplayLabel(tonicPitchClass, scaleKind),
    scaleKind,
    tonicPitchClass,
    octaveSpan,
    progressKey: progressKeyFor(scaleId, octaveSpan),
    slug: scaleWorkspaceSlug(scaleId, octaveSpan),
  };
}
