"use client";

import { CoachParsaShell } from "@/components/CoachParsaShell";
import {
  coachBubbleSize,
  type CoachBubbleSize,
  type CoachReplySource,
} from "@/components/CoachParsaChat";
import {
  localCoachChatReply,
  buildScaleCoachChatContext,
  coachSuggestedQuestions,
} from "@/lib/scaleCoachChat";
import {
  guideSuggestedQuestions,
  localSiteGuideReply,
  type ScaleCoachPreview,
} from "@/lib/musaiSiteGuide";
import {
  ensureBulletFeedback,
  sanitizeCoachFeedback,
  takeCoachBullets,
} from "@/lib/scalePracticeCopy";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";

export { coachBubbleSize };
export type { CoachBubbleSize };

type Props = {
  start: boolean;
  trendLine: string;
  tip: string;
  source: "template" | "llm";
  /** Absent before the first take. The chat still answers. */
  session?: ScalePracticeSessionV1 | null;
  /** Scale on the staff when they have not recorded yet. */
  preview?: ScaleCoachPreview;
  /** Kept for API compatibility; never shown in the UI. */
  initialError?: string | null;
  /** Embed beside the staff on results (fills column, no top rule). */
  embed?: boolean;
  /** Sidebar heading when embedded. */
  title?: string;
  /** Loop takes so the coach knows the progress bar streak. */
  loopAttempts?: ScalePracticeSessionV1[];
};

/**
 * Scale Studio Coach · Parsa — shared shell, Scale-specific reply logic.
 */
export function CoachChatPanel({
  start,
  trendLine,
  tip,
  source: initialSource,
  session = null,
  preview,
  initialError = null,
  embed = false,
  title = "Coach · Parsa",
  loopAttempts,
}: Props) {
  void initialError;
  const openerText = takeCoachBullets(
    [trendLine, tip].filter(Boolean).join("\n"),
    2,
  );
  const suggestions = session
    ? coachSuggestedQuestions(
        buildScaleCoachChatContext(session, tip, trendLine, loopAttempts),
      )
    : guideSuggestedQuestions();

  return (
    <CoachParsaShell
      start={start}
      embed={embed}
      title={title}
      openerText={openerText}
      source={initialSource as CoachReplySource}
      suggestions={suggestions}
      sanitizeUserText={sanitizeCoachFeedback}
      getReply={async (userText, history) => {
        const ctx = session
          ? buildScaleCoachChatContext(session, tip, trendLine, loopAttempts)
          : null;
        let answer = ctx
          ? localCoachChatReply(userText, ctx)
          : (localSiteGuideReply(userText, preview) ??
            ensureBulletFeedback(
              "Ask me how to record, or about Tuner, Scale studio, or Piece studio",
            ));
        let replySource: CoachReplySource = "template";

        try {
          const res = await fetch("/api/scale-coach-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session: session ?? undefined,
              preview,
              tip,
              trendLine,
              loopAttempts,
              messages: history,
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as {
              reply?: string;
              source?: CoachReplySource;
            };
            if (typeof data.reply === "string" && data.reply.trim()) {
              answer = ensureBulletFeedback(data.reply);
            }
            if (data.source === "llm" || data.source === "template") {
              replySource = data.source;
            }
          }
        } catch {
          /* keep local reply */
        }

        return { reply: answer, source: replySource };
      }}
    />
  );
}
