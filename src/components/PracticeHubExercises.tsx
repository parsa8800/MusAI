"use client";

import Link from "next/link";
import { useAnimeEntrance } from "@/hooks/useAnimeEntrance";

/**
 * Practice hub exercises — titles only; purpose is clear from each name.
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
        <Link
          data-anime-enter
          href="/practice/tuner"
          className="group relative block overflow-hidden rounded-[var(--musai-radius-lg)] px-7 py-8 text-left musai-glass-panel musai-glass-card before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-[var(--musai-accent)] before:opacity-0 before:transition-opacity before:duration-200 hover:before:opacity-100"
        >
          <div className="relative z-10">
            <p className="font-display text-xl font-semibold tracking-tight text-[var(--musai-ink)]">
              Violin tuner
            </p>
          </div>
        </Link>

        <Link
          data-anime-enter
          href="/practice/single-note"
          className="group relative block overflow-hidden rounded-[var(--musai-radius-lg)] px-7 py-8 text-left musai-glass-panel musai-glass-card before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-[var(--musai-key-flat)] before:opacity-0 before:transition-opacity before:duration-200 hover:before:opacity-100"
        >
          <div className="relative z-10">
            <p className="font-display text-xl font-semibold tracking-tight text-[var(--musai-ink)]">
              Tuning trainer
            </p>
          </div>
        </Link>

        <Link
          data-anime-enter
          href="/practice/scale"
          className="group relative block overflow-hidden rounded-[var(--musai-radius-lg)] px-7 py-8 text-left musai-glass-panel musai-glass-card sm:col-span-2 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-[var(--musai-accent-2)] before:opacity-0 before:transition-opacity before:duration-200 hover:before:opacity-100"
        >
          <div className="relative z-10">
            <p className="font-display text-xl font-semibold tracking-tight text-[var(--musai-ink)]">
              Scale studio
            </p>
          </div>
        </Link>

        <div
          data-anime-enter
          className="musai-glass-panel musai-glass-panel--muted rounded-[var(--musai-radius-lg)] px-7 py-8 text-left sm:col-span-2"
        >
          <p className="text-sm font-semibold tracking-tight text-[var(--musai-muted)]">
            Coming soon
          </p>
        </div>
      </div>
    </section>
  );
}
