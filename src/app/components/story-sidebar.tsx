"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession, signOut } from "next-auth/react";
import axios from "@/lib/axios";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { AuthModal } from "@/components/auth-modal";
import { useMobileTab } from "../story-shell";

function useIsMobile() {
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return mobile;
}

interface StorySession {
  id: string;
  title: string | null;
  seed: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = "story-sidebar-pinned";

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconEdit() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}

function IconFilm() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
    </svg>
  );
}

function IconSidebarToggle() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h4M9 3v18M9 3h10a2 2 0 012 2v14a2 2 0 01-2 2H9" />
    </svg>
  );
}

function IconLibrary() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h7" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 14l3 3m0 0l3-3m-3 3V11" />
    </svg>
  );
}

// ── Shared sub-components (declared outside to avoid re-create-on-render) ─────

function UserMenuPopup({
  initials,
  name,
  email,
  onClose,
}: {
  initials: string;
  name: string;
  email: string;
  onClose: () => void;
}) {
  return (
    <div className="rounded-2xl border border-white/15 w-56 overflow-hidden bg-card/95 backdrop-blur-2xl shadow-2xl">
      <div className="px-4 py-3 flex items-center gap-3 border-b border-white/10">
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{name}</p>
          <p className="text-xs text-muted-foreground/60 truncate">{email}</p>
        </div>
      </div>
      <div className="py-1">
        <Link
          href="/dashboard"
          onClick={onClose}
          className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground/80 hover:bg-white/8 transition-colors"
        >
          <svg className="w-4 h-4 text-muted-foreground/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          Dashboard
        </Link>
      </div>
      <div className="border-t border-white/10" />
      <div className="py-1">
        <button
          onClick={() => void signOut({ callbackUrl: "/auth/signin" })}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground/80 hover:bg-white/8 transition-colors"
        >
          <svg className="w-4 h-4 text-muted-foreground/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Log out
        </button>
      </div>
    </div>
  );
}

function SessionList({
  sessions,
  activeSessionId,
}: {
  sessions: StorySession[];
  activeSessionId?: string;
}) {
  if (sessions.length === 0) {
    return <p className="text-xs text-muted-foreground/40 px-3 py-3">No stories yet</p>;
  }
  return (
    <>
      {sessions.map((s) => {
        const isActive = s.id === activeSessionId;
        const label = s.title ?? s.seed ?? "Untitled story";
        return (
          <Link
            key={s.id}
            href={`/c/${s.id}`}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors mb-1",
              isActive
                ? "bg-primary/15 text-foreground"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
            )}
          >
            <span className={cn("shrink-0 transition-colors", isActive ? "text-primary/70" : "opacity-40")}><IconFilm /></span>
            <span className="truncate leading-tight">{label}</span>
          </Link>
        );
      })}
    </>
  );
}

// ── Expanded sidebar content (shared between desktop and mobile Sheet) ────────

function ExpandedSidebarContent({
  isLibrary,
  sessions,
  activeSessionId,
  name,
  email,
  initials,
  isLoggedIn,
  onLoginClick,
  menuOpen,
  setMenuOpen,
  menuRef,
  togglePin,
}: {
  isLibrary: boolean;
  sessions: StorySession[];
  activeSessionId?: string;
  name: string;
  email: string;
  initials: string;
  isLoggedIn: boolean;
  onLoginClick: () => void;
  menuOpen: boolean;
  setMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  menuRef: React.RefObject<HTMLDivElement | null>;
  togglePin: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <span className="text-[15px] font-semibold text-foreground px-2">Story Room</span>
        <button
          onClick={togglePin}
          title="Collapse sidebar"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-white/8 transition-colors"
        >
          <IconSidebarToggle />
        </button>
      </div>

      <div className="px-2 pt-1 pb-2 flex flex-col gap-0.5">
        <Link
          href="/"
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-foreground/80 hover:bg-white/8 hover:text-foreground transition-colors group"
        >
          <span className="text-muted-foreground/60 group-hover:text-muted-foreground transition-colors"><IconEdit /></span>
          New story
        </Link>
        <Link
          href="/library"
          className={cn(
            "flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm transition-colors group",
            isLibrary ? "bg-white/10 text-foreground" : "text-muted-foreground hover:bg-white/8 hover:text-foreground"
          )}
        >
          <span className={cn("transition-colors", isLibrary ? "text-muted-foreground" : "text-muted-foreground/60 group-hover:text-muted-foreground")}>
            <IconLibrary />
          </span>
          Library
        </Link>
      </div>

      {sessions.length > 0 && (
        <p className="px-5 pb-1 text-[11px] font-semibold text-muted-foreground/40 uppercase tracking-wider">Recents</p>
      )}

      <div className="flex-1 overflow-y-auto px-1.5 pb-2 [scrollbar-width:thin] [scrollbar-color:#333_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-white/30">
        <SessionList sessions={sessions} activeSessionId={activeSessionId} />
      </div>

      <div className="px-2 py-2 border-t border-white/6 relative" ref={menuRef}>
        {isLoggedIn ? (
          <>
            {menuOpen && (
              <div className="absolute bottom-full left-2 right-2 mb-2">
                <UserMenuPopup initials={initials} name={name} email={email} onClose={() => setMenuOpen(false)} />
              </div>
            )}
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/8 transition-colors group"
            >
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground shrink-0">{initials}</div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm text-foreground truncate leading-tight">{name}</p>
              </div>
              <svg className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" fill="currentColor" viewBox="0 0 16 16">
                <circle cx="8" cy="3" r="1.2" />
                <circle cx="8" cy="8" r="1.2" />
                <circle cx="8" cy="13" r="1.2" />
              </svg>
            </button>
          </>
        ) : (
          <div className="px-1 pt-1 pb-0.5 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5 px-2">
              <p className="text-sm font-semibold text-foreground">Save your stories</p>
              <p className="text-xs text-muted-foreground leading-relaxed">Log in to access your library, resume projects, and generate videos.</p>
            </div>
            <button
              onClick={onLoginClick}
              className="w-full flex items-center justify-center px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-medium text-foreground transition-colors"
            >
              Log in
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function StorySidebar() {
  const params = useParams();
  const pathname = usePathname();
  const activeSessionId = params?.sessionId as string | undefined;
  const isLibrary = pathname === "/v2/library";
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [storiesOpen, setStoriesOpen] = useState(false);
  const storiesCloseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const openStories = () => { clearTimeout(storiesCloseTimer.current); setStoriesOpen(true); };
  const closeStories = () => { storiesCloseTimer.current = setTimeout(() => setStoriesOpen(false), 120); };
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pinned, setPinned] = useState(
    () => typeof window !== "undefined"
      ? (localStorage.getItem(STORAGE_KEY) ?? "true") === "true"
      : true
  );
  const isMobile = useIsMobile();
  const menuRef = useRef<HTMLDivElement>(null);

  function togglePin() {
    setPinned((p) => {
      const next = !p;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }

  const { data } = useQuery<StorySession[]>({
    queryKey: ["story-sessions"],
    queryFn: async () => {
      const res = await axios.get("/v2/story");
      return res.data.sessions;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const sessions = data ?? [];
  const isLoggedIn = !!session?.user;
  const name = session?.user?.name ?? "User";
  const email = session?.user?.email ?? "";
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // ── MOBILE ──────────────────────────────────────────────────────────────────
  const mobileCtx = useMobileTab();
  if (isMobile) {
    const open = mobileCtx?.sidebarSheetOpen ?? sheetOpen;
    const setOpen = (v: boolean) =>
      mobileCtx ? mobileCtx.setSidebarSheetOpen(v) : setSheetOpen(v);

    return (
      <>
        {/* Fixed trigger only when no tab bar is present (standalone usage) */}
        {!mobileCtx && (
          <button
            onClick={() => setOpen(true)}
            className="fixed top-3 left-3 z-40 w-9 h-9 flex items-center justify-center rounded-lg glass-base text-muted-foreground hover:text-foreground transition-colors"
            title="Open menu"
          >
            <IconSidebarToggle />
          </button>
        )}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" showCloseButton={false} className="w-72 p-0 bg-sidebar border-white/6">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <ExpandedSidebarContent
              isLibrary={isLibrary}
              sessions={sessions}
              activeSessionId={activeSessionId}
              name={name}
              email={email}
              initials={initials}
              isLoggedIn={isLoggedIn}
              onLoginClick={() => setAuthModalOpen(true)}
              menuOpen={menuOpen}
              setMenuOpen={setMenuOpen}
              menuRef={menuRef}
              togglePin={() => setOpen(false)}
            />
          </SheetContent>
        </Sheet>
        <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} />
      </>
    );
  }

  // ── COLLAPSED ───────────────────────────────────────────────────────────────
  if (!pinned) {
    return (
      <div className="relative shrink-0 h-full" ref={menuRef}>
        {/* User menu popup — outside GlassPanel so overflow-hidden doesn't clip it */}
        {menuOpen && (
          <div className="absolute bottom-2 left-full ml-2 z-50">
            <UserMenuPopup
              initials={initials}
              name={name}
              email={email}
              onClose={() => setMenuOpen(false)}
            />
          </div>
        )}
        <Card variant="panel" padding="none" className="w-[52px] h-full rounded-none overflow-visible flex-col py-2 items-center">
          {/* Toggle expand */}
          <button
            onClick={togglePin}
            title="Expand sidebar"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/8 transition-colors"
          >
            <IconSidebarToggle />
          </button>

          <div className="h-3" />

          {/* New story */}
          <Link
            href="/"
            title="New story"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/8 transition-colors"
          >
            <IconEdit />
          </Link>

          {/* Library */}
          <Link
            href="/library"
            title="Library"
            className={cn("w-9 h-9 flex items-center justify-center rounded-lg transition-colors mt-1", isLibrary ? "bg-primary/20 text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/8")}
          >
            <IconLibrary />
          </Link>

          {/* Stories — hover flyout */}
          <div className="relative w-9 mt-1" onMouseEnter={openStories} onMouseLeave={closeStories}>
            <button
              title="Recent stories"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/8 transition-colors"
            >
              <IconFilm />
            </button>

            {storiesOpen && (
              <div
                onMouseEnter={openStories}
                onMouseLeave={closeStories}
                className="absolute left-full top-0 ml-4 w-64 z-50 transition-all duration-150 ease-out opacity-100 translate-y-0 pointer-events-auto"
              >
                <Card variant="panel-dark" padding="none">
                  <div className="px-4 py-3 border-b border-white/10">
                    <p className="text-sm font-semibold text-foreground">Recent</p>
                  </div>
                  <div className="max-h-96 overflow-y-auto py-1.5 px-1.5 [scrollbar-width:thin] [scrollbar-color:#333_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-white/30]">
                    <SessionList sessions={sessions} activeSessionId={activeSessionId} />
                  </div>
                </Card>
              </div>
            )}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* User avatar / login */}
          <div className="pb-1">
            {isLoggedIn ? (
              <button
                onClick={() => setMenuOpen((o) => !o)}
                title={name}
                className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground hover:ring-2 hover:ring-ring/50 transition-all"
              >
                {initials}
              </button>
            ) : (
              <button
                onClick={() => setAuthModalOpen(true)}
                title="Log in"
                className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/8 transition-colors"
              >
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                </svg>
              </button>
            )}
          </div>
        </Card>
        <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} />
      </div>
    );
  }

  // ── EXPANDED ────────────────────────────────────────────────────────────────
  return (
    <Card variant="panel" padding="none" className="w-64 shrink-0 rounded-none min-h-0">
      <ExpandedSidebarContent
        isLibrary={isLibrary}
        sessions={sessions}
        activeSessionId={activeSessionId}
        name={name}
        email={email}
        initials={initials}
        isLoggedIn={isLoggedIn}
        onLoginClick={() => setAuthModalOpen(true)}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        menuRef={menuRef}
        togglePin={togglePin}
      />
      <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} />
    </Card>
  );
}
