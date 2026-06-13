import type { Metadata } from "next";
import { StorySidebar } from "./components/story-sidebar";

export const metadata: Metadata = {
  title: "Story Room — Faceless",
  description: "Turn a single sentence into a complete Film Bible with an AI showrunner.",
};

export default function StoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen bg-gray-950 text-white flex overflow-hidden">
      <StorySidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
