"use client";

import Link from "next/link";
import { useAnimeEntrance } from "@/hooks/useAnimeEntrance";

const exercises = [
  {
    href: "/practice/tuner",
    label: "Violin tuner",
    tone: "tuner",
    span: false,
  },
  {
    href: "/practice/single-note",
    label: "Tuning trainer",
    tone: "trainer",
    span: false,
  },
  {
    href: "/practice/scale",
    label: "Scale studio",
    tone: "scale",
    span: true,
  },
] as const;

/**
 * Practice hub exercises — titles only; each tool has a colour cue.
 */
export function PracticeHubExercises() {
  const ref = useAnimeEntrance<HTMLElement>({ delay: 120 });

  return (
    <section
      ref={ref}
      id="features"
      aria-labelledby="features-heading"
      className="w-full max-w-3xl scroll-mt-8"
    >
      <h2
        data-anime-enter
        id="features-heading"
        className="font-display mb-8 text-center text-xl font-semibold tracking-tight text-[var(--musai-ink)] sm:mb-10 sm:text-2xl"
      >
        Exercises
      </h2>
      <div className="grid w-full grid-cols-1 gap-4 p-0.5 sm:grid-cols-2 sm:gap-5">
        {exercises.map((ex) => (
          <Link
            key={ex.href}
            data-anime-enter
            href={ex.href}
            className={`musai-exercise-card musai-exercise-card--${ex.tone}${
              ex.span ? " sm:col-span-2" : ""
            }`}
          >
            <p className="font-display text-xl font-semibold tracking-tight text-[var(--musai-ink)]">
              {ex.label}
            </p>
          </Link>
        ))}

        <div
          data-anime-enter
          className="musai-exercise-card musai-exercise-card--piece sm:col-span-2"
          aria-disabled="true"
        >
          <p className="font-display text-xl font-semibold tracking-tight text-[var(--musai-ink)]">
            Piece studio
          </p>
          <p className="mt-1.5 text-[13px] font-medium text-[var(--musai-muted)]">
            Coming soon · play a piece, get feedback
          </p>
        </div>
      </div>
    </section>
  );
}
