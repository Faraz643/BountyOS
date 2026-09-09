import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "BountyOS — AI Bounty Hunter", description: "Find the GitHub bounties you have the highest probability of successfully completing." };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }
