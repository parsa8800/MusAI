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
          notes={[
            {
              note: "G",
              problem: "Held a little too short",
              fix: "Hold it for the full beat",
            },
          ]}
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
    const notes = [
      {
        note: "G",
        problem: "Held a little too short",
        fix: "Hold it for the full beat",
      },
    ];
    const { unmount } = render(
      <PieceRhythmHighlightPopup
        place="Bar 1"
        notes={notes}
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
        notes={notes}
        memoryKey="bar-1-g"
        claimFresh={claimFresh}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByLabelText("Thinking")).not.toBeInTheDocument();
    expect(screen.getByText("Held a little too short")).toBeInTheDocument();
    expect(screen.getByText("Hold it for the full beat")).toBeInTheDocument();
  });

  it("closes without clearing the selected chat issue", () => {
    render(<PopupHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Change selection" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("rhythm-highlight-popup")).not.toBeInTheDocument();
    expect(screen.getByTestId("preview-id")).toHaveTextContent("rhythm-a");
  });
});
