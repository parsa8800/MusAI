import type { CursorPose } from "@/features/piece-studio/score/cursorTrack";
import type { PieceOsmdTheme } from "@/features/piece-studio/score/osmdTheme";
import type {
  ScoreLayoutMetrics,
  ScorePaintOptions,
} from "@/features/piece-studio/score/scorePresentation";
import type { ScoreRenderSource } from "@/features/piece-studio/score/scoreRenderSource";

/**
 * Notation engine contract. Piece Studio UI talks to this — never to a
 * vendor SDK. Playback timing still comes from MusaiScoreV1.
 */
export type ScoreRenderer = {
  readonly id: string;
  mount(host: HTMLElement): Promise<void>;
  load(source: ScoreRenderSource): Promise<void>;
  /**
   * Apply theme + presentation layout and paint into the host.
   * Returns engraved metrics for the Score viewer chrome.
   */
  paint(
    theme: PieceOsmdTheme,
    options?: ScorePaintOptions,
  ): ScoreLayoutMetrics;
  /**
   * Walk the engraved cursor for on-screen poses.
   * When `noteTimes` is provided, MusaiScore note seconds own the clock;
   * OSMD only supplies x/y (Listen playhead accuracy).
   */
  collectCursorSnapshots(
    wrap: HTMLElement,
    wholeNotesToSeconds: (wholeNotes: number) => number,
    noteTimes?: readonly { startSec: number; endSec: number }[],
  ): CursorPose[];
  /** Show only one engraved page (Page mode). No-op for Continuous. */
  setVisiblePage?(pageIndex: number): void;
  dispose(): void;
};

export type ScoreRendererFactory = () => ScoreRenderer;
