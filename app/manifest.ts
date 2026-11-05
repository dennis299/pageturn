import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pageturn",
    short_name: "Pageturn",
    description: "Your PDFs, read aloud.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f211b",
    theme_color: "#0f211b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
