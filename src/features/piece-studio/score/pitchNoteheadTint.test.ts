import { describe, expect, it } from "vitest";
import {
  applyPitchNoteheadTints,
  clearPitchNoteheadTints,
} from "@/features/piece-studio/score/pitchNoteheadTint";
import type { PitchNoteMark } from "@/features/piece-studio/feedback/visual/piecePitchScoreMap";

describe("applyPitchNoteheadTints", () => {
  it("colours the notehead and leaves the stem, flag, and beam alone", () => {
    const wrap = document.createElement("div");
    wrap.className = "musai-piece-osmd-wrap";
    wrap.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 400,
        bottom: 200,
        width: 400,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    Object.defineProperty(wrap, "scrollLeft", { value: 0 });
    Object.defineProperty(wrap, "scrollTop", { value: 0 });

    const host = document.createElement("div");
    host.className = "musai-piece-osmd";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

    function box(el: Element, x: number, width: number, height: number) {
      el.getBoundingClientRect = () =>
        ({
          left: x,
          top: 40,
          right: x + width,
          bottom: 40 + height,
          width,
          height,
          x,
          y: 40,
          toJSON: () => ({}),
        }) as DOMRect;
    }

    function noteAt(x: number) {
      const note = document.createElementNS("http://www.w3.org/2000/svg", "g");
      note.setAttribute("class", "vf-stavenote");
      const head = document.createElementNS("http://www.w3.org/2000/svg", "g");
      head.setAttribute("class", "vf-notehead");
      box(head, x, 13, 11);
      const headPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      headPath.setAttribute("fill", "#111");
      head.appendChild(headPath);
      const stem = document.createElementNS("http://www.w3.org/2000/svg", "g");
      stem.setAttribute("class", "vf-stem");
      const stemPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      stemPath.setAttribute("stroke", "#111");
      stem.appendChild(stemPath);
      const flag = document.createElementNS("http://www.w3.org/2000/svg", "g");
      flag.setAttribute("class", "vf-flag");
      const flagPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      flagPath.setAttribute("fill", "#111");
      flag.appendChild(flagPath);
      note.append(head, stem, flag);
      svg.appendChild(note);
      return { head, headPath, stem, stemPath, flag, flagPath };
    }

    const first = noteAt(40);
    noteAt(90);
    const beam = document.createElementNS("http://www.w3.org/2000/svg", "g");
    beam.setAttribute("class", "vf-beam");
    const beamPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    beamPath.setAttribute("fill", "#111");
    beam.appendChild(beamPath);
    svg.appendChild(beam);

    host.appendChild(svg);
    wrap.appendChild(host);
    document.body.appendChild(wrap);

    const mark: PitchNoteMark = {
      id: "n0",
      kind: "in_tune",
      noteIndex: 0,
      startWholeNotes: 0,
      endWholeNotes: 0.25,
      label: "G4",
      source: "analysis",
    };
    applyPitchNoteheadTints(wrap, [], [mark], () => 0);

    expect(first.head.getAttribute("data-musai-pitch-kind")).toBe("in_tune");
    expect(first.headPath.style.fill).toContain("--musai-pitch-in_tune");
    expect(first.stem.hasAttribute("data-musai-pitch-kind")).toBe(false);
    expect(first.stemPath.style.stroke).toBe("");
    expect(first.flag.hasAttribute("data-musai-pitch-kind")).toBe(false);
    expect(beam.hasAttribute("data-musai-pitch-kind")).toBe(false);
    expect(beamPath.getAttribute("fill")).toBe("#111");

    clearPitchNoteheadTints(wrap);
    expect(first.head.hasAttribute("data-musai-pitch-kind")).toBe(false);
    expect(first.headPath.style.fill).toBe("");
    expect(first.headPath.getAttribute("fill")).toBe("#111");
    expect(first.stemPath.getAttribute("stroke")).toBe("#111");
    wrap.remove();
  });

  it("restores engraved ink when a colour was left on the notehead", () => {
    const wrap = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const stem = document.createElementNS("http://www.w3.org/2000/svg", "path");
    stem.setAttribute("class", "vf-stem");
    stem.setAttribute("stroke", "#eef2f6");
    const head = document.createElementNS("http://www.w3.org/2000/svg", "path");
    head.setAttribute("class", "vf-notehead");
    head.setAttribute("fill", "var(--musai-pitch-in_tune)");
    head.style.setProperty("fill", "var(--musai-pitch-in_tune)", "important");
    svg.append(stem, head);
    wrap.appendChild(svg);

    clearPitchNoteheadTints(wrap);

    expect(head.style.fill).toBe("");
    expect(head.getAttribute("fill")).toBe("#eef2f6");
    expect(stem.getAttribute("stroke")).toBe("#eef2f6");
  });
});
