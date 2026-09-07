import Link from "next/link";
import { HomeMusicMotifs } from "@/components/HomeMusicMotifs";
import { PracticeHubExercises } from "@/components/PracticeHubExercises";
import { SiteFooter } from "@/components/SiteFooter";

export default function Home() {
  return (
    <>
      <div className="relative flex min-h-full flex-col items-center px-5 pb-16 pt-16 sm:px-8 sm:pb-20 sm:pt-20">
        <HomeMusicMotifs />

        <Link
          href="/settings"
          className="musai-pressable absolute right-[max(1.25rem,env(safe-area-inset-right))] top-[max(1.25rem,env(safe-area-inset-top))] z-[2] inline-flex min-h-10 items-center gap-1.5 rounded-[var(--musai-radius)] border border-[var(--musai-border)] bg-[var(--musai-surface)] px-3 py-2 text-[12px] font-medium text-[var(--musai-muted)] shadow-[var(--musai-shadow)] hover:border-[color-mix(in_srgb,var(--musai-accent)_28%,var(--musai-border))] hover:text-[var(--musai-ink)] sm:right-8 sm:top-6"
          aria-label="Open settings"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          Settings
        </Link>

        <header className="relative z-[1] mb-12 w-full max-w-2xl text-center sm:mb-14">
          <div className="relative mx-auto flex flex-col items-center gap-2">
            <div className="musai-hero-brand flex flex-col items-center gap-2">
              <div className="musai-wordmark-glow">
                <h1 className="musai-wordmark text-5xl sm:text-6xl md:text-7xl">
                  <span className="musai-wordmark__mus">Mus</span>
                  <span className="musai-wordmark__ai">AI</span>
                </h1>
              </div>
            </div>
          </div>
        </header>

        <div className="relative z-[1] w-full max-w-3xl">
          <PracticeHubExercises />
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
