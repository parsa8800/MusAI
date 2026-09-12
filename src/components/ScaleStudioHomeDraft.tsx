"use client";

import { STAVE_LINE_SPACING_PX } from "@/lib/vexflowScaleSpelling";

const draftFrameClass =
  "musai-notes-draft-frame w-full overflow-hidden rounded-[var(--musai-radius-lg)]";

/**
 * Engraving proportions mirrored from ScaleTrebleStaff / VexFlow / Bravura:
 * same staff space as live notation; stem ≈ 3.2 spaces; SMuFL gClef on the G line.
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
/** Pull stem slightly into the head so stroke ends don’t leave a hairline gap. */
const STEM_OVERLAP = 1.35;
/** Horizontal gap between note centres — roomy like the real staff formatter. */
const NOTE_GAP = SPACE * 2.15;
/** SMuFL gClef (Bravura) — same glyph family VexFlow uses for treble. */
const CLEF_GLYPH = "\uE050";
/** Bravura advance width of gClef, in staff spaces. */
const CLEF_ADVANCE = 2.684;
/**
 * Bravura gClef bbox relative to origin on the G line (staff spaces):
 * top +4.392, bottom −2.632 → ~1.4 above staff, ~1.6 below.
 */
const CLEF_ABOVE = 1.45;
const CLEF_BELOW = 1.75;
const CLEF_X = SPACE * 1.1;
/** Staff steps from the top line (0 = top line, 8 = bottom line). G line = 6. */
const MID_STEP = 4;
const G_STEP = 6;

/**
 * Irregular draft pitches — not an ascending/descending scale, so it can’t be
 * mistaken for an exercise. All stems follow live engraving rules; inactivity
 * comes from fade + non-scale contour, not broken proportions.
 */
const GHOST_NOTES = [
  { step: 6 },
  { step: 3 },
  { step: 5 },
  { step: 1 },
  { step: 7 },
  { step: 4 },
  { step: 2 },
] as const;

function noteY(step: number): number {
  return STAFF_TOP + step * (SPACE / 2);
}

const STAFF_TOP = Math.ceil(Math.max(STEM_LEN * 0.5, SPACE * CLEF_ABOVE) + 4);
const STAFF_YS = [0, 1, 2, 3, 4].map((i) => STAFF_TOP + i * SPACE);
const G_LINE_Y = noteY(G_STEP);
const FIRST_NOTE_X = CLEF_X + CLEF_ADVANCE * SPACE + SPACE * 0.95;
const VIEW_W =
  FIRST_NOTE_X + (GHOST_NOTES.length - 1) * NOTE_GAP + HEAD_RX + SPACE * 1.4;
const VIEW_H =
  STAFF_TOP +
  4 * SPACE +
  Math.max(STEM_LEN * 0.5, SPACE * CLEF_BELOW) +
  6;

/** Stem up below the middle line; stem down on/above it (standard engraving). */
function stemUp(step: number): boolean {
  return step > MID_STEP;
}

/**
 * Empty notes pane — faded staff + clef + ghost notes, not playable notation.
 * Real coloured notes replace this after a take is analysed.
 */
export function DraftNotesFrame({ className = "" }: { className?: string }) {
  return (
    <div
      className={`${draftFrameClass} flex min-h-0 w-full flex-1 flex-col justify-center px-3 py-3 sm:px-5 ${className}`.trim()}
      role="img"
      aria-label="Your notes and feedback will appear here"
    >
      <div className="musai-notes-placeholder">
        <svg
          className="musai-notes-placeholder__art"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="xMidYMid meet"
          fill="none"
          aria-hidden
        >
          {STAFF_YS.map((y) => (
            <line
              key={y}
              className="musai-notes-placeholder__line"
              x1={SPACE * 0.7}
              y1={y}
              x2={VIEW_W - SPACE * 0.9}
              y2={y}
            />
          ))}

          {/*
            Bravura SMuFL gClef — origin sits on the G line (2nd from bottom),
            font-size = 4 staff spaces (SMuFL em = staff height).
          */}
          <text
            className="musai-notes-placeholder__clef"
            x={CLEF_X}
            y={G_LINE_Y}
            fontSize={SPACE * 4}
            textRendering="geometricPrecision"
          >
            {CLEF_GLYPH}
          </text>

          {GHOST_NOTES.map((note, i) => {
            const x = FIRST_NOTE_X + i * NOTE_GAP;
            const y = noteY(note.step);
            const up = stemUp(note.step);
            // Stem on the notehead rim (right for up, left for down), not mid-head.
            const stemX = up ? x + HEAD_RIM_X - 0.55 : x - HEAD_RIM_X + 0.55;
            const stemY1 = up ? y + STEM_OVERLAP : y - STEM_OVERLAP;
            const stemY2 = up ? y - STEM_LEN : y + STEM_LEN;
            return (
              <g key={`${note.step}-${i}`} className="musai-notes-placeholder__note">
                {/* Stem under head so the oval covers the join cleanly. */}
                <line
                  className="musai-notes-placeholder__stem"
                  x1={stemX}
                  y1={stemY1}
                  x2={stemX}
                  y2={stemY2}
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
