import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PieceImportDropzone } from "@/features/piece-studio/PieceImportDropzone";
import { PIECE_STUDIO_UPLOAD_ACCEPT } from "@/features/piece-studio/pieceStudioImport";
import { OMR_COPY } from "@/features/piece-studio/omr/omrProvider";

describe("PieceImportDropzone", () => {
  it("shows one drop surface with format hint and unified accept", () => {
    render(<PieceImportDropzone onFile={vi.fn()} />);

    expect(screen.getByTestId("piece-import-dropzone")).toBeInTheDocument();
    expect(screen.getByText(OMR_COPY.dropMusic)).toBeInTheDocument();
    expect(screen.getByText(OMR_COPY.dropFormats)).toBeInTheDocument();
    expect(screen.queryByText(OMR_COPY.uploadSheet)).not.toBeInTheDocument();
    expect(screen.queryByText(OMR_COPY.advancedDigital)).not.toBeInTheDocument();
    expect(screen.queryByText(/choose file/i)).not.toBeInTheDocument();

    const input = screen.getByLabelText(OMR_COPY.importMusic);
    expect(input).toHaveAttribute("type", "file");
    const accept = input.getAttribute("accept") ?? "";
    expect(accept).toBe(PIECE_STUDIO_UPLOAD_ACCEPT);
    for (const ext of [".pdf", ".png", ".jpg", ".jpeg", ".musicxml", ".xml", ".mxl"]) {
      expect(accept).toContain(ext);
    }
  });

  it("forwards a picked file", () => {
    const onFile = vi.fn();
    render(<PieceImportDropzone onFile={onFile} />);
    const input = screen.getByLabelText(OMR_COPY.importMusic);
    const file = new File(["%PDF"], "page.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("accepts a dropped file", () => {
    const onFile = vi.fn();
    render(<PieceImportDropzone onFile={onFile} />);
    const zone = screen.getByTestId("piece-import-dropzone");
    const file = new File([`xml`], "tune.musicxml", { type: "" });
    fireEvent.drop(zone, {
      dataTransfer: { files: [file], dropEffect: "copy" },
    });
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("highlights while dragging over", () => {
    render(<PieceImportDropzone onFile={vi.fn()} />);
    const zone = screen.getByTestId("piece-import-dropzone");
    fireEvent.dragEnter(zone, { dataTransfer: { files: [] } });
    expect(zone).toHaveAttribute("data-dragging", "true");
    fireEvent.dragLeave(zone, { dataTransfer: { files: [] } });
    expect(zone).not.toHaveAttribute("data-dragging");
  });
});
