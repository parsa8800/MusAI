/**
 * End-to-end Piece Studio import pipeline tests against real fixture files.
 *
 * Coverage:
 *  - MusicXML (direct digital import)
 *  - multi-staff MusicXML
 *  - one-page PDF / multi-page PDF / PNG / JPG after recognition yields MusicXML
 *  - invalid non-music PDF failure hygiene (no corrupted catalog entry)
 *
 * Live Audiveris recognition is probed separately; when Java/Audiveris are not
 * installed the scan→MusicXML hop is exercised with a fixture MusicXML return
 * that mirrors a successful worker export (explicitly labeled in assertions).
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  clearPieceCatalog,
  getPieceWorkspaceBySlug,
  listPieceWorkspaces,
} from "@/features/piece-studio/pieceStudioCatalog";
import {
  clearPieceFileMemory,
  readPieceOriginalFile,
  readPieceRecognizedMusicXml,
  readPieceStructuredScore,
} from "@/features/piece-studio/pieceStudioFiles";
import {
  commitPieceImport,
  importPieceFromFile,
} from "@/features/piece-studio/pieceStudioImport";
import { OMR_COPY } from "@/features/piece-studio/omr/omrProvider";
import { resolveOmrProvider } from "@/features/piece-studio/omr/resolveOmrProvider";
import { buildPlaybackTimeline } from "@/features/piece-studio/playback/playbackTimeline";
import { expectedNotesFromScore } from "@/features/piece-studio/score/expectedNotes";
import { createDefaultScoreRenderer } from "@/features/piece-studio/score/createDefaultScoreRenderer";
import { musicXmlRenderSource } from "@/features/piece-studio/score/scoreRenderSource";

const FIXTURES = path.join(process.cwd(), "fixtures/piece-import");

function fixture(name: string): Buffer {
  const full = path.join(FIXTURES, name);
  if (!existsSync(full)) {
    throw new Error(`Missing fixture: ${full}`);
  }
  return readFileSync(full);
}

function fileFromFixture(
  name: string,
  mime: string,
  fileName = name,
): File {
  const buf = fixture(name);
  const bytes = new Uint8Array(buf.byteLength);
  bytes.set(buf);
  return new File([bytes], fileName, { type: mime });
}

type PipelineReport = {
  recognitionEngineConfigured: string | null;
  liveOmrAvailable: boolean;
  pdfRasterise: string;
  omrWorker: string;
  resultFormat: string;
  cases: Array<Record<string, unknown>>;
};

const REPORT: PipelineReport = {
  recognitionEngineConfigured: null,
  liveOmrAvailable: false,
  pdfRasterise:
    "worker: pdftoppm ≈300 DPI when Poppler is installed; else Audiveris ingests PDF",
  omrWorker:
    "services/omr-worker on http://127.0.0.1:8090 (outside Next.js / Vercel)",
  resultFormat: "MusicXML (text) → MusaiScoreV1",
  cases: [],
};

beforeAll(() => {
  const provider = resolveOmrProvider({
    MUSAI_OMR_PROVIDER: process.env.MUSAI_OMR_PROVIDER,
    MUSAI_OMR_URL: process.env.MUSAI_OMR_URL,
    MUSAI_FLAT_API_TOKEN: process.env.MUSAI_FLAT_API_TOKEN,
    FLAT_API_TOKEN: process.env.FLAT_API_TOKEN,
  });
  REPORT.recognitionEngineConfigured = provider.id;
});

afterEach(() => {
  clearPieceCatalog();
  clearPieceFileMemory();
});


async function importCommitted(
  file: File,
  deps?: Parameters<typeof importPieceFromFile>[2],
) {
  const result = await importPieceFromFile(file, new Date(), deps);
  if (result.status === "committed") return result.piece;
  if (result.status === "ready") return commitPieceImport(result.draft);
  throw new Error(`expected ready/committed import, got ${result.status}`);
}

describe("Piece Studio import pipeline (real fixtures)", () => {
  it("MusicXML: upload → normalise → render source → Listen timeline → Practise notes", async () => {
    const file = fileFromFixture(
      "twinkle.musicxml",
      "application/vnd.recordare.musicxml+xml",
    );
    const piece = await importCommitted(file);
    expect(piece.recognitionConfirmed).toBe(true);

    const xml = await readPieceRecognizedMusicXml(piece.pieceId);
    const structured = await readPieceStructuredScore(piece.pieceId);
    const original = await readPieceOriginalFile(piece.pieceId);
    expect(xml).toContain("<score-partwise");
    expect(structured).toBeTruthy();
    expect(original).toBeTruthy();

    expect(structured!.noteCount).toBe(14);
    expect(structured!.restCount).toBe(2);
    expect(structured!.keySignature).toBe("C major");
    expect(structured!.timeSignature).toBe("4/4");
    expect(structured!.tempoBpm).toBe(100);

    const notes = structured!.parts[0]!.measures.flatMap((m) =>
      m.events.filter((e) => e.kind === "note"),
    );
    expect(notes.every((n) => n.kind === "note" && n.durationQuarters === 1)).toBe(
      true,
    );

    const render = musicXmlRenderSource(xml!);
    expect(render.format).toBe("musicxml");
    expect(createDefaultScoreRenderer().id).toBe("opensheetmusicdisplay");

    const timeline = buildPlaybackTimeline(structured!);
    expect(timeline.notes).toHaveLength(14);
    expect(timeline.durationSec).toBeGreaterThan(0);
    expect(timeline.baseBpm).toBe(100);

    const expected = expectedNotesFromScore(structured!);
    expect(expected).toHaveLength(14);
    expect(expected[0]?.label).toMatch(/^C/);

    expect(getPieceWorkspaceBySlug(piece.slug)?.pieceId).toBe(piece.pieceId);

    REPORT.cases.push({
      file: "twinkle.musicxml",
      path: "direct MusicXML",
      recognition: "n/a",
      notes: structured!.noteCount,
      key: structured!.keySignature,
      time: structured!.timeSignature,
      listenNotes: timeline.notes.length,
      practiseNotes: expected.length,
      ok: true,
    });
  });

  it("multi-staff MusicXML: both parts parse; Listen/Practise use melody part", async () => {
    const file = fileFromFixture(
      "two-staff-study.musicxml",
      "application/vnd.recordare.musicxml+xml",
    );
    const piece = await importCommitted(file);
    const structured = await readPieceStructuredScore(piece.pieceId);
    expect(structured?.parts).toHaveLength(2);
    expect(structured?.parts[0]?.name).toMatch(/Violin I/i);
    expect(structured?.parts[1]?.name).toMatch(/Violin II/i);
    expect(structured?.keySignature).toBe("G major");
    expect(structured?.timeSignature).toBe("3/4");
    expect(structured?.tempoBpm).toBe(90);

    const p1Notes = structured!.parts[0]!.measures.flatMap((m) =>
      m.events.filter((e) => e.kind === "note"),
    );
    const p2Notes = structured!.parts[1]!.measures.flatMap((e) =>
      e.events.filter((ev) => ev.kind === "note"),
    );
    expect(p1Notes.length).toBeGreaterThan(0);
    expect(p2Notes.length).toBeGreaterThan(0);

    // Half note + dotted half survive conversion
    expect(p1Notes.some((n) => n.kind === "note" && n.durationQuarters === 2)).toBe(
      true,
    );
    expect(p2Notes.some((n) => n.kind === "note" && n.durationQuarters === 3)).toBe(
      true,
    );

    const timeline = buildPlaybackTimeline(structured!);
    expect(timeline.notes.length).toBeGreaterThan(0);
    const expected = expectedNotesFromScore(structured!);
    // Practise melody = first part only
    expect(expected.every((n) => n.measure === "1" || n.measure === "2")).toBe(
      true,
    );

    REPORT.cases.push({
      file: "two-staff-study.musicxml",
      path: "direct MusicXML multi-staff",
      parts: structured!.parts.length,
      key: structured!.keySignature,
      time: structured!.timeSignature,
      listenNotes: timeline.notes.length,
      practiseNotes: expected.length,
      ok: true,
    });
  });

  it.each([
    ["twinkle-one-page.pdf", "application/pdf", "one-page PDF"],
    ["twinkle-multi-page.pdf", "application/pdf", "multi-page PDF"],
    ["twinkle-scan.png", "image/png", "PNG scan"],
    ["twinkle-scan.jpg", "image/jpeg", "JPG scan"],
  ] as const)(
    "%s: upload → processing → MusicXML → normalise → Listen → Practise (post-OMR hop)",
    async (name, mime, label) => {
      // TEST ONLY: inject MusicXML to exercise the hop *after* recognition
      // without calling Audiveris. Production never does this — the worker
      // returns MusicXML derived from the uploaded PDF/PNG/JPG itself.
      const musicXml = fixture("twinkle.musicxml").toString("utf8");
      const recognizeSheet = async () => musicXml;
      const file = fileFromFixture(name, mime);
      const before = listPieceWorkspaces().length;
      const result = await importPieceFromFile(file, new Date(), {
        recognizeSheet,
      });

      expect(result.status).toBe("ready");
      if (result.status !== "ready") return;
      expect(result.draft.recognitionStatus).toBe("ready");
      expect(result.draft.structured?.noteCount).toBe(14);
      expect(listPieceWorkspaces()).toHaveLength(before);

      const structured = result.draft.structured!;
      expect(structured.keySignature).toBe("C major");
      expect(structured.timeSignature).toBe("4/4");

      const timeline = buildPlaybackTimeline(structured);
      expect(timeline.notes).toHaveLength(14);
      const expected = expectedNotesFromScore(structured);
      expect(expected).toHaveLength(14);

      // Catalog + IndexedDB only after confirm
      const confirmed = await commitPieceImport(result.draft);
      expect(listPieceWorkspaces().some((p) => p.pieceId === confirmed.pieceId)).toBe(
        true,
      );
      expect(await readPieceOriginalFile(confirmed.pieceId)).toBeTruthy();
      expect(await readPieceRecognizedMusicXml(confirmed.pieceId)).toContain(
        "score-partwise",
      );

      REPORT.cases.push({
        file: name,
        label,
        recognition: "test-injected MusicXML (not a production Twinkle fallback)",
        notes: structured!.noteCount,
        key: structured!.keySignature,
        time: structured!.timeSignature,
        listenNotes: timeline.notes.length,
        practiseNotes: expected.length,
        originalPersisted: true,
        ok: true,
      });
    },
  );

  it("invalid non-music PDF: recognition fails without creating a library piece", async () => {
    const before = listPieceWorkspaces().length;
    const file = fileFromFixture("not-music.pdf", "application/pdf");
    const result = await importPieceFromFile(file, new Date(), {
      recognizeSheet: async () => {
        throw new Error(OMR_COPY.noMusic);
      },
    });

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.draft.recognitionMessage).toBe(OMR_COPY.noMusic);
    expect(result.draft.musicXml).toBeNull();
    expect(result.draft.structured).toBeNull();
    expect(result.draft.file.size).toBeGreaterThan(0);
    expect(listPieceWorkspaces().length).toBe(before);
    expect(getPieceWorkspaceBySlug("not-music")).toBeNull();

    REPORT.cases.push({
      file: "not-music.pdf",
      recognition: "failed (expected)",
      corrupted: false,
      catalogUnchanged: true,
      ok: true,
    });
  });

  it("unavailable live OMR does not invent a digital score for a PDF", async () => {
    expect(
      resolveOmrProvider({ NODE_ENV: "production" }).id,
    ).toBe("unavailable");

    const file = fileFromFixture("twinkle-one-page.pdf", "application/pdf");
    const before = listPieceWorkspaces().length;
    const result = await importPieceFromFile(file, new Date(), {
      recognizeSheet: async () => {
        throw new Error(OMR_COPY.unavailable);
      },
    });
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.draft.musicXml).toBeNull();
    expect(result.draft.structured).toBeNull();
    expect(listPieceWorkspaces().length).toBe(before);

    REPORT.cases.push({
      file: "twinkle-one-page.pdf",
      recognition: "unavailable provider — no fake score",
      ok: true,
    });
  });
});

describe("Live OMR probe (Audiveris worker)", () => {
  it("records whether the dedicated worker is reachable", async () => {
    const base =
      process.env.MUSAI_OMR_URL?.replace(/\/$/, "") || "http://127.0.0.1:8090";
    let live = false;
    let detail: Record<string, unknown> = { reachable: false };
    try {
      const res = await fetch(`${base}/healthz`, {
        signal: AbortSignal.timeout(1500),
      });
      const body = (await res.json()) as Record<string, unknown>;
      live = res.ok && body.ok === true;
      detail = { reachable: true, ...body };
      REPORT.liveOmrAvailable = live;
    } catch (err) {
      detail = {
        reachable: false,
        error: err instanceof Error ? err.message : String(err),
      };
      REPORT.liveOmrAvailable = false;
    }
    // Soft assertion: environment may not have Java/Audiveris yet.
    expect(detail).toBeTruthy();
    console.info("[piece-import-e2e] live OMR probe", detail);
    console.info("[piece-import-e2e] report", JSON.stringify(REPORT, null, 2));
  });
});
