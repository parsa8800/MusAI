import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { PieceImportReview } from "@/features/piece-studio/PieceImportReview";
import { OMR_COPY } from "@/features/piece-studio/omr/omrProvider";
import type { PieceImportDraft } from "@/features/piece-studio/pieceStudioImport";
import { parseMusicXmlToScore } from "@/features/piece-studio/score/parseMusicXml";
import { TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";
import type { ScorePaintState } from "@/features/piece-studio/score/OsmdScoreAdapter";

const paintStateRef = vi.hoisted(() => ({
  next: "ready" as ScorePaintState,
}));

vi.mock("@/features/piece-studio/score/OsmdScoreAdapter", () => ({
  OsmdScoreAdapter: ({
    title,
    highlight,
    onPaintState,
  }: {
    title: string;
    highlight?: { label?: string } | null;
    onPaintState?: (state: ScorePaintState) => void;
  }) => {
    useEffect(() => {
      onPaintState?.("preparing");
      onPaintState?.(paintStateRef.next);
      // Mount-only: parent callback identity must not re-trigger paint reports.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return (
      <div data-testid="piece-osmd">
        {title}
        {highlight?.label ? (
          <span data-testid="piece-osmd-highlight">{highlight.label}</span>
        ) : null}
      </div>
    );
  },
}));

function readyDraft(
  partial: Partial<PieceImportDraft> = {},
): PieceImportDraft {
  const file = new File(["png"], "page.png", { type: "image/png" });
  const structured = parseMusicXmlToScore(TWINKLE_XML, "Etude");
  return {
    sessionId: "import-1",
    file,
    sourceKind: "image",
    sourceFileName: "page.png",
    sourceMimeType: "image/png",
    title: "Etude",
    composer: null,
    recognitionStatus: "ready",
    recognitionMessage: null,
    musicXml: TWINKLE_XML,
    structured,
    recognitionHints: [],
    recognitionFocusMeasure: null,
    ...partial,
  };
}

function failedDraft(
  partial: Partial<PieceImportDraft> = {},
): PieceImportDraft {
  return readyDraft({
    recognitionStatus: "failed",
    recognitionMessage: OMR_COPY.failed,
    musicXml: null,
    structured: null,
    ...partial,
  });
}

describe("PieceImportReview", () => {
  it("keeps Use this score disabled until the score has painted", async () => {
    paintStateRef.next = "preparing";
    const onConfirm = vi.fn();
    const { unmount } = render(
      <PieceImportReview
        draft={readyDraft()}
        onConfirm={onConfirm}
        onTryAgain={vi.fn()}
        onChooseAnotherFile={vi.fn()}
      />,
    );

    expect(await screen.findByText(OMR_COPY.preparingScore)).toBeInTheDocument();
    expect(screen.getByTestId("piece-import-review")).toHaveAttribute(
      "data-state",
      "preparing",
    );
    expect(screen.queryByTestId("piece-import-confirm")).not.toBeInTheDocument();
    expect(screen.getByTestId("piece-import-paint-host")).toBeInTheDocument();
    unmount();

    paintStateRef.next = "ready";
    render(
      <PieceImportReview
        draft={readyDraft({ sessionId: "import-1b" })}
        onConfirm={onConfirm}
        onTryAgain={vi.fn()}
        onChooseAnotherFile={vi.fn()}
      />,
    );

    expect(await screen.findByTestId("piece-import-confirm")).toHaveTextContent(
      OMR_COPY.looksGood,
    );
    expect(screen.getByTestId("piece-import-review")).toHaveAttribute(
      "data-state",
      "ready",
    );
    fireEvent.click(screen.getByTestId("piece-import-confirm"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("shows Original | Digital score with Use this score after successful paint", async () => {
    paintStateRef.next = "ready";
    const onConfirm = vi.fn();
    const onTryAgain = vi.fn();
    render(
      <PieceImportReview
        draft={readyDraft()}
        onConfirm={onConfirm}
        onTryAgain={onTryAgain}
        onChooseAnotherFile={vi.fn()}
      />,
    );

    expect(await screen.findByTestId("piece-osmd")).toHaveTextContent("Etude");
    expect(screen.getByRole("heading", { name: "Etude" })).toBeInTheDocument();
    expect(screen.queryByText(OMR_COPY.statusReady)).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: OMR_COPY.originalLabel })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: OMR_COPY.musaiScoreLabel }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("piece-import-confirm")).toHaveTextContent(
      OMR_COPY.looksGood,
    );
    expect(screen.getByText(OMR_COPY.confirmLead)).toBeInTheDocument();
    expect(screen.queryByTestId("piece-import-keep-original")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("piece-import-confirm"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("shows a digital-only preview for MusicXML drafts (no Original compare)", async () => {
    paintStateRef.next = "ready";
    const structured = parseMusicXmlToScore(TWINKLE_XML, "Twinkle");
    render(
      <PieceImportReview
        draft={readyDraft({
          sourceKind: "musicxml",
          sourceFileName: "twinkle.musicxml",
          sourceMimeType: "",
          file: new File([TWINKLE_XML], "twinkle.musicxml", { type: "" }),
          title: "Twinkle",
          structured,
          musicXml: TWINKLE_XML,
        })}
        onConfirm={vi.fn()}
        onTryAgain={vi.fn()}
        onChooseAnotherFile={vi.fn()}
      />,
    );

    expect(await screen.findByTestId("piece-import-digital-preview")).toBeInTheDocument();
    expect(screen.getByTestId("piece-osmd")).toHaveTextContent("Twinkle");
    expect(screen.queryByRole("tab", { name: OMR_COPY.originalLabel })).not.toBeInTheDocument();
    expect(screen.getByTestId("piece-import-confirm")).toBeInTheDocument();
  });

  it("highlights a section that may need a closer look", async () => {
    paintStateRef.next = "ready";
    render(
      <PieceImportReview
        draft={readyDraft({ recognitionFocusMeasure: 1 })}
        onConfirm={vi.fn()}
        onTryAgain={vi.fn()}
        onChooseAnotherFile={vi.fn()}
      />,
    );

    expect(await screen.findByTestId("piece-import-check-section")).toHaveTextContent(
      OMR_COPY.checkSection,
    );
    expect(screen.getByTestId("piece-osmd-highlight")).toHaveTextContent(
      OMR_COPY.checkSection,
    );
  });

  it("on paint failure shows Couldn’t display this score without confirm or empty card", async () => {
    paintStateRef.next = "failed";
    const onChoose = vi.fn();
    const onTry = vi.fn();
    render(
      <PieceImportReview
        draft={readyDraft({
          sourceKind: "musicxml",
          sourceFileName: "twinkle.musicxml",
          file: new File([TWINKLE_XML], "twinkle.musicxml", { type: "" }),
        })}
        onConfirm={vi.fn()}
        onTryAgain={onTry}
        onChooseAnotherFile={onChoose}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: OMR_COPY.displayFailedTitle }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("piece-import-review")).toHaveAttribute(
      "data-state",
      "failed",
    );
    expect(screen.queryByTestId("piece-import-confirm")).not.toBeInTheDocument();
    expect(screen.queryByTestId("piece-import-digital-preview")).not.toBeInTheDocument();
    expect(screen.queryByText(OMR_COPY.emptyPreview)).not.toBeInTheDocument();
    expect(screen.getByTestId("piece-import-try-again")).toHaveTextContent(
      OMR_COPY.tryAgain,
    );
    expect(screen.getByTestId("piece-import-choose-another")).toHaveTextContent(
      OMR_COPY.chooseAnotherFile,
    );

    fireEvent.click(screen.getByTestId("piece-import-try-again"));
    expect(onTry).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId("piece-import-choose-another"));
    expect(onChoose).toHaveBeenCalledOnce();
  });

  it("on recognition failure shows Couldn’t read this score with try / choose another", async () => {
    paintStateRef.next = "ready";
    const onChoose = vi.fn();
    const onTry = vi.fn();
    render(
      <PieceImportReview
        draft={failedDraft()}
        onConfirm={vi.fn()}
        onTryAgain={onTry}
        onChooseAnotherFile={onChoose}
      />,
    );

    await waitFor(() => {
      expect(screen.getByAltText(/original/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("piece-osmd")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: OMR_COPY.failedTitle }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("piece-import-keep-original")).not.toBeInTheDocument();
    expect(screen.queryByTestId("piece-import-confirm")).not.toBeInTheDocument();
    expect(screen.getByTestId("piece-import-try-again")).toHaveTextContent(
      OMR_COPY.tryAnotherImage,
    );
    expect(screen.getByTestId("piece-import-choose-another")).toHaveTextContent(
      OMR_COPY.chooseAnotherFile,
    );

    fireEvent.click(screen.getByTestId("piece-import-try-again"));
    expect(onTry).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByTestId("piece-import-choose-another"));
    expect(onChoose).toHaveBeenCalledOnce();
  });

  it("shows Reading your music without empty containers", () => {
    paintStateRef.next = "ready";
    render(
      <PieceImportReview
        draft={null}
        processing
        processingLabel={OMR_COPY.reading}
        onConfirm={vi.fn()}
        onTryAgain={vi.fn()}
        onChooseAnotherFile={vi.fn()}
      />,
    );
    expect(screen.getByTestId("piece-import-review")).toHaveAttribute(
      "data-state",
      "reading",
    );
    expect(screen.getByTestId("piece-import-loading")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: OMR_COPY.openingScore }),
    ).toBeInTheDocument();
    expect(screen.getByText(OMR_COPY.reading)).toBeInTheDocument();
    expect(screen.getByText(OMR_COPY.readingPatience)).toBeInTheDocument();
    expect(screen.queryByTestId("piece-import-confirm")).not.toBeInTheDocument();
    expect(screen.queryByText(OMR_COPY.emptyPreview)).not.toBeInTheDocument();
    expect(screen.queryByText(/MusicXML/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bOMR\b/)).not.toBeInTheDocument();
  });
});
