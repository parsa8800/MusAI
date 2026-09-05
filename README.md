# MusAI

Violin-focused practice assistant: record or upload a take, measure intonation, and get clear practice feedback.

## What works today

- **Violin tuner** — live pitch on open strings (G D A E), any octave of that note
- **Tuning trainer** — optional target letter → generous pitch-class score + coaching
- **Scale studio** — record or upload a scale; MusAI detects tonic / major–minor when you have not picked one, then colours each note. Optional written guide while you play.

Stack: [Next.js](https://nextjs.org) (App Router), TypeScript, Tailwind CSS, `pitchy`, VexFlow. Analysis runs in the browser (no backend required for scoring).

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm test          # Vitest unit + component tests
npm run test:e2e  # Playwright (requires `npx playwright install`)
```

## Roadmap (high level)

1. ~~Intonation scoring for single notes and scales~~ *(shipped)*
2. Template coaching + optional LLM tip (`OPENAI_API_KEY` in `.env.local`) on measured scale data
3. Accounts, billing, and teacher/student workflows

### Optional AI tips + coach chat

1. Copy `.env.example` → `.env.local` (already set up if you use the local file).
2. Set `OPENAI_API_KEY=sk-...` from [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
3. Restart `npm run dev`.

Without a key, results and chat use short template replies. With a key, `/api/scale-coaching` and `/api/scale-coach-chat` call OpenAI on measured JSON only (never raw audio).

## License

Private / TBD — this repo is intended for a commercial product.
