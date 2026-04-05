import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Faceless - AI Video Generator",
  description:
    "Create viral faceless short-form videos on autopilot with AI. Generate and publish to TikTok, Reels, and YouTube Shorts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
