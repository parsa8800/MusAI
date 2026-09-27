import { titleFromFileName } from "@/features/piece-studio/pieceStudioScore";

/** File ids and empty labels are not piece names. */
export function isMachinePieceTitle(title: string | null | undefined): boolean {
  const trimmed = title?.replace(/\s+/g, " ").trim() ?? "";
  if (!trimmed) return true;
  if (/^untitled(\s+piece)?$/i.test(trimmed)) return true;
  const compact = trimmed.replace(/[\s-]+/g, "");
  if (/^[0-9a-f]{24,}$/i.test(compact)) return true;
  const tokens = trimmed.split(" ");
  if (
    tokens.length >= 3 &&
    tokens.every((token) => /^[0-9a-f]{3,}$/i.test(token))
  ) {
    return true;
  }
  return false;
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function tagTexts(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const out: string[] = [];
  for (const match of xml.matchAll(re)) {
    const text = decodeXml(match[1] ?? "");
    if (text) out.push(text);
  }
  return out;
}

function usablePieceTitle(raw: string | null | undefined): string | null {
  const title = raw?.replace(/\s+/g, " ").trim() ?? "";
  if (title.length < 2 || title.length > 80) return null;
  if (!/[A-Za-z\u00C0-\u024F]/.test(title)) return null;
  if (isMachinePieceTitle(title)) return null;
  if (/^(page|scan|img|image|photo)\b/i.test(title) && /\d/.test(title)) {
    return null;
  }
  return title;
}

/** Titles printed on the score: work title, then a title credit. */
export function titlesDetectedInMusicXml(xml: string | null | undefined): string[] {
  if (!xml?.trim()) return [];
  const found: string[] = [];
  const push = (raw: string | null | undefined) => {
    const title = usablePieceTitle(raw);
    if (title && !found.some((item) => item.toLowerCase() === title.toLowerCase())) {
      found.push(title);
    }
  };

  for (const title of [
    ...tagTexts(xml, "work-title"),
    ...tagTexts(xml, "movement-title"),
  ]) {
    push(title);
  }

  const credits = xml.match(/<credit\b[\s\S]*?<\/credit>/gi) ?? [];
  const titled: string[] = [];
  const other: string[] = [];
  for (const block of credits) {
    const type = tagTexts(block, "credit-type")[0]?.toLowerCase() ?? "";
    if (type.includes("composer") || type.includes("lyric") || type.includes("rights")) {
      continue;
    }
    const words = tagTexts(block, "credit-words");
    if (type.includes("title")) titled.push(...words);
    else other.push(...words);
  }
  for (const title of [...titled, ...other]) push(title);
  return found;
}

/**
 * A name worth offering. Score text wins, then a filename that is already
 * a real title. File ids are never suggested.
 */
export function recommendedPieceTitle(input: {
  fileName?: string | null;
  scoreTitle?: string | null;
  musicXml?: string | null;
}): string | null {
  const fromScore = titlesDetectedInMusicXml(input.musicXml);
  if (fromScore[0]) return fromScore[0];
  const parsed = usablePieceTitle(input.scoreTitle);
  if (parsed) return parsed;
  if (input.fileName) return usablePieceTitle(titleFromFileName(input.fileName));
  return null;
}
