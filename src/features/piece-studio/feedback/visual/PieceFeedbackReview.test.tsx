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

  it("keeps skills and lesson outside chat; sample is labeled", () => {
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
    expect(screen.getByTestId("piece-focus-sample")).toHaveTextContent(
      /Sample · not from your take/i,
    );
    expect(screen.queryByText(/not_ready/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Focus")).not.toBeInTheDocument();
    expect(screen.queryByText("Improve")).not.toBeInTheDocument();
    expect(screen.queryByText("Also")).not.toBeInTheDocument();

    expect(screen.getByTestId("piece-focus-skills")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Pitch" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("piece-focus-card")).toBeInTheDocument();
    expect(screen.getByText("Where")).toBeInTheDocument();
    expect(screen.getByTestId("piece-focus-where")).toBeInTheDocument();
    expect(screen.getByText("What’s wrong")).toBeInTheDocument();
    expect(screen.getByTestId("piece-focus-what")).toHaveTextContent(
      /running sharp/i,
    );
    expect(screen.getByText("Try this")).toBeInTheDocument();
    expect(screen.getByTestId("piece-focus-try")).toHaveTextContent(
      /slowly/i,
    );
    expect(screen.getByTestId("coach-chat")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Ask your coach/i)).toBeInTheDocument();
    expect(screen.getByText("Ask Parsa")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("coach-focus-show-on-score"));
    expect(onShowOnScore).toHaveBeenCalledWith(issues[0]!.id);
  });

  it("switches focus from the skills rail without ALSO chips in chat", () => {
    const onActiveId = vi.fn();
    render(
      <PieceFeedbackReview
        issues={issues}
        activeId={issues[0]!.id}
        onActiveId={onActiveId}
      />,
    );
    expect(screen.queryByText("Also")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Rushing" }));
    expect(onActiveId).toHaveBeenCalledWith("mock-rushing");
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
    expect(screen.getByRole("option", { name: "Pitch" })).toBeInTheDocument();
  });
});
