import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/pwa",
    name: "EchoVest",
    short_name: "EchoVest",
    description: "Copy trading signals and referral earnings in one wallet.",
    start_url: "/pwa",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#F7F8FA",
    theme_color: "#F7F8FA",
    icons: [
      { src: "/icons/echovest-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/echovest-icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
