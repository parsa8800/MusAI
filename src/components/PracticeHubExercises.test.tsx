import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PracticeHubExercises } from "@/components/PracticeHubExercises";
import { PIECE_STUDIO_HREF } from "@/features/piece-studio/pieceStudioRoutes";

describe("PracticeHubExercises", () => {
  it("keeps existing studios and opens Piece Studio as its own route", () => {
    render(<PracticeHubExercises />);

    expect(screen.getByRole("link", { name: "Violin tuner" })).toHaveAttribute(
      "href",
      "/practice/tuner",
    );
    expect(screen.getByRole("link", { name: "Tuning trainer" })).toHaveAttribute(
      "href",
      "/practice/single-note",
    );
    expect(screen.getByRole("link", { name: "Scale studio" })).toHaveAttribute(
      "href",
      "/practice/scale",
    );
    expect(screen.getByRole("link", { name: "Piece studio" })).toHaveAttribute(
      "href",
      PIECE_STUDIO_HREF,
    );
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });
});
