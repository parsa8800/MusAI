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

function listLead(lead: string): string {
  const trimmed = capitalizeFirst(lead.trim());
  if (/^(?:Select|Choose|Pick|Add)$/.test(trimmed)) return `${trimmed} one`;
  return trimmed;
}

function isStep(text: string): boolean {
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
): { lead: string; items: string[]; rest: string } | null {
  const match = choiceListMatch(line);
  if (!match || match.index == null) return null;
  const raw = match[0];
  const items = raw
    .split(/,\s*(?:(?:or|and)\s+)?|\s+(?:or|and)\s+/i)
    .map(cleanItem)
    .filter((item) => item.length > 0 && item.split(/\s+/).length <= 5);
  if (items.length < 3) return null;
  const lead = line
    .slice(0, match.index)
    .replace(/\b(?:a|an)\s*$/i, "")
    .replace(/[,\s]+$/g, "")
    .trim();
  let rest = line
    .slice(match.index + raw.length)
    .replace(/^[,\s]+/g, "")
    .replace(/\.$/, "")
    .trim();
  if (/^(?:from|in|on|with|for)\b/i.test(rest)) {
    items[items.length - 1] = `${items[items.length - 1]} ${rest}`;
    rest = "";
  }
  return { lead, items, rest };
}

function sentenceToBlocks(sentence: string): Block[] {
  const list = extractChoiceList(sentence);
  if (list) {
    const blocks: Block[] = [];
    if (list.lead) blocks.push({ kind: "prose", text: listLead(list.lead) });
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

/** Shape a coach reply so choices read as dots and ordered actions as numbers. */
export function formatCoachReadability(text: string): string {
  const source = text
    .split(/\n/)
    .map((line) => line.replace(/^•\s*/, "").trim())
    .filter(Boolean);
  const blocks: Block[] = [];
  for (const line of source) {
    for (const sentence of splitSentences(line)) {
      blocks.push(...sentenceToBlocks(sentence));
    }
  }
  return renderBlocks(blocks);
}
