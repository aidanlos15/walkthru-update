import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Allow remote thumbnails (Airbnb/Muscache CDN, fixtures, Creatomate, etc.)
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
