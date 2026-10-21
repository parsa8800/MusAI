import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScalePickControls } from "@/components/ScalePickControls";

vi.mock("@/components/KeySignatureMini", () => ({
  KeySignatureMini: ({ option }: { option: { label: string } }) => (
    <span data-testid="key-sig-preview">{option.label} stave</span>
  ),
}));

function overlayScreen() {
  const root = document.getElementById("musai-overlay-root");
  if (!root) throw new Error("expected #musai-overlay-root");
  return within(root);
}

function renderPicker(
  tonicPc = 0,
  onTonicPc: (pc: number) => void = vi.fn(),
) {
  return render(
    <ScalePickControls
      tonicPc={tonicPc}
      onTonicPc={onTonicPc}
      scaleKind="major"
      onScaleKind={vi.fn()}
      octaveSpan={1}
      onOctaveSpan={vi.fn()}
      scaleMotion="ascending"
      onScaleMotion={vi.fn()}
    />,
  );
}

describe("ScalePickControls", () => {
  it("shows the current key with a stave preview and a plain count", () => {
    renderPicker(10);
    expect(
      screen.getByRole("button", { name: /Key, B♭ major, 2 flats/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("B♭ major")).toBeInTheDocument();
    expect(screen.getByText("2 flats")).toBeInTheDocument();
    expect(screen.getByText("B♭ stave")).toBeInTheDocument();
    expect(screen.queryByText("2♭")).not.toBeInTheDocument();
    expect(screen.queryByText("♭♭")).not.toBeInTheDocument();
  });

  it("opens a stave list grouped by flats and sharps", () => {
    const onTonicPc = vi.fn();
    renderPicker(0, onTonicPc);
    fireEvent.click(
      screen.getByRole("button", { name: /Key, C major, No sharps or flats/i }),
    );
    const menu = overlayScreen();
    expect(menu.getByRole("listbox", { name: "Key" })).toBeInTheDocument();
    expect(menu.getByText("No accidentals")).toBeInTheDocument();
    expect(menu.getByText("Flats")).toBeInTheDocument();
    expect(menu.getByText("Sharps")).toBeInTheDocument();
    expect(
      menu.getByRole("option", { name: /B♭ major, 2 flats/i }),
    ).toBeInTheDocument();
    expect(
      menu.getByRole("option", { name: /D major, 2 sharps/i }),
    ).toBeInTheDocument();
    expect(
      menu.getByRole("option", { name: /F♯ major, 6 sharps/i }),
    ).toBeInTheDocument();
    expect(menu.queryByText("F♯ C♯")).not.toBeInTheDocument();
    expect(menu.queryByText("B♭ E♭")).not.toBeInTheDocument();
    expect(menu.getAllByRole("option")).toHaveLength(12);
    expect(
      menu.getByRole("option", { name: /C major, No sharps or flats/i }),
    ).toHaveAttribute("aria-selected", "true");
    fireEvent.click(
      menu.getByRole("option", { name: /D major, 2 sharps/i }),
    );
    expect(onTonicPc).toHaveBeenCalledWith(2);
  });

  it("opens the menu on the html overlay root, not inside the clipped studio pane", () => {
    renderPicker();
    fireEvent.click(
      screen.getByRole("button", { name: /Key, C major, No sharps or flats/i }),
    );
    const listbox = overlayScreen().getByRole("listbox", { name: "Key" });
    expect(listbox.closest("#musai-overlay-root")).not.toBeNull();
    expect(
      document.querySelector(".musai-scale-pick .musai-key-menu"),
    ).toBeNull();
  });
});
