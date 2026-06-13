"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
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

export function StorySidebar() {
  const params = useParams();
  const activeSessionId = params?.sessionId as string | undefined;
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  // close menu on outside click
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

  return (
    <div className="w-64 shrink-0 flex flex-col h-full bg-[#0f0f0f] border-r border-white/[0.06]">
      {/* Header */}
      <div className="px-3 pt-4 pb-2 flex items-center justify-between">
        <span className="px-2 text-sm font-semibold text-white">Story Room</span>
        <Link
          href="/v2/story"
          className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
          title="New story"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </Link>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {sessions.length === 0 && (
          <p className="text-xs text-gray-600 px-3 py-3">No stories yet</p>
        )}

        {sessions.length > 0 && (
          <>
            <p className="px-3 py-1.5 text-[11px] font-medium text-gray-600 uppercase tracking-wider">
              Recents
            </p>
            {sessions.map((s) => {
              const isActive = s.id === activeSessionId;
              const label = s.title ?? s.seed ?? "Untitled story";
              return (
                <Link
                  key={s.id}
                  href={`/v2/story/${s.id}`}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${isActive
                    ? "bg-white/10 text-white"
                    : "text-gray-400 hover:bg-white/5 hover:text-white"
                    }`}
                >
                  <svg className="w-3.5 h-3.5 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                  </svg>
                  <span className="truncate leading-tight">{label}</span>
                </Link>
              );
            })}
          </>
        )}
      </div>

      {/* Footer — user profile */}
      <div className="px-2 py-3 border-t border-white/[0.06] relative" ref={menuRef}>

        {/* Popup menu */}
        {menuOpen && (
          <div className="absolute bottom-full left-0 right-0 mb-2 mx-2 bg-[#1c1c1c] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            {/* User header row */}
            <div className="px-4 py-3 flex items-center justify-between border-b border-white/[0.06]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{name}</p>
                  <p className="text-xs text-gray-500 truncate">{email}</p>
                </div>
              </div>
            </div>

            {/* Menu items */}
            <div className="py-1">
              <Link
                href="/dashboard"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 transition-colors"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                Dashboard
              </Link>
            </div>

            <div className="border-t border-white/[0.06]" />

            <div className="py-1">
              <button
                onClick={() => void signOut({ callbackUrl: "/auth/signin" })}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 transition-colors"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Log out
              </button>
            </div>
          </div>
        )}

        {/* Profile button */}
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors group"
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
