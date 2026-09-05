import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";
import { ScalePracticeFlow } from "@/components/ScalePracticeFlow";
import { ScaleStudioHeader } from "@/components/ScaleStudioHeader";

export default function ScalePracticePage() {
  return (
    <div className="flex min-h-full flex-col items-center px-4 pb-24 pt-10 sm:px-8 sm:pt-12">
      <div className="w-full max-w-[min(1280px,100%)]">
        <PracticeHubBackLink />
      </div>
      <ScaleStudioHeader />
      <ScalePracticeFlow />
    </div>
  );
}
