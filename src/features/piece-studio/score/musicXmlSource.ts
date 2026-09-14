import { unzipSync, strFromU8 } from "fflate";

function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function decodeXml(bytes: Uint8Array): string {
  const text = new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
  return text.trim();
}

function looksLikeMusicXml(text: string): boolean {
  return (
    text.includes("<score-partwise") ||
    text.includes("<score-timewise") ||
    text.includes("score-partwise") ||
    text.includes("score-timewise")
  );
}

/** True for .musicxml / .xml / .mxl digital score interchange files. */
export function isMusicXmlInterchangeFile(fileName: string, mimeType = ""): boolean {
  const name = fileName.toLowerCase().trim();
  // Extension is authoritative — do not require a correct browser MIME type.
  if (
    name.endsWith(".musicxml") ||
    name.endsWith(".mxl") ||
    (name.endsWith(".xml") && !name.endsWith(".container.xml"))
  ) {
    return true;
  }
  // MIME-only fallback when the OS strips the extension (rare).
  const mime = mimeType.toLowerCase().trim();
  return (
    mime.includes("vnd.recordare.musicxml") ||
    mime === "application/x-musicxml" ||
    mime === "application/vnd.recordare.musicxml+xml"
  );
}

function xmlFromMxl(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const names = Object.keys(files);
  const containerKey = names.find(
    (n) => n.replace(/\\/g, "/").toLowerCase() === "meta-inf/container.xml",
  );
  if (containerKey) {
    const container = strFromU8(files[containerKey]!);
    const match = container.match(/full-path\s*=\s*"([^"]+)"/i);
    if (match?.[1]) {
      const wanted = match[1].replace(/\\/g, "/");
      const hit = names.find(
        (n) => n.replace(/\\/g, "/") === wanted,
      );
      if (hit) return decodeXml(files[hit]!);
    }
  }
  for (const name of names) {
    const lower = name.replace(/\\/g, "/").toLowerCase();
    if (lower.includes("meta-inf/")) continue;
    if (lower.endsWith(".musicxml") || lower.endsWith(".xml")) {
      const xml = decodeXml(files[name]!);
      if (looksLikeMusicXml(xml)) return xml;
    }
  }
  throw new Error("That compressed score file didn’t contain readable music.");
}

/** Turn a MusicXML or compressed .mxl payload into a MusicXML string. */
export function musicXmlFromBytes(
  buffer: ArrayBuffer | Uint8Array,
  fileName: string,
): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const name = fileName.toLowerCase();
  if (name.endsWith(".mxl") || isZip(bytes)) {
    return xmlFromMxl(bytes);
  }
  const xml = decodeXml(bytes);
  if (!looksLikeMusicXml(xml)) {
    throw new Error("That doesn’t look like a score file we can open.");
  }
  return xml;
}

export async function musicXmlFromFile(file: File): Promise<string> {
  return musicXmlFromBytes(await file.arrayBuffer(), file.name);
}
