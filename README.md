# MusAI

AI-assisted violin practice: record a take, compare it to the target notes, and get feedback on intonation that a student can actually use.

**Live demo:** [https://mus-ai-xi.vercel.app](https://mus-ai-xi.vercel.app)

## What works today

- Record violin performances in the browser
- Scale practice with played notes compared to expected target notes
- Per-note classification as **sharp**, **flat**, or **in tune**
- Colour-coded note feedback on musical notation
- Overall intonation scoring, multiple attempts, and progress tracking
- Violin tuner and tuning trainer
- Optional AI coaching that explains what to improve (measured note data only — not raw audio)

## Stack

React, TypeScript, Next.js, browser audio APIs (`MediaRecorder` / Web Audio), in-browser pitch analysis, VexFlow notation, Vercel.

Scoring runs in the browser. There is no separate Python or FastAPI backend.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm test
```

Optional AI coaching: copy `.env.example` to `.env.local` and set `OPENAI_API_KEY` from [OpenAI API keys](https://platform.openai.com/api-keys). Without a key, results use short template replies.

## License

Copyright © 2026 Parsa Rahmanseresht. All rights reserved.
