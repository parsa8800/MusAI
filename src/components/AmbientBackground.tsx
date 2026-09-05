/**
 * Ambient light: heavily blurred OKLCH blobs only (no stacked gradient meshes).
 * Overlapping teal/cyan/soft-blue fields read as one wash behind the whole app.
 */
export function AmbientBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      aria-hidden
    >
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "oklch(0.072 0.016 263)" }}
      />

      <div
        className="absolute rounded-full"
        style={{
          left: "50%",
          top: "2%",
          width: "min(220vw, 2000px)",
          height: "min(125vh, 1050px)",
          transform: "translate(-50%, -42%)",
          background: "oklch(0.44 0.055 205)",
          filter: "blur(200px)",
          opacity: 0.22,
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          left: "-20%",
          bottom: "-25%",
          width: "min(160vw, 1500px)",
          height: "min(100vh, 900px)",
          background: "oklch(0.4 0.048 215)",
          filter: "blur(220px)",
          opacity: 0.18,
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          right: "-22%",
          top: "-5%",
          width: "min(150vw, 1300px)",
          height: "min(95vh, 850px)",
          background: "oklch(0.38 0.05 242)",
          filter: "blur(240px)",
          opacity: 0.16,
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          left: "50%",
          top: "48%",
          width: "min(240vw, 2200px)",
          height: "min(130vh, 1100px)",
          transform: "translate(-50%, -50%)",
          background: "oklch(0.3 0.038 225)",
          filter: "blur(260px)",
          opacity: 0.14,
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          left: "50%",
          top: "18%",
          width: "min(260vw, 2400px)",
          height: "min(90vh, 800px)",
          transform: "translate(-50%, -50%)",
          background: "oklch(0.36 0.04 208)",
          filter: "blur(280px)",
          opacity: 0.1,
        }}
      />

      <div
        className="absolute inset-0 mix-blend-overlay"
        style={{
          opacity: 0.032,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.42' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}
