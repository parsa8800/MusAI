# Piece Studio import fixtures

**Test-only.** These files live under `fixtures/` and are **never** shipped into a user’s Piece Studio library, never preloaded as catalog data, and never used as a fallback when PDF/image recognition fails.

Production import always:

1. Accepts the **user’s** upload  
2. Runs recognition via `OMRProvider` → Audiveris worker (PDF/PNG/JPG) **or** parses MusicXML/MXL directly  
3. Uses **only** MusicXML returned for that upload  

If recognition fails, the import stays a temporary draft and **no** piece is created — Twinkle is not substituted.

Regenerate (needs pillow + reportlab on `PYTHONPATH`):

```bash
PYTHONPATH=./.pip-tools python3 scripts/generate-piece-import-fixtures.py
```

---

## Files and which tests use them

| Fixture | Role | Used by |
|---------|------|---------|
| `twinkle.musicxml` | Valid digital score — **1 part · 4 measures · 14 notes** (regression lock) | `twinkleMusicXmlRegression.test.tsx`, `pieceImportPipeline.e2e.test.ts`, `musicXmlImport.test.ts`, `unifiedImportFlow.test.tsx` |
| `two-staff-study.musicxml` | Multi-staff / multi-part MusicXML | `pieceImportPipeline.e2e.test.ts`, `musicXmlImport.test.ts` |
| `twinkle-one-page.pdf` | Clean one-page printed-style PDF | `pieceImportPipeline.e2e.test.ts`, `pieceImportReliability.test.ts`, `unifiedImportFlow.test.tsx` |
| `twinkle-multi-page.pdf` | Two-page PDF (page order) | `pieceImportPipeline.e2e.test.ts`, `pieceImportReliability.test.ts` |
| `twinkle-scan.png` | Photo/scan PNG | same + `unifiedImportFlow.test.tsx` |
| `twinkle-scan.jpg` | Photo/scan JPG (mime/path coverage) | same + `unifiedImportFlow.test.tsx` |
| `not-music.pdf` | Non-music PDF — must fail cleanly | `pieceImportPipeline.e2e.test.ts`, `pieceImportReliability.test.ts`, `unifiedImportFlow.test.tsx` |

### Related in-repo **string** fixtures (not binary files)

`src/features/piece-studio/score/musicXmlFixtures.ts` (`TWINKLE_XML`, `CANON_XML`) is for unit tests only (parser, timeline, mocked OMR responses). Same rule: **not** production data.

| Consumers of `TWINKLE_XML` / `CANON_XML` (no disk fixtures) |
|---|
| `parseMusicXml.test.ts`, `pieceStudioScore.test.ts`, `playbackTimeline.test.ts` |
| `omrProvider.test.ts`, `assessRecognitionHints.test.ts`, `pieceImportReliability.test.ts` (also uses disk) |
| `pieceStudioCatalog.test.ts`, `PieceStudioView.test.tsx`, `PieceImportReview.test.tsx` |
| `PieceWorkspaceView.test.tsx`, `PieceScorePaper.test.tsx`, `PiecePractiseDock.test.tsx` |
| `pieceFeedback.test.ts`, `PieceFeedbackReview.test.tsx`, `mockPieceFeedbackPreview.test.ts` |
| `analyzePiecePerformance.test.ts`, `src/app/api/piece-omr/route.test.ts`, `jobs/route.test.ts` |

Many unit tests inject `TWINKLE_XML` via a **test-only** `recognizeSheet` mock to exercise the post-OMR hop (parse → validate → draft → confirm) **without** calling Audiveris. That mock is never registered in the real app; production always calls `recognizeSheetMusic` → `/api/piece-omr/jobs` → worker.

---

## What is *not* a recognition fallback

Practise mode’s optional **Sample** coach preview (`mockPieceFeedbackPreview`) builds sample feedback issues from the **piece’s own** structured score. It does not load Twinkle fixtures or replace failed OMR.
