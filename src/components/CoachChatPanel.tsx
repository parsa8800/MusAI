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
import { postCoachChatJson } from "@/lib/coachChatTransport";
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
  /** Rail: field only until they ask. Feedback stays outside this chat. */
  askOnly?: boolean;
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
  askOnly = false,
}: Props) {
  void initialError;
  const openerText = askOnly
    ? ""
    : takeCoachBullets([trendLine, tip].filter(Boolean).join("\n"), 2);
  const suggestions = askOnly
    ? []
    : session
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

        const remote = await postCoachChatJson<{
          reply?: string;
          source?: CoachReplySource;
        }>("/api/scale-coach-chat", {
          session: session ?? undefined,
          preview,
          tip,
          trendLine,
          loopAttempts,
          messages: history,
        });
        if (remote.ok) {
          if (typeof remote.data.reply === "string" && remote.data.reply.trim()) {
            answer = ensureBulletFeedback(remote.data.reply);
          }
          if (remote.data.source === "llm" || remote.data.source === "template") {
            replySource = remote.data.source;
          }
        }

        return { reply: answer, source: replySource };
      }}
    />
  );
}
