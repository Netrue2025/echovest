import type { Metadata, Viewport } from "next";
import { PwaBootstrap } from "../components/PwaBootstrap";
import "./globals.css";

export const metadata: Metadata = {
  title: "EchoVest — Copy trading signals and referral earnings",
  description: "Copy trading signals and referral earnings in one wallet with EchoVest.",
  applicationName: "EchoVest",
  appleWebApp: { capable: true, title: "EchoVest", statusBarStyle: "default" },
  icons: { icon: "/echovest-icon.png", apple: "/echovest-icon.png" },
  openGraph: {
    title: "EchoVest — Copy trading signals and referral earnings",
    description: "Copy trading signals and referral earnings in one wallet with EchoVest.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "EchoVest — Copy trading signals and referral earnings",
    description: "Copy trading signals and referral earnings in one wallet with EchoVest.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<PwaBootstrap /></body></html>;
}
