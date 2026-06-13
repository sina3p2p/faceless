"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { canRetryOrResumeFromFailure, isVideoListNonActive } from "@/lib/pipeline-resume";

interface UsageData {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
}

interface SeriesData {
  id: string;
  name: string;
  niche: string;
  _count: { videoProjects: number };
}

interface VideoData {
  id: string;
  title: string | null;
  status: string;
  createdAt: string;
  renderJobs: Array<{ progress: number; step: string; status?: string; error?: string | null }>;
}

const statusVariant = (video: VideoData): "danger" | "success" | "warning" | "default" => {
  if (canRetryOrResumeFromFailure(video)) return "danger";
  switch (video.status) {
    case "COMPLETED": return "success";
    case "SCRIPT":
    case "MUSIC_SCRIPT":
    case "MUSIC_GENERATION":
    case "VIDEO_SCRIPT":
    case "IMAGE_GENERATION":
    case "VIDEO_GENERATION":
    case "RENDERING": return "warning";
    default: return "default";
  }
};

function StatCard({
  label,
  value,
  sub,
  icon,
  accent,
  progress,
  progressMax,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accent?: string;
  progress?: number;
  progressMax?: number;
}) {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[0.8125rem] font-medium" style={{ color: "var(--secondary-foreground)" }}>{label}</p>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: accent ? `${accent}18` : "rgba(99,102,241,0.1)", border: `1px solid ${accent ? `${accent}28` : "rgba(99,102,241,0.15)"}` }}
        >
          <span style={{ color: accent ?? "#818cf8" }}>{icon}</span>
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold tracking-tight text-white"
          style={accent ? { color: accent } : {}}>
          {value}
          {sub && <span className="text-base font-normal ml-1" style={{ color: "var(--muted-foreground)" }}>{sub}</span>}
        </p>
      </div>
      {progress !== undefined && progressMax !== undefined && (
        <Progress value={progress} max={progressMax} className="mt-1" />
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [series, setSeries] = useState<SeriesData[]>([]);
  const [videos, setVideos] = useState<VideoData[]>([]);

  useEffect(() => {
    fetch("/api/usage").then((r) => r.json()).then(setUsage);
    fetch("/api/series").then((r) => r.json()).then(setSeries);
    fetch("/api/videos").then((r) => r.json()).then(setVideos);
  }, []);

  const firstName = session?.user?.name?.split(" ")[0] ?? "Creator";

  return (
    <div className="min-h-screen p-8" style={{ background: "var(--background)" }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white mb-1">
            Good to see you, {firstName}
          </h1>
          <p className="text-sm" style={{ color: "var(--secondary-foreground)" }}>
            Here&apos;s what&apos;s happening with your content.
          </p>
        </div>
        <Link href="/dashboard/series/new">
          <Button size="sm">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Series
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Videos This Month"
          value={usage?.used ?? 0}
          sub={`/ ${usage?.limit ?? 0}`}
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          }
          progress={usage?.used}
          progressMax={usage?.limit}
        />
        <StatCard
          label="Active Series"
          value={series.length}
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
            </svg>
          }
          accent="#10b981"
        />
        <StatCard
          label="Videos Remaining"
          value={usage?.remaining ?? 0}
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          }
          accent="#6366f1"
        />
      </div>

      {/* Recent Videos */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[0.9375rem] font-semibold text-white">Recent Videos</h2>
          <Link href="/videos">
            <Button variant="ghost" size="sm" className="text-xs">
              View all
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </Button>
          </Link>
        </div>

        {videos.length === 0 ? (
          <div
            className="rounded-2xl p-12 text-center"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}>
              <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            </div>
            <p className="text-[0.9375rem] font-medium text-white mb-1">No videos yet</p>
            <p className="text-sm mb-6" style={{ color: "var(--secondary-foreground)" }}>
              Create a series and generate your first video.
            </p>
            <Link href="/dashboard/series/new">
              <Button size="sm">Create a Series</Button>
            </Link>
          </div>
        ) : (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ border: "1px solid var(--border)" }}
          >
            {videos.slice(0, 6).map((video, idx) => (
              <Link key={video.id} href={`/videos/${video.id}`}>
                <div
                  className="flex items-center justify-between px-5 py-4 transition-colors duration-150 cursor-pointer"
                  style={{
                    borderTop: idx > 0 ? "1px solid var(--border)" : undefined,
                    background: "transparent",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--surface)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)" }}
                    >
                      <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {video.title ?? "Generating title…"}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                        {new Date(video.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {video.renderJobs[0] && video.status !== "COMPLETED" && !isVideoListNonActive(video) && (
                      <Progress value={video.renderJobs[0].progress} className="w-24" />
                    )}
                    <Badge variant={statusVariant(video)}>
                      {video.status.replace(/_/g, " ")}
                    </Badge>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}
                      style={{ color: "var(--muted-foreground)" }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* My Series */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[0.9375rem] font-semibold text-white">My Series</h2>
          <Link href="/dashboard/series">
            <Button variant="ghost" size="sm" className="text-xs">
              View all
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </Button>
          </Link>
        </div>

        {series.length === 0 ? (
          <div
            className="rounded-2xl p-12 text-center"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <p className="text-sm" style={{ color: "var(--secondary-foreground)" }}>No series yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {series.slice(0, 6).map((s) => (
              <Link key={s.id} href={`/dashboard/series/${s.id}`}>
                <div
                  className="rounded-2xl p-5 h-full transition-all duration-150 cursor-pointer hover:scale-[1.01]"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = "rgba(99,102,241,0.3)";
                    (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                    (e.currentTarget as HTMLElement).style.background = "var(--surface)";
                  }}
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                    style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}>
                    <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-1 truncate">{s.name}</h3>
                  <p className="text-xs mb-3 truncate" style={{ color: "var(--secondary-foreground)" }}>{s.niche}</p>
                  <p className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
                    {s._count.videoProjects} video{s._count.videoProjects !== 1 ? "s" : ""}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
