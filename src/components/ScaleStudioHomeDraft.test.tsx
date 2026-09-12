import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  DraftNotesFrame,
  DraftTipsFrame,
} from "@/components/ScaleStudioHomeDraft";

describe("DraftNotesFrame", () => {
  it("shows a ghost staff empty state with one short line of copy", () => {
    render(<DraftNotesFrame />);

    expect(
      screen.getByRole("img", {
        name: /Your notes and feedback will appear here/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Your notes and feedback will appear here/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Record a scale to see note by note feedback/i),
    ).not.toBeInTheDocument();
    expect(document.querySelector(".musai-notes-placeholder__art")).toBeTruthy();
    expect(document.querySelector(".musai-notes-placeholder__clef")).toBeTruthy();
    expect(document.querySelector(".musai-notes-placeholder__clef")?.textContent).toBe(
      "\uE050",
    );
    expect(document.querySelectorAll(".musai-notes-placeholder__line")).toHaveLength(
      5,
    );
    expect(
      document.querySelectorAll(".musai-notes-placeholder__note").length,
    ).toBeGreaterThan(3);
    expect(
      document.querySelectorAll(".musai-notes-placeholder__stem").length,
    ).toBe(document.querySelectorAll(".musai-notes-placeholder__note").length);
    expect(
      document.querySelectorAll(".musai-notes-placeholder__head").length,
    ).toBe(
      document.querySelectorAll(".musai-notes-placeholder__note").length,
    );
    expect(screen.queryByText(/C major/i)).not.toBeInTheDocument();
  });
});

describe("DraftTipsFrame", () => {
  it("shows a minimal coach chat empty state with input only", () => {
    render(<DraftTipsFrame />);

    expect(screen.getByRole("heading", { name: "Tips" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Ask your coach/i)).toBeInTheDocument();
    expect(document.querySelector(".musai-tips-empty__icon")).toBeTruthy();
    expect(screen.queryByText(/Your coach is here to help/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/After you play, ask about your notes/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Record a scale to start chatting/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/C major/i)).not.toBeInTheDocument();
  });
});
