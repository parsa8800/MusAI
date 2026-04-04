# MusAI

Violin-focused practice assistant: analyze a recording against target pitches, score intonation, and give per-note feedback.

**Current phase:** MVP — single target note + upload/record → pitch detection → sharp/flat feedback and a simple accuracy score.

Stack: [Next.js](https://nextjs.org) (App Router), TypeScript, Tailwind CSS.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Roadmap (high level)

1. Intonation scoring vs. expected notes (scales, then short excerpts)
2. Clearer feedback copy (optional LLM layer on top of measured data)
3. Accounts, billing, and teacher/student workflows

## License

Private / TBD — this repo is intended for a commercial product.
