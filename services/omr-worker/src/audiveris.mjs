/**
 * Audiveris CLI adapter — batch recognition → MusicXML / MXL on disk.
 * All Audiveris-specific process details stay in this worker package.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync, strFromU8 } from "./mxl.mjs";
import { pickOrMergeExportedScores } from "./mergePartwiseMusicXml.mjs";
import { recoverPrintedDynamics } from "./recoverPrintedDynamics.mjs";
import { run } from "./rasterize.mjs";

/**
 * @param {object} opts
 * @param {string[]} opts.inputPaths Ordered PDF or image paths
 * @param {string} opts.outputDir
 * @param {string} [opts.audiverisBin]
 * @param {number} [opts.timeoutMs]
 * @param {(line: string) => void} [opts.onLogLine]
 * @returns {Promise<string>} MusicXML text
 */
export async function runAudiverisExport(opts) {
  let bin = opts.audiverisBin || process.env.AUDIVERIS_BIN || "";
  if (!bin) {
    const probed = await probeAudiverisBinary();
    bin = probed.audiverisConfigured ? probed.audiverisBin : "audiveris";
  }
  const timeoutMs = opts.timeoutMs ?? Number(process.env.OMR_JOB_TIMEOUT_MS || 300_000);

  const available = await audiverisExists(bin);
  if (!available) {
    const err = new Error(
      `Audiveris binary not found (${bin}). Install Audiveris and set AUDIVERIS_BIN.`,
    );
    err.code = "AUDIVERIS_MISSING";
    throw err;
  }

  const args = [
    "-batch",
    "-export",
    "-output",
    opts.outputDir,
    // Audiveris 5.x renamed -option → -constant (both accepted; prefer new name)
    "-constant",
    "org.audiveris.omr.sheet.BookManager.useSeparateBookFolders=false",
    "-constant",
    "org.audiveris.omr.Main.sheetStepTimeOut=180",
    // smallHeads/smallBeams stay off — they invent extra notes and misread
    // principal pitches (confirmed on Caprice 24 vs the first accurate export).
    "--",
    ...opts.inputPaths,
  ];

  console.info(`[omr-worker] audiveris ${args.join(" ")}`);
  let pending = "";
  const takeChunk = (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) opts.onLogLine?.(line);
  };
  try {
    const result = await run(bin, args, {
      timeoutMs,
      onChunk: takeChunk,
      env: {
        JAVA_TOOL_OPTIONS: [
          process.env.JAVA_TOOL_OPTIONS,
          "-Djava.awt.headless=true",
        ]
          .filter(Boolean)
          .join(" "),
      },
    });
    if (pending) opts.onLogLine?.(pending);
    if (result?.stderr) {
      const warnLines = String(result.stderr)
        .split("\n")
        .filter((line) => /WARN|ERROR|Exception/i.test(line))
        .slice(0, 12);
      for (const line of warnLines) {
        console.info(`[omr-worker] audiveris: ${line}`);
      }
    }
  } catch (err) {
    if (err && err.code === "ENOENT") {
      const missing = new Error(`Audiveris binary not found (${bin})`);
      missing.code = "AUDIVERIS_MISSING";
      throw missing;
    }
    const detail = audiverisFailureDetail(err);
    const wrapped = new Error(detail);
    wrapped.code = err && err.code;
    throw wrapped;
  }

  const musicXml = await findExportedMusicXml(opts.outputDir, opts.inputPaths);
  if (!musicXml) {
    const err = new Error("Audiveris finished without a MusicXML export");
    err.code = "NO_EXPORT";
    throw err;
  }
  return musicXml;
}

function audiverisFailureDetail(err) {
  const text = `${err?.stderr || ""}\n${err?.stdout || ""}\n${err?.message || ""}`;
  const line = text
    .split("\n")
    .map((row) => row.trim())
    .find((row) =>
      /interline|Sheet ignored|Could not export|No suitable|too low/i.test(row),
    );
  return line || err?.message || String(err);
}

/**
 * Collect every MusicXML/.mxl under dir (and one level of nest), then merge
 * Audiveris multi-movement exports (*.mvtN.mxl) into one continuous score.
 */
export async function findExportedMusicXml(dir, inputPaths) {
  const collected = await collectExportedScores(dir);
  const sheetsByStem = await loadSheetXmlsByStem(dir);
  const pngByStem = await loadPngsByStem(inputPaths);
  const withMarks = collected.map((entry) => {
    const stem = path
      .basename(entry.name)
      .replace(/\.(mxl|musicxml|xml)$/i, "");
    const sheets = sheetsByStem.get(stem);
    if (!sheets || sheets.length === 0) return entry;
    const png = pngByStem.get(stem) ?? null;
    return {
      ...entry,
      text: recoverPrintedDynamics(
        entry.text,
        sheets,
        sheets.map((_, index) => (index === 0 ? png : null)),
      ),
    };
  });
  const merged = pickOrMergeExportedScores(withMarks);
  if (merged && collected.length > 1) {
    const mvtCount = collected.filter((e) => /\.mvt\d+/i.test(e.name)).length;
    console.info(
      `[omr-worker] export merge files=${collected.length} movements=${mvtCount} measures=${(merged.match(/<measure(?=[\s>])/gi) || []).length} chars=${merged.length}`,
    );
  }
  return merged;
}

/**
 * The page photo uses the same stem as the export (`page-1.png` / `page-1.mxl`).
 * Hairpins the reader missed are measured from that image.
 * @param {string[] | undefined} inputPaths
 */
async function loadPngsByStem(inputPaths) {
  /** @type {Map<string, Uint8Array>} */
  const map = new Map();
  for (const full of inputPaths || []) {
    if (!/\.png$/i.test(String(full))) continue;
    try {
      const bytes = new Uint8Array(await readFile(full));
      map.set(path.basename(full).replace(/\.png$/i, ""), bytes);
    } catch {
      /* The reader export still stands without the page image. */
    }
  }
  return map;
}

/**
 * Audiveris stores glyph confidence in the .omr book next to the .mxl.
 * @param {string} dir
 * @returns {Promise<Map<string, string[]>>}
 */
async function loadSheetXmlsByStem(dir) {
  /** @type {Map<string, string[]>} */
  const map = new Map();
  const omrPaths = await listOmrFiles(dir);
  for (const full of omrPaths) {
    const stem = path.basename(full).replace(/\.omr$/i, "");
    try {
      const buf = await readFile(full);
      const files = unzipSync(new Uint8Array(buf));
      const sheetNames = Object.keys(files)
        .filter((name) =>
          /sheet#\d+\/sheet#\d+\.xml$/i.test(name.replace(/\\/g, "/")),
        )
        .sort((a, b) => sheetIndex(a) - sheetIndex(b));
      const sheets = sheetNames.map((name) => strFromU8(files[name]));
      if (sheets.length > 0) map.set(stem, sheets);
    } catch {
      /* The MusicXML export still stands without the book file. */
    }
  }
  return map;
}

async function listOmrFiles(dir) {
  /** @type {string[]} */
  const found = [];
  const names = await readdir(dir);
  for (const name of names) {
    const full = path.join(dir, name);
    if (name.toLowerCase().endsWith(".omr")) found.push(full);
  }
  for (const name of names) {
    const full = path.join(dir, name);
    try {
      const nested = await readdir(full);
      for (const child of nested) {
        if (child.toLowerCase().endsWith(".omr")) {
          found.push(path.join(full, child));
        }
      }
    } catch {
      /* not a directory */
    }
  }
  return found;
}

function sheetIndex(name) {
  const match = String(name).match(/sheet#(\d+)/i);
  return match ? Number(match[1]) : 0;
}

async function audiverisExists(bin) {
  try {
    await run(bin, ["-help"], { timeoutMs: 15_000 });
    return true;
  } catch (err) {
    if (err && (err.code === "ENOENT" || err.message?.includes("ENOENT"))) {
      return false;
    }
    // -help may exit non-zero on some builds but still proves the binary runs
    if (String(err.message || "").includes("exited")) return true;
    return false;
  }
}

/** Resolve Audiveris binary path and whether it responds to -help. */
export async function probeAudiverisBinary() {
  const candidates = [
    process.env.AUDIVERIS_BIN,
    "audiveris",
    "Audiveris",
    "/opt/audiveris/bin/Audiveris",
    "/Applications/Audiveris.app/Contents/MacOS/Audiveris",
  ].filter(Boolean);

  for (const bin of candidates) {
    if (await audiverisExists(bin)) {
      return { audiverisConfigured: true, audiverisBin: bin };
    }
  }
  return {
    audiverisConfigured: false,
    audiverisBin: process.env.AUDIVERIS_BIN || "audiveris",
  };
}

/**
 * @param {string} dir
 * @returns {Promise<{ name: string, text: string }[]>}
 */
async function collectExportedScores(dir) {
  const names = await readdir(dir);
  /** @type {{ name: string, text: string }[]} */
  const collected = [];
  /** @type {string[]} */
  const decodeErrors = [];

  const tryDecode = async (fileName, fullPath) => {
    if (!/\.(mxl|musicxml|xml)$/i.test(fileName)) return;
    try {
      const buf = await readFile(fullPath);
      const text = decodeMusicXmlBuffer(buf, fileName);
      if (looksLikeMusicXml(text)) {
        collected.push({ name: fileName, text });
      } else {
        decodeErrors.push(`${fileName}: not MusicXML`);
      }
    } catch (err) {
      decodeErrors.push(
        `${fileName}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  for (const name of names) {
    await tryDecode(name, path.join(dir, name));
  }

  // Audiveris may nest under a book folder even with the option set
  for (const name of names) {
    const full = path.join(dir, name);
    try {
      const nested = await readdir(full);
      for (const child of nested) {
        await tryDecode(`${name}/${child}`, path.join(full, child));
      }
    } catch {
      /* not a directory */
    }
  }

  if (collected.length === 0 && decodeErrors.length) {
    console.warn(
      `[omr-worker] export decode failed: ${decodeErrors.slice(0, 5).join("; ")}`,
    );
  }
  return collected;
}

function looksLikeMusicXml(text) {
  return (
    text.includes("<score-partwise") ||
    text.includes("<score-timewise") ||
    text.includes("score-partwise") ||
    text.includes("score-timewise")
  );
}

function decodeMusicXmlBuffer(buf, fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".mxl") || isZip(buf)) {
    return xmlFromMxl(buf);
  }
  return buf.toString("utf8").replace(/^\uFEFF/, "").trim();
}

function isZip(buf) {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b;
}

function xmlFromMxl(buf) {
  const files = unzipSync(new Uint8Array(buf));
  const names = Object.keys(files);
  const containerKey = names.find(
    (n) => n.replace(/\\/g, "/").toLowerCase() === "meta-inf/container.xml",
  );
  if (containerKey) {
    const container = strFromU8(files[containerKey]);
    const match = container.match(/full-path\s*=\s*"([^"]+)"/i);
    if (match?.[1]) {
      const wanted = match[1].replace(/\\/g, "/");
      const hit = names.find((n) => n.replace(/\\/g, "/") === wanted);
      if (hit) {
        return strFromU8(files[hit]).replace(/^\uFEFF/, "").trim();
      }
    }
  }
  for (const name of names) {
    const lower = name.replace(/\\/g, "/").toLowerCase();
    if (lower.includes("meta-inf/")) continue;
    if (lower.endsWith(".musicxml") || lower.endsWith(".xml")) {
      const text = strFromU8(files[name]).replace(/^\uFEFF/, "").trim();
      if (looksLikeMusicXml(text)) return text;
    }
  }
  throw new Error("MXL archive did not contain MusicXML");
}
