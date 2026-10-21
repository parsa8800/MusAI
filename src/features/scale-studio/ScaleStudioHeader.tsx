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
        className="musai-page-title font-display"
      >
        Scale studio
      </h1>
    </header>
  );
}
