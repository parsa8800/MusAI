# MusAI architecture

Ownership map for the product codebase. Behaviour changes do not belong in
structure-only refactors.

## Layers

| Layer | Path | Owns |
|-------|------|------|
| Routes | `src/app/` | Thin App Router pages and API routes. No domain logic. |
| Features | `src/features/*` | Product domains (Piece, Scale, Tuner, …). |
| Shared UI | `src/components/` | Chrome used by more than one studio (capture, coach shell, viewport). |
| Shared lib | `src/lib/` | Primitives: pitch DSP, intonation maths, instrument profiles, mic helpers. |
| OMR worker | `services/omr-worker/` | Audiveris / sheet recognition off the Next request path. |

```
Route (app/practice/…)
  → Feature view (features/…)
    → Shared chrome (components/) + shared DSP / instrument (lib/)
```

## Feature modules

### Piece Studio — `src/features/piece-studio/`

Internal folders: `score/`, `playback/`, `practice/`, `feedback/analyzers/`,
`feedback/visual/`, `omr/`, `pitch/`.

- Domain storage keys: `musai-piece-*` only.
- Feedback skills are pluggable analyzers orchestrated by `runPieceFeedback`.
- OSMD stays behind `score/OpenSheetMusicDisplayRenderer`.
- Must not import Scale session, progress, detection, or Scale notation.

### Scale Studio — `src/features/scale-studio/`

Scale practice UI, session, detection, take scoring, and progress.

- Domain storage keys: `musai-scale-*` only.
- Must not import Piece catalog, OSMD, or piece feedback types.
- Live entry points are `ScaleStudioSelector` and `ScaleWorkspace`.
  The old `ScalePracticeFlow` entry was removed.

Thin re-exports under `src/components/Scale*` and `src/lib/scale*` keep
older import paths working while call sites move to `@/features/scale-studio`.

### Tuner — `src/features/tuner/`

Open-string / chromatic tuner UI and hold logic.

## Shared vs studio-specific

**Shared (improve once, both studios benefit):**

- Pitch frames and mono decode — `src/lib/analyzePitch.ts`
- Intonation maths — `src/lib/intonation.ts`, `src/lib/intonationScore.ts`
- Instrument profiles — `src/lib/instrument/*`
- Recording chrome — `MusaiMicCapturePanel`, `MusaiCaptureDock`, `.musai-rec-bar`
- Viewport / coach shell chrome
- Coach HTTP transport — `src/lib/coachChatTransport.ts` (domain prompts stay per studio)

**Studio-specific (do not merge for DRY):**

- Note-to-slot matching (Scale vs Piece bow/repeat rules)
- Sessions, progress keys, coach domain prompts
- Score engraving (VexFlow scale staff vs OSMD piece scores)

## Instruments

One implementation per studio. Violin / Viola / future instruments differ only
through `InstrumentProfile` and helpers under `src/lib/instrument/`. Do not
fork `ViolinPieceStudio` / `ViolaScaleStudio`.

## Rules of change

1. Prefer move-only and extract-only PRs; keep scoring thresholds and UI copy
   unchanged unless the task is product work.
2. New studios follow Piece’s feature-folder shape.
3. Isolation tests under each feature guard domain bleed.
4. Do not spawn OMR / Audiveris inside Vercel request handlers.
