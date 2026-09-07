import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScalePitchCueKey } from "@/components/ScalePitchCueKey";

describe("ScalePitchCueKey", () => {
  it("shows teacher-plain pitch cues that match staff colours", () => {
    render(<ScalePitchCueKey />);
    expect(
      screen.getByRole("group", { name: /How to read coloured notes/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("In tune")).toBeInTheDocument();
    expect(screen.getByText("Too high")).toBeInTheDocument();
    expect(screen.getByText("Too low")).toBeInTheDocument();
    expect(screen.getByText("Missed")).toBeInTheDocument();
    expect(screen.queryByText(/^Sharp$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Flat$/i)).not.toBeInTheDocument();
  });
});
