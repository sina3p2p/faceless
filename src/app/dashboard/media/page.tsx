"use client";

import { useEffect, useState, useCallback } from "react";

interface MediaItem {
  id: string;
  type: "video" | "image" | "audio";
  url: string;
  videoTitle: string | null;
  seriesName: string;
  sceneIndex: number;
  prompt: string | null;
  model: string | null;
  createdAt: string;
}

type Tab = "videos" | "images" | "audio";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: "videos",
    label: "Videos",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
      </svg>
    ),
  },
  {
    id: "images",
    label: "Images",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a2.25 2.25 0 002.25-2.25V5.25a2.25 2.25 0 00-2.25-2.25H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
      </svg>
    ),
  },
  {
    id: "audio",
    label: "Audio",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
      </svg>
    ),
  },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MediaGrid({ items, type }: { items: MediaItem[]; type: Tab }) {
  const [lightbox, setLightbox] = useState<MediaItem | null>(null);

  if (items.length === 0) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p className="text-lg mb-1">No {type} yet</p>
        <p className="text-sm">Generated {type} from your videos will appear here.</p>
      </div>
    );
  }

  return (
    <>
      <div className={type === "audio"
        ? "flex flex-col gap-3"
        : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
      }>
        {items.map((item) => (
          <MediaCard key={item.id} item={item} type={type} onClick={() => setLightbox(item)} />
        ))}
      </div>

      {lightbox && (
        <Lightbox item={lightbox} onClose={() => setLightbox(null)} />
      )}
    </>
  );
}

function MediaCard({
  item,
  type,
  onClick,
}: {
  item: MediaItem;
  type: Tab;
  onClick: () => void;
}) {
  const label = item.sceneIndex >= 0
    ? `Scene ${item.sceneIndex + 1}`
    : "Final Video";

  if (type === "audio") {
    return (
      <div className="flex items-center gap-4 rounded-xl border border-white/5 bg-white/2 p-4 hover:border-white/10 transition-colors">
        <div className="w-10 h-10 rounded-lg bg-violet-600/20 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white font-medium truncate">
            {item.videoTitle || "Untitled"} — {label}
          </p>
          <p className="text-xs text-gray-500 truncate">{item.seriesName} · {formatDate(item.createdAt)}</p>
        </div>
        <audio controls preload="none" className="h-8 max-w-[200px]">
          <source src={item.url} />
        </audio>
        <a
          href={item.url}
          download
          className="p-2 rounded-lg text-gray-500 hover:text-violet-400 hover:bg-white/5 transition-colors shrink-0"
          title="Download"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </a>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className="group relative rounded-xl border border-white/5 bg-white/2 overflow-hidden cursor-pointer hover:border-white/15 transition-all"
    >
      <div className="aspect-4/3 relative bg-black/30">
        {type === "videos" ? (
          <video
            src={item.url}
            className="w-full h-full object-cover"
            muted
            preload="metadata"
            onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
            onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.url}
            alt={item.prompt || `Scene ${item.sceneIndex + 1}`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        )}

        <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        <div className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <p className="text-xs text-white font-medium truncate">{item.videoTitle || "Untitled"}</p>
          <p className="text-[10px] text-gray-300 truncate">{label} · {item.seriesName}</p>
        </div>

        {type === "videos" && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur flex items-center justify-center">
              <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}
      </div>

      <div className="p-2.5">
        <p className="text-xs text-gray-400 truncate">{formatDate(item.createdAt)}</p>
        {item.model && <p className="text-[10px] text-gray-600 truncate mt-0.5">{item.model}</p>}
      </div>
    </div>
  );
}

function Lightbox({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl w-full max-h-[90vh] rounded-2xl bg-gray-900 border border-white/10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-center justify-center bg-black min-h-[300px]">
          {item.type === "video" ? (
            <video src={item.url} controls autoPlay className="max-w-full max-h-[70vh]" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.url} alt="" className="max-w-full max-h-[70vh] object-contain" />
          )}
        </div>

        <div className="p-4 border-t border-white/5">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white font-medium">
                {item.videoTitle || "Untitled"} — {item.sceneIndex >= 0 ? `Scene ${item.sceneIndex + 1}` : "Final Video"}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{item.seriesName} · {formatDate(item.createdAt)}{item.model ? ` · ${item.model}` : ""}</p>
              {item.prompt && (
                <p className="text-xs text-gray-400 mt-2 line-clamp-2">{item.prompt}</p>
              )}
            </div>
            <a
              href={item.url}
              download
              className="ml-4 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors shrink-0"
            >
              Download
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MediaPage() {
  const [tab, setTab] = useState<Tab>("videos");
  const [data, setData] = useState<{ videos: MediaItem[]; images: MediaItem[]; audio: MediaItem[] }>({
    videos: [],
    images: [],
    audio: [],
  });
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/media");
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const counts = {
    videos: data.videos.length,
    images: data.images.length,
    audio: data.audio.length,
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Media Library</h1>
        <p className="text-sm text-gray-500 mt-1">
          All images, video clips, and audio files generated across your projects.
        </p>
      </div>

      <div className="flex gap-1 p-1 bg-white/5 rounded-xl mb-6 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-violet-600 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            {t.icon}
            {t.label}
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              tab === t.id ? "bg-white/20 text-white" : "bg-white/5 text-gray-500"
            }`}>
              {counts[t.id]}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full" />
        </div>
      ) : (
        <MediaGrid items={data[tab]} type={tab} />
      )}
    </div>
  );
}
