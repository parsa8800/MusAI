<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

- Install dependencies with `npm ci`. Node 22 is already on the default image.
- `npm run dev` serves Next.js at http://127.0.0.1:3000 (hostname is loopback). The same script starts the OMR worker on http://127.0.0.1:8090 and attempts to open macOS Chrome; on Linux the server still comes up.
- `npm test` (Vitest) and `npm run build` (TypeScript runs as part of the build) are the checks to run. `npm run lint` currently exits non-zero because of existing ESLint errors in the app.
- `OPENAI_API_KEY` is optional. With no key, coaching uses the template replies described in `.env.example`.
- Photo and PDF score reading needs Audiveris (Java 17+). This image does not include it, so `GET http://127.0.0.1:8090/healthz` reports `audiverisConfigured: false`. Scale studio, the tuner, and MusicXML piece import work without Audiveris.
