import { IntonationUpload } from "@/components/IntonationUpload";
import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";

export default function SingleNotePracticePage() {
  return (
    <div className="flex min-h-full flex-col items-center px-4 pb-24 pt-10 sm:px-8 sm:pt-12">
      <div className="w-full max-w-[min(1000px,100%)]">
        <PracticeHubBackLink />
      </div>
      <header className="mb-7 flex w-full max-w-[min(1000px,100%)] flex-col items-center text-center sm:mb-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-400/85">
          Practice
        </p>
        <h1 className="mt-2.5 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
          Tuning trainer
        </h1>
        <p className="mt-2.5 max-w-sm text-sm leading-relaxed text-zinc-400">
          One pitch, clear intonation feedback.
        </p>
      </header>

      <IntonationUpload />
    </div>
  );
}
