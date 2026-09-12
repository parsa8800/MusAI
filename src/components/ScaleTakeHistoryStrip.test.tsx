import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScaleTakeHistoryStrip } from "@/components/ScaleTakeHistoryStrip";
import type { ScaleTakeSummary } from "@/lib/scaleTakeHistory";

function overlayScreen() {
  const root = document.getElementById("musai-overlay-root");
  if (!root) throw new Error("expected #musai-overlay-root");
  return within(root);
}

function take(
  n: number,
  extra: Partial<ScaleTakeSummary> = {},
): ScaleTakeSummary {
  return {
    sessionId: `t${n}`,
    takeNumber: n,
    unresolvedCount: 0,
    improved: null,
    isLatest: false,
    ...extra,
  };
}

describe("ScaleTakeHistoryStrip", () => {
  it("hides when there is only one take", () => {
    render(
      <ScaleTakeHistoryStrip
        takes={[take(1, { isLatest: true })]}
        selectedId="t1"
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /History/i })).not.toBeInTheDocument();
  });

  it("opens a compact menu instead of a row of take cards", () => {
    render(
      <ScaleTakeHistoryStrip
        takes={[
          take(1, { unresolvedCount: 2 }),
          take(2, { isLatest: true, improved: true }),
        ]}
        selectedId="t2"
        onSelect={() => {}}
      />,
    );

    expect(screen.queryByRole("tablist", { name: /Take history/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Clean")).not.toBeInTheDocument();
    expect(screen.queryByText(/to fix/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Improved")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Take history, 2 takes/i }));
    expect(overlayScreen().getByRole("option", { name: /Take 1/i })).toBeInTheDocument();
    expect(overlayScreen().getByRole("option", { name: /Take 2/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(overlayScreen().getByText("Latest")).toBeInTheDocument();
  });

  it("selects an earlier take from the menu", () => {
    const onSelect = vi.fn();
    render(
      <ScaleTakeHistoryStrip
        takes={[take(1), take(2, { isLatest: true })]}
        selectedId="t2"
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Take history, 2 takes/i }));
    fireEvent.click(overlayScreen().getByRole("option", { name: /Take 1/i }));
    expect(onSelect).toHaveBeenCalledWith("t1");
  });
});
