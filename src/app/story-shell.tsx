"use client";

import { createContext, useContext, useState } from "react";
import { cn } from "@/lib/utils";

export type MobileTab = "editor" | "chat";

const MobileTabCtx = createContext<{
  tab: MobileTab;
  setTab: (t: MobileTab) => void;
  sidebarSheetOpen: boolean;
  setSidebarSheetOpen: (open: boolean) => void;
} | null>(null);

export function useMobileTab() { return useContext(MobileTabCtx); }

export function StoryShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const [tab, setTab] = useState<MobileTab>("editor");
  const [sidebarSheetOpen, setSidebarSheetOpen] = useState(false);

  return (
    <MobileTabCtx.Provider value={{ tab, setTab, sidebarSheetOpen, setSidebarSheetOpen }}>
      <div className="relative z-10 h-full flex flex-col overflow-hidden">
        {/* Mobile-only tab bar */}
        <div className="md:hidden shrink-0 h-12 flex border-b border-white/10 bg-background/80 backdrop-blur-md">
          <button
            onClick={() => setSidebarSheetOpen(true)}
            className="flex-1 text-sm font-medium text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            Sessions
          </button>
          {(["editor", "chat"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 text-sm font-medium capitalize transition-colors",
                tab === t
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground/60 hover:text-muted-foreground"
              )}
            >
              {t === "editor" ? "Editor" : "Chat"}
            </button>
          ))}
        </div>

        {/* Layout */}
        <div className="flex-1 flex max-md:p-0 max-md:gap-0 overflow-hidden min-h-0">
          <div className="contents">{sidebar}</div>
          <div className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0">{children}</div>
        </div>
      </div>
    </MobileTabCtx.Provider>
  );
}
