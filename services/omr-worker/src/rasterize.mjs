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

  const available = await commandExists(bin);
  if (!available) {
    console.warn(
      `[omr-worker] ${bin} not found — skipping explicit rasterise; Audiveris will ingest the PDF`,
    );
    return null;
  }

  await run(bin, ["-png", "-r", String(dpi), opts.pdfPath, prefix], {
    timeoutMs: 120_000,
  });

  const names = (await readdir(opts.outDir))
    .filter((n) => /^page-\d+\.png$/i.test(n))
    .sort(comparePdfPageNames);

  if (names.length === 0) {
    throw new Error("PDF rasterise produced no page images");
  }
  return names.map((n) => path.join(opts.outDir, n));
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
