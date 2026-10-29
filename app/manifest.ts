import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return { name: "Echovest", short_name: "Echovest", description: "Copy trading signals and referral earnings in one wallet.", start_url: "/pwa", display: "standalone", background_color: "#F8FAFC", theme_color: "#FF5A00", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }] };
}
