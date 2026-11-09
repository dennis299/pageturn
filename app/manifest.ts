import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    // An explicit identity and scope, so the phone treats Pageturn as one app of its own: tapping its
    // icon (or its lock-screen player) brings this app back. "/" matches the old implicit id, so an
    // existing Android install stays the same app.
    id: "/",
    name: "Pageturn",
    short_name: "Pageturn",
    description: "Your PDFs, read aloud.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f211b",
    theme_color: "#0f211b",
    // Chrome/Android: reopening the app focuses the window that's already playing instead of starting another.
    launch_handler: { client_mode: ["focus-existing", "auto"] },
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  } as MetadataRoute.Manifest;
}
