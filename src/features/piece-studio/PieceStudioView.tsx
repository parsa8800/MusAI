"use client";

import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";
import { StudioViewport } from "@/components/StudioViewport";
import {
  listPieceWorkspaces,
  removePieceWorkspace,
} from "@/features/piece-studio/pieceStudioCatalog";
import { PieceImportDropzone } from "@/features/piece-studio/PieceImportDropzone";
import { pieceLibraryCardModel } from "@/features/piece-studio/practice/piecePracticeCopy";
import { PieceLibraryCard } from "@/features/piece-studio/PieceLibraryCard";
import {
  readPieceOriginalFile,
  readPieceRecognizedMusicXml,
  readPieceStructuredScore,
  removePieceOriginalFile,
} from "@/features/piece-studio/pieceStudioFiles";
import {
  commitPieceImport,
  discardPieceImport,
  draftFromCatalogPiece,
  hrefForImportedPiece,
  importPhaseLabel,
  importPieceFromFile,
  needsImportReview,
  purgeIncompleteImports,
  type ImportPiecePhase,
  type PieceImportDraft,
} from "@/features/piece-studio/pieceStudioImport";
import { OMR_COPY } from "@/features/piece-studio/omr/omrProvider";
import { pieceWorkspaceHref } from "@/features/piece-studio/pieceStudioRoutes";
import type { PieceWorkspaceV1 } from "@/features/piece-studio/pieceStudioTypes";
import { tapFeedback } from "@/lib/motion";

const PieceImportReview = dynamic(
  () =>
    import("@/features/piece-studio/PieceImportReview").then((m) => ({
      default: m.PieceImportReview,
    })),
  { ssr: false },
);

/**
 * Piece Studio home — one import surface, then confirm the digital score.
 * Catalog is read after mount so SSR and the first client paint stay identical.
 * Permanent pieces are created only after a validated score is confirmed.
 */
export function PieceStudioView() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const importDraftRef = useRef<PieceImportDraft | null>(null);
  const [revision, setRevision] = useState(0);
  const [phase, setPhase] = useState<ImportPiecePhase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pieces, setPieces] = useState<PieceWorkspaceV1[] | null>(null);
  const [importDraft, setImportDraft] = useState<PieceImportDraft | null>(null);
  const [committing, setCommitting] = useState(false);
  const [readingHint, setReadingHint] = useState<string | null>(null);
  importDraftRef.current = importDraft;

  useEffect(() => {
    let cancelled = false;
    void purgeIncompleteImports().then(() => {
      if (!cancelled) setPieces(listPieceWorkspaces());
    });
    return () => {
      cancelled = true;
    };
  }, [revision]);

  // Optional PDF/photo scanning health — hint only; never disables digital import.
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/piece-omr")
      .then(async (res) => {
        if (!res.ok) {
          return { available: false };
        }
        return (await res.json()) as {
          available?: boolean;
        };
      })
      .then((data) => {
        if (cancelled) return;
        setReadingHint(
          Boolean(data.available) ? null : OMR_COPY.scanningUnavailable,
        );
      })
      .catch(() => {
        if (!cancelled) {
          setReadingHint(OMR_COPY.scanningUnavailable);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Abandon temporary import if the user leaves Piece Studio mid-review.
  useEffect(() => {
    return () => {
      void discardPieceImport(importDraftRef.current);
    };
  }, []);

  const clearDraft = async () => {
    await discardPieceImport(importDraftRef.current);
    setImportDraft(null);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    await clearDraft();
    setPhase("uploading");
    try {
      const result = await importPieceFromFile(file, new Date(), {
        onPhase: setPhase,
      });
      tapFeedback("medium");
      if (result.status === "committed") {
        setRevision((n) => n + 1);
        router.push(hrefForImportedPiece(result.piece));
        return;
      }
      setImportDraft(result.draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t import that file.");
    } finally {
      setPhase(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (pieceId: string) => {
    await removePieceOriginalFile(pieceId);
    removePieceWorkspace(pieceId);
    setRevision((n) => n + 1);
  };

  const onConfirmReview = async () => {
    if (!importDraft || committing) return;
    tapFeedback("medium");
    setCommitting(true);
    try {
      const confirmed = await commitPieceImport(importDraft);
      setImportDraft(null);
      setRevision((n) => n + 1);
      router.push(hrefForImportedPiece(confirmed));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn’t save that score.",
      );
      await clearDraft();
    } finally {
      setCommitting(false);
    }
  };

  const onTryAgain = async () => {
    tapFeedback("light");
    await clearDraft();
    fileRef.current?.click();
  };

  const onChooseAnotherFile = async () => {
    tapFeedback("light");
    await clearDraft();
  };

  const openLegacyReview = async (piece: PieceWorkspaceV1) => {
    const [xml, blob, structured] = await Promise.all([
      readPieceRecognizedMusicXml(piece.pieceId),
      readPieceOriginalFile(piece.pieceId),
      readPieceStructuredScore(piece.pieceId),
    ]);
    if (!xml || !blob || !structured) {
      setError("That score isn’t ready to review yet.");
      return;
    }
    const draft = await draftFromCatalogPiece(piece, blob, xml, structured);
    setImportDraft(draft);
  };

  const ready = pieces !== null;
  const list = pieces ?? [];
  const busy = phase != null;
  const libraryLabel = "Your pieces";
  const inReview = busy || importDraft != null;

  if (inReview) {
    return (
      <StudioViewport>
        <div className="musai-piece-home musai-piece-home--review">
          <header className="musai-piece-home__nav">
            <PracticeHubBackLink className="!mb-0 shrink-0" />
          </header>
          <PieceImportReview
            key={importDraft?.sessionId ?? (busy ? "processing" : "idle")}
            draft={importDraft}
            processing={busy && !importDraft}
            processingLabel={phase ? importPhaseLabel(phase) : OMR_COPY.reading}
            onConfirm={() => void onConfirmReview()}
            onTryAgain={() => void onTryAgain()}
            onChooseAnotherFile={() => void onChooseAnotherFile()}
          />
        </div>
      </StudioViewport>
    );
  }

  return (
    <StudioViewport>
      <div className="musai-piece-home">
        <header className="musai-piece-home__nav">
          <PracticeHubBackLink className="!mb-0 shrink-0" />
        </header>

        <div className="musai-piece-home__shell">
          <header className="musai-piece-home__intro">
            <h1 className="musai-piece-home__title font-display">Piece studio</h1>
          </header>

          <section
            className="musai-piece-home__action"
            aria-label="Import"
          >
            <PieceImportDropzone
              inputRef={fileRef}
              busy={busy}
              busyLabel={phase ? importPhaseLabel(phase) : null}
              onFile={(file) => void onFile(file)}
            />

            {readingHint ? (
              <p className="musai-piece-home__hint" role="status">
                {readingHint}
              </p>
            ) : null}

            {error ? (
              <p className="musai-piece-home__error" role="alert">
                {error}
              </p>
            ) : null}
          </section>

          <section
            className="musai-piece-home__library"
            aria-label="Your pieces"
            data-empty={!ready || list.length === 0 ? "true" : undefined}
          >
            {!ready ? (
              <div className="musai-piece-home__empty" role="status">
                <div className="musai-piece-home__spinner" aria-hidden />
                <span className="sr-only">Loading</span>
              </div>
            ) : list.length === 0 ? null : (
              <>
                <div className="musai-piece-home__library-head">
                  <h2 className="musai-piece-home__library-title">
                    {libraryLabel}
                  </h2>
                </div>
                <ul className="musai-scroll musai-piece-library">
                  {list.map((piece) => {
                    const needsCheck = needsImportReview(piece);
                    const model = pieceLibraryCardModel(piece, { needsCheck });
                    return (
                      <PieceLibraryCard
                        key={piece.pieceId}
                        href={pieceWorkspaceHref(piece.slug)}
                        model={model}
                        onOpen={() => {
                          tapFeedback("light");
                          if (needsCheck) {
                            void openLegacyReview(piece);
                            return;
                          }
                          router.push(pieceWorkspaceHref(piece.slug));
                        }}
                        onRemove={() => void remove(piece.pieceId)}
                      />
                    );
                  })}
                </ul>
              </>
            )}
          </section>
        </div>
      </div>
    </StudioViewport>
  );
}
