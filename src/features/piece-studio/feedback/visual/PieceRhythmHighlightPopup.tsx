"use client";

import { useEffect, useMemo, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * Closeable explanation for one rhythm rectangle.
 * The first time a highlight is opened, the sentence types in like the coach.
 * Opening that same highlight again shows the finished text.
 */
export function PieceRhythmHighlightPopup({
  place,
  line,
  bullets,
  memoryKey,
  claimFresh,
  onClose,
  topic = "Rhythm",
}: {
  place: string | null;
  line?: string;
  bullets?: readonly string[];
  memoryKey: string;
  /** Returns true only the first time this highlight is opened. */
  claimFresh: (key: string) => boolean;
  onClose: () => void;
  topic?: string;
}) {
  const body = useMemo(() => {
    if (bullets && bullets.length > 0) return bullets.join("\n");
    return line ?? "";
  }, [bullets, line]);

  const [play] = useState(
    () => claimFresh(memoryKey) && !prefersReducedMotion(),
  );
  const [phase, setPhase] = useState<"thinking" | "typing" | "done">(
    () => (play ? "thinking" : "done"),
  );
  const [shown, setShown] = useState(() => (play ? "" : body));

  useEffect(() => {
    if (phase !== "thinking") return;
    const t = window.setTimeout(() => setPhase("typing"), 700);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "typing") return;
    if (bullets && bullets.length > 0) {
      setPhase("done");
      return;
    }
    if (!body) {
      setPhase("done");
      return;
    }
    setShown("");
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setShown(body.slice(0, i));
      if (i >= body.length) {
        window.clearInterval(id);
        setPhase("done");
      }
    }, 16);
    return () => window.clearInterval(id);
  }, [phase, body, bullets]);

  const useBullets = Boolean(bullets && bullets.length > 0);
  const typing =
    !useBullets && phase === "typing" && shown.length < body.length;
  const showBody = phase !== "thinking";

  return (
    <div
      className="musai-rhythm-popup"
      role="dialog"
      aria-label={place ? `${topic} in ${place}` : topic}
      data-testid="rhythm-highlight-popup"
      data-typing={typing || phase === "thinking" ? "true" : "false"}
    >
      <button
        type="button"
        className="musai-pressable musai-rhythm-popup__back"
        onClick={onClose}
      >
        All notes
      </button>
      {phase === "thinking" ? (
        <div className="musai-coach-typing" aria-label="Thinking">
          <i aria-hidden />
          <i aria-hidden />
          <i aria-hidden />
        </div>
      ) : null}
      {showBody ? (
        <>
          {place ? <p className="musai-rhythm-popup__place">{place}</p> : null}
          {useBullets ? (
            <ul className="musai-rhythm-popup__points">
              {bullets!.map((item, index) => (
                <li key={`${index}-${item}`}>{item}</li>
              ))}
            </ul>
          ) : body ? (
            <p className="musai-rhythm-popup__line">
              {phase === "done" ? body : shown}
              {typing ? (
                <span
                  className="musai-chat-caret ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.12em] bg-[var(--musai-accent)] align-baseline"
                  aria-hidden
                />
              ) : null}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
