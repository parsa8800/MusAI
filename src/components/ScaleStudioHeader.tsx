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
        className="musai-studio-title inline-flex items-center justify-center rounded-2xl border border-sky-400/18 bg-gradient-to-b from-white/[0.08] to-white/[0.03] px-7 py-3 text-3xl font-semibold tracking-tight text-zinc-50 shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset,0_10px_36px_rgba(14,165,233,0.08)] sm:px-9 sm:py-3.5 sm:text-4xl"
      >
        Scale studio
      </h1>
    </header>
  );
}
