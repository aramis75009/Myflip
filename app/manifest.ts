import type { MetadataRoute } from "next";

import { FOND_THEME } from "@/lib/themeMeta";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MyFlip",
    short_name: "MyFlip",
    description: "Pilotage de revente de vêtements de marque.",
    start_url: "/dashboard",
    display: "standalone",
    // --bg of the light theme (the manifest knows no media query). The
    // status bar follows both themes through the inline theme script.
    background_color: FOND_THEME.light,
    theme_color: FOND_THEME.light,
    lang: "fr",
    icons: [
      { src: "/logo-atlas/myflip-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/logo-atlas/myflip-icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/logo-atlas/myflip-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
