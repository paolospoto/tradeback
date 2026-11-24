import type { MetadataRoute } from "next";
import { t } from "@/lib/i18n";

// The manifest is JSON read by the browser, so it cannot use CSS variables: these are --color-bg of public/brand/tokens.css.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: t.site.name,
    short_name: t.site.name,
    description: t.site.tagline,
    start_url: "/",
    display: "standalone",
    background_color: "#120C1A",
    theme_color: "#120C1A",
    icons: [
      { src: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { src: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
