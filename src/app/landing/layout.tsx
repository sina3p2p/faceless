import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { DM_Sans, Geist_Mono } from "next/font/google";
import { cn } from "@/lib/utils";

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const viewport: Viewport = {
  viewportFit: "cover",
};

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
    <html lang="en" className={cn("dark", "font-sans", dmSans.variable, geistMono.variable)}>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
