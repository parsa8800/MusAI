import { describe, expect, it } from "vitest";
import { formatCoachReadability } from "@/lib/coachReadability";

describe("formatCoachReadability", () => {
  it("turns a choice list into dots under the lead-in", () => {
    const formatted = formatCoachReadability(
      "• Use Piece Studio to import a photo, PDF, or MusicXML file\n• MusAI reads the notes for you to play along",
    );
    expect(formatted).toBe(
      [
        "Use Piece Studio to import",
        "• Photo",
        "• PDF",
        "• MusicXML file",
        "MusAI reads the notes for you to play along",
      ].join("\n"),
    );
  });

  it("puts the choosing word before the instrument list", () => {
    const formatted = formatCoachReadability(
      "• Go to Settings to choose your instrument\n• Select violin, viola, or piano",
    );
    expect(formatted).toBe(
      [
        "Go to Settings to choose your instrument",
        "Select:",
        "• Violin",
        "• Viola",
        "• Piano",
      ].join("\n"),
    );
  });

  it("starts an instrument list at the first instrument", () => {
    expect(
      formatCoachReadability(
        "Go to Settings to change your instrument\nChoose\nViolin\nViola\nPiano",
      ),
    ).toBe(
      [
        "Go to Settings to change your instrument",
        "Choose:",
        "• Violin",
        "• Viola",
        "• Piano",
      ].join("\n"),
    );
  });

  it("numbers a then-sequence", () => {
    expect(
      formatCoachReadability(
        "Press Record under the staff, play the scale, then stop",
      ),
    ).toBe(
      ["1. Press Record under the staff", "2. Play the scale", "3. Stop"].join(
        "\n",
      ),
    );
  });

  it("numbers a click, play, stop sequence", () => {
    expect(
      formatCoachReadability(
        "Choose a scale\nClick record under the staff\nPlay the scale",
      ),
    ).toBe(
      ["1. Choose a scale", "2. Click record under the staff", "3. Play the scale"].join(
        "\n",
      ),
    );
  });
  it("keeps a few coaching points as dots and drops dashes", () => {
    expect(
      formatCoachReadability(
        "• Louder than written — Bar 1\n• Quieter than written — Bar 12",
      ),
    ).toBe("• Louder than written. Bar 1\n• Quieter than written. Bar 12");
  });

  it("leaves a single coaching sentence as a sentence", () => {
    expect(formatCoachReadability("• A bit high overall")).toBe(
      "A bit high overall",
    );
    expect(formatCoachReadability("• You're welcome")).toBe("You're welcome");
  });
});
