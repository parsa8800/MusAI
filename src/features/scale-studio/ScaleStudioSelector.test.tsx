import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstrumentProvider } from "@/components/InstrumentProvider";
import { ScaleStudioSelector } from "@/components/ScaleStudioSelector";
import { INSTRUMENT_STORAGE_KEY } from "@/lib/instrument";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/components/ScaleTrebleStaff", () => ({
  ScaleTrebleStaff: ({
    ascendingMidis,
  }: {
    ascendingMidis: number[];
    descendingMidis: number[];
  }) => (
    <div data-testid="staff-midis">{ascendingMidis.join(",")}</div>
  ),
}));

vi.mock("@/components/MusaiCaptureDock", () => ({
  MusaiCaptureDock: () => <div data-testid="capture-dock" />,
}));

vi.mock("@/components/MusaiFloatingMiniRecorder", () => ({
  MusaiFloatingMiniRecorder: () => null,
}));

function renderStudio() {
  return render(
    <InstrumentProvider>
      <ScaleStudioSelector />
    </InstrumentProvider>,
  );
}

describe("ScaleStudioSelector instrument register", () => {
  afterEach(() => {
    window.localStorage.removeItem(INSTRUMENT_STORAGE_KEY);
  });

  it("previews violin C major from C4", async () => {
    renderStudio();
    fireEvent.click(screen.getByRole("tab", { name: "Pick notes" }));
    await waitFor(() => {
      expect(screen.getByTestId("staff-midis").textContent).toBe(
        "60,62,64,65,67,69,71,72",
      );
    });
  });

  it("previews viola C major from C3 without changing the key", async () => {
    window.localStorage.setItem(INSTRUMENT_STORAGE_KEY, "viola");
    renderStudio();
    fireEvent.click(screen.getByRole("tab", { name: "Pick notes" }));
    await waitFor(() => {
      expect(screen.getByTestId("staff-midis").textContent).toBe(
        "48,50,52,53,55,57,59,60",
      );
    });
    expect(screen.getByRole("heading", { name: "C major" })).toBeInTheDocument();
  });
});
