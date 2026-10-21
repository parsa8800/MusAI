import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { PieceRhythmHighlightPopup } from "@/features/piece-studio/feedback/visual/PieceRhythmHighlightPopup";

function PopupHarness() {
  const [previewId, setPreviewId] = useState("rhythm-b");
  const [explainId, setExplainId] = useState<string | null>("rhythm-b");
  const seen = new Set<string>();
  return (
    <div>
      <span data-testid="preview-id">{previewId}</span>
      <button type="button" onClick={() => setPreviewId("rhythm-a")}>
        Change selection
      </button>
      {explainId ? (
        <PieceRhythmHighlightPopup
          place="Bar 1"
          line="Hold E and F# as crotchets so each gets a full beat"
          memoryKey="rhythm-b"
          claimFresh={(key) => {
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          }}
          onClose={() => setExplainId(null)}
        />
      ) : null}
    </div>
  );
}

describe("PieceRhythmHighlightPopup", () => {
  it("types a highlight once and shows it finished the next time", () => {
    const seen = new Set<string>();
    const claimFresh = (key: string) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    };
    const line = "Hold E and F# as crotchets so each gets a full beat";
    const { unmount } = render(
      <PieceRhythmHighlightPopup
        place="Bar 1"
        line={line}
        memoryKey="bar-1-g"
        claimFresh={claimFresh}
        onClose={() => {}}
      />,
    );
    expect(screen.getByLabelText("Thinking")).toBeInTheDocument();
    unmount();
    render(
      <PieceRhythmHighlightPopup
        place="Bar 1"
        line={line}
        memoryKey="bar-1-g"
        claimFresh={claimFresh}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByLabelText("Thinking")).not.toBeInTheDocument();
    expect(screen.getByText(line)).toBeInTheDocument();
    expect(screen.queryByText(/what went wrong/i)).not.toBeInTheDocument();
  });

  it("shows bullet points for rhythm tips", () => {
    render(
      <PieceRhythmHighlightPopup
        place="Bar 7"
        bullets={["Both D quavers ran long", "Give each quaver half a beat"]}
        memoryKey="bar-7-d"
        claimFresh={() => false}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("list")).toHaveClass("musai-rhythm-popup__points");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Both D quavers ran long")).toBeInTheDocument();
  });

  it("closes without clearing the selected chat issue", () => {
    render(<PopupHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Change selection" }));
    fireEvent.click(screen.getByRole("button", { name: "All notes" }));
    expect(screen.queryByTestId("rhythm-highlight-popup")).not.toBeInTheDocument();
    expect(screen.getByTestId("preview-id")).toHaveTextContent("rhythm-a");
  });
});
