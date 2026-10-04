/**
 * Turns choice lists and ordered steps in coach copy into lines the chat
 * can show as dots or numbers. Other sentences stay as sentences.
 */

const STEP_VERBS = [
  "open",
  "press",
  "pick",
  "select",
  "choose",
  "go",
  "add",
  "play",
  "stop",
  "tap",
  "set",
  "use",
  "record",
  "import",
  "start",
  "click",
];

const STEP_VERB = new RegExp(`^(?:${STEP_VERBS.join("|")})\\b`, "i");
const STEP_SPLIT = new RegExp(
  `\\.\\s+|,\\s*then\\s+|\\s+then\\s+|,\\s*(?=(?:${STEP_VERBS.join("|")})\\b)|\\s+and\\s+(?=(?:${STEP_VERBS.join("|")})\\b)`,
  "i",
);

const CHOICE_LIST =
  /\b(?:(?:a|an|the)\s+)?(?!(?:or|and)\b)[A-Za-z0-9][\w'’./+-]*(?:\s+(?!(?:or|and)\b)[A-Za-z0-9][\w'’./+-]*){0,3}(?:,\s*(?:(?:a|an|the)\s+)?(?!(?:or|and)\b)[A-Za-z0-9][\w'’./+-]*(?:\s+(?!(?:or|and)\b)[A-Za-z0-9][\w'’./+-]*){0,3})+,\s*(?:or|and)\s+(?:(?:a|an|the)\s+)?(?!(?:or|and)\b)[A-Za-z0-9][\w'’./+-]*(?:\s+[A-Za-z0-9][\w'’./+-]*){0,4}/i;

type Block =
  | { kind: "prose"; text: string }
  | { kind: "items"; items: string[] };

function capitalizeFirst(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function cleanItem(raw: string): string {
  return capitalizeFirst(
    raw
      .replace(/^(?:a|an|the)\s+/i, "")
      .replace(/[.,;:]+$/g, "")
      .trim(),
  );
}

function stepCore(text: string): string {
  return text.replace(/^(?:and|then)\s+/i, "").trim();
}

const LIST_INTRO = /^(?:select|choose|pick|add)$/i;

function listIntroLabel(word: string): string {
  const trimmed = capitalizeFirst(word.replace(/:$/, "").trim());
  return `${trimmed}:`;
}

function isBareIntro(text: string): boolean {
  return LIST_INTRO.test(stepCore(text).replace(/:$/, "").trim());
}

function isStep(text: string): boolean {
  if (isBareIntro(text)) return false;
  return STEP_VERB.test(stepCore(text));
}

function splitSentences(line: string): string[] {
  const parts = line
    .split(/(?<=\.)\s+/)
    .map((part) => part.replace(/\.$/, "").trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [line];
}

function splitOrderedSteps(line: string): string[] | null {
  const parts = line
    .split(STEP_SPLIT)
    .map((part) => stepCore(part.replace(/^[,\s]+|[.\s]+$/g, "")))
    .filter(Boolean);
  if (parts.length < 2 || !parts.every((part) => STEP_VERB.test(part))) return null;
  return parts.map(capitalizeFirst);
}

function choiceListMatch(line: string): RegExpMatchArray | null {
  const re = new RegExp(CHOICE_LIST.source, "i");
  let best: RegExpMatchArray | null = null;
  for (let start = 0; start < line.length; start += 1) {
    if (start > 0 && /[\w'’]/.test(line[start - 1] ?? "") && /[\w'’]/.test(line[start] ?? "")) {
      continue;
    }
    const match = re.exec(line.slice(start));
    if (!match || match.index !== 0) continue;
    best = [match[0]] as RegExpMatchArray;
    best.index = start;
    best.input = line;
  }
  return best;
}

function extractChoiceList(
  line: string,
): { lead: string; intro: string; items: string[]; rest: string } | null {
  const match = choiceListMatch(line);
  if (!match || match.index == null) return null;
  const raw = match[0];
  const items = raw
    .split(/,\s*(?:(?:or|and)\s+)?|\s+(?:or|and)\s+/i)
    .map(cleanItem)
    .filter((item) => item.length > 0 && item.split(/\s+/).length <= 5);
  if (items.length < 3) return null;
  let lead = line
    .slice(0, match.index)
    .replace(/\b(?:a|an)\s*$/i, "")
    .replace(/[,\s]+$/g, "")
    .trim();
  let intro = "";
  const introTail = lead.match(/^(.*?)(?:^|[\s,]+)(select|choose|pick|add)$/i);
  if (introTail) {
    const before = (introTail[1] ?? "").replace(/[,\s]+$/g, "").trim();
    intro = capitalizeFirst(introTail[2] ?? "");
    lead = before;
  } else if (LIST_INTRO.test(lead)) {
    intro = capitalizeFirst(lead);
    lead = "";
  }
  if (items[0] && LIST_INTRO.test(items[0])) {
    if (!intro) intro = items[0];
    items.shift();
  }
  const prefixed = items[0]?.match(/^(select|choose|pick|add)\s+(.+)$/i);
  if (prefixed) {
    if (!intro) intro = capitalizeFirst(prefixed[1] ?? "");
    items[0] = cleanItem(prefixed[2] ?? "");
  }
  if (items.length < 2) return null;
  let rest = line
    .slice(match.index + raw.length)
    .replace(/^[,\s]+/g, "")
    .replace(/\.$/, "")
    .trim();
  if (/^(?:from|in|on|with|for)\b/i.test(rest)) {
    items[items.length - 1] = `${items[items.length - 1]} ${rest}`;
    rest = "";
  }
  return { lead, intro, items, rest };
}

function sentenceToBlocks(sentence: string): Block[] {
  const list = extractChoiceList(sentence);
  if (list) {
    const blocks: Block[] = [];
    if (list.lead) blocks.push({ kind: "prose", text: capitalizeFirst(list.lead) });
    if (list.intro) blocks.push({ kind: "prose", text: listIntroLabel(list.intro) });
    blocks.push({ kind: "items", items: list.items });
    if (list.rest) blocks.push(...sentenceToBlocks(capitalizeFirst(stepCore(list.rest))));
    return blocks;
  }
  const steps = splitOrderedSteps(sentence);
  if (steps) return steps.map((text) => ({ kind: "prose" as const, text }));
  return [{ kind: "prose", text: capitalizeFirst(sentence) }];
}

function renderBlocks(blocks: Block[]): string {
  const lines: string[] = [];
  let index = 0;
  while (index < blocks.length) {
    const block = blocks[index];
    if (block.kind === "items") {
      for (const item of block.items) lines.push(`• ${item}`);
      index += 1;
      continue;
    }
    const run: string[] = [];
    while (index < blocks.length) {
      const current = blocks[index];
      if (!current || current.kind !== "prose" || !isStep(current.text)) break;
      run.push(capitalizeFirst(stepCore(current.text)));
      index += 1;
    }
    if (run.length >= 2) {
      run.forEach((step, stepIndex) => lines.push(`${stepIndex + 1}. ${step}`));
    } else if (run.length === 1) {
      lines.push(run[0]);
    } else {
      lines.push(block.text);
      index += 1;
    }
  }
  return lines.join("\n");
}

function absorbIntroLists(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (!block || block.kind !== "prose" || !isBareIntro(block.text)) {
      if (block) out.push(block);
      continue;
    }
    const items: string[] = [];
    let next = index + 1;
    while (next < blocks.length) {
      const candidate = blocks[next];
      if (!candidate || candidate.kind !== "prose" || isStep(candidate.text) || isBareIntro(candidate.text)) {
        break;
      }
      if (candidate.text.split(/\s+/).length > 4) break;
      items.push(cleanItem(candidate.text));
      next += 1;
    }
    if (items.length >= 2) {
      out.push({ kind: "prose", text: listIntroLabel(block.text) });
      out.push({ kind: "items", items });
      index = next - 1;
      continue;
    }
    out.push(block);
  }
  return out;
}

/** Drop dash characters. A dash used as a join becomes a short pause. */
function stripCoachDashes(text: string): string {
  return text
    .replace(/\s*[\u2012\u2013\u2014\u2015\u2212]\s*/g, ". ")
    .replace(/\s+-\s+/g, ". ")
    .replace(/[\u002D\u00AD\u2010\u2011]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/(?:\.\s*){2,}/g, ". ")
    .trim();
}

/**
 * A reply that is already a few short points should stay a few short points.
 * Choice lists and numbered steps still go through the fuller pass.
 */
function keepShortPoints(lines: readonly string[]): string | null {
  if (lines.length < 2 || !lines.every((line) => line.startsWith("•"))) return null;
  const bodies = lines.map((line) => stripCoachDashes(line.replace(/^•\s*/, "")));
  if (bodies.some((line) => extractChoiceList(line) || splitOrderedSteps(line))) {
    return null;
  }
  return bodies.map((line) => `• ${line.replace(/[.]+$/g, "")}`).join("\n");
}

/** Shape a coach reply so choices read as dots and ordered actions as numbers. */
export function formatCoachReadability(text: string): string {
  const rawLines = text
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const kept = keepShortPoints(rawLines);
  if (kept) return kept;

  const source = rawLines
    .map((line) => line.replace(/^•\s*/, "").trim())
    .filter(Boolean);
  const blocks: Block[] = [];
  for (const line of source) {
    for (const sentence of splitSentences(line)) {
      blocks.push(...sentenceToBlocks(sentence));
    }
  }
  return renderBlocks(absorbIntroLists(blocks))
    .split("\n")
    .map((line) => {
      const bullet = /^•\s*/.exec(line);
      const step = /^(\d+\.\s+)/.exec(line);
      const body = stripCoachDashes(line.replace(/^•\s*/, "").replace(/^\d+\.\s+/, ""));
      if (bullet) return `• ${body}`;
      if (step) return `${step[1]}${body}`;
      return body;
    })
    .join("\n");
}
