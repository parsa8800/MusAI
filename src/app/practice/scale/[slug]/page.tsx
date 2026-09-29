import Link from "next/link";
import { Suspense } from "react";
import { MusaiLoadingScreen, StudioReveal } from "@/components/MusaiLoadingMark";
import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";
import { ScaleWorkspace } from "@/components/ScaleWorkspace";
import { parseScaleWorkspaceSlug } from "@/lib/scaleWorkspace";

export default async function ScaleWorkspacePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const identity = parseScaleWorkspaceSlug(slug);

  if (!identity) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-5 px-6 text-center">
        <PracticeHubBackLink
          href="/practice/scale"
          label="Scale studio"
          ariaLabel="Back to Scale studio"
        />
        <p className="text-sm text-[var(--musai-muted)]">
          That scale page wasn’t found.
        </p>
        <Link href="/practice/scale" className="musai-btn-primary">
          Choose a scale
        </Link>
      </div>
    );
  }

  return (
    <Suspense fallback={<MusaiLoadingScreen label="Opening your scale" />}>
      <StudioReveal label="Opening your scale">
        <ScaleWorkspace identity={identity} />
      </StudioReveal>
    </Suspense>
  );
}
