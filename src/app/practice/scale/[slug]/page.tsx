import Link from "next/link";
import { Suspense } from "react";
import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";
import { ScaleWorkspace } from "@/components/ScaleWorkspace";
import { parseScaleWorkspaceSlug } from "@/lib/scaleWorkspace";

function WorkspaceFallback() {
  return (
    <div className="flex min-h-[50vh] w-full flex-col items-center justify-center">
      <div
        className="h-10 w-10 rounded-full border-2 border-[var(--musai-border)] border-t-[var(--musai-accent)] motion-safe:animate-spin motion-reduce:animate-none"
        aria-hidden
      />
    </div>
  );
}

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
    <Suspense fallback={<WorkspaceFallback />}>
      <ScaleWorkspace identity={identity} />
    </Suspense>
  );
}
