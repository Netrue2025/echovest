import "./admin.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "EchoVest Admin",
  applicationName: "EchoVest Admin",
  manifest: "/admin/manifest.webmanifest",
  appleWebApp: { capable: true, title: "EchoVest Admin", statusBarStyle: "default" },
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
