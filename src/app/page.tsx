import { IntonationUpload } from "@/components/IntonationUpload";

export default function Home() {
  return (
    <div className="flex min-h-full flex-col items-center px-5 pb-24 pt-14 sm:px-8">
      <header className="mb-12 w-full max-w-md sm:mb-14">
        <div className="rounded-3xl border border-white/[0.1] bg-white/[0.04] px-8 py-8 text-center shadow-[0_16px_48px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl sm:px-10 sm:py-9">
          <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-emerald-400/85">
            Violin practice
          </p>
          <h1 className="mt-3 bg-gradient-to-br from-white via-white to-zinc-300 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
            MusAI
          </h1>
          <p className="mx-auto mt-4 max-w-[280px] text-[13px] leading-relaxed text-zinc-500">
            Hear your target, record your line, get a clear intonation readout in
            three steps.
          </p>
        </div>
      </header>

      <IntonationUpload />
    </div>
  );
}
