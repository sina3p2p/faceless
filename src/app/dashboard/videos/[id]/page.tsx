"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface Scene {
  id: string;
  sceneOrder: number;
  text: string;
  duration: number | null;
  assetType: string | null;
}

interface VideoDetail {
  id: string;
  title: string | null;
  status: string;
  script: string | null;
  duration: number | null;
  outputUrl: string | null;
  createdAt: string;
  scenes: Scene[];
  renderJobs: Array<{
    step: string;
    status: string;
    progress: number;
    error: string | null;
    attempts: number;
  }>;
  series: { name: string; niche: string };
}

export default function VideoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const loadVideo = useCallback(() => {
    fetch(`/api/videos/${id}`)
      .then((r) => r.json())
      .then(setVideo);
  }, [id]);

  useEffect(() => {
    loadVideo();
  }, [loadVideo]);

  useEffect(() => {
    if (!video) return;
    if (["COMPLETED", "FAILED"].includes(video.status)) return;
    const interval = setInterval(loadVideo, 3000);
    return () => clearInterval(interval);
  }, [video, loadVideo]);

  async function handleDownload() {
    setDownloading(true);
    const res = await fetch(`/api/videos/${id}/download`);
    const data = await res.json();
    if (data.url) {
      setDownloadUrl(data.url);
      window.open(data.url, "_blank");
    }
    setDownloading(false);
  }

  const statusVariant = (status: string) => {
    switch (status) {
      case "COMPLETED": return "success" as const;
      case "FAILED": return "danger" as const;
      case "RENDERING":
      case "GENERATING_SCRIPT":
      case "GENERATING_ASSETS": return "warning" as const;
      default: return "default" as const;
    }
  };

  if (!video) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const job = video.renderJobs[0];

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-sm text-gray-500 mb-1">
            {video.series.name} &middot; {video.series.niche}
          </p>
          <h1 className="text-2xl font-bold">
            {video.title ?? "Video Generation In Progress"}
          </h1>
        </div>
        <Badge variant={statusVariant(video.status)} className="text-sm px-3 py-1">
          {video.status.replace(/_/g, " ")}
        </Badge>
      </div>

      {/* Progress */}
      {job && !["COMPLETED", "FAILED"].includes(video.status) && (
        <Card className="mb-8">
          <CardContent className="py-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-400">
                Step: {job.step.replace(/_/g, " ")}
              </span>
              <span className="text-sm text-gray-400">
                Attempt {job.attempts}/3
              </span>
            </div>
            <Progress value={job.progress} label="Generation Progress" />
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {job?.error && (
        <Card className="mb-8 border-red-500/30">
          <CardContent className="py-4">
            <p className="text-sm text-red-400">{job.error}</p>
          </CardContent>
        </Card>
      )}

      {/* Video Player & Download */}
      {video.status === "COMPLETED" && (
        <Card className="mb-8">
          <CardHeader>
            <h2 className="font-semibold">Your Video</h2>
          </CardHeader>
          <CardContent>
            {downloadUrl ? (
              <div className="aspect-[9/16] max-w-sm mx-auto rounded-xl overflow-hidden bg-black mb-4">
                <video
                  src={downloadUrl}
                  controls
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="aspect-[9/16] max-w-sm mx-auto rounded-xl bg-white/5 flex items-center justify-center mb-4">
                <p className="text-gray-500">Click download to preview</p>
              </div>
            )}
            <div className="flex justify-center">
              <Button loading={downloading} onClick={handleDownload}>
                Download MP4
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Script & Scenes */}
      {video.scenes.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold">
              Scenes ({video.scenes.length})
            </h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {video.scenes.map((scene) => (
                <div
                  key={scene.id}
                  className="flex gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5"
                >
                  <div className="w-8 h-8 rounded-full bg-violet-600/20 flex items-center justify-center text-sm font-medium text-violet-400 shrink-0">
                    {scene.sceneOrder + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-gray-300 text-sm">{scene.text}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      {scene.duration && <span>{scene.duration}s</span>}
                      {scene.assetType && (
                        <Badge variant="default">{scene.assetType}</Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metadata */}
      <div className="mt-8 text-sm text-gray-500 space-y-1">
        <p>Created: {new Date(video.createdAt).toLocaleString()}</p>
        {video.duration && <p>Duration: {video.duration} seconds</p>}
        <p>Video ID: {video.id}</p>
      </div>
    </div>
  );
}
