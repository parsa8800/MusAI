import { ensureBulletFeedback } from "@/lib/scalePracticeCopy";

/** What is on the staff before a take, if a scale has been chosen. */
export type ScaleCoachPreview = {
  scaleLabel?: string;
  scaleKind?: string;
  octaveLabel?: string;
  instrumentId?: string;
};

/**
 * Facts the coach may use for “how does MusAI work?”.
 * Written from the app itself, not from a live page crawl.
 */
export function musaiSiteGuideText(): string {
  return [
    "Home has Tuner, Tuning trainer, Scale studio, and Piece studio.",
    "Tuner checks whether one pitch is in tune.",
    "Tuning trainer is for practising a single note.",
    "Scale studio: pick a key, Major or Minor, 1 or 2 octaves, and Up or Up and down. Fingering shows string and finger on violin and viola. Record is under the staff. After a take, notes colour on the staff. The bar fills as that scale is played in tune. My scales is the button at the top and keeps past scales. The Coach button opens this chat even before a recording.",
    "Piece studio: import a photo, a PDF, or a MusicXML file. MusAI reads the notes into a score you can play along with. You can open the original file too.",
    "Settings chooses the instrument (violin, viola, or piano) and light, dark, or system appearance.",
    "Do not invent other pages, accounts, or payments.",
  ].join(" ");
}

export function guideSuggestedQuestions(): string[] {
  return [
    "How do I record a scale?",
    "Where do I import a piece?",
    "How do I change my instrument?",
  ];
}

export function scaleCoachGuidePrompt(): string {
  return [
    "They have not recorded a scale yet. Do not invent a take, a score, or coloured notes.",
    "Help with the scale on screen and with how MusAI works.",
    musaiSiteGuideText(),
    "Reply with JSON only: {\"reply\":\"...\"}",
    "reply: 1 or 2 short • bullets. Plain words. No hyphens or dashes.",
    "When you name choices, write them as photo, PDF, or MusicXML in one sentence.",
    "When someone must do steps in order, give each step its own short sentence that starts with a verb.",
  ].join(" ");
}

export function scaleCoachPreviewMessage(preview?: ScaleCoachPreview): string {
  const label = preview?.scaleLabel?.trim();
  const named = label && !/^play a scale$/i.test(label) ? label : "";
  const bits = [
    named ? `Staff scale: ${named}` : "No scale chosen yet.",
    preview?.scaleKind ? `Kind: ${preview.scaleKind}` : "",
    preview?.octaveLabel ? `Length: ${preview.octaveLabel}` : "",
    "No recording yet.",
  ].filter(Boolean);
  return bits.join(" ");
}

/** App answers. Null when the question is about a take, not the site. */
export function localSiteGuideReply(
  question: string,
  preview?: ScaleCoachPreview,
): string | null {
  const q = question.toLowerCase();

  if (/\b(piece studio|import|musicxml|pdf|photo of|sheet music|upload a score)\b/.test(q)) {
    return ensureBulletFeedback(
      "Open Piece studio from the home page. Add a photo, a PDF, or a MusicXML file",
    );
  }
  if (/\b(tuning trainer|single note|one note)\b/.test(q)) {
    return ensureBulletFeedback(
      "Tuning trainer is on the home page. It is for one note at a time",
    );
  }
  if (/\btuner\b/.test(q)) {
    return ensureBulletFeedback("Tuner is on the home page. It checks one pitch");
  }
  if (
    /\b(settings|dark mode|light mode|theme)\b/.test(q) ||
    /\b(change|switch|set|pick|choose).{0,40}\b(instrument|violin|viola|piano)\b/.test(q)
  ) {
    return ensureBulletFeedback(
      "Open Settings. Pick violin, viola, or piano, and light or dark",
    );
  }
  if (/\b(fingering|finger numbers)\b/.test(q)) {
    return ensureBulletFeedback(
      "Fingering is the button by the scale title. It shows string and finger",
    );
  }
  if (/\b(my scales|scale history|past scales)\b/.test(q)) {
    return ensureBulletFeedback("My scales is the button at the top of Scale studio");
  }
  if (/\b(record|microphone|\bmic\b|how do i (play|start|practise|practice))\b/.test(q)) {
    const scale = namedScale(preview);
    return ensureBulletFeedback(
      scale
        ? `Press Record under the staff and play ${scale}`
        : "Press Record under the staff, play the scale, then stop",
    );
  }
  if (
    /\b(how (does|do) (this|the|musai)|what (is|can) (this|musai|the app)|how (the|this) (app|site|website))\b/.test(
      q,
    ) ||
    /\b(where (is|do i)|what pages|how (do i|to) use)\b/.test(q)
  ) {
    return ensureBulletFeedback(
      "Home has Tuner, Tuning trainer, Scale studio, and Piece studio. Settings changes instrument and colour",
    );
  }
  return null;
}

function namedScale(preview?: ScaleCoachPreview): string {
  const label = preview?.scaleLabel?.trim() ?? "";
  if (!label || /^play a scale$/i.test(label)) return "";
  return label;
}
