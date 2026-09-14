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
  session: ScalePracticeSessionV1;
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
  session,
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
  const suggestions = coachSuggestedQuestions(
    buildScaleCoachChatContext(session, tip, trendLine, loopAttempts),
  );

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
        const ctx = buildScaleCoachChatContext(
          session,
          tip,
          trendLine,
          loopAttempts,
        );
        let answer = localCoachChatReply(userText, ctx);
        let replySource: CoachReplySource = "template";

        try {
          const res = await fetch("/api/scale-coach-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session,
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
