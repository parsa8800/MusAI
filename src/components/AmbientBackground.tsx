/**
 * Flat system background, faint staff lines, and a light grain.
 * Colours follow --musai-* tokens (light / dark).
 */
export function AmbientBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      aria-hidden
    >
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "var(--musai-bg)" }}
      />

      {/* Faint staff-like horizontal lines */}
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, transparent 0, transparent 27px, var(--musai-ink) 27px, var(--musai-ink) 28px)",
        }}
      />

      <div className="musai-ambient-grain absolute inset-0" />
    </div>
  );
}
