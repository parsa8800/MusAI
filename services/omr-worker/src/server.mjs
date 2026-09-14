/**
 * MusAI OMR worker — Audiveris batch recognition as an HTTP job service.
 *
 *   POST /v1/jobs          multipart file → { jobId, status: "queued" }
 *   GET  /v1/jobs/:id      → { id, status, musicXml?, error? }
 *   GET  /healthz          → { ok, audiverisConfigured }
 *
 * Never expose this port publicly without auth (set OMR_TOKEN).
 */

import { createServer } from "node:http";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createJob, getJob, pruneJobs, publicJobView } from "./jobs.mjs";
import { processRecognitionJob } from "./processJob.mjs";
import { probeAudiverisBinary } from "./audiveris.mjs";

const PORT = Number(process.env.PORT || process.env.OMR_PORT || 8090);
const TOKEN = process.env.OMR_TOKEN || process.env.MUSAI_OMR_TOKEN || "";
const TMP_ROOT =
  process.env.OMR_TMP_DIR || path.join(os.tmpdir(), "musai-omr-worker");
const MAX_BYTES = Number(process.env.OMR_MAX_BYTES || 20 * 1024 * 1024);
const JOB_TTL_MS = Number(process.env.OMR_JOB_TTL_MS || 30 * 60 * 1000);

await mkdir(TMP_ROOT, { recursive: true });

const server = createServer(async (req, res) => {
  try {
    if (!(await authorize(req, res))) return;

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/healthz") {
      const { audiverisConfigured, audiverisBin } = await probeAudiverisBinary();
      return json(res, 200, {
        ok: true,
        service: "musai-omr-worker",
        engine: "audiveris",
        audiverisConfigured,
        audiverisBin,
      });
    }

    if (req.method === "POST" && url.pathname === "/v1/jobs") {
      pruneJobs(JOB_TTL_MS);
      const uploaded = await readMultipartFile(req, MAX_BYTES);
      if (!uploaded) {
        return json(res, 400, {
          error: "Choose a photo or PDF of your music.",
        });
      }
      if (!isAllowedUpload(uploaded.fileName, uploaded.mimeType)) {
        return json(res, 400, {
          error: "Choose a photo or PDF of your music.",
        });
      }

      const workDir = await mkdtemp(path.join(TMP_ROOT, "job-"));
      const job = createJob(workDir);
      json(res, 202, { jobId: job.id, id: job.id, status: "queued" });

      // Process after responding — never hold the Next.js request open.
      void processRecognitionJob({
        jobId: job.id,
        workDir,
        bytes: uploaded.bytes,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
      });
      return;
    }

    const jobMatch = url.pathname.match(/^\/v1\/jobs\/([^/]+)$/);
    if (req.method === "GET" && jobMatch) {
      const job = getJob(decodeURIComponent(jobMatch[1]));
      if (!job) {
        return json(res, 404, {
          status: "failed",
          error: "We couldn’t read the notes from this page.",
        });
      }
      return json(res, 200, publicJobView(job));
    }

    json(res, 404, { error: "not found" });
  } catch (err) {
    console.error("[omr-worker] request error", err);
    if (!res.headersSent) {
      json(res, 500, {
        error: "We couldn’t read the notes from this page.",
      });
    }
  }
});

server.listen(PORT, process.env.OMR_HOST || "127.0.0.1", () => {
  const host = process.env.OMR_HOST || "127.0.0.1";
  console.info(
    `[omr-worker] listening on http://${host}:${PORT} (Audiveris job API)`,
  );
  console.info(
    `[omr-worker] set MUSAI_OMR_PROVIDER=audiveris and MUSAI_OMR_URL=http://127.0.0.1:${PORT}`,
  );
});

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function authorize(req, res) {
  if (!TOKEN) return true;
  const header = req.headers.authorization || "";
  const ok = header === `Bearer ${TOKEN}`;
  if (!ok) {
    json(res, 401, { error: "unauthorized" });
    return false;
  }
  return true;
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function isAllowedUpload(fileName, mimeType) {
  const name = (fileName || "").toLowerCase();
  const mime = (mimeType || "").toLowerCase();
  if (name.endsWith(".pdf") || mime === "application/pdf") return true;
  if (name.endsWith(".png") || mime === "image/png") return true;
  if (
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    mime === "image/jpeg" ||
    mime === "image/jpg"
  ) {
    return true;
  }
  return false;
}

/**
 * Minimal multipart/form-data parser for a single `file` field.
 * @returns {Promise<{ fileName: string, mimeType: string, bytes: Buffer } | null>}
 */
async function readMultipartFile(req, maxBytes) {
  const ctype = req.headers["content-type"] || "";
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ctype);
  if (!boundaryMatch) {
    // Also accept raw body with x-filename (tests / simple clients)
    const chunks = await readBody(req, maxBytes);
    if (!chunks) return null;
    const fileName = String(req.headers["x-filename"] || "upload.bin");
    const mimeType = String(req.headers["content-type"] || "application/octet-stream");
    return { fileName, mimeType, bytes: chunks };
  }
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const body = await readBody(req, maxBytes);
  if (!body) return null;

  const parts = splitMultipart(body, boundary);
  for (const part of parts) {
    const headerEnd = indexOfBuffer(part, Buffer.from("\r\n\r\n"));
    if (headerEnd < 0) continue;
    const headerText = part.subarray(0, headerEnd).toString("utf8");
    if (!/name="file"/i.test(headerText)) continue;
    const nameMatch = /filename="([^"]*)"/i.exec(headerText);
    const typeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(headerText);
    let data = part.subarray(headerEnd + 4);
    // trim trailing CRLF
    if (data.length >= 2 && data[data.length - 2] === 0x0d && data[data.length - 1] === 0x0a) {
      data = data.subarray(0, data.length - 2);
    }
    return {
      fileName: nameMatch?.[1] || "upload.bin",
      mimeType: typeMatch?.[1]?.trim() || "application/octet-stream",
      bytes: data,
    };
  }
  return null;
}

function splitMultipart(body, boundary) {
  const sep = Buffer.from(`--${boundary}`);
  /** @type {Buffer[]} */
  const parts = [];
  let start = indexOfBuffer(body, sep);
  while (start >= 0) {
    let next = indexOfBuffer(body, sep, start + sep.length);
    if (next < 0) break;
    let slice = body.subarray(start + sep.length, next);
    if (slice[0] === 0x0d && slice[1] === 0x0a) slice = slice.subarray(2);
    if (!(slice.length === 2 && slice[0] === 0x2d && slice[1] === 0x2d)) {
      parts.push(slice);
    }
    start = next;
  }
  return parts;
}

function indexOfBuffer(buf, needle, from = 0) {
  return buf.indexOf(needle, from);
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {number} maxBytes
 */
function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
