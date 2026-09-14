import {
  emptyMusaiScore,
  summarizeMusaiScore,
  type MusaiScoreV1,
  type ScoreAccidental,
  type ScoreArticulation,
  type ScoreClef,
  type ScoreDynamic,
  type ScoreEvent,
  type ScoreKey,
  type ScoreMeasure,
  type ScoreNoteType,
  type ScorePart,
  type ScorePitch,
  type ScoreTime,
} from "@/features/piece-studio/score/musaiScore";

const STEPS = ["C", "D", "E", "F", "G", "A", "B"] as const;
const STEP_PC: Record<(typeof STEPS)[number], number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const FIFTHS_MAJOR = [
  "C♭ major",
  "G♭ major",
  "D♭ major",
  "A♭ major",
  "E♭ major",
  "B♭ major",
  "F major",
  "C major",
  "G major",
  "D major",
  "A major",
  "E major",
  "B major",
  "F♯ major",
  "C♯ major",
] as const;

const FIFTHS_MINOR = [
  "A♭ minor",
  "E♭ minor",
  "B♭ minor",
  "F minor",
  "C minor",
  "G minor",
  "D minor",
  "A minor",
  "E minor",
  "B minor",
  "F♯ minor",
  "C♯ minor",
  "G♯ minor",
  "D♯ minor",
  "A♯ minor",
] as const;

function text(el: Element | null): string {
  return el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function child(el: Element, tag: string): Element | null {
  for (const node of el.children) {
    if (node.tagName === tag) return node;
  }
  return null;
}

function childrenNamed(el: Element, tag: string): Element[] {
  return [...el.children].filter((n) => n.tagName === tag);
}

function keyFromFifths(fifthsRaw: string, modeRaw: string): ScoreKey | null {
  const fifths = Number.parseInt(fifthsRaw, 10);
  if (!Number.isFinite(fifths) || fifths < -7 || fifths > 7) return null;
  const mode = modeRaw.toLowerCase().includes("minor") ? "minor" : "major";
  const label = (mode === "minor" ? FIFTHS_MINOR : FIFTHS_MAJOR)[fifths + 7];
  if (!label) return null;
  return { fifths, mode, label };
}

function midiFromPitch(step: ScorePitch["step"], alter: number, octave: number): number {
  return (octave + 1) * 12 + STEP_PC[step] + Math.round(alter);
}

function noteType(raw: string): ScoreNoteType {
  if (
    raw === "whole" ||
    raw === "half" ||
    raw === "quarter" ||
    raw === "eighth" ||
    raw === "16th" ||
    raw === "32nd" ||
    raw === "64th" ||
    raw === "breve"
  ) {
    return raw;
  }
  return "unknown";
}

function accidentalOf(raw: string): ScoreAccidental {
  switch (raw) {
    case "sharp":
    case "flat":
    case "natural":
      return raw;
    case "double-sharp":
    case "sharp-sharp":
      return "double-sharp";
    case "flat-flat":
    case "double-flat":
      return "double-flat";
    default:
      return null;
  }
}

function clefOf(sign: string, line: string): ScoreClef {
  const s = sign.toUpperCase();
  if (s === "G") return "treble";
  if (s === "F") return "bass";
  if (s === "C" && line === "3") return "alto";
  if (s === "C" && line === "4") return "tenor";
  if (s === "percussion") return "percussion";
  return "unknown";
}

function parsePitch(noteEl: Element): ScorePitch | null {
  const pitchEl = child(noteEl, "pitch");
  if (!pitchEl) return null;
  const stepRaw = text(child(pitchEl, "step")).toUpperCase();
  if (!STEPS.includes(stepRaw as ScorePitch["step"])) return null;
  const step = stepRaw as ScorePitch["step"];
  const octave = Number.parseInt(text(child(pitchEl, "octave")), 10);
  if (!Number.isFinite(octave)) return null;
  const alterRaw = text(child(pitchEl, "alter"));
  const alter = alterRaw ? Number.parseFloat(alterRaw) : 0;
  const safeAlter = Number.isFinite(alter) ? alter : 0;
  return {
    step,
    alter: safeAlter,
    octave,
    midi: midiFromPitch(step, safeAlter, octave),
  };
}

function articulationsOf(noteEl: Element): ScoreArticulation[] {
  const out: ScoreArticulation[] = [];
  const seen = new Set<ScoreArticulation>();
  const push = (mark: ScoreArticulation) => {
    if (seen.has(mark)) return;
    seen.add(mark);
    out.push(mark);
  };
  for (const art of noteEl.querySelectorAll("notations articulations > *")) {
    switch (art.tagName) {
      case "staccato":
      case "staccatissimo":
      case "accent":
      case "strong-accent":
      case "tenuto":
        push(art.tagName as ScoreArticulation);
        break;
      case "marcato":
        push("marcato");
        break;
      default:
        break;
    }
  }
  if (noteEl.querySelector("notations fermata")) push("fermata");
  return out;
}

function durationQuarters(noteEl: Element, divisions: number): number {
  const dur = Number.parseFloat(text(child(noteEl, "duration")));
  if (!Number.isFinite(dur) || divisions <= 0) return 0;
  return dur / divisions;
}

function dynamicMark(directionEl: Element): string | null {
  const dyn = directionEl.querySelector("dynamics");
  if (!dyn) return null;
  const mark = dyn.children[0]?.tagName;
  return mark ? mark.toLowerCase() : null;
}

function tempoFrom(el: Element): number | null {
  const fromSelf = el.tagName === "sound" ? el.getAttribute("tempo") : null;
  const sound = el.querySelector("sound[tempo]");
  const fromSound = fromSelf ?? sound?.getAttribute("tempo");
  if (fromSound) {
    const n = Number.parseFloat(fromSound);
    if (Number.isFinite(n)) return Math.round(n);
  }
  const perMinute = text(el.querySelector("per-minute"));
  if (perMinute) {
    const n = Number.parseFloat(perMinute);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return null;
}

function parseMeasure(
  measureEl: Element,
  divisions: number,
  key: ScoreKey | null,
  time: ScoreTime | null,
  tempoBpm: number | null,
  clef: ScoreClef | null,
): {
  measure: ScoreMeasure;
  divisions: number;
  key: ScoreKey | null;
  time: ScoreTime | null;
  tempoBpm: number | null;
  clef: ScoreClef | null;
} {
  let onset = 0;
  const events: ScoreEvent[] = [];
  let lastNoteOnset = 0;

  for (const el of measureEl.children) {
    const tag = el.tagName;
    if (tag === "attributes") {
      const divRaw = text(child(el, "divisions"));
      if (divRaw) {
        const n = Number.parseInt(divRaw, 10);
        if (Number.isFinite(n) && n > 0) divisions = n;
      }
      const fifths = text(el.querySelector("key > fifths") ?? child(el, "fifths"));
      const mode = text(el.querySelector("key > mode") ?? child(el, "mode"));
      if (fifths) key = keyFromFifths(fifths, mode || "major") ?? key;
      const beats = text(el.querySelector("time > beats") ?? child(el, "beats"));
      const beatType = text(
        el.querySelector("time > beat-type") ?? child(el, "beat-type"),
      );
      if (beats && beatType) {
        const b = Number.parseInt(beats, 10);
        const bt = Number.parseInt(beatType, 10);
        if (Number.isFinite(b) && Number.isFinite(bt)) {
          time = { beats: b, beatType: bt, label: `${b}/${bt}` };
        }
      }
      const sign = text(el.querySelector("clef > sign"));
      const line = text(el.querySelector("clef > line"));
      if (sign) clef = clefOf(sign, line);
      const attrTempo = tempoFrom(el);
      if (attrTempo != null) tempoBpm = attrTempo;
    } else if (tag === "sound" || tag === "direction") {
      const t = tempoFrom(el);
      if (t != null) tempoBpm = t;
      if (tag === "direction") {
        const mark = dynamicMark(el);
        if (mark) {
          const dyn: ScoreDynamic = {
            kind: "dynamic",
            onsetQuarters: onset,
            mark,
          };
          events.push(dyn);
        }
      }
    } else if (tag === "backup") {
      onset = Math.max(0, onset - durationQuarters(el, divisions));
    } else if (tag === "forward") {
      onset += durationQuarters(el, divisions);
    } else if (tag === "note") {
      const isChord = Boolean(child(el, "chord"));
      const isGrace = Boolean(child(el, "grace"));
      const dur = isGrace ? 0 : durationQuarters(el, divisions);
      const onsetHere = isChord ? lastNoteOnset : onset;
      const staff = Number.parseInt(text(child(el, "staff")), 10) || 1;
      const voice = Number.parseInt(text(child(el, "voice")), 10) || 1;
      const dots = childrenNamed(el, "dot").length;
      const type = noteType(text(child(el, "type")));
      if (child(el, "rest")) {
        events.push({
          kind: "rest",
          onsetQuarters: onsetHere,
          durationQuarters: dur,
          type,
          dots,
          staff,
          voice,
        });
      } else {
        const pitch = parsePitch(el);
        if (pitch) {
          const accRaw = text(child(el, "accidental"));
          events.push({
            kind: "note",
            onsetQuarters: onsetHere,
            durationQuarters: dur,
            pitch,
            type,
            dots,
            accidental: accidentalOf(accRaw),
            chord: isChord,
            tied: Boolean(el.querySelector('tie[type="start"]')),
            articulations: articulationsOf(el),
            staff,
            voice,
          });
        }
      }
      lastNoteOnset = onsetHere;
      if (!isChord && !isGrace) onset += dur;
    }
  }

  const number = measureEl.getAttribute("number") || "";
  return {
    measure: {
      number,
      divisions,
      key,
      time,
      tempoBpm,
      clef,
      events,
    },
    divisions,
    key,
    time,
    tempoBpm,
    clef,
  };
}

export function parseMusicXmlToScore(
  xml: string,
  fallbackTitle: string,
): MusaiScoreV1 {
  const empty = emptyMusaiScore(fallbackTitle);
  if (typeof DOMParser === "undefined") return empty;
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("That score file couldn’t be read.");
  }

  const partwiseRoot =
    doc.querySelector("score-partwise") ??
    convertTimewiseToPartwise(doc.querySelector("score-timewise"));

  if (!partwiseRoot) {
    throw new Error("That doesn’t look like a score file we can open.");
  }

  const title =
    text(partwiseRoot.querySelector("work-title")) ||
    text(partwiseRoot.querySelector("movement-title")) ||
    text(doc.querySelector("work-title")) ||
    text(doc.querySelector("movement-title")) ||
    fallbackTitle;
  const composer =
    text(partwiseRoot.querySelector('creator[type="composer"]')) ||
    text(partwiseRoot.querySelector("creator")) ||
    text(doc.querySelector('creator[type="composer"]')) ||
    text(doc.querySelector("creator")) ||
    null;

  const partNames = new Map<string, string>();
  for (const scorePart of partwiseRoot.querySelectorAll("part-list score-part")) {
    const id = scorePart.getAttribute("id") ?? "";
    const name = text(scorePart.querySelector("part-name"));
    if (id && name) partNames.set(id, name);
  }

  const parts: ScorePart[] = [];
  let firstKey: ScoreKey | null = null;
  let firstTime: ScoreTime | null = null;
  let firstTempo: number | null = null;

  for (const partEl of [...partwiseRoot.children].filter((n) => n.tagName === "part")) {
    const id = partEl.getAttribute("id") || `P${parts.length + 1}`;
    let divisions = 1;
    let key: ScoreKey | null = null;
    let time: ScoreTime | null = null;
    let tempoBpm: number | null = null;
    let clef: ScoreClef | null = null;
    const measures: ScoreMeasure[] = [];
    for (const measureEl of childrenNamed(partEl, "measure")) {
      const parsed = parseMeasure(
        measureEl,
        divisions,
        key,
        time,
        tempoBpm,
        clef,
      );
      divisions = parsed.divisions;
      key = parsed.key;
      time = parsed.time;
      tempoBpm = parsed.tempoBpm;
      clef = parsed.clef;
      measures.push(parsed.measure);
      firstKey = firstKey ?? parsed.measure.key;
      firstTime = firstTime ?? parsed.measure.time;
      firstTempo = firstTempo ?? parsed.measure.tempoBpm;
    }
    parts.push({
      id,
      name: partNames.get(id) ?? null,
      measures,
    });
  }

  const score: MusaiScoreV1 = {
    schemaVersion: 1,
    title: title || fallbackTitle,
    composer: composer || null,
    keySignature: firstKey?.label ?? null,
    timeSignature: firstTime?.label ?? null,
    tempoBpm: firstTempo,
    measureCount: 0,
    noteCount: 0,
    restCount: 0,
    parts,
  };
  const counts = summarizeMusaiScore(score);
  return { ...score, ...counts };
}

/**
 * Convert MusicXML score-timewise into an in-memory score-partwise root so the
 * rest of the parser stays partwise-only.
 */
function convertTimewiseToPartwise(timewise: Element | null): Element | null {
  if (!timewise) return null;
  const owner = timewise.ownerDocument;
  if (!owner) return null;

  const partwise = owner.createElement("score-partwise");
  const version = timewise.getAttribute("version");
  if (version) partwise.setAttribute("version", version);

  for (const child of [...timewise.children]) {
    if (child.tagName === "measure") continue;
    partwise.appendChild(child.cloneNode(true));
  }

  const partIds: string[] = [];
  for (const scorePart of partwise.querySelectorAll("part-list score-part")) {
    const id = scorePart.getAttribute("id");
    if (id) partIds.push(id);
  }
  // Discover part ids from measures if part-list is incomplete.
  for (const measure of childrenNamed(timewise, "measure")) {
    for (const part of childrenNamed(measure, "part")) {
      const id = part.getAttribute("id");
      if (id && !partIds.includes(id)) partIds.push(id);
    }
  }
  if (partIds.length === 0) return null;

  const partEls = new Map<string, Element>();
  for (const id of partIds) {
    const partEl = owner.createElement("part");
    partEl.setAttribute("id", id);
    partEls.set(id, partEl);
    partwise.appendChild(partEl);
  }

  for (const measure of childrenNamed(timewise, "measure")) {
    const number = measure.getAttribute("number") ?? "";
    for (const id of partIds) {
      const srcPart = [...measure.children].find(
        (n) => n.tagName === "part" && n.getAttribute("id") === id,
      );
      const measureEl = owner.createElement("measure");
      if (number) measureEl.setAttribute("number", number);
      if (srcPart) {
        for (const node of [...srcPart.childNodes]) {
          measureEl.appendChild(node.cloneNode(true));
        }
      }
      partEls.get(id)!.appendChild(measureEl);
    }
  }

  return partwise;
}
