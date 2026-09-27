import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";
import { Tuner } from "@/components/ViolinTuner";

export default function TunerPracticePage() {
  return (
    <div className="musai-tuner-page">
      <div className="musai-tuner-page__chrome">
        <PracticeHubBackLink className="!mb-0 shrink-0" />
      </div>
      <div className="musai-tuner-page__stage">
        <header className="musai-tuner-page__header">
          <h1 className="musai-tuner-page__title font-display">
            Tuner
          </h1>
        </header>
        <Tuner />
      </div>
    </div>
  );
}
