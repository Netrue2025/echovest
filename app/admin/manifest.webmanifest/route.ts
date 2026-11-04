import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    id: "/admin-app",
    name: "EchoVest Admin",
    short_name: "EV Admin",
    description: "EchoVest administrator console and account alerts.",
    start_url: "/admin",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#F5F6F7",
    theme_color: "#F0B90B",
    icons: [
      { src: "/icons/echovest-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/echovest-icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  }, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
