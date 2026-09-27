import { describe, expect, it } from "vitest";
import {
  dataTransferMatchesMusaiAccept,
  fileMatchesMusaiAccept,
  filterMusaiImportFiles,
  MUSAI_AUDIO_UPLOAD_ACCEPT,
  musaiImportRejectMessage,
  parseMusaiAccept,
} from "@/lib/musaiFileImport";

function file(name: string, type: string, size = 128) {
  return new File([new Uint8Array(size)], name, { type });
}

describe("musaiFileImport helpers", () => {
  it("parses extensions and MIME wildcards", () => {
    const tokens = parseMusaiAccept("audio/*,.wav,.PDF,image/png");
    expect(tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mimeWildcard: true, mime: "audio/" }),
        expect.objectContaining({ extension: "wav" }),
        expect.objectContaining({ extension: "pdf" }),
        expect.objectContaining({ mime: "image/png", mimeWildcard: false }),
      ]),
    );
  });

  it("matches files by extension or MIME", () => {
    expect(
      fileMatchesMusaiAccept(file("a.WAV", "audio/wav"), MUSAI_AUDIO_UPLOAD_ACCEPT),
    ).toBe(true);
    expect(
      fileMatchesMusaiAccept(file("clip.bin", "audio/mpeg"), MUSAI_AUDIO_UPLOAD_ACCEPT),
    ).toBe(true);
    expect(
      fileMatchesMusaiAccept(file("notes.pdf", "application/pdf"), MUSAI_AUDIO_UPLOAD_ACCEPT),
    ).toBe(false);
    expect(fileMatchesMusaiAccept(file("any.bin", "application/octet-stream"), "")).toBe(
      true,
    );
  });

  it("filters type and size through one gate", () => {
    const ok = filterMusaiImportFiles(
      [file("take.mp3", "audio/mpeg", 100)],
      { accept: MUSAI_AUDIO_UPLOAD_ACCEPT, maxSizeBytes: 200 },
    );
    expect(ok.accepted).toHaveLength(1);
    expect(ok.reason).toBeNull();

    const tooBig = filterMusaiImportFiles(
      [file("take.mp3", "audio/mpeg", 500)],
      { accept: MUSAI_AUDIO_UPLOAD_ACCEPT, maxSizeBytes: 200 },
    );
    expect(tooBig.accepted).toHaveLength(0);
    expect(tooBig.reason).toBe("size");
    expect(tooBig.message).toMatch(/too large/i);

    const wrong = filterMusaiImportFiles(
      [file("page.pdf", "application/pdf")],
      { accept: MUSAI_AUDIO_UPLOAD_ACCEPT },
    );
    expect(wrong.reason).toBe("type");
  });

  it("enforces single vs multiple selection", () => {
    const files = [
      file("a.wav", "audio/wav"),
      file("b.wav", "audio/wav"),
    ];
    const single = filterMusaiImportFiles(files, {
      accept: MUSAI_AUDIO_UPLOAD_ACCEPT,
      multiple: false,
    });
    expect(single.reason).toBe("too-many");
    expect(musaiImportRejectMessage("too-many", { maxFiles: 1 })).toMatch(
      /one file/i,
    );

    const multi = filterMusaiImportFiles(files, {
      accept: MUSAI_AUDIO_UPLOAD_ACCEPT,
      multiple: true,
      maxFiles: 3,
    });
    expect(multi.accepted).toHaveLength(2);
  });

  it("best-effort matches DataTransfer MIME during drag", () => {
    const dt = {
      items: [{ kind: "file", type: "audio/mpeg" }],
      types: ["Files"],
    } as unknown as DataTransfer;
    expect(dataTransferMatchesMusaiAccept(dt, MUSAI_AUDIO_UPLOAD_ACCEPT)).toBe(
      true,
    );

    const bad = {
      items: [{ kind: "file", type: "application/pdf" }],
      types: ["Files"],
    } as unknown as DataTransfer;
    expect(dataTransferMatchesMusaiAccept(bad, MUSAI_AUDIO_UPLOAD_ACCEPT)).toBe(
      false,
    );

    const unknown = {
      items: [{ kind: "file", type: "" }],
      types: ["Files"],
    } as unknown as DataTransfer;
    expect(
      dataTransferMatchesMusaiAccept(unknown, MUSAI_AUDIO_UPLOAD_ACCEPT),
    ).toBe("unknown");
  });
});
