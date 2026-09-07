import { PracticeHubExercises } from "@/components/PracticeHubExercises";

export default function Home() {
  return (
    <div className="flex min-h-full flex-col items-center px-5 pb-20 pt-16 sm:px-8 sm:pb-24 sm:pt-20">
      <header className="mb-12 w-full max-w-2xl text-center sm:mb-14">
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

      <PracticeHubExercises />
    </div>
  );
}
