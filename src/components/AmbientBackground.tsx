/**
 * Quiet warm wash — soft paper grain, no neon blobs.
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

      <div
        className="absolute rounded-full"
        style={{
          left: "50%",
          top: "-8%",
          width: "min(90vw, 900px)",
          height: "min(50vh, 420px)",
          transform: "translateX(-50%)",
          background: "color-mix(in srgb, var(--musai-accent) 18%, transparent)",
          filter: "blur(90px)",
          opacity: 0.35,
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          right: "-10%",
          bottom: "5%",
          width: "min(70vw, 640px)",
          height: "min(45vh, 380px)",
          background: "color-mix(in srgb, var(--musai-accent-2) 10%, transparent)",
          filter: "blur(100px)",
          opacity: 0.25,
        }}
      />

      <div className="musai-ambient-grain absolute inset-0" />
    </div>
  );
}
