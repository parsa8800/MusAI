import Link from "next/link";
import { ScalePracticeFlow } from "@/components/ScalePracticeFlow";

export default function ScalePracticePage() {
  return (
    <div className="flex min-h-full flex-col items-center px-4 pb-24 pt-12 sm:px-8 sm:pt-14">
      <header className="mb-10 w-full max-w-2xl sm:mb-12">
        <div className="rounded-3xl border border-white/[0.1] bg-white/[0.04] px-6 py-7 text-center shadow-[0_16px_48px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl sm:px-10 sm:py-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-sky-400/85">
            Scale practice
          </p>
          <h1 className="mt-2 bg-gradient-to-br from-white via-white to-zinc-300 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
            Scale studio
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-[13px] leading-relaxed text-zinc-500">
            Choose a scale, read the staff, record when you are ready.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center justify-center rounded-full border border-white/15 bg-black/25 px-5 py-2.5 text-xs font-semibold text-zinc-200/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:bg-black/35"
          >
            ← Single-note intonation
          </Link>
        </div>
      </header>
      <ScalePracticeFlow />
    </div>
  );
}
