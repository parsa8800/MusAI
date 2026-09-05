"use client";

import Link from "next/link";
import { useAnimeEntrance } from "@/hooks/useAnimeEntrance";

/**
 * Practice hub exercises grid with staggered Anime.js entrance.
 * Keeps the existing glass card visual language.
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
        className="mb-8 text-center text-xl font-semibold tracking-tight text-white sm:mb-10 sm:text-2xl"
      >
        Exercises
      </h2>
      <div className="grid w-full grid-cols-1 gap-4 p-0.5 sm:grid-cols-2 sm:gap-5">
        <Link
          data-anime-enter
          href="/practice/tuner"
          className="group relative block overflow-hidden rounded-[1.5rem] px-7 py-8 text-left musai-glass-panel musai-glass-card musai-glass-card--amber"
        >
          <div
            className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100"
            aria-hidden
            style={{
              background:
                "radial-gradient(ellipse 120% 85% at 15% -5%, rgba(251,191,36,0.14) 0%, rgba(251,191,36,0.03) 48%, transparent 88%)",
            }}
          />
          <div className="relative z-10">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-400/90">
              Tuner
            </p>
            <p className="mt-3 text-xl font-semibold tracking-tight text-white">
              Violin tuner
            </p>
            <p className="mt-2 text-[13px] leading-snug text-zinc-500">
              Open strings, live pitch.
            </p>
          </div>
        </Link>

        <Link
          data-anime-enter
          href="/practice/single-note"
          className="group relative block overflow-hidden rounded-[1.5rem] px-7 py-8 text-left musai-glass-panel musai-glass-card musai-glass-card--emerald"
        >
          <div
            className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100"
            aria-hidden
            style={{
              background:
                "radial-gradient(ellipse 120% 85% at 15% -5%, rgba(16,185,129,0.12) 0%, rgba(16,185,129,0.03) 48%, transparent 88%)",
            }}
          />
          <div className="relative z-10">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-400/90">
              Single note
            </p>
            <p className="mt-3 text-xl font-semibold tracking-tight text-white">
              Tuning trainer
            </p>
            <p className="mt-2 text-[13px] leading-snug text-zinc-500">
              One pitch, clear feedback.
            </p>
          </div>
        </Link>

        <Link
          data-anime-enter
          href="/practice/scale"
          className="group relative block overflow-hidden rounded-[1.5rem] px-7 py-8 text-left musai-glass-panel musai-glass-card musai-glass-card--sky"
        >
          <div
            className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100"
            aria-hidden
            style={{
              background:
                "radial-gradient(ellipse 120% 85% at 15% -5%, rgba(56,189,248,0.12) 0%, rgba(56,189,248,0.03) 48%, transparent 88%)",
            }}
          />
          <div className="relative z-10">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-sky-400/90">
              Scale
            </p>
            <p className="mt-3 text-xl font-semibold tracking-tight text-white">
              Scale studio
            </p>
            <p className="mt-2 text-[13px] leading-snug text-zinc-500">
              Full scale readout.
            </p>
          </div>
        </Link>

        <div
          data-anime-enter
          className="musai-glass-panel musai-glass-panel--muted rounded-[1.5rem] px-7 py-8 text-left sm:col-span-2"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
            Soon
          </p>
          <p className="mt-3 text-sm font-semibold tracking-tight text-zinc-400">
            Shifting · Drills
          </p>
        </div>
      </div>
    </section>
  );
}
