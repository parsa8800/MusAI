"use client";

import { useMemo } from "react";
import { CoachChatPanel } from "@/components/CoachChatPanel";
import { buildScaleCoachingFeedback } from "@/lib/scalePracticeCopy";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";

/**
 * Coach panel beside the staff. Starts compact, grows if they keep chatting.
 */
export function ScaleInlineFeedback({
  session,
  loopAttempts,
}: {
  session: ScalePracticeSessionV1;
  loopAttempts?: ScalePracticeSessionV1[];
}) {
  const template = useMemo(() => buildScaleCoachingFeedback(session), [session]);

  return (
    <div
      key={session.sessionId}
      className="flex min-h-0 flex-1 w-full flex-col items-stretch"
    >
      <CoachChatPanel
        embed
        start
        title="Coach · Parsa"
        trendLine={template.trendLine}
        tip={template.tip}
        source="template"
        session={session}
        loopAttempts={loopAttempts}
      />
    </div>
  );
}
