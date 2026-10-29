import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EchoVest — Copy trading signals and referral earnings",
  description: "Copy trading signals and referral earnings in one wallet with EchoVest.",
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
