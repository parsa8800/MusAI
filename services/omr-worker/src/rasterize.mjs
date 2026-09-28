/**
 * PDF → high-resolution page images for OMR (≈300 DPI).
 * Uses poppler `pdftoppm` when available; otherwise returns null so the
 * caller can feed the PDF straight to Audiveris.
 */

import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

/**
 * @param {object} opts
 * @param {string} opts.pdfPath
 * @param {string} opts.outDir
 * @param {string} [opts.pdftoppmBin]
 * @param {number} [opts.dpi]
 * @returns {Promise<string[] | null>} Ordered PNG paths, or null if tool missing
 */
export async function rasterizePdfToPngs(opts) {
  const dpi = opts.dpi ?? 300;
  const bin = opts.pdftoppmBin || process.env.PDFTOPPM_BIN || "pdftoppm";
  const prefix = path.join(opts.outDir, "page");
  // Long edge in pixels. 300 DPI on letter paper is about this size.
  // Phone photos saved as PDF are often one point per pixel (a 40-inch page),
  // and `-r 300` would blow those up until pdftoppm times out.
  const longEdge = opts.longEdge ?? Math.round((11 * dpi));

  const available = await commandExists(bin);
  if (!available) {
    console.warn(
      `[omr-worker] ${bin} not found — skipping explicit rasterise; Audiveris will ingest the PDF`,
    );
    return null;
  }

  await run(
    bin,
    ["-png", "-scale-to", String(longEdge), opts.pdfPath, prefix],
    { timeoutMs: 120_000 },
  );

  const names = (await readdir(opts.outDir))
    .filter((n) => /^page-\d+\.png$/i.test(n))
    .sort(comparePdfPageNames);

  if (names.length === 0) {
    throw new Error("PDF rasterise produced no page images");
  }
  return names.map((n) => path.join(opts.outDir, n));
}

/**
 * Printed music is letter or tabloid. A phone photo saved as PDF is often
 * one point per pixel, so the page is tens of inches and Audiveris ignores it.
 */
export const PDF_PHOTO_LONG_EDGE_PT = 18 * 72;

export function pdfPageIsPhotoScale(longEdgePt) {
  return (
    typeof longEdgePt === "number" &&
    Number.isFinite(longEdgePt) &&
    longEdgePt > PDF_PHOTO_LONG_EDGE_PT
  );
}

/**
 * @param {string} pdfPath
 * @returns {Promise<number | null>} Longest page edge in points
 */
export async function pdfMaxLongEdgePoints(pdfPath) {
  const bin = process.env.PDFINFO_BIN || "pdfinfo";
  try {
    const { stdout } = await run(bin, [pdfPath], { timeoutMs: 15_000 });
    let max = 0;
    for (const line of String(stdout).split("\n")) {
      const match = line.match(/([\d.]+)\s*x\s*([\d.]+)\s*pts/i);
      if (!match) continue;
      max = Math.max(max, Number(match[1]), Number(match[2]));
    }
    return max > 0 ? max : null;
  } catch {
    return null;
  }
}

/** Keep multi-page PDF raster order stable (page-1, page-2, … page-10). */
export function comparePdfPageNames(a, b) {
  return pageIndex(a) - pageIndex(b);
}

function pageIndex(name) {
  const m = name.match(/page-(\d+)\.png$/i);
  return m ? Number(m[1]) : 0;
}

function commandExists(bin) {
  return new Promise((resolve) => {
    const child = spawn(bin, ["-v"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0 || code === 99 || code === 1));
    // pdftoppm -v exits 0 and prints version to stderr
    setTimeout(() => {
      child.kill("SIGKILL");
      resolve(false);
    }, 3_000);
  });
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ timeoutMs?: number, env?: NodeJS.ProcessEnv }} [opts]
 */
export function run(command, args, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 300_000;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...opts.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Command timed out: ${command}`));
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr, code });
      else {
        const err = new Error(
          `${command} exited ${code}: ${(stderr || stdout).slice(0, 500)}`,
        );
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }
    });
  });
}
