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

  it("shows a quiet focus card and chat without mock jargon", () => {
    const onShowOnScore = vi.fn();
    render(
      <PieceFeedbackReview
        issues={issues}
        activeId={issues[0]!.id}
        onActiveId={() => undefined}
        onShowOnScore={onShowOnScore}
      />,
    );
    const preview = screen.getByTestId("piece-feedback-preview");
    expect(preview).toHaveAttribute("data-mock", "true");
    expect(screen.queryByText(/sample review/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/from your latest take/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("coach-focus-card")).toBeInTheDocument();
    expect(screen.getByText("Focus")).toBeInTheDocument();
    expect(screen.getByText("Pitch")).toBeInTheDocument();
    expect(screen.getByText("Improve")).toBeInTheDocument();
    expect(screen.getByText("A few notes are running sharp")).toBeInTheDocument();
    expect(screen.getByText("Try")).toBeInTheDocument();
    expect(
      screen.getByText("Play the phrase slowly and relax into each note"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Where")).not.toBeInTheDocument();
    expect(screen.getByTestId("coach-focus-where")).toBeInTheDocument();
    expect(screen.getByTestId("coach-chat")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Ask your coach/i)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("coach-focus-show-on-score"));
    expect(onShowOnScore).toHaveBeenCalledWith(issues[0]!.id);
  });

  it("lets a later chip change focus without listing every overlay", () => {
    const onActiveId = vi.fn();
    render(
      <PieceFeedbackReview
        issues={issues}
        activeId={issues[0]!.id}
        onActiveId={onActiveId}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Rushing" }));
    expect(onActiveId).toHaveBeenCalledWith("mock-rushing");
  });

  it("marks live analysis without a status banner", () => {
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
    expect(screen.queryByText(/from your latest take/i)).not.toBeInTheDocument();
    expect(screen.getByText("Pitch")).toBeInTheDocument();
  });
});
