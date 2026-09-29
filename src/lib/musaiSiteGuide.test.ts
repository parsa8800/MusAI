import { describe, expect, it } from "vitest";
import { localSiteGuideReply } from "@/lib/musaiSiteGuide";

describe("localSiteGuideReply", () => {
  it("answers how to import a piece", () => {
    const reply = localSiteGuideReply("Where do I import a piece?");
    expect(reply).toMatch(/Piece studio/i);
    expect(reply).toMatch(/PDF/i);
  });

  it("answers how the tuner works", () => {
    expect(localSiteGuideReply("What does the tuner do?")).toMatch(/one pitch/i);
  });

  it("answers instrument settings", () => {
    const reply = localSiteGuideReply("How do I change my instrument?");
    expect(reply).toMatch(/Settings/i);
    expect(reply).toMatch(/violin, viola, or piano/i);
  });

  it("explains recording without listing the scale controls", () => {
    const reply = localSiteGuideReply("How do I record a scale?");
    expect(reply).toMatch(/finds it/i);
    expect(reply).toMatch(/choose the scale yourself/i);
    expect(reply).not.toMatch(/octave/i);
    expect(reply).not.toMatch(/Major or Minor/i);
  });

  it("names the scale on the staff when they ask how to record", () => {
    expect(
      localSiteGuideReply("How do I record a scale?", {
        scaleLabel: "E major",
      }),
    ).toMatch(/E major/);
  });

  it("leaves take questions for the measured coach", () => {
    expect(localSiteGuideReply("why was A2 high")).toBeNull();
  });
});
