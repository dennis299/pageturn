import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Every page is private and per-user, so pages render on request (no Cache Components).
  cacheComponents: false,

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
