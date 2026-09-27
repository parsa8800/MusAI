"use client";

import { useInstrument } from "@/components/InstrumentProvider";
import { clefGlyph, vexflowClef, type ClefGlyphSpec } from "@/lib/instrument";
import { STAVE_LINE_SPACING_PX } from "@/lib/vexflowScaleSpelling";

const draftFrameClass =
  "musai-notes-draft-frame w-full overflow-hidden rounded-[var(--musai-radius-lg)]";

/**
 * Engraving proportions mirrored from ScaleTrebleStaff / VexFlow / Bravura:
 * same staff space as live notation; stem ≈ 3.2 spaces; SMuFL clef on its origin line.
 */
const SPACE = STAVE_LINE_SPACING_PX;
const STEM_SPACES = 3.2;
const STEM_LEN = SPACE * STEM_SPACES;
/** Bravura-like black notehead oval (≈ 1.18 × 1.0 staff spaces). */
const HEAD_RX = SPACE * 0.59;
const HEAD_RY = SPACE * 0.44;
const HEAD_ROTATE_DEG = -20;
const HEAD_ROTATE = (HEAD_ROTATE_DEG * Math.PI) / 180;
/**
 * Distance from note centre to the oval rim on the note mid-line after
 * rotation — where engraving attaches the stem.
 */
function headRimXAtMidline(): number {
  const t = Math.atan(-(HEAD_RX / HEAD_RY) * Math.tan(HEAD_ROTATE));
  const dx = (phi: number) =>
    HEAD_RX * Math.cos(phi) * Math.cos(HEAD_ROTATE) -
    HEAD_RY * Math.sin(phi) * Math.sin(HEAD_ROTATE);
  return Math.max(Math.abs(dx(t)), Math.abs(dx(t + Math.PI)));
}
const HEAD_RIM_X = headRimXAtMidline();
/** Horizontal gap between note centres — roomy like the real staff formatter. */
const NOTE_GAP = SPACE * 2.15;
const CLEF_X = SPACE * 1.1;
/** Staff steps from the top line (0 = top line, 8 = bottom line). Middle line = 4. */
const MID_STEP = 4;
/** Same width as the live stem, drawn as fill so it is part of the note. */
const STEM_W = 1.65;

/**
 * A short rising line in the feedback colours, so the empty staff shows
 * what a take will look like. Not a named exercise.
 */
const EXAMPLE_SCALE = [
  { step: 7, tone: "ok" },
  { step: 6, tone: "high" },
  { step: 5, tone: "low" },
  { step: 4, tone: "miss" },
  { step: 3, tone: "ok" },
  { step: 2, tone: "high" },
] as const;

function draftStaffMetrics(spec: ClefGlyphSpec) {
  const staffTop = Math.ceil(Math.max(STEM_LEN * 0.5, SPACE * spec.aboveSpaces) + 4);
  const firstNoteX = CLEF_X + spec.advanceSpaces * SPACE + SPACE * 0.95;
  return {
    staffTop,
    staffYs: [0, 1, 2, 3, 4].map((i) => staffTop + i * SPACE),
    originY: staffTop + spec.originStep * (SPACE / 2),
    firstNoteX,
    viewW: firstNoteX + (EXAMPLE_SCALE.length - 1) * NOTE_GAP + HEAD_RX + SPACE * 1.4,
    viewH:
      staffTop +
      4 * SPACE +
      Math.max(STEM_LEN * 0.5, SPACE * spec.belowSpaces) +
      6,
  };
}

/** Stem up below the middle line; stem down on/above it (standard engraving). */
function stemUp(step: number): boolean {
  return step > MID_STEP;
}

/**
 * Empty notes pane — a short colour-coded scale, not playable notation.
 * Real notes from a take replace this after analysis.
 */
export function DraftNotesFrame({ className = "" }: { className?: string }) {
  const { instrument } = useInstrument();
  const spec = clefGlyph(vexflowClef(instrument));
  const { staffTop, staffYs, originY, firstNoteX, viewW, viewH } =
    draftStaffMetrics(spec);
  const noteY = (step: number) => staffTop + step * (SPACE / 2);

  return (
    <div
      className={`${draftFrameClass} flex min-h-0 w-full flex-1 flex-col justify-center px-3 py-3 sm:px-5 ${className}`.trim()}
      role="img"
      aria-label="Example scale with feedback colours. Your notes and feedback will appear here"
    >
      <div className="musai-notes-placeholder">
        <svg
          className="musai-notes-placeholder__art"
          viewBox={`0 0 ${viewW} ${viewH}`}
          preserveAspectRatio="xMidYMid meet"
          fill="none"
          aria-hidden
          data-clef={spec.clef}
        >
          {staffYs.map((y) => (
            <line
              key={y}
              className="musai-notes-placeholder__line"
              x1={SPACE * 0.7}
              y1={y}
              x2={viewW - SPACE * 0.9}
              y2={y}
            />
          ))}

          {/*
            Bravura SMuFL clef — treble origin on the G line, alto on middle C.
            font-size = 4 staff spaces (SMuFL em = staff height).
          */}
          <text
            className="musai-notes-placeholder__clef"
            x={CLEF_X}
            y={originY}
            fontSize={SPACE * 4}
            textRendering="geometricPrecision"
          >
            {spec.glyph}
          </text>

          {EXAMPLE_SCALE.map((note, i) => {
            const x = firstNoteX + i * NOTE_GAP;
            const y = noteY(note.step);
            const up = stemUp(note.step);
            // Stem ends on the note’s mid-line, inside the head, so no cap sticks out.
            const stemX = up
              ? x + HEAD_RIM_X - STEM_W * 0.72
              : x - HEAD_RIM_X + STEM_W * 0.72;
            const stemY = up ? y - STEM_LEN : y;
            return (
              <g
                key={`${note.step}-${i}`}
                className="musai-notes-placeholder__note"
                data-tone={note.tone}
              >
                <rect
                  className="musai-notes-placeholder__stem"
                  x={stemX - STEM_W / 2}
                  y={stemY}
                  width={STEM_W}
                  height={STEM_LEN}
                />
                <ellipse
                  className="musai-notes-placeholder__head"
                  cx={x}
                  cy={y}
                  rx={HEAD_RX}
                  ry={HEAD_RY}
                  transform={`rotate(${HEAD_ROTATE_DEG} ${x} ${y})`}
                />
              </g>
            );
          })}
        </svg>
        <div className="musai-notes-placeholder__copy-block">
          <p className="musai-notes-placeholder__copy">
            Your notes and feedback will appear here
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Empty tips / coach pane — reads as a chat waiting for the student.
 * Real coach thread replaces this after a take is analysed.
 */
export function DraftTipsFrame({
  className = "",
  title = "Tips",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <div
      className={`musai-tips-empty ${className}`.trim()}
      aria-label={`${title}. Ask your coach`}
    >
      <h2 className="musai-tips-empty__title font-display">{title}</h2>

      <div className="musai-tips-empty__body">
        <span className="musai-tips-empty__icon" aria-hidden>
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5.5 6.75h13a1.75 1.75 0 0 1 1.75 1.75v7a1.75 1.75 0 0 1-1.75 1.75H11l-3.75 2.75V17.25H5.5A1.75 1.75 0 0 1 3.75 15.5v-7A1.75 1.75 0 0 1 5.5 6.75Z"
            />
            <path
              strokeLinecap="round"
              d="M8.25 11h.01M12 11h.01M15.75 11h.01"
            />
          </svg>
        </span>
      </div>

      <form
        className="musai-tips-empty__composer"
        onSubmit={(e) => e.preventDefault()}
        aria-label="Ask your coach"
      >
        <div className="musai-tips-empty__field">
          <label className="sr-only" htmlFor="musai-tips-empty-input">
            Ask your coach
          </label>
          <textarea
            id="musai-tips-empty-input"
            rows={1}
            disabled
            placeholder="Ask your coach..."
            className="musai-tips-empty__input"
          />
          <button
            type="submit"
            disabled
            aria-label="Send"
            className="musai-tips-empty__send"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              aria-hidden
            >
              <path
                d="M12 19V5M12 5l-5 5M12 5l5 5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
