import { IntonationUpload } from "@/components/IntonationUpload";
import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";

export default function SingleNotePracticePage() {
  return (
    <div className="flex min-h-full flex-col items-center px-4 pb-[max(6rem,env(safe-area-inset-bottom))] pt-10 sm:px-8 sm:pt-12">
      <div className="w-full max-w-[min(1000px,100%)]">
        <PracticeHubBackLink />
      </div>
      <header className="mb-7 flex w-full max-w-[min(1000px,100%)] flex-col items-center text-center sm:mb-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--musai-ink)] sm:text-3xl">
          Tuning trainer
        </h1>
      </header>

      <IntonationUpload />
    </div>
  );
}
