"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession, signOut } from "next-auth/react";
import axios from "@/lib/axios";

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
    <div className="bg-[#1c1c1c] border border-white/10 rounded-2xl shadow-2xl overflow-hidden w-56">
      <div className="px-4 py-3 flex items-center gap-3 border-b border-white/6">
        <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">{name}</p>
          <p className="text-xs text-gray-500 truncate">{email}</p>
        </div>
      </div>
      <div className="py-1">
        <Link
          href="/dashboard"
          onClick={onClose}
          className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 transition-colors"
        >
          <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          Dashboard
        </Link>
      </div>
      <div className="border-t border-white/6" />
      <div className="py-1">
        <button
          onClick={() => void signOut({ callbackUrl: "/auth/signin" })}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 transition-colors"
        >
          <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
    return <p className="text-xs text-gray-600 px-3 py-3">No stories yet</p>;
  }
  return (
    <>
      {sessions.map((s) => {
        const isActive = s.id === activeSessionId;
        const label = s.title ?? s.seed ?? "Untitled story";
        return (
          <Link
            key={s.id}
            href={`/v2/story/${s.id}`}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive
                ? "bg-white/10 text-white"
                : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
            }`}
          >
            <span className="shrink-0 opacity-50"><IconFilm /></span>
            <span className="truncate leading-tight">{label}</span>
          </Link>
        );
      })}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function StorySidebar() {
  const params = useParams();
  const pathname = usePathname();
  const activeSessionId = params?.sessionId as string | undefined;
  const isLibrary = pathname === "/v2/story/library";
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pinned, setPinned] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) setPinned(stored === "true");
  }, []);
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
  const name = session?.user?.name ?? "User";
  const email = session?.user?.email ?? "";
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // ── COLLAPSED ───────────────────────────────────────────────────────────────
  if (!pinned) {
    return (
      <div className="w-[52px] shrink-0 flex flex-col h-full bg-[#0f0f0f] border-r border-white/6 py-2 items-center">
        {/* Toggle expand */}
        <button
          onClick={togglePin}
          title="Expand sidebar"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/8 transition-colors"
        >
          <IconSidebarToggle />
        </button>

        <div className="h-3" />

        {/* New story */}
        <Link
          href="/v2/story"
          title="New story"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/8 transition-colors"
        >
          <IconEdit />
        </Link>

        {/* Library */}
        <Link
          href="/v2/story/library"
          title="Library"
          className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors mt-1 ${
            isLibrary ? "bg-white/12 text-white" : "text-gray-400 hover:text-white hover:bg-white/8"
          }`}
        >
          <IconLibrary />
        </Link>

        {/* Stories — hover flyout */}
        <div className="group relative w-9 mt-1">
          <button
            title="Recent stories"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/8 transition-colors"
          >
            <IconFilm />
          </button>

          <div className="absolute left-full top-0 ml-2 w-64 pointer-events-none opacity-0 -translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto transition-all duration-150 ease-out z-50">
            <div className="bg-[#1c1c1c] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-white/6">
                <p className="text-sm font-semibold text-white">Recents</p>
              </div>
              <div className="max-h-96 overflow-y-auto py-1.5 px-1.5 [scrollbar-width:thin] [scrollbar-color:#333_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-white/30">
                <SessionList sessions={sessions} activeSessionId={activeSessionId} />
              </div>
            </div>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* User avatar */}
        <div className="relative pb-1" ref={menuRef}>
          {menuOpen && (
            <div className="absolute bottom-full left-0 mb-2">
              <UserMenuPopup
                initials={initials}
                name={name}
                email={email}
                onClose={() => setMenuOpen(false)}
              />
            </div>
          )}
          <button
            onClick={() => setMenuOpen((o) => !o)}
            title={name}
            className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold text-white hover:ring-2 hover:ring-violet-400/50 transition-all"
          >
            {initials}
          </button>
        </div>
      </div>
    );
  }

  // ── EXPANDED ────────────────────────────────────────────────────────────────
  return (
    <div className="w-64 shrink-0 flex flex-col h-full bg-[#0f0f0f] border-r border-white/6">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <span className="text-[15px] font-semibold text-white px-2">Story Room</span>
        <button
          onClick={togglePin}
          title="Collapse sidebar"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/8 transition-colors"
        >
          <IconSidebarToggle />
        </button>
      </div>

      {/* Nav items */}
      <div className="px-2 pt-1 pb-2 flex flex-col gap-0.5">
        <Link
          href="/v2/story"
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-gray-300 hover:bg-white/8 hover:text-white transition-colors group"
        >
          <span className="text-gray-500 group-hover:text-gray-300 transition-colors">
            <IconEdit />
          </span>
          New story
        </Link>
        <Link
          href="/v2/story/library"
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm transition-colors group ${
            isLibrary
              ? "bg-white/10 text-white"
              : "text-gray-300 hover:bg-white/8 hover:text-white"
          }`}
        >
          <span className={`transition-colors ${isLibrary ? "text-gray-300" : "text-gray-500 group-hover:text-gray-300"}`}>
            <IconLibrary />
          </span>
          Library
        </Link>
      </div>

      {/* Recents label */}
      {sessions.length > 0 && (
        <p className="px-5 pb-1 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
          Recents
        </p>
      )}

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto px-1.5 pb-2 [scrollbar-width:thin] [scrollbar-color:#333_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-white/30">
        <SessionList sessions={sessions} activeSessionId={activeSessionId} />
      </div>

      {/* Footer */}
      <div className="px-2 py-2 border-t border-white/6 relative" ref={menuRef}>
        {menuOpen && (
          <div className="absolute bottom-full left-2 right-2 mb-2">
            <UserMenuPopup
              initials={initials}
              name={name}
              email={email}
              onClose={() => setMenuOpen(false)}
            />
          </div>
        )}
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/8 transition-colors group"
        >
          <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {initials}
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-sm text-white truncate leading-tight">{name}</p>
          </div>
          <svg className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors shrink-0" fill="currentColor" viewBox="0 0 16 16">
            <circle cx="8" cy="3" r="1.2" />
            <circle cx="8" cy="8" r="1.2" />
            <circle cx="8" cy="13" r="1.2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
