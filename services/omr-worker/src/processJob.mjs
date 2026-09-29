/**
 * Run one recognition job: validate → rasterise PDF if needed → Audiveris → MusicXML.
 */

import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { runAudiverisExport } from "./audiveris.mjs";
import { updateJob } from "./jobs.mjs";
import { prepareSheetImageForOmr } from "./prepareSheetImage.mjs";
import {
  pdfMaxLongEdgePoints,
  pdfPageIsPhotoScale,
  rasterizePdfToPngs,
} from "./rasterize.mjs";

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

  updateJob(jobId, { status: "processing", progress: 8 });

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
      updateJob(jobId, { progress: 16 });
      console.info(
        `[omr-worker] job ${jobId}: PDF_RASTERISE start dpi=${dpi}`,
      );
      const photoScale = pdfPageIsPhotoScale(
        await pdfMaxLongEdgePoints(inputPath),
      );
      try {
        const pages = await rasterizePdfToPngs({
          pdfPath: inputPath,
          outDir: rasterDir,
          dpi,
        });
        if (pages && pages.length === 1) {
          // Single raster page is fine as one Audiveris book.
          audiverisInputs = pages;
          console.info(
            `[omr-worker] job ${jobId}: PDF_RASTERISE ok pages=1`,
          );
        } else if (pages && pages.length > 1 && photoScale) {
          // The original media box is a phone photo. Audiveris ignores that
          // PDF ("Sheet ignored"). Page images stay in order and are merged.
          audiverisInputs = pages;
          console.info(
            `[omr-worker] job ${jobId}: PDF_RASTERISE ok pages=${pages.length} — photo PDF, feeding page images`,
          );
        } else if (pages && pages.length > 1) {
          // Separate PNGs become separate books; keep the PDF so Audiveris
          // builds one multi-sheet book with page order preserved.
          audiverisInputs = [inputPath];
          console.info(
            `[omr-worker] job ${jobId}: PDF_RASTERISE ok pages=${pages.length} — feeding PDF as one book`,
          );
        } else if (photoScale) {
          throw new Error("PDF rasterise produced no page images");
        } else {
          console.info(
            `[omr-worker] job ${jobId}: PDF_RASTERISE skipped — feeding PDF to Audiveris`,
          );
        }
      } catch (err) {
        const timedOut = /timed out/i.test(
          err instanceof Error ? err.message : String(err),
        );
        if (photoScale || timedOut) {
          console.warn(
            `[omr-worker] job ${jobId}: PDF_RASTERISE failed, not sending the original PDF`,
            err,
          );
          throw err;
        }
        console.warn(
          `[omr-worker] job ${jobId}: PDF_RASTERISE failed, falling back to PDF`,
          err,
        );
        audiverisInputs = [inputPath];
      }
    } else {
      try {
        const prepared = await prepareSheetImageForOmr({
          inputPath,
          outDir: rasterDir,
        });
        if (prepared) {
          audiverisInputs = [prepared];
        } else {
          console.info(
            `[omr-worker] job ${jobId}: image input — already large enough (${mimeType})`,
          );
        }
      } catch (err) {
        console.warn(
          `[omr-worker] job ${jobId}: image upscale failed, using the original`,
          err,
        );
      }
    }

    const heard = { sheetCount: 1, percent: 18 };
    console.info(
      `[omr-worker] job ${jobId}: OMR start inputs=${audiverisInputs.length}`,
    );
    const musicXml = await runAudiverisExport({
      inputPaths: audiverisInputs,
      outputDir: outDir,
      onLogLine: (line) => {
        const next = progressFromAudiverisLine(line, heard);
        if (next != null && next > heard.percent) {
          heard.percent = next;
          updateJob(jobId, { progress: next });
        }
      },
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
      progress: 100,
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

const AUDIVERIS_STEPS = [
  "LOAD",
  "BINARY",
  "SCALE",
  "GRID",
  "HEADERS",
  "STEM_SEEDS",
  "BEAMS",
  "LEDGERS",
  "HEADS",
  "STEMS",
  "REDUCTION",
  "CUE_BEAMS",
  "TEXTS",
  "MEASURES",
  "CHORDS",
  "CURVES",
  "SYMBOLS",
  "LINKS",
  "RHYTHMS",
  "PAGE",
];

/**
 * Map one Audiveris log line onto 16–96. Sheet count comes from
 * "N sheets in …" before the first step, so a long score does not
 * reach the top of the bar on page one.
 * @param {string} line
 * @param {{ sheetCount: number }} state
 * @returns {number | null}
 */
function progressFromAudiverisLine(line, state) {
  const count = line.match(/\b(\d+) sheets in\b/);
  if (count) state.sheetCount = Math.max(1, Number(count[1]));
  const stepName = line.match(/StepMonitoring\s+\d+\s+\|\s+([A-Z0-9_]+)/);
  if (!stepName) return null;
  const ctx = line.match(/\[([^\]]+)\]/);
  const sheetNo = ctx?.[1]?.match(/#(\d+)\s*$/);
  const sheetIndex = sheetNo ? Math.max(0, Number(sheetNo[1]) - 1) : 0;
  const stepIndex = AUDIVERIS_STEPS.indexOf(stepName[1]);
  if (stepIndex < 0) return null;
  const sheets = Math.max(state.sheetCount || 1, sheetIndex + 1);
  const frac =
    (sheetIndex + (stepIndex + 1) / AUDIVERIS_STEPS.length) / sheets;
  return Math.round(16 + Math.min(1, frac) * 80);
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
