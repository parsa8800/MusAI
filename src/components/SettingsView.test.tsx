import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InstrumentProvider } from "@/components/InstrumentProvider";
import { SettingsView } from "@/components/SettingsView";
import { ThemeProvider } from "@/components/ThemeProvider";
import { INSTRUMENT_STORAGE_KEY } from "@/lib/instrument";

function renderSettings() {
  return render(
    <ThemeProvider>
      <InstrumentProvider>
        <SettingsView />
      </InstrumentProvider>
    </ThemeProvider>,
  );
}

describe("SettingsView", () => {
  afterEach(() => {
    window.localStorage.removeItem(INSTRUMENT_STORAGE_KEY);
    window.localStorage.removeItem("musai-theme");
    document.documentElement.removeAttribute("data-theme");
  });

  it("lets the player choose Violin or Viola and remembers it", () => {
    renderSettings();

    const violin = screen.getByRole("tab", { name: "Violin" });
    const viola = screen.getByRole("tab", { name: "Viola" });
    const piano = screen.getByRole("tab", { name: "Piano" });
    expect(violin).toHaveAttribute("aria-selected", "true");
    expect(viola).toHaveAttribute("aria-selected", "false");
    expect(piano).toHaveAttribute("aria-selected", "false");

    fireEvent.click(piano);
    expect(piano).toHaveAttribute("aria-selected", "true");
    expect(window.localStorage.getItem(INSTRUMENT_STORAGE_KEY)).toBe("piano");

    fireEvent.click(viola);
    expect(viola).toHaveAttribute("aria-selected", "true");
    expect(violin).toHaveAttribute("aria-selected", "false");
    expect(window.localStorage.getItem(INSTRUMENT_STORAGE_KEY)).toBe("viola");
  });

  it("restores the saved instrument after a remount", async () => {
    window.localStorage.setItem(INSTRUMENT_STORAGE_KEY, "viola");
    renderSettings();
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Viola" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
  });

  it("keeps appearance next to instrument as a simple preference", () => {
    renderSettings();
    expect(screen.getByRole("tablist", { name: "Instrument" })).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Colour theme" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Light" })).toBeInTheDocument();
  });

  it("lets the player switch Light, Dark, and System", () => {
    renderSettings();

    const light = screen.getByRole("tab", { name: "Light" });
    const dark = screen.getByRole("tab", { name: "Dark" });
    const system = screen.getByRole("tab", { name: "System" });

    expect(light).toHaveAttribute("aria-selected", "true");

    fireEvent.click(dark);
    expect(dark).toHaveAttribute("aria-selected", "true");
    expect(light).toHaveAttribute("aria-selected", "false");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    fireEvent.click(system);
    expect(system).toHaveAttribute("aria-selected", "true");
    expect(dark).toHaveAttribute("aria-selected", "false");
  });
});
