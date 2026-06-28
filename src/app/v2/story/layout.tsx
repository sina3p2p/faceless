import type { Metadata } from "next";
import { StorySidebar } from "./components/story-sidebar";
import { WarpShaderBackground } from "@/components/ui/warp-shader";

export const metadata: Metadata = {
  title: "Story Room — Faceless",
  description: "Turn a single sentence into a complete Film Bible with an AI showrunner.",
};

export default function StoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-screen text-foreground overflow-hidden bg-background">
      <WarpShaderBackground />
      <div className="relative z-10 h-full flex gap-2 p-3 overflow-hidden">
        <StorySidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
