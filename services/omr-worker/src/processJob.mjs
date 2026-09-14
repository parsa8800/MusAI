/**
 * Run one recognition job: validate → rasterise PDF if needed → Audiveris → MusicXML.
 */

import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { runAudiverisExport } from "./audiveris.mjs";
import { updateJob } from "./jobs.mjs";
import { rasterizePdfToPngs } from "./rasterize.mjs";

const USER_FAIL = "We couldn’t read the notes from this page.";
const USER_NO_MUSIC = "We couldn’t find music on that page.";
const USER_TIMEOUT = "Reading took too long. Try a clearer page.";
const USER_UNAVAILABLE =
  "We couldn’t read the notes from this page yet. Try again later, or upload a digital score.";

/**
 * @param {object} opts
 * @param {string} opts.jobId
 * @param {string} opts.workDir
 * @param {Buffer} opts.bytes
 * @param {string} opts.fileName
 * @param {string} opts.mimeType
 * @param {number} [opts.dpi]
 */
export async function processRecognitionJob(opts) {
  const { jobId, workDir, bytes, fileName, mimeType } = opts;
  const dpi = opts.dpi ?? Number(process.env.OMR_DPI || 300);
  const inputDir = path.join(workDir, "input");
  const rasterDir = path.join(workDir, "raster");
  const outDir = path.join(workDir, "out");

  updateJob(jobId, { status: "processing" });

  try {
    await mkdir(inputDir, { recursive: true });
    await mkdir(rasterDir, { recursive: true });
    await mkdir(outDir, { recursive: true });

    const safeName = sanitizeFileName(fileName);
    const inputPath = path.join(inputDir, safeName);
    await writeFile(inputPath, bytes);

    const isPdf =
      mimeType === "application/pdf" || safeName.toLowerCase().endsWith(".pdf");

    /** @type {string[]} */
    let audiverisInputs = [inputPath];

    if (isPdf) {
      console.info(
        `[omr-worker] job ${jobId}: PDF_RASTERISE start dpi=${dpi}`,
      );
      try {
        const pages = await rasterizePdfToPngs({
          pdfPath: inputPath,
          outDir: rasterDir,
          dpi,
        });
        if (pages && pages.length > 0) {
          audiverisInputs = pages;
          console.info(
            `[omr-worker] job ${jobId}: PDF_RASTERISE ok pages=${pages.length}`,
          );
        } else {
          console.info(
            `[omr-worker] job ${jobId}: PDF_RASTERISE skipped — feeding PDF to Audiveris`,
          );
        }
      } catch (err) {
        console.warn(
          `[omr-worker] job ${jobId}: PDF_RASTERISE failed, falling back to PDF`,
          err,
        );
        audiverisInputs = [inputPath];
      }
    } else {
      console.info(
        `[omr-worker] job ${jobId}: image input — no rasterise (${mimeType})`,
      );
    }

    console.info(
      `[omr-worker] job ${jobId}: OMR start inputs=${audiverisInputs.length}`,
    );
    const musicXml = await runAudiverisExport({
      inputPaths: audiverisInputs,
      outputDir: outDir,
    });

    if (!musicXml?.includes("score-partwise") && !musicXml?.includes("score-timewise")) {
      updateJob(jobId, {
        status: "failed",
        error: USER_FAIL,
        internalError: "export did not look like MusicXML",
      });
      return;
    }

    updateJob(jobId, {
      status: "completed",
      musicXml,
      error: undefined,
      internalError: undefined,
    });
    console.info(
      `[omr-worker] job ${jobId}: completed musicXmlChars=${musicXml.length}`,
    );
  } catch (err) {
    const mapped = mapEngineError(err);
    console.error(`[omr-worker] job ${jobId} failed:`, mapped.internal);
    updateJob(jobId, {
      status: "failed",
      error: mapped.user,
      internalError: mapped.internal,
    });
  } finally {
    // Always clean temp files; job record keeps MusicXML in memory briefly.
    await safeRm(workDir);
  }
}

function mapEngineError(err) {
  const message = err instanceof Error ? err.message : String(err);
  const code = err && typeof err === "object" ? err.code : undefined;
  if (code === "AUDIVERIS_MISSING") {
    return { user: USER_UNAVAILABLE, internal: message };
  }
  if (code === "NO_EXPORT") {
    return { user: USER_NO_MUSIC, internal: message };
  }
  if (/timed out/i.test(message)) {
    return { user: USER_TIMEOUT, internal: message };
  }
  return { user: USER_FAIL, internal: message };
}

function sanitizeFileName(name) {
  const base = path.basename(name || "upload.bin").replace(/[^\w.\-]+/g, "_");
  return base || "upload.bin";
}

async function safeRm(dir) {
  try {
    await rm(dir, { recursive: true, force: true });
  } catch (err) {
    console.warn(`[omr-worker] cleanup failed for ${dir}`, err);
  }
}
