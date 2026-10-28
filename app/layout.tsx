import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Echovest — Copy trading signals and referral earnings", description: "Copy trading signals and referral earnings in one wallet with Echovest.", icons: { icon: "/icon.svg" }, openGraph: { title: "Echovest — Copy trading signals and referral earnings", description: "Copy trading signals and referral earnings in one wallet with Echovest.", type: "website" }, twitter: { card: "summary", title: "Echovest — Copy trading signals and referral earnings", description: "Copy trading signals and referral earnings in one wallet with Echovest." } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
