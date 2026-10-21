/**
 * Scale Studio public surface.
 * Routes may import from here. Shared pitch DSP stays in `@/lib/analyzePitch`.
 * Do not import Piece Studio catalog, OSMD, or piece feedback through this barrel.
 */
export { ScaleStudioSelector } from "@/features/scale-studio/ScaleStudioSelector";
export { ScaleWorkspace } from "@/features/scale-studio/ScaleWorkspace";
export {
  parseScaleWorkspaceSlug,
  scaleWorkspaceHref,
  progressKeyFor,
} from "@/features/scale-studio/scaleWorkspaceRoutes";
export type { ScaleWorkspaceIdentity } from "@/features/scale-studio/scaleWorkspaceRoutes";
export type { ScalePracticeSessionV1 } from "@/features/scale-studio/scalePracticeTypes";
