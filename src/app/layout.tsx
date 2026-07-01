import type { Metadata } from "next";
import "./globals.css";
import { StorySidebar } from "./components/story-sidebar";
import { WarpShaderBackground } from "@/components/ui/warp-shader";
import { StoryShell } from "./story-shell";
import { Providers } from "@/components/providers";
import { DM_Sans, Geist_Mono } from "next/font/google";
import { cn } from "@/lib/utils";

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: "Story Room — Faceless",
  description: "Turn a single sentence into a complete Film Bible with an AI showrunner.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("dark", "font-sans", dmSans.variable, geistMono.variable)}>
      <body className="min-h-screen antialiased">
        <Providers>
          <div className="fixed inset-0 text-foreground overflow-hidden bg-background">
            <WarpShaderBackground />
            <StoryShell sidebar={<StorySidebar />}>
              {children}
            </StoryShell>
          </div>
        </Providers>
      </body>
    </html>
  );
}
