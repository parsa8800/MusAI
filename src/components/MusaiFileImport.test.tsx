import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MusaiFileImport } from "@/components/MusaiFileImport";
import { MUSAI_AUDIO_UPLOAD_ACCEPT } from "@/lib/musaiFileImport";

function dropFile(target: Element, file: File, types: string[] = ["Files"]) {
  fireEvent.drop(target, {
    dataTransfer: {
      files: [file],
      items: [{ kind: "file", type: file.type, getAsFile: () => file }],
      types,
    },
  });
}

describe("MusaiFileImport", () => {
  it("routes click and drop through the same onFilesSelected handler", () => {
    const onFilesSelected = vi.fn();
    const inputRef = createRef<HTMLInputElement | null>();
    render(
      <MusaiFileImport
        acceptedFiles={MUSAI_AUDIO_UPLOAD_ACCEPT}
        label="Import audio"
        hint="WAV, MP3, or M4A"
        onFilesSelected={onFilesSelected}
        inputRef={inputRef}
      />,
    );

    const root = screen.getByTestId("musai-file-import");
    expect(root).toHaveAttribute("data-state", "idle");
    expect(screen.getByText("Import audio")).toBeInTheDocument();
    expect(screen.getByText("WAV, MP3, or M4A")).toBeInTheDocument();

    const picked = new File([new Uint8Array(32)], "take.wav", {
      type: "audio/wav",
    });
    fireEvent.change(inputRef.current!, { target: { files: [picked] } });
    expect(onFilesSelected).toHaveBeenCalledTimes(1);
    expect(onFilesSelected.mock.calls[0][0][0]).toBe(picked);

    const dropped = new File([new Uint8Array(32)], "drop.mp3", {
      type: "audio/mpeg",
    });
    dropFile(root, dropped);
    expect(onFilesSelected).toHaveBeenCalledTimes(2);
    expect(onFilesSelected.mock.calls[1][0][0]).toBe(dropped);
  });

  it("rejects unsupported drops without calling onFilesSelected", () => {
    const onFilesSelected = vi.fn();
    const onReject = vi.fn();
    render(
      <MusaiFileImport
        acceptedFiles={MUSAI_AUDIO_UPLOAD_ACCEPT}
        label="Import audio"
        onFilesSelected={onFilesSelected}
        onReject={onReject}
      />,
    );

    dropFile(
      screen.getByTestId("musai-file-import"),
      new File([new Uint8Array(8)], "page.pdf", { type: "application/pdf" }),
    );
    expect(onFilesSelected).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledWith(
      expect.stringMatching(/isn’t supported/i),
    );
  });

  it("shows processing, error, and success states", () => {
    const { rerender } = render(
      <MusaiFileImport
        acceptedFiles={MUSAI_AUDIO_UPLOAD_ACCEPT}
        label="Import audio"
        processing
        processingLabel="Reading your take"
        onFilesSelected={vi.fn()}
      />,
    );
    expect(screen.getByTestId("musai-file-import")).toHaveAttribute(
      "data-state",
      "processing",
    );
    expect(screen.getAllByText("Reading your take").length).toBeGreaterThan(0);
    expect(screen.getByRole("status")).toHaveTextContent("Reading your take");

    rerender(
      <MusaiFileImport
        acceptedFiles={MUSAI_AUDIO_UPLOAD_ACCEPT}
        label="Import audio"
        error="Couldn’t read that file"
        onFilesSelected={vi.fn()}
      />,
    );
    expect(screen.getByTestId("musai-file-import")).toHaveAttribute(
      "data-state",
      "error",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn’t read that file",
    );

    rerender(
      <MusaiFileImport
        acceptedFiles={MUSAI_AUDIO_UPLOAD_ACCEPT}
        label="Import audio"
        success="Ready"
        onFilesSelected={vi.fn()}
      />,
    );
    expect(screen.getByTestId("musai-file-import")).toHaveAttribute(
      "data-state",
      "success",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Ready");
  });

  it("marks valid vs invalid drag states from DataTransfer MIME", () => {
    render(
      <MusaiFileImport
        acceptedFiles={MUSAI_AUDIO_UPLOAD_ACCEPT}
        label="Import audio"
        onFilesSelected={vi.fn()}
      />,
    );
    const root = screen.getByTestId("musai-file-import");

    fireEvent.dragEnter(root, {
      dataTransfer: {
        items: [{ kind: "file", type: "audio/mpeg" }],
        types: ["Files"],
      },
    });
    expect(root).toHaveAttribute("data-state", "drag-valid");

    fireEvent.dragLeave(root, { dataTransfer: { types: ["Files"] } });
    // depth may still be >0 depending on bubbling; force leave to zero with second leave
    fireEvent.dragLeave(root, { dataTransfer: { types: ["Files"] } });

    fireEvent.dragEnter(root, {
      dataTransfer: {
        items: [{ kind: "file", type: "application/pdf" }],
        types: ["Files"],
      },
    });
    expect(root).toHaveAttribute("data-state", "drag-invalid");
  });

  it("supports keyboard activation on the surface", () => {
    const inputRef = createRef<HTMLInputElement | null>();
    const clickSpy = vi.fn();
    render(
      <MusaiFileImport
        acceptedFiles={MUSAI_AUDIO_UPLOAD_ACCEPT}
        label="Import audio"
        onFilesSelected={vi.fn()}
        inputRef={inputRef}
      />,
    );
    const button = screen.getByRole("button", { name: "Import audio" });
    if (inputRef.current) {
      inputRef.current.click = clickSpy;
    }
    fireEvent.keyDown(button, { key: "Enter" });
    expect(clickSpy).toHaveBeenCalled();
  });

  it("ignores a cancelled file picker and clears drag when leaving", () => {
    const onFilesSelected = vi.fn();
    const inputRef = createRef<HTMLInputElement | null>();
    render(
      <MusaiFileImport
        acceptedFiles={MUSAI_AUDIO_UPLOAD_ACCEPT}
        label="Import audio"
        onFilesSelected={onFilesSelected}
        inputRef={inputRef}
      />,
    );
    const root = screen.getByTestId("musai-file-import");

    fireEvent.change(inputRef.current!, { target: { files: [] } });
    expect(onFilesSelected).not.toHaveBeenCalled();

    fireEvent.dragEnter(root, {
      dataTransfer: {
        items: [{ kind: "file", type: "audio/wav" }],
        types: ["Files"],
      },
    });
    expect(root).toHaveAttribute("data-state", "drag-valid");
    fireEvent.dragLeave(root, { dataTransfer: { types: ["Files"] } });
    expect(root).toHaveAttribute("data-state", "idle");
  });

  it("allows repeated imports through the same handler", () => {
    const onFilesSelected = vi.fn();
    const inputRef = createRef<HTMLInputElement | null>();
    render(
      <MusaiFileImport
        acceptedFiles={MUSAI_AUDIO_UPLOAD_ACCEPT}
        label="Import audio"
        onFilesSelected={onFilesSelected}
        inputRef={inputRef}
      />,
    );
    const a = new File([new Uint8Array(8)], "a.wav", { type: "audio/wav" });
    const b = new File([new Uint8Array(8)], "b.wav", { type: "audio/wav" });
    fireEvent.change(inputRef.current!, { target: { files: [a] } });
    fireEvent.change(inputRef.current!, { target: { files: [b] } });
    expect(onFilesSelected).toHaveBeenCalledTimes(2);
    expect(onFilesSelected.mock.calls[0][0][0]).toBe(a);
    expect(onFilesSelected.mock.calls[1][0][0]).toBe(b);
  });
});
