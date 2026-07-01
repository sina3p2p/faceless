"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "@/lib/axios";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type MediaType = "image" | "video" | "audio";
type Tab = "all" | MediaType;
type ViewMode = "grid" | "list";

interface MediaItem {
  id: string;
  type: MediaType;
  url: string;
  prompt: string | null;
  model: string | null;
  createdAt: string;
}

interface MediaResponse {
  items: MediaItem[];
  total: number;
  totalPages: number;
  page: number;
  limit: number;
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) {
    const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    return days[date.getDay()];
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function IconSearch() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function IconList() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  );
}

function IconImage() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function IconVideo() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function IconAudio() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
    </svg>
  );
}

function MediaTypeIcon({ type }: { type: MediaType }) {
  const colors: Record<MediaType, string> = {
    image: "text-primary",
    video: "text-blue-400",
    audio: "text-emerald-400",
  };
  return (
    <span className={colors[type]}>
      {type === "image" && <IconImage />}
      {type === "video" && <IconVideo />}
      {type === "audio" && <IconAudio />}
    </span>
  );
}

function ItemThumbnail({ item }: { item: MediaItem }) {
  if (item.type === "image") {
    return (
      <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-white/5 flex items-center justify-center">
        <Image
          src={item.url}
          alt={item.prompt ?? "image"}
          width={40}
          height={40}
          className="w-full h-full object-cover"
          unoptimized
        />
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-lg shrink-0 bg-white/5 flex items-center justify-center">
      <MediaTypeIcon type={item.type} />
    </div>
  );
}

function GridThumbnail({ item }: { item: MediaItem }) {
  if (item.type === "image") {
    return (
      <div className="aspect-square rounded-xl overflow-hidden bg-white/5">
        <Image
          src={item.url}
          alt={item.prompt ?? "image"}
          width={300}
          height={300}
          className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
          unoptimized
        />
      </div>
    );
  }
  return (
    <div className="aspect-square rounded-xl bg-white/5 flex flex-col items-center justify-center gap-2">
      <MediaTypeIcon type={item.type} />
      <span className="text-xs text-muted-foreground/60 capitalize">{item.type}</span>
    </div>
  );
}

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "image", label: "Images" },
  { key: "video", label: "Videos" },
  { key: "audio", label: "Audio" },
];

export default function LibraryPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [view, setView] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");

  const imageQ = useQuery<MediaResponse>({
    queryKey: ["media", "image"],
    queryFn: async () => (await axios.get("/media?tab=image&limit=50")).data,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: tab === "all" || tab === "image",
  });

  const videoQ = useQuery<MediaResponse>({
    queryKey: ["media", "video"],
    queryFn: async () => (await axios.get("/media?tab=video&limit=50")).data,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: tab === "all" || tab === "video",
  });

  const audioQ = useQuery<MediaResponse>({
    queryKey: ["media", "audio"],
    queryFn: async () => (await axios.get("/media?tab=audio&limit=50")).data,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: tab === "all" || tab === "audio",
  });

  const isLoading =
    (tab === "all" && (imageQ.isLoading || videoQ.isLoading || audioQ.isLoading)) ||
    (tab === "image" && imageQ.isLoading) ||
    (tab === "video" && videoQ.isLoading) ||
    (tab === "audio" && audioQ.isLoading);

  const allItems = useMemo(() => {
    const imgs = tab === "all" || tab === "image" ? (imageQ.data?.items ?? []) : [];
    const vids = tab === "all" || tab === "video" ? (videoQ.data?.items ?? []) : [];
    const auds = tab === "all" || tab === "audio" ? (audioQ.data?.items ?? []) : [];
    const combined = [...imgs, ...vids, ...auds];
    combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return combined;
  }, [tab, imageQ.data, videoQ.data, audioQ.data]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allItems;
    const q = search.toLowerCase();
    return allItems.filter(
      (i) => i.prompt?.toLowerCase().includes(q) || i.model?.toLowerCase().includes(q)
    );
  }, [allItems, search]);

  const totalCount =
    (imageQ.data?.total ?? 0) + (videoQ.data?.total ?? 0) + (audioQ.data?.total ?? 0);

  return (
    <div className="flex flex-col h-full text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between px-8 pt-8 pb-4 shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none">
              <IconSearch />
            </span>
            <input
              type="text"
              placeholder="Search library"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-white/6 border border-white/10 rounded-full pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-white/20 w-52 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Tab bar + view toggle */}
      <div className="flex items-center justify-between px-8 pb-4 shrink-0 border-b border-white/6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList variant="chip">
            {TABS.map(({ key, label }) => (
              <TabsTrigger key={key} value={key}>{label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setView("grid")}
            className={cn("w-8 h-8 flex items-center justify-center rounded-lg transition-colors", view === "grid" ? "bg-white/12 text-foreground" : "text-muted-foreground/60 hover:text-foreground hover:bg-white/8")}
            title="Grid view"
          >
            <IconGrid />
          </button>
          <button
            onClick={() => setView("list")}
            className={cn("w-8 h-8 flex items-center justify-center rounded-lg transition-colors", view === "list" ? "bg-white/12 text-foreground" : "text-muted-foreground/60 hover:text-foreground hover:bg-white/8")}
            title="List view"
          >
            <IconList />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4 text-muted-foreground/40">
              <IconImage />
            </div>
            <p className="text-muted-foreground/60 text-sm">
              {search ? "No results found" : "Your library is empty"}
            </p>
            {!search && (
              <p className="text-muted-foreground/30 text-xs mt-1">
                Generated media will appear here
              </p>
            )}
          </div>
        ) : view === "list" ? (
          <div className="w-full">
            {/* List header */}
            <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-3 pb-2 text-xs font-medium text-muted-foreground/40 uppercase tracking-wider border-b border-white/6">
              <span>Name</span>
              <span className="w-32 text-right">Modified</span>
              <span className="w-24 text-right">Type</span>
            </div>
            <div className="divide-y divide-white/4">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[1fr_auto_auto] gap-4 items-center px-3 py-3 hover:bg-white/4 rounded-lg transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ItemThumbnail item={item} />
                    <span className="text-sm text-foreground truncate leading-tight">
                      {item.prompt ?? `${item.type}-${item.id.slice(0, 8)}`}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground/60 w-32 text-right shrink-0">
                    {formatDate(item.createdAt)}
                  </span>
                  <span className="text-xs text-muted-foreground/40 w-24 text-right shrink-0 capitalize">
                    {item.model ?? item.type}
                  </span>
                </div>
              ))}
            </div>
            {totalCount > filtered.length && !search && (
              <p className="text-center text-xs text-muted-foreground/40 py-4">
                Showing {filtered.length} of {totalCount} items
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filtered.map((item) => (
              <div key={item.id} className="group cursor-pointer">
                <GridThumbnail item={item} />
                <p className="mt-1.5 text-xs text-muted-foreground truncate px-0.5 group-hover:text-foreground transition-colors">
                  {item.prompt ?? `${item.type}-${item.id.slice(0, 8)}`}
                </p>
                <p className="text-xs text-muted-foreground/40 px-0.5">{formatDate(item.createdAt)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
