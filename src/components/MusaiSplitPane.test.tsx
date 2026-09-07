import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MusaiSplitPane, MUSAI_SCALE_SPLIT_STORAGE_KEY } from "@/components/MusaiSplitPane";

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

  it("persists the shared Scale Studio split key", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(
      <MusaiSplitPane
        left={<div>Notes</div>}
        right={<div>Coach</div>}
        storageKey={MUSAI_SCALE_SPLIT_STORAGE_KEY}
        resizable
      />,
    );

    const sep = screen.getByRole("separator", {
      name: /Resize notes and feedback/i,
    });
    fireEvent.keyDown(sep, { key: "ArrowRight" });

    expect(setItem).toHaveBeenCalledWith(
      MUSAI_SCALE_SPLIT_STORAGE_KEY,
      expect.any(String),
    );
  });
});
