"use client";

import { useAnimeEntrance } from "@/hooks/useAnimeEntrance";

export function ScaleStudioHeader() {
  const ref = useAnimeEntrance<HTMLElement>({ delay: 40 });

  return (
    <header
      ref={ref}
      className="mb-6 flex w-full max-w-[min(1280px,100%)] flex-col items-center text-center sm:mb-7"
    >
      <h1
        data-anime-enter
        className="font-display text-3xl font-semibold tracking-tight text-[var(--musai-ink)] sm:text-4xl"
      >
        Scale studio
      </h1>
    </header>
  );
}
