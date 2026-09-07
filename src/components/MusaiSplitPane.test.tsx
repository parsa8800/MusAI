import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MusaiSplitPane } from "@/components/MusaiSplitPane";

describe("MusaiSplitPane", () => {
  beforeEach(() => {
    window.matchMedia = (query: string) =>
      ({
        matches: query.includes("768"),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("exposes a keyboard-resizable separator on desktop", () => {
    render(
      <MusaiSplitPane
        left={<div>Notes</div>}
        right={<div>Coach</div>}
        storageKey="musai-test-split"
      />,
    );

    const sep = screen.getByRole("separator", {
      name: /Resize notes and feedback/i,
    });
    expect(sep).toBeInTheDocument();
    expect(sep).toHaveAttribute("aria-valuenow", "50");

    fireEvent.keyDown(sep, { key: "ArrowRight" });
    expect(Number(sep.getAttribute("aria-valuenow"))).toBeGreaterThan(50);

    fireEvent.keyDown(sep, { key: "Home" });
    expect(sep).toHaveAttribute("aria-valuenow", "50");
  });
});
