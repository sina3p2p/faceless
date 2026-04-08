"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const DURATION_PRESETS = [
  { label: "15s", value: 15, hint: "Quick test" },
  { label: "30s", value: 30, hint: "Short" },
  { label: "45s", value: 45, hint: "Standard" },
  { label: "60s", value: 60, hint: "Standard+" },
  { label: "90s", value: 90, hint: "Long" },
  { label: "120s", value: 120, hint: "Extra long" },
];

interface Video {
  id: string;
  title: string | null;
  status: string;
  duration: number | null;
  createdAt: string;
  renderJobs: Array<{ progress: number; step: string; status: string }>;
}

interface SeriesDetail {
  id: string;
  name: string;
  niche: string;
  style: string;
  captionStyle: string;
  videoType: string;
  defaultVoiceId: string | null;
  topicIdeas: string[];
  videoProjects: Video[];
}

export default function SeriesDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [series, setSeries] = useState<SeriesDetail | null>(null);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [targetDuration, setTargetDuration] = useState(45);
  const pickerRef = useRef<HTMLDivElement>(null);

  const loadSeries = useCallback(() => {
    fetch(`/api/series/${id}`)
      .then((r) => r.json())
      .then(setSeries);
  }, [id]);

  useEffect(() => {
    loadSeries();
  }, [loadSeries]);

  useEffect(() => {
    if (series?.videoType === "music_video") setTargetDuration(60);
  }, [series?.videoType]);

  useEffect(() => {
    if (!series) return;
    const hasActive = series.videoProjects.some(
      (v) => !["COMPLETED", "FAILED", "REVIEW_SCRIPT", "IMAGE_REVIEW", "CANCELLED"].includes(v.status)
    );
    if (!hasActive) return;
    const interval = setInterval(loadSeries, 3000);
    return () => clearInterval(interval);
  }, [series, loadSeries]);

  useEffect(() => {
    if (!showDurationPicker) return;
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowDurationPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDurationPicker]);

  async function handleGenerate() {
    setGenerating(true);
    setShowDurationPicker(false);
    const res = await fetch("/api/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesId: id, targetDuration }),
    });

    if (res.ok) {
      const video = await res.json();
      router.push(`/dashboard/videos/${video.id}`);
    } else {
      setGenerating(false);
    }
  }

  async function handleRetry(videoId: string) {
    setRetryingId(videoId);
    const res = await fetch(`/api/videos/${videoId}/retry`, { method: "POST" });
    if (res.ok) {
      router.push(`/dashboard/videos/${videoId}`);
    } else {
      setRetryingId(null);
    }
  }

  async function handleCancel(videoId: string) {
    if (!confirm("Cancel this video generation? This cannot be undone.")) return;
    setCancellingId(videoId);
    const res = await fetch(`/api/videos/${videoId}/cancel`, { method: "POST" });
    if (res.ok) {
      loadSeries();
    }
    setCancellingId(null);
  }

  async function handleDelete() {
    if (!confirm("Delete this series and all its videos?")) return;
    setDeleting(true);
    await fetch(`/api/series/${id}`, { method: "DELETE" });
    router.push("/dashboard/series");
  }

  const statusVariant = (status: string) => {
    switch (status) {
      case "COMPLETED": return "success" as const;
      case "FAILED":
      case "CANCELLED": return "danger" as const;
      case "REVIEW_SCRIPT":
      case "IMAGE_REVIEW": return "default" as const;
      case "SCRIPT":
      case "IMAGE_GENERATION":
      case "VIDEO_GENERATION":
      case "RENDERING": return "warning" as const;
      default: return "default" as const;
    }
  };

  if (!series) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">{series.name}</h1>
          <p className="text-gray-400 mt-1">
            {series.niche} &middot; {series.style} &middot;{" "}
            {series.captionStyle} captions &middot;{" "}
            {series.videoType === "ai_video" ? "AI Video" : "Faceless"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="danger" size="sm" loading={deleting} onClick={handleDelete}>
            Delete
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/dashboard/series/${id}/edit`)}
          >
            Edit Series
          </Button>
          <div className="relative" ref={pickerRef}>
            <Button
              loading={generating}
              onClick={() => setShowDurationPicker(!showDurationPicker)}
            >
              Generate Video
            </Button>
            {showDurationPicker && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-gray-900 border border-white/10 rounded-xl shadow-2xl p-4 z-50">
                <p className="text-sm font-medium text-gray-300 mb-3">Video Duration</p>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {DURATION_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setTargetDuration(p.value)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        targetDuration === p.value
                          ? "bg-violet-600 text-white"
                          : "bg-white/5 text-gray-400 hover:bg-white/10"
                      }`}
                    >
                      <span className="block">{p.label}</span>
                      <span className="block text-[10px] opacity-60">{p.hint}</span>
                    </button>
                  ))}
                </div>
                <Button
                  className="w-full"
                  loading={generating}
                  onClick={handleGenerate}
                >
                  Generate {targetDuration}s Video
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {series.topicIdeas.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <h2 className="text-sm font-medium text-gray-400">Topic Ideas</h2>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {series.topicIdeas.map((topic, i) => (
                <span
                  key={i}
                  className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-sm text-gray-300"
                >
                  {topic}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <h2 className="text-lg font-semibold mb-4">
        Videos ({series.videoProjects.length})
      </h2>

      {series.videoProjects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-400 mb-4">
              No videos in this series yet. Click &quot;Generate Video&quot; to create
              one.
            </p>
            <Button onClick={handleGenerate} loading={generating}>
              Generate First Video
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {series.videoProjects.map((video) => (
            <Link key={video.id} href={`/dashboard/videos/${video.id}`}>
              <Card className="hover:bg-white/[0.04] transition-colors cursor-pointer">
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium">
                      {video.title ?? "Generating..."}
                    </p>
                    <p className="text-sm text-gray-500">
                      {video.duration
                        ? `${video.duration}s`
                        : "Duration pending"}{" "}
                      &middot;{" "}
                      {new Date(video.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {video.renderJobs[0] &&
                      !["COMPLETED", "FAILED", "CANCELLED"].includes(video.status) && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">
                            {video.renderJobs[0].step}
                          </span>
                          <Progress
                            value={video.renderJobs[0].progress}
                            className="w-24"
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={cancellingId === video.id}
                            onClick={(e) => {
                              e.preventDefault();
                              handleCancel(video.id);
                            }}
                            className="text-gray-400 hover:text-red-400"
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                    {(video.status === "REVIEW_SCRIPT" || video.status === "IMAGE_REVIEW" || video.status === "IMAGE_GENERATION") && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={(e) => {
                          e.preventDefault();
                          router.push(`/dashboard/videos/${video.id}/review`);
                        }}
                      >
                        {video.status === "REVIEW_SCRIPT" ? "Review Script" : video.status === "IMAGE_GENERATION" ? "View Progress" : "Review Images"}
                      </Button>
                    )}
                    {(video.status === "FAILED" || video.status === "CANCELLED") && (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={retryingId === video.id}
                        onClick={(e) => {
                          e.preventDefault();
                          handleRetry(video.id);
                        }}
                      >
                        Retry
                      </Button>
                    )}
                    <Badge variant={statusVariant(video.status)}>
                      {video.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
