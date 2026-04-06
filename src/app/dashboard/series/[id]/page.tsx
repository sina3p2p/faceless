"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

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

  const loadSeries = useCallback(() => {
    fetch(`/api/series/${id}`)
      .then((r) => r.json())
      .then(setSeries);
  }, [id]);

  useEffect(() => {
    loadSeries();
  }, [loadSeries]);

  useEffect(() => {
    if (!series) return;
    const hasActive = series.videoProjects.some(
      (v) => !["COMPLETED", "FAILED", "REVIEW", "CANCELLED"].includes(v.status)
    );
    if (!hasActive) return;
    const interval = setInterval(loadSeries, 3000);
    return () => clearInterval(interval);
  }, [series, loadSeries]);

  async function handleGenerate() {
    setGenerating(true);
    const res = await fetch("/api/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesId: id }),
    });

    if (res.ok) {
      loadSeries();
    }
    setGenerating(false);
  }

  async function handleRetry(videoId: string) {
    setRetryingId(videoId);
    const res = await fetch(`/api/videos/${videoId}/retry`, { method: "POST" });
    if (res.ok) {
      loadSeries();
    }
    setRetryingId(null);
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
      case "FAILED": return "danger" as const;
      case "CANCELLED": return "danger" as const;
      case "REVIEW": return "default" as const;
      case "RENDERING":
      case "GENERATING_SCRIPT":
      case "GENERATING_ASSETS": return "warning" as const;
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
          <Button loading={generating} onClick={handleGenerate}>
            Generate Video
          </Button>
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
                    {video.status === "REVIEW" && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={(e) => {
                          e.preventDefault();
                          router.push(`/dashboard/videos/${video.id}/review`);
                        }}
                      >
                        Review Script
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
