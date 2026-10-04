"use client";

import { CoachParsaChat } from "@/components/CoachParsaChat";
import {
  localPieceAskReply,
  pieceCoachFollowPrompt,
  pieceCoachIdlePrompts,
  type PieceAskContext,
} from "@/features/piece-studio/feedback/visual/pieceCoachChat";
import type { PieceCoachIssueView } from "@/features/piece-studio/feedback/visual/pieceCoachIssueView";
import { pieceCoachPlaceLine } from "@/features/piece-studio/feedback/visual/pieceCoachIssueView";

/**
 * Piece coach chat. Works from the written score alone, so Score and
 * Practise can both ask questions before any recording.
 */
export function PieceAskCoach({
  pieceId,
  context,
  issue = null,
  issues = [],
  suppressCue = false,
}: {
  pieceId: string;
  context: PieceAskContext;
  issue?: PieceCoachIssueView | null;
  issues?: readonly PieceCoachIssueView[];
  /** Rhythm uses its own popup. Hide the cue so it is not explained twice. */
  suppressCue?: boolean;
}) {
  const idleSuggestions = suppressCue ? [] : pieceCoachIdlePrompts();
  const followSuggestion = suppressCue ? null : pieceCoachFollowPrompt(issue);

  const cue = suppressCue
    ? null
    : issue?.category === "tempo"
      ? issue
      : (issues.find((item) => item.category === "tempo") ?? null);
  const place = cue ? pieceCoachPlaceLine(cue) : null;

  return (
    <>
      {cue ? (
        <div className="musai-coach-cue" data-testid="coach-rhythm-cue">
          {place ? <p className="musai-coach-cue__place">{place}</p> : null}
          <ul className="musai-coach-cue__points">
            <li>{cue.what.replace(/\.$/, "")}</li>
            <li>{cue.practise.replace(/\.$/, "")}</li>
          </ul>
        </div>
      ) : null}
      <CoachParsaChat
      start
      embed
      title="Teacher"
      placeholder="Ask your teacher..."
      showHeader={false}
      emptyNote="Ask me about this piece"
      openerText=""
      source="template"
      idleSuggestions={idleSuggestions}
      followSuggestion={followSuggestion}
      showPreviewDot={false}
      threadKey={`piece:${pieceId}`}
      getReply={async (userText) => ({
        reply: localPieceAskReply(userText, context, issue, issues),
        source: "template",
      })}
    />
    </>
  );
}
