import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return { name: "EchoVest", short_name: "EchoVest", description: "Copy trading signals and referral earnings in one wallet.", start_url: "/pwa", display: "standalone", background_color: "#F6F8FC", theme_color: "#1E2329", icons: [{ src: "/echovest-icon.png", sizes: "any", type: "image/png" }] };
}
