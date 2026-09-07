import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";
import { ViolinTuner } from "@/components/ViolinTuner";

export default function TunerPracticePage() {
  return (
    <div className="flex min-h-full flex-col items-center px-4 pb-24 pt-10 sm:px-8 sm:pt-12">
      <div className="w-full max-w-[min(1000px,100%)]">
        <PracticeHubBackLink />
      </div>
      <header className="mb-5 flex w-full max-w-[min(640px,100%)] flex-col items-center text-center sm:mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--musai-ink)] sm:text-3xl">
          Violin tuner
        </h1>
      </header>
      <ViolinTuner />
    </div>
  );
}
