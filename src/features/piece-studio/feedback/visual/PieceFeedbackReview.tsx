"use client";

import { animate, stagger } from "animejs";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScalePitchCueKey } from "@/components/ScalePitchCueKey";
import { PieceCoachLessonCard } from "@/features/piece-studio/feedback/visual/PieceCoachLessonCard";
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

function topicKeysFromIssues(issues: readonly PieceCoachIssueView[]): string[] {
  return groupPieceCoachTopics(issues).map((topic) => topic.key);
}

/**
 * Take map for the Teacher rail: skill filters + issue cards.
 * Chat lives only in StudioTeacherRail / PieceAskCoach — not here.
 */
export function PieceFeedbackReview({
  issues,
  activeId,
  onActiveId,
  onShowOnScore,
  onHearIssue,
  hearingIssue = false,
  visibleCategories,
  onVisibleCategoriesChange,
}: {
  issues: readonly PieceCoachIssueView[];
  activeId: string | null;
  onActiveId: (id: string) => void;
  /** Highlight / scroll the focused note/measure on the score. */
  onShowOnScore?: (id: string) => void;
  /** Play the written notes for this issue (score playback, not the Listen tab). */
  onHearIssue?: (id: string) => void;
  hearingIssue?: boolean;
  /** Categories shown on the score. Defaults to every topic in this take. */
  visibleCategories?: ReadonlySet<string>;
  onVisibleCategoriesChange?: (next: ReadonlySet<string>) => void;
}) {
  const issuesRef = useRef<HTMLDivElement>(null);
  const uniqueIssues = useMemo(() => collapsePieceCoachIssues(issues), [issues]);
  const topics = useMemo(() => groupPieceCoachTopics(uniqueIssues), [uniqueIssues]);

  const [localVisible, setLocalVisible] = useState<ReadonlySet<string>>(() =>
    new Set(topicKeysFromIssues(uniqueIssues)),
  );

  useEffect(() => {
    if (visibleCategories) return;
    setLocalVisible(new Set(topicKeysFromIssues(uniqueIssues)));
  }, [uniqueIssues, visibleCategories]);

  const visible = visibleCategories ?? localVisible;

  const setVisible = (next: ReadonlySet<string>) => {
    if (onVisibleCategoriesChange) onVisibleCategoriesChange(next);
    else setLocalVisible(next);
  };

  const visibleIssues = useMemo(
    () => uniqueIssues.filter((issue) => visible.has(pieceCoachTopicKey(issue))),
    [uniqueIssues, visible],
  );

  const visibleTopics = useMemo(
    () => topics.filter((topic) => visible.has(topic.key)),
    [topics, visible],
  );

  const active = useMemo(() => {
    if (visibleIssues.length === 0) return null;
    const direct = visibleIssues.find((issue) => issue.id === activeId);
    if (direct) return direct;
    const source = issues.find((issue) => issue.id === activeId);
    if (source && visible.has(pieceCoachTopicKey(source))) {
      const key = pieceCoachCollapseKey(source);
      const match = visibleIssues.find(
        (issue) => pieceCoachCollapseKey(issue) === key,
      );
      if (match) return match;
    }
    return visibleIssues[0] ?? null;
  }, [activeId, issues, visible, visibleIssues]);

  const activeTopicKey = active ? pieceCoachTopicKey(active) : null;
  const pitchVisible = visible.has("pitch");
  const pitchTopic = visibleTopics.find((topic) => topic.key === "pitch");
  const pitchIssues = pitchTopic?.issues ?? [];
  const otherVisibleIssues = useMemo(
    () =>
      visibleTopics
        .filter((topic) => topic.key !== "pitch")
        .flatMap((topic) => topic.issues),
    [visibleTopics],
  );

  const hearPitchId = useMemo(() => {
    if (!pitchVisible || pitchIssues.length === 0) return null;
    return pitchIssues[0]?.id ?? null;
  }, [pitchVisible, pitchIssues]);

  useEffect(() => {
    if (otherVisibleIssues.length === 0) return;
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
  }, [otherVisibleIssues, visibleTopics]);

  useEffect(() => {
    if (otherVisibleIssues.length === 0) return;
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
  }, [active?.id, otherVisibleIssues]);

  if (uniqueIssues.length === 0) return null;

  const fromTake = uniqueIssues[0]!.source === "analysis";

  const focusIssue = (id: string) => {
    onActiveId(id);
    onShowOnScore?.(id);
  };

  const toggleTopic = (key: string) => {
    const next = new Set(visible);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setVisible(next);
    const topic = topics.find((entry) => entry.key === key);
    if (next.has(key) && topic?.issues[0]) {
      focusIssue(topic.issues[0].id);
    } else if (active && !next.has(pieceCoachTopicKey(active))) {
      const fallback = uniqueIssues.find((issue) =>
        next.has(pieceCoachTopicKey(issue)),
      );
      if (fallback) focusIssue(fallback.id);
    }
  };

  return (
    <div
      className="musai-piece-review"
      data-testid="piece-feedback-preview"
      data-mock={fromTake ? "false" : "true"}
      data-source={fromTake ? "analysis" : "mock-preview"}
      data-topic={activeTopicKey ?? "none"}
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
          role="group"
          aria-label="Show on the score"
          data-testid="piece-focus-skills"
        >
          <div className="musai-piece-review__skills-list" role="presentation">
            {topics.map((topic) => {
              const pressed = visible.has(topic.key);
              const count = topic.issues.length;
              const showCount = count > 1;
              return (
                <button
                  key={topic.key}
                  type="button"
                  aria-pressed={pressed}
                  aria-label={
                    showCount
                      ? `${topic.label}, ${count} issues`
                      : topic.label
                  }
                  className={[
                    "musai-pressable",
                    "musai-piece-review__skill",
                    pressed ? "is-active" : "is-idle",
                  ].join(" ")}
                  data-topic={topic.key}
                  onClick={() => {
                    tapFeedback("light");
                    toggleTopic(topic.key);
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

        {pitchVisible && pitchIssues.length > 0 ? (
          <div
            className="musai-piece-review__pitch"
            data-testid="piece-pitch-map"
          >
            <p className="musai-piece-review__pitch-summary">
              {pitchSummaryLine(pitchIssues)}
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
        ) : null}

        {otherVisibleIssues.length > 0 ? (
          <div
            ref={issuesRef}
            className="musai-piece-review__issues"
            role="listbox"
            aria-label="Issues on the score"
            data-testid="piece-focus-issues"
            data-topic={activeTopicKey ?? "mixed"}
          >
            {otherVisibleIssues.map((issue) => {
              const selected = issue.id === active?.id;
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
    </div>
  );
}
