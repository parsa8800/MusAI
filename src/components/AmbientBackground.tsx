/**
 * Quiet warm wash — soft paper grain, no neon blobs.
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
            "repeating-linear-gradient(to bottom, transparent 0, transparent 27px, #1c1917 27px, #1c1917 28px)",
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

      <div
        className="absolute inset-0 mix-blend-multiply"
        style={{
          opacity: 0.04,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}
