import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScoreRing } from "../ScoreRing";

describe("ScoreRing", () => {
  it("renders rounded score and label", () => {
    render(<ScoreRing score={73} size={120} label="Match" />);
    expect(screen.getByText("73")).toBeInTheDocument();
    expect(screen.getByText("Match")).toBeInTheDocument();
  });

  it("clamps score display to 0–100", () => {
    render(<ScoreRing score={150} size={100} />);
    expect(screen.getByText("100")).toBeInTheDocument();
  });
});
