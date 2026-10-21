import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { InstrumentProvider } from "@/components/InstrumentProvider";
import {
  DraftNotesFrame,
  DraftTipsFrame,
} from "@/components/ScaleStudioHomeDraft";
import { INSTRUMENT_STORAGE_KEY } from "@/lib/instrument";

function renderDraft(ui: ReactElement) {
  return render(<InstrumentProvider>{ui}</InstrumentProvider>);
}

describe("DraftNotesFrame", () => {
  afterEach(() => {
    window.localStorage.removeItem(INSTRUMENT_STORAGE_KEY);
  });

  it("shows a ghost staff empty state with one short line of copy", () => {
    renderDraft(<DraftNotesFrame />);

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
    expect(
      document.querySelector(".musai-notes-placeholder__art")?.getAttribute("data-clef"),
    ).toBe("treble");
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
    expect(
      [...document.querySelectorAll(".musai-notes-placeholder__note")].map((el) =>
        el.getAttribute("data-tone"),
      ),
    ).toEqual(["ok", "high", "low", "miss", "ok", "high"]);
    expect(screen.queryByText(/C major/i)).not.toBeInTheDocument();
  });

  it("uses an alto C-clef when the instrument is viola", async () => {
    window.localStorage.setItem(INSTRUMENT_STORAGE_KEY, "viola");
    renderDraft(<DraftNotesFrame />);

    await waitFor(() => {
      expect(
        document.querySelector(".musai-notes-placeholder__clef")?.textContent,
      ).toBe("\uE05C");
    });
    expect(
      document.querySelector(".musai-notes-placeholder__art")?.getAttribute("data-clef"),
    ).toBe("alto");
  });
});

describe("DraftTipsFrame", () => {
  it("keeps the coach chat for when the home tab is opened", () => {
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
