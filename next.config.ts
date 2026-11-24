import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Pixel sprites are 96×96: serve them as is, so the browser can scale them up with
    // crisp pixels (resampling by the optimizer would blur them).
    unoptimized: true,
    // Artwork is served by the PokéAPI sprites repository on GitHub.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        pathname: "/PokeAPI/sprites/**",
      },
    ],
  },
};

export default nextConfig;
