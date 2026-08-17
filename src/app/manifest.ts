import type { MetadataRoute } from "next";

// Makes the app installable from Android Chrome ("Add to Home screen" /
// the install prompt) as a standalone, browser-chrome-free app icon --
// no native build/APK involved, Chrome generates the on-device wrapper
// itself from this manifest. See CLAUDE.md.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Meal Prep Planner",
    short_name: "Meal Prep",
    description:
      "Weekly meal planning: consolidated grocery lists, filtered dish search, and pantry-based recipe suggestions.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#09090b",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
