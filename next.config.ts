import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Default is bottom-left and sits on Piece Studio Listen Play/Restart.
  // Production has no badge; errors still surface in the overlay when this is false.
  devIndicators: false,
  transpilePackages: ["opensheetmusicdisplay"],
};

export default nextConfig;
