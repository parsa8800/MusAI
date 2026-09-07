import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";
import { ViolinTuner } from "@/components/ViolinTuner";

export default function TunerPracticePage() {
  return (
    <div className="flex min-h-full flex-col items-center px-4 pb-10 pt-6 sm:px-8 sm:pt-8">
      <div className="w-full max-w-[min(1000px,100%)]">
        <PracticeHubBackLink />
      </div>
      <header className="mb-3 flex w-full max-w-[min(440px,100%)] flex-col items-center text-center sm:mb-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--musai-ink)] sm:text-[1.75rem]">
          Violin tuner
        </h1>
      </header>
      <ViolinTuner />
    </div>
  );
}
