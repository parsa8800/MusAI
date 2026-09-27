import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PracticeHubExercises } from "@/components/PracticeHubExercises";
import { PIECE_STUDIO_HREF } from "@/features/piece-studio/pieceStudioRoutes";
import { INSTRUMENT_STORAGE_KEY } from "@/lib/instrument";

afterEach(() => {
  window.localStorage.removeItem(INSTRUMENT_STORAGE_KEY);
});

describe("PracticeHubExercises", () => {
  it("groups quick tools above deeper studios with the same routes", () => {
    render(<PracticeHubExercises />);

    expect(
      screen.getByRole("heading", { name: "Practice", hidden: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Practice tools" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Studios" })).toBeInTheDocument();

    const tools = screen
      .getByRole("heading", { name: "Practice tools" })
      .closest(".musai-home-exercises__group");
    const studios = screen
      .getByRole("heading", { name: "Studios" })
      .closest(".musai-home-exercises__group");
    expect(tools).toBeTruthy();
    expect(studios).toBeTruthy();

    expect(within(tools as HTMLElement).getByRole("link", { name: "Tuner" })).toHaveAttribute(
      "href",
      "/practice/tuner",
    );
    expect(
      within(tools as HTMLElement).getByRole("link", { name: "Tuning trainer" }),
    ).toHaveAttribute("href", "/practice/single-note");
    expect(within(tools as HTMLElement).queryByRole("link", { name: "Scale studio" })).toBeNull();
    expect(within(tools as HTMLElement).queryByRole("link", { name: "Piece studio" })).toBeNull();

    expect(within(studios as HTMLElement).getByRole("link", { name: "Scale studio" })).toHaveAttribute(
      "href",
      "/practice/scale",
    );
    expect(within(studios as HTMLElement).getByRole("link", { name: "Piece studio" })).toHaveAttribute(
      "href",
      PIECE_STUDIO_HREF,
    );
    expect(within(studios as HTMLElement).queryByRole("link", { name: "Tuner" })).toBeNull();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Open strings")).not.toBeInTheDocument();
    expect(screen.queryByText("One note at a time")).not.toBeInTheDocument();
    expect(screen.queryByText("Each step, in colour")).not.toBeInTheDocument();
    expect(screen.queryByText("Marks on the page")).not.toBeInTheDocument();
  });

  it("draws the current instrument's open strings on the tuner", () => {
    window.localStorage.setItem(INSTRUMENT_STORAGE_KEY, "viola");
    render(<PracticeHubExercises />);
    const tuner = screen.getByRole("link", { name: "Tuner" });
    const letters = [...tuner.querySelectorAll("text")].map((el) => el.textContent);
    expect(letters).toEqual(["C", "G", "D", "A"]);
  });
});
