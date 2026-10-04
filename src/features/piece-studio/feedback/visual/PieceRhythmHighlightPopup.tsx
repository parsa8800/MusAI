"use client";

import { useEffect, useState } from "react";
import type { RhythmHighlightNote } from "@/features/piece-studio/feedback/visual/pieceRhythmScoreMap";
import { prefersReducedMotion } from "@/lib/motion";

function revealNotes(
  notes: readonly RhythmHighlightNote[],
  count: number,
): RhythmHighlightNote[] {
  let left = count;
  const shown: RhythmHighlightNote[] = [];
  for (const item of notes) {
    if (left <= 0) break;
    const problem = item.problem.slice(0, left);
    left -= problem.length;
    const fixFull = item.fix ?? "";
    const fix = left > 0 ? fixFull.slice(0, left) : "";
    left -= Math.min(left, fixFull.length);
    if (!problem && !fix) break;
    shown.push({
      note: item.note,
      problem,
      fix: fix ? fix : null,
    });
  }
  return shown;
}

/**
 * Closeable explanation for one rhythm rectangle.
 * The first time a highlight is opened, the note types in like the coach.
 * Opening that same highlight again shows the finished text.
 */
export function PieceRhythmHighlightPopup({
  place,
  notes,
  memoryKey,
  claimFresh,
  onClose,
}: {
  place: string | null;
  notes: readonly RhythmHighlightNote[];
  memoryKey: string;
  /** Returns true only the first time this highlight is opened. */
  claimFresh: (key: string) => boolean;
  onClose: () => void;
}) {
  const script = notes
    .map((item) => item.problem + (item.fix ?? ""))
    .join("");
  const [play] = useState(
    () => claimFresh(memoryKey) && !prefersReducedMotion(),
  );
  const [phase, setPhase] = useState<"thinking" | "typing" | "done">(
    () => (play ? "thinking" : "done"),
  );
  const [shown, setShown] = useState(() => (play ? "" : script));

  useEffect(() => {
    if (phase !== "thinking") return;
    const t = window.setTimeout(() => setPhase("typing"), 700);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "typing") return;
    if (!script) {
      setPhase("done");
      return;
    }
    setShown("");
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setShown(script.slice(0, i));
      if (i >= script.length) {
        window.clearInterval(id);
        setPhase("done");
      }
    }, 16);
    return () => window.clearInterval(id);
  }, [phase, script]);

  const typing = phase === "typing" && shown.length < script.length;
  const visibleNotes = phase === "done" ? notes : revealNotes(notes, shown.length);

  return (
    <div
      className="musai-rhythm-popup"
      role="dialog"
      aria-label={place ? `Rhythm in ${place}` : "Rhythm"}
      data-testid="rhythm-highlight-popup"
      data-typing={typing || phase === "thinking" ? "true" : "false"}
    >
      <button
        type="button"
        className="musai-pressable musai-rhythm-popup__close"
        aria-label="Close"
        onClick={onClose}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {phase === "thinking" ? (
        <div className="musai-coach-typing" aria-label="Thinking">
          <i aria-hidden />
          <i aria-hidden />
          <i aria-hidden />
        </div>
      ) : (
        <>
          {place ? <p className="musai-rhythm-popup__place">{place}</p> : null}
          {visibleNotes.length > 0 ? (
            <ul className="musai-rhythm-popup__notes">
              {visibleNotes.map((item, index) => {
                const last = index === visibleNotes.length - 1;
                const fixTyping = typing && last && item.problem.length === notes[index]?.problem.length;
                const problemTyping = typing && last && !fixTyping;
                return (
                  <li key={`${item.note}-${index}`}>
                    <p className="musai-rhythm-popup__letter">{item.note}</p>
                    {item.problem ? (
                      <p className="musai-rhythm-popup__row">
                        <span
                          className="musai-rhythm-popup__mark musai-rhythm-popup__mark--wrong"
                          aria-hidden
                        />
                        <span className="sr-only">What went wrong. </span>
                        <span>
                          {item.problem}
                          {problemTyping ? (
                            <span
                              className="musai-chat-caret ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.12em] bg-[var(--musai-accent)] align-baseline"
                              aria-hidden
                            />
                          ) : null}
                        </span>
                      </p>
                    ) : null}
                    {item.fix ? (
                      <p className="musai-rhythm-popup__row">
                        <span
                          className="musai-rhythm-popup__mark musai-rhythm-popup__mark--fix"
                          aria-hidden
                        />
                        <span className="sr-only">What to try. </span>
                        <span>
                          {item.fix}
                          {fixTyping ? (
                            <span
                              className="musai-chat-caret ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.12em] bg-[var(--musai-accent)] align-baseline"
                              aria-hidden
                            />
                          ) : null}
                        </span>
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}
