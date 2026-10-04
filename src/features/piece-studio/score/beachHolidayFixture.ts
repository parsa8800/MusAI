/**
 * Beach Holiday melody for unit tests only.
 * Not app content, and not a fallback when a page cannot be read.
 * 12 bars, one sharp, with the printed marks p, f, and ff.
 */

type MelodyNote = {
  step: "C" | "D" | "E" | "F" | "G" | "A" | "B";
  alter: number;
  octave: number;
  /** Length in eighth notes. */
  eighths: number;
};

const quarter = (
  step: MelodyNote["step"],
  octave: number,
  alter = 0,
): MelodyNote => ({ step, alter, octave, eighths: 2 });

const eighth = (
  step: MelodyNote["step"],
  octave: number,
  alter = 0,
): MelodyNote => ({ step, alter, octave, eighths: 1 });

const gPhrase: MelodyNote[] = [
  eighth("G", 4),
  eighth("G", 4),
  eighth("F", 4, 1),
  eighth("F", 4, 1),
  quarter("E", 4),
  quarter("F", 4, 1),
];

const dPhrase: MelodyNote[] = [
  eighth("D", 5),
  eighth("D", 5),
  eighth("C", 5, 1),
  eighth("C", 5, 1),
  quarter("B", 4),
  quarter("C", 5, 1),
];

const gQuarters: MelodyNote[] = [
  quarter("G", 4),
  quarter("F", 4, 1),
  quarter("E", 4),
  quarter("F", 4, 1),
];

const dQuarters: MelodyNote[] = [
  quarter("D", 5),
  quarter("C", 5, 1),
  quarter("B", 4),
  quarter("C", 5, 1),
];

type Bar = { notes: MelodyNote[]; dynamic?: "p" | "f" | "ff" };

const bars: Bar[] = [
  { notes: gQuarters, dynamic: "p" },
  { notes: gPhrase },
  { notes: gPhrase },
  { notes: [quarter("G", 4)], dynamic: "f" },
  { notes: dQuarters },
  { notes: dPhrase },
  { notes: dPhrase },
  { notes: [quarter("D", 5)] },
  { notes: gQuarters },
  { notes: gPhrase },
  { notes: gPhrase },
  {
    notes: [quarter("G", 4), eighth("G", 3), eighth("G", 3), quarter("G", 3)],
    dynamic: "ff",
  },
];

function noteXml(note: MelodyNote): string {
  const alter =
    note.alter === 0 ? "" : `<alter>${note.alter}</alter>`;
  const type = note.eighths === 1 ? "eighth" : "quarter";
  return `<note><pitch><step>${note.step}</step>${alter}<octave>${note.octave}</octave></pitch><duration>${note.eighths}</duration><type>${type}</type></note>`;
}

function restXml(eighths: number): string {
  const type = eighths === 2 ? "quarter" : eighths === 4 ? "half" : "eighth";
  return `<note><rest/><duration>${eighths}</duration><type>${type}</type></note>`;
}

function barXml(bar: Bar, number: number, first: boolean): string {
  const used = bar.notes.reduce((sum, note) => sum + note.eighths, 0);
  const rest = Math.max(0, 8 - used);
  const head = first
    ? `<attributes><divisions>2</divisions><key><fifths>1</fifths><mode>major</mode></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>`
    : "";
  const dynamic = bar.dynamic
    ? `<direction placement="below"><direction-type><dynamics><${bar.dynamic}/></dynamics></direction-type></direction>`
    : "";
  const rests = rest > 0 ? restXml(rest) : "";
  return `<measure number="${number}">${head}${dynamic}${bar.notes.map(noteXml).join("")}${rests}</measure>`;
}

export const BEACH_HOLIDAY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Beach Holiday</work-title></work>
  <part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list>
  <part id="P1">
    ${bars.map((bar, i) => barXml(bar, i + 1, i === 0)).join("\n    ")}
  </part>
</score-partwise>`;
