"use client";

import { animate, stagger } from "animejs";
import { useEffect, useMemo, useRef } from "react";
import { CoachParsaChat } from "@/components/CoachParsaChat";
import { ScalePitchCueKey } from "@/components/ScalePitchCueKey";
import { PieceCoachLessonCard } from "@/features/piece-studio/feedback/visual/PieceCoachLessonCard";
import {
  localPieceCoachReply,
  pieceCoachOpenerText,
} from "@/features/piece-studio/feedback/visual/pieceCoachChat";
import {
  collapsePieceCoachIssues,
  groupPieceCoachTopics,
  pieceCoachCollapseKey,
  pieceCoachPlaceLine,
  pieceCoachTopicKey,
  type PieceCoachIssueView,
} from "@/features/piece-studio/feedback/visual/pieceCoachIssueView";
import { pitchSummaryLine } from "@/features/piece-studio/feedback/visual/piecePitchScoreMap";
import {
  MUSAI_DUR,
  MUSAI_EASE,
  prefersReducedMotion,
  tapFeedback,
} from "@/lib/motion";

/**
 * Practise support panel: take map on the score + separate coach chat.
 * Pitch stays visual on the score — the panel only summarises.
 * Presentation only — no analyzer changes.
 */
export function PieceFeedbackReview({
  issues,
  activeId,
  onActiveId,
  onShowOnScore,
  onHearIssue,
  hearingIssue = false,
}: {
  issues: readonly PieceCoachIssueView[];
  activeId: string | null;
  onActiveId: (id: string) => void;
  /** Highlight / scroll the focused note/measure on the score. */
  onShowOnScore?: (id: string) => void;
  /** Play the written notes for this issue (score playback, not the Listen tab). */
  onHearIssue?: (id: string) => void;
  hearingIssue?: boolean;
}) {
  const issuesRef = useRef<HTMLDivElement>(null);
  const uniqueIssues = useMemo(() => collapsePieceCoachIssues(issues), [issues]);
  const topics = useMemo(() => groupPieceCoachTopics(uniqueIssues), [uniqueIssues]);

  const active = useMemo(() => {
    if (uniqueIssues.length === 0) return null;
    const direct = uniqueIssues.find((issue) => issue.id === activeId);
    if (direct) return direct;
    const source = issues.find((issue) => issue.id === activeId);
    if (source) {
      const key = pieceCoachCollapseKey(source);
      const match = uniqueIssues.find(
        (issue) => pieceCoachCollapseKey(issue) === key,
      );
      if (match) return match;
    }
    return uniqueIssues[0] ?? null;
  }, [activeId, issues, uniqueIssues]);

  const activeTopicKey = active ? pieceCoachTopicKey(active) : null;
  const pitchTopic = activeTopicKey === "pitch";

  const topicIssues = useMemo(() => {
    if (!activeTopicKey) return [];
    return topics.find((topic) => topic.key === activeTopicKey)?.issues ?? [];
  }, [topics, activeTopicKey]);

  const openerText = useMemo(() => pieceCoachOpenerText(uniqueIssues), [uniqueIssues]);

  const takeChatKey = useMemo(
    () => uniqueIssues.map((issue) => issue.id).join("|") || "empty",
    [uniqueIssues],
  );

  const hearPitchId = useMemo(() => {
    if (!pitchTopic || topicIssues.length === 0) return null;
    return topicIssues[0]?.id ?? null;
  }, [pitchTopic, topicIssues]);

  useEffect(() => {
    if (pitchTopic) return;
    const root = issuesRef.current;
    if (!root || prefersReducedMotion()) return;
    const cards = root.querySelectorAll<HTMLElement>(
      '[data-testid="piece-focus-card"]',
    );
    if (cards.length === 0) return;
    const anim = animate(cards, {
      opacity: [0.45, 1],
      translateY: [5, 0],
      delay: stagger(36),
      duration: MUSAI_DUR.fast,
      ease: MUSAI_EASE.out,
    });
    return () => {
      try {
        (anim as { pause: () => void; revert?: () => void }).pause();
        (anim as { revert?: () => void }).revert?.();
      } catch {
        /* cleanup */
      }
    };
  }, [activeTopicKey, pitchTopic]);

  useEffect(() => {
    if (pitchTopic) return;
    const root = issuesRef.current;
    if (!root || prefersReducedMotion() || !active?.id) return;
    const selected = root.querySelector<HTMLElement>(
      '[data-testid="piece-focus-card"][aria-selected="true"]',
    );
    if (!selected) return;
    const anim = animate(selected, {
      opacity: [0.72, 1],
      scale: [0.985, 1],
      duration: MUSAI_DUR.base,
      ease: MUSAI_EASE.out,
    });
    return () => {
      try {
        (anim as { pause: () => void; revert?: () => void }).pause();
        (anim as { revert?: () => void }).revert?.();
      } catch {
        /* cleanup */
      }
    };
  }, [active?.id, pitchTopic]);

  if (!active || !activeTopicKey) return null;

  const fromTake = active.source === "analysis";

  const focusIssue = (id: string) => {
    onActiveId(id);
    onShowOnScore?.(id);
  };

  return (
    <div
      className="musai-piece-review"
      data-testid="piece-feedback-preview"
      data-mock={fromTake ? "false" : "true"}
      data-source={active.source}
      data-topic={activeTopicKey}
      aria-label="Practise feedback"
    >
      <section
        className="musai-piece-review__panel musai-piece-review__panel--map"
        aria-labelledby="piece-take-map-title"
        data-testid="piece-take-map"
      >
        <header className="musai-piece-review__panel-head">
          <h2
            id="piece-take-map-title"
            className="musai-piece-review__title sr-only"
          >
            Score feedback
          </h2>
          {!fromTake ? (
            <span
              className="musai-piece-review__sample"
              data-testid="piece-focus-sample"
              aria-hidden
            >
              Sample
            </span>
          ) : null}
        </header>

        <div
          className="musai-piece-review__skills"
          role="listbox"
          aria-label="Areas from this take"
          data-testid="piece-focus-skills"
        >
          <div className="musai-piece-review__skills-list" role="presentation">
            {topics.map((topic) => {
              const selected = topic.key === activeTopicKey;
              const count = topic.issues.length;
              const showCount = count > 1;
              const focusId =
                topic.issues.find((issue) => issue.id === activeId)?.id ??
                topic.issues[0]!.id;
              return (
                <button
                  key={topic.key}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-label={
                    showCount ? `${topic.label}, ${count} issues` : topic.label
                  }
                  className={[
                    "musai-pressable",
                    "musai-piece-review__skill",
                    selected ? "is-active" : "is-idle",
                  ].join(" ")}
                  data-topic={topic.key}
                  onClick={() => {
                    if (selected && focusId === active.id) return;
                    tapFeedback("light");
                    focusIssue(focusId);
                  }}
                >
                  <span className="musai-piece-review__skill-label">
                    {topic.label}
                  </span>
                  {showCount ? (
                    <span className="musai-piece-review__skill-count" aria-hidden>
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {pitchTopic ? (
          <div
            className="musai-piece-review__pitch"
            data-testid="piece-pitch-map"
          >
            <p className="musai-piece-review__pitch-summary">
              {pitchSummaryLine(topicIssues)}
            </p>
            <ScalePitchCueKey compact />
            {hearPitchId && onHearIssue ? (
              <button
                type="button"
                className="musai-pressable musai-piece-review__hear"
                data-testid="piece-section-listen"
                aria-pressed={hearingIssue}
                aria-label={
                  hearingIssue
                    ? "Pause this spot on the score"
                    : "Hear an out-of-tune note on the score"
                }
                onClick={() => {
                  tapFeedback("medium");
                  onHearIssue(hearPitchId);
                }}
              >
                {hearingIssue ? "Pause" : "Hear this"}
              </button>
            ) : null}
          </div>
        ) : topicIssues.length > 0 ? (
          <div
            ref={issuesRef}
            className="musai-piece-review__issues"
            role="listbox"
            aria-label="Issues in this category"
            data-testid="piece-focus-issues"
            data-topic={activeTopicKey}
          >
            {topicIssues.map((issue) => {
              const selected = issue.id === active.id;
              return (
                <div
                  key={issue.id}
                  className={
                    selected
                      ? "musai-piece-review__issue is-active"
                      : "musai-piece-review__issue"
                  }
                >
                  <PieceCoachLessonCard
                    place={pieceCoachPlaceLine(issue)}
                    what={issue.what}
                    next={issue.practise}
                    selected={selected}
                    onSelect={() => {
                      if (selected) {
                        onShowOnScore?.(issue.id);
                        return;
                      }
                      focusIssue(issue.id);
                    }}
                  />
                  {selected && onHearIssue ? (
                    <button
                      type="button"
                      className="musai-pressable musai-piece-review__hear"
                      data-testid="piece-section-listen"
                      aria-pressed={hearingIssue}
                      aria-label={
                        hearingIssue
                          ? "Pause this spot on the score"
                          : issue.visualStyle === "note"
                            ? "Hear this note on the score"
                            : "Hear this section on the score"
                      }
                      onClick={() => {
                        tapFeedback("medium");
                        onHearIssue(issue.id);
                      }}
                    >
                      {hearingIssue ? "Pause" : "Hear this"}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      <section
        className="musai-piece-review__panel musai-piece-review__panel--coach"
        aria-labelledby="piece-coach-chat-title"
        data-testid="piece-coach-panel"
      >
        <header className="musai-piece-review__panel-head musai-piece-review__panel-head--coach">
          <h2
            id="piece-coach-chat-title"
            className="musai-piece-review__title musai-piece-review__title--coach sr-only"
          >
            Ask your coach
          </h2>
        </header>

        <div className="musai-piece-review__chat">
          <CoachParsaChat
            key={takeChatKey}
            start
            embed
            title="Coach"
            openerText={openerText}
            source="template"
            suggestions={[]}
            showPreviewDot={false}
            getReply={async (userText) => ({
              reply: localPieceCoachReply(userText, active, uniqueIssues),
              source: "template",
            })}
          />
        </div>
      </section>
    </div>
  );
}
