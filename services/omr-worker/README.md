# MusAI OMR worker (Audiveris)

Dedicated recognition service for Piece Studio. **Next.js / Vercel never runs Audiveris.**

```
Browser → POST /api/piece-omr/jobs → AudiverisOmrProvider → this worker
Browser → GET  /api/piece-omr/jobs/:id (poll) → MusicXML → Piece Studio parser
```

## Local setup (macOS / host)

1. Install **Java 17+** (Temurin) and [Audiveris](https://github.com/Audiveris/audiveris/releases) (macOS `.dmg`).
2. Optional but recommended: `brew install poppler` so PDFs are rasterised at ~300 DPI.
3. Point the worker at Audiveris if it is not on `PATH`:

```bash
export AUDIVERIS_BIN="/Applications/Audiveris.app/Contents/MacOS/Audiveris"
```

4. Start the worker:

```bash
npm run omr-worker
# → http://127.0.0.1:8090
curl -s http://127.0.0.1:8090/healthz
# expect audiverisConfigured: true
```

5. In `.env.local` (restart `npm run dev` after):

```bash
MUSAI_OMR_PROVIDER=audiveris
MUSAI_OMR_URL=http://127.0.0.1:8090
```

In local/dev, Piece Studio already defaults to the Audiveris worker on `:8090` when unset — but you still need the worker running with Audiveris installed.

## Docker (includes Audiveris)

```bash
npm run omr-worker:docker
# or:
docker build -t musai-omr-worker ./services/omr-worker
docker run --rm -p 8090:8090 musai-omr-worker
```

## API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/healthz` | Liveness + whether Audiveris binary responds |
| `POST` | `/v1/jobs` | Multipart `file` → `{ jobId, status: "queued" }` |
| `GET` | `/v1/jobs/:id` | `{ status, musicXml?, error? }` |

Statuses: `queued` → `processing` → `completed` | `failed`.

## Pipeline

1. Validate PDF / PNG / JPG
2. PDF → `pdftoppm -png -r 300` (page order preserved); if Poppler is missing, feed the PDF to Audiveris directly
3. `Audiveris -batch -export` → `.mxl` / MusicXML
4. Return MusicXML text; delete temp files

## Production

Run this directory as a long-lived container. Point `MUSAI_OMR_URL` at the private worker URL. Do **not** bundle Audiveris into the Vercel deployment.

## Env

| Variable | Default | Meaning |
|----------|---------|---------|
| `PORT` / `OMR_PORT` | `8090` | Listen port |
| `OMR_HOST` | `127.0.0.1` (Docker: `0.0.0.0`) | Bind address |
| `AUDIVERIS_BIN` | auto-probed / `audiveris` | CLI path |
| `PDFTOPPM_BIN` | `pdftoppm` | PDF rasteriser |
| `OMR_DPI` | `300` | Raster DPI |
| `OMR_TOKEN` | _(empty)_ | Optional bearer token |
| `OMR_JOB_TIMEOUT_MS` | `300000` | Audiveris timeout |
| `OMR_TMP_DIR` | OS temp | Work directories |
