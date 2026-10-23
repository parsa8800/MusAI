import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Default is bottom-left and sits on Piece Studio Listen Play/Restart.
  // Production has no badge; errors still surface in the overlay when this is false.
  devIndicators: false,
  transpilePackages: ["opensheetmusicdisplay"],
  experimental: {
    // The on-disk Turbopack cache grows without bound and stalls page loads
    // once it reaches a few gigabytes. Keep dev compiles in memory.
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
