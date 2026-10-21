"use client";

/**
 * Take notes for the teacher rail. The ask field lives under this, not inside it.
 */
export function ScaleInlineFeedback({ tip }: { tip: string }) {
  const lines = tip
    .split("\n")
    .map((line) => line.replace(/^[•*]\s*/, "").trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return <p className="musai-teacher-rail__quiet">This take is on the staff</p>;
  }

  return (
    <ul className="musai-teacher-rail__points">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}
