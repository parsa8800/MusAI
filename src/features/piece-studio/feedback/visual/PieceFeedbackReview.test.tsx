import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PieceFeedbackReview } from "@/features/piece-studio/feedback/visual/PieceFeedbackReview";
import { mockPieceFeedbackIssues } from "@/features/piece-studio/feedback/visual/mockPieceFeedbackPreview";
import { coachIssuesFromMock } from "@/features/piece-studio/feedback/visual/pieceCoachIssueView";
import { parseMusicXmlToScore } from "@/features/piece-studio/score/parseMusicXml";
import { TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";

describe("PieceFeedbackReview", () => {
  const issues = coachIssuesFromMock(
    mockPieceFeedbackIssues(parseMusicXmlToScore(TWINKLE_XML, "Twinkle")),
  );
  const pitchIssues = issues.filter((issue) => issue.category === "pitch");
  const tempoIssue = issues.find((issue) => issue.category === "tempo")!;

  it("keeps pitch visual: summary + legend, no Heard/Try cards", () => {
    render(
      <PieceFeedbackReview
        issues={issues}
        activeId={issues[0]!.id}
        onActiveId={() => undefined}
        onShowOnScore={() => undefined}
      />,
    );
    const preview = screen.getByTestId("piece-feedback-preview");
    expect(preview).toHaveAttribute("data-mock", "true");
    expect(preview).toHaveAttribute("data-topic", "pitch");
    expect(screen.getByTestId("piece-focus-sample")).toHaveTextContent(
      /^Sample$/i,
    );
    expect(screen.queryByText(/not_ready/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Heard")).not.toBeInTheDocument();
    expect(screen.queryByText("Try")).not.toBeInTheDocument();
    expect(screen.queryByText("What’s wrong")).not.toBeInTheDocument();
    expect(screen.queryByText(/Running slightly sharp/i)).not.toBeInTheDocument();

    expect(screen.getByTestId("piece-pitch-map")).toBeInTheDocument();
    expect(screen.getByText(/colour on the score/i)).toBeInTheDocument();
    expect(screen.getByText("In tune")).toBeInTheDocument();
    expect(screen.getByText("Go lower")).toBeInTheDocument();
    expect(screen.getByText("Go higher")).toBeInTheDocument();
    expect(screen.getByText("Missed")).toBeInTheDocument();
    expect(screen.queryByText(/Soft washes/i)).not.toBeInTheDocument();
    expect(pitchIssues.length).toBeGreaterThan(1);
    expect(screen.getByRole("button", { name: /Pitch/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByTestId("coach-chat")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Ask your coach/i)).not.toBeInTheDocument();
  });

  it("offers Hear this for pitch without listing every note", () => {
    const onHearIssue = vi.fn();
    render(
      <PieceFeedbackReview
        issues={issues}
        activeId={issues[0]!.id}
        onActiveId={() => undefined}
        onHearIssue={onHearIssue}
      />,
    );
    const hear = screen.getByTestId("piece-section-listen");
    expect(hear).toHaveTextContent("Hear this");
    expect(screen.getAllByTestId("piece-section-listen")).toHaveLength(1);
    fireEvent.click(hear);
    expect(onHearIssue).toHaveBeenCalled();
  });

  it("shows Pause while that spot is playing", () => {
    render(
      <PieceFeedbackReview
        issues={issues}
        activeId={issues[0]!.id}
        onActiveId={() => undefined}
        onHearIssue={() => undefined}
        hearingIssue
      />,
    );
    expect(screen.getByTestId("piece-section-listen")).toHaveTextContent("Pause");
  });

  it("does not show Hear this without playback", () => {
    render(
      <PieceFeedbackReview
        issues={issues}
        activeId={issues[0]!.id}
        onActiveId={() => undefined}
      />,
    );
    expect(screen.queryByTestId("piece-section-listen")).not.toBeInTheDocument();
  });

  it("toggles skills on the score and focuses a topic when turning it on", () => {
    const onActiveId = vi.fn();
    const onShowOnScore = vi.fn();
    const onVisible = vi.fn();
    const { rerender } = render(
      <PieceFeedbackReview
        issues={issues}
        activeId={issues[0]!.id}
        onActiveId={onActiveId}
        onShowOnScore={onShowOnScore}
        visibleCategories={new Set(["pitch", "rhythm", "tempo", "dynamics"])}
        onVisibleCategoriesChange={onVisible}
      />,
    );
    expect(screen.queryByText("Also")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pitch/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /Tempo/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: /Tempo/i }));
    expect(onVisible).toHaveBeenCalled();
    const afterOff = onVisible.mock.calls[0]![0] as Set<string>;
    expect(afterOff.has("tempo")).toBe(false);

    onVisible.mockClear();
    onActiveId.mockClear();
    onShowOnScore.mockClear();
    rerender(
      <PieceFeedbackReview
        issues={issues}
        activeId={issues[0]!.id}
        onActiveId={onActiveId}
        onShowOnScore={onShowOnScore}
        visibleCategories={new Set(["pitch", "rhythm", "dynamics"])}
        onVisibleCategoriesChange={onVisible}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Tempo/i }));
    expect(onActiveId).toHaveBeenCalledWith("mock-rushing");
    expect(onShowOnScore).toHaveBeenCalledWith("mock-rushing");
    const afterOn = onVisible.mock.calls[0]![0] as Set<string>;
    expect(afterOn.has("tempo")).toBe(true);
  });

  it("hides pitch map when pitch is turned off and keeps other cards", () => {
    render(
      <PieceFeedbackReview
        issues={issues}
        activeId={tempoIssue.id}
        onActiveId={() => undefined}
        visibleCategories={new Set(["tempo", "rhythm", "dynamics"])}
      />,
    );
    expect(screen.queryByTestId("piece-pitch-map")).not.toBeInTheDocument();
    expect(screen.getByTestId("piece-focus-issues")).toBeInTheDocument();
    expect(screen.getAllByTestId("piece-focus-card").length).toBeGreaterThan(0);
  });

  it("shows a count only when a topic has multiple real issues", () => {
    render(
      <PieceFeedbackReview
        issues={issues}
        activeId={issues[0]!.id}
        onActiveId={() => undefined}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Pitch, \d+ issues/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rhythm" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Rhythm, \d+ issues/i }),
    ).not.toBeInTheDocument();
  });

  it("only lists skill chips for topics that have points to improve", () => {
    const rhythmOnly = issues.filter((issue) => issue.category === "rhythm");
    render(
      <PieceFeedbackReview
        issues={rhythmOnly}
        activeId={rhythmOnly[0]!.id}
        onActiveId={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: /^Rhythm/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Pitch/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Dynamics/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Tempo/i })).not.toBeInTheDocument();
  });

  it("marks live analysis without sample banner", () => {
    const live = [
      {
        ...issues[0]!,
        id: "pitch-0-sharp",
        source: "analysis" as const,
        severity: "focus" as const,
      },
    ];
    render(
      <PieceFeedbackReview
        issues={live}
        activeId={live[0]!.id}
        onActiveId={() => undefined}
      />,
    );
    expect(screen.getByTestId("piece-feedback-preview")).toHaveAttribute(
      "data-mock",
      "false",
    );
    expect(screen.queryByTestId("piece-focus-sample")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pitch" })).toBeInTheDocument();
    expect(screen.getByTestId("piece-pitch-map")).toBeInTheDocument();
  });
});
