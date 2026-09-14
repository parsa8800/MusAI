"use client";

import {
  CoachFocusCard,
  type CoachFocusLaterItem,
} from "@/components/CoachFocusCard";
import {
  CoachParsaChat,
  type CoachParsaChatProps,
  type CoachReplySource,
} from "@/components/CoachParsaChat";

export type CoachParsaFocusProps = {
  focus: string;
  whatToImprove: string;
  tryThis: string;
  where?: string | null;
  onShowOnScore?: () => void;
  later?: readonly CoachFocusLaterItem[];
  onSelectLater?: (id: string) => void;
};

export type CoachParsaShellProps = {
  start: boolean;
  title?: string;
  embed?: boolean;
  showPreviewDot?: boolean;
  /** Structured take focus — omit for chat-only (e.g. Scale opener). */
  focus?: CoachParsaFocusProps | null;
  openerText: string;
  suggestions?: string[];
  source?: CoachReplySource;
  sanitizeUserText?: CoachParsaChatProps["sanitizeUserText"];
  getReply: CoachParsaChatProps["getReply"];
  className?: string;
  "data-testid"?: string;
  "aria-label"?: string;
  /** Piece sample preview vs live take — mirrored onto the aside. */
  dataMock?: "true" | "false";
  dataSource?: string;
};

/**
 * Shared Coach · Parsa shell for Scale Studio and Piece Studio.
 * Focus card + chat chrome stay here; studio adapters supply copy and replies.
 */
export function CoachParsaShell({
  start,
  title = "Coach · Parsa",
  embed = false,
  showPreviewDot,
  focus = null,
  openerText,
  suggestions,
  source = "template",
  sanitizeUserText,
  getReply,
  className,
  "data-testid": testId = "coach-parsa-shell",
  "aria-label": ariaLabel = "Coach Parsa",
  dataMock,
  dataSource,
}: CoachParsaShellProps) {
  const focusCard = focus ? (
    <CoachFocusCard
      focus={focus.focus}
      whatToImprove={focus.whatToImprove}
      tryThis={focus.tryThis}
      where={focus.where}
      onShowOnScore={focus.onShowOnScore}
      later={focus.later}
      onSelectLater={focus.onSelectLater}
    />
  ) : null;

  return (
    <aside
      className={["musai-coach-parsa", className].filter(Boolean).join(" ")}
      data-testid={testId}
      data-mock={dataMock}
      data-source={dataSource}
      aria-label={ariaLabel}
    >
      <CoachParsaChat
        start={start}
        embed={embed}
        title={title}
        showPreviewDot={showPreviewDot}
        openerText={openerText}
        source={source}
        suggestions={suggestions}
        sanitizeUserText={sanitizeUserText}
        topSlot={focusCard}
        getReply={getReply}
      />
    </aside>
  );
}
