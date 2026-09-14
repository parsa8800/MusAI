/**
 * Audiveris CLI adapter — batch recognition → MusicXML / MXL on disk.
 * All Audiveris-specific process details stay in this worker package.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync, strFromU8 } from "./mxl.mjs";
import { run } from "./rasterize.mjs";

/**
 * @param {object} opts
 * @param {string[]} opts.inputPaths Ordered PDF or image paths
 * @param {string} opts.outputDir
 * @param {string} [opts.audiverisBin]
 * @param {number} [opts.timeoutMs]
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
    "-option",
    "org.audiveris.omr.sheet.BookManager.useSeparateBookFolders=false",
    ...opts.inputPaths,
  ];

  console.info(`[omr-worker] audiveris ${args.join(" ")}`);
  try {
    await run(bin, args, {
      timeoutMs,
      env: {
        JAVA_TOOL_OPTIONS: [
          process.env.JAVA_TOOL_OPTIONS,
          "-Djava.awt.headless=true",
        ]
          .filter(Boolean)
          .join(" "),
      },
    });
  } catch (err) {
    if (err && err.code === "ENOENT") {
      const missing = new Error(`Audiveris binary not found (${bin})`);
      missing.code = "AUDIVERIS_MISSING";
      throw missing;
    }
    throw err;
  }

  const musicXml = await findExportedMusicXml(opts.outputDir);
  if (!musicXml) {
    const err = new Error("Audiveris finished without a MusicXML export");
    err.code = "NO_EXPORT";
    throw err;
  }
  return musicXml;
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

async function findExportedMusicXml(dir) {
  const names = await readdir(dir);
  const preferred = names.filter(
    (n) =>
      n.toLowerCase().endsWith(".mxl") ||
      n.toLowerCase().endsWith(".musicxml") ||
      n.toLowerCase().endsWith(".xml"),
  );
  // Prefer compressed MusicXML, then .musicxml, then generic .xml
  preferred.sort((a, b) => scoreExport(b) - scoreExport(a));

  for (const name of preferred) {
    const full = path.join(dir, name);
    try {
      const buf = await readFile(full);
      const text = decodeMusicXmlBuffer(buf, name);
      if (looksLikeMusicXml(text)) return text;
    } catch {
      /* try next */
    }
  }

  // Audiveris may nest under a book folder even with the option set
  for (const name of names) {
    const full = path.join(dir, name);
    try {
      const nested = await readdir(full);
      for (const child of nested) {
        if (!/\.(mxl|musicxml|xml)$/i.test(child)) continue;
        const buf = await readFile(path.join(full, child));
        const text = decodeMusicXmlBuffer(buf, child);
        if (looksLikeMusicXml(text)) return text;
      }
    } catch {
      /* not a directory */
    }
  }
  return null;
}

function scoreExport(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".mxl")) return 3;
  if (lower.endsWith(".musicxml")) return 2;
  if (lower.endsWith(".xml")) return 1;
  return 0;
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
