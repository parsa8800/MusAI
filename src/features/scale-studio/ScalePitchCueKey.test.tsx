import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScalePitchCueKey } from "@/components/ScalePitchCueKey";

describe("ScalePitchCueKey", () => {
  it("shows coaching cues: colour plus what to try next", () => {
    render(<ScalePitchCueKey />);
    expect(
      screen.getByRole("group", { name: /What to try on the next take/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("In tune")).toBeInTheDocument();
    expect(screen.getByText("Go lower")).toBeInTheDocument();
    expect(screen.getByText("Go higher")).toBeInTheDocument();
    expect(screen.getByText("Missed")).toBeInTheDocument();
    expect(document.querySelector(".musai-pitch-key__chip--ok")).toBeTruthy();
    expect(document.querySelector(".musai-pitch-key__chip--high")).toBeTruthy();
    expect(document.querySelector(".musai-pitch-key__chip--low")).toBeTruthy();
    expect(document.querySelector(".musai-pitch-key__chip--miss")).toBeTruthy();
    expect(screen.queryByText(/^Too high$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Too low$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Sharp$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Flat$/i)).not.toBeInTheDocument();
  });
});
