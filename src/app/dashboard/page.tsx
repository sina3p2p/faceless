"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

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
  renderJobs: Array<{ progress: number; step: string }>;
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

  const statusVariant = (status: string) => {
    switch (status) {
      case "COMPLETED": return "success";
      case "FAILED": return "danger";
      case "RENDERING":
      case "GENERATING_SCRIPT":
      case "GENERATING_ASSETS": return "warning";
      default: return "default";
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">
            Welcome back, {session?.user?.name ?? "Creator"}
          </h1>
          <p className="text-gray-400 mt-1">
            Here&apos;s an overview of your content factory.
          </p>
        </div>
        <Link href="/dashboard/series/new">
          <Button>Create New Series</Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-gray-400 mb-1">Videos This Month</p>
            <p className="text-3xl font-bold">
              {usage?.used ?? 0}
              <span className="text-lg text-gray-500 font-normal">
                /{usage?.limit ?? 0}
              </span>
            </p>
            {usage && (
              <Progress
                value={usage.used}
                max={usage.limit}
                className="mt-3"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-gray-400 mb-1">Active Series</p>
            <p className="text-3xl font-bold">{series.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-gray-400 mb-1">Videos Remaining</p>
            <p className="text-3xl font-bold text-violet-400">
              {usage?.remaining ?? 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Videos */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Recent Videos</h2>
        {videos.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-400 mb-4">
                No videos yet. Create a series and generate your first video!
              </p>
              <Link href="/dashboard/series/new">
                <Button>Create Series</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {videos.slice(0, 5).map((video) => (
              <Link key={video.id} href={`/dashboard/videos/${video.id}`}>
                <Card className="hover:bg-white/[0.04] transition-colors cursor-pointer">
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-medium">
                        {video.title ?? "Generating..."}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(video.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {video.renderJobs[0] &&
                        video.status !== "COMPLETED" &&
                        video.status !== "FAILED" && (
                          <Progress
                            value={video.renderJobs[0].progress}
                            className="w-32"
                          />
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

      {/* Series */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">My Series</h2>
          <Link href="/dashboard/series">
            <Button variant="ghost" size="sm">
              View All
            </Button>
          </Link>
        </div>
        {series.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-400">No series created yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {series.slice(0, 6).map((s) => (
              <Link key={s.id} href={`/dashboard/series/${s.id}`}>
                <Card className="hover:bg-white/[0.04] transition-colors cursor-pointer h-full">
                  <CardContent className="py-5">
                    <h3 className="font-medium mb-1">{s.name}</h3>
                    <p className="text-sm text-gray-500 mb-3">{s.niche}</p>
                    <p className="text-xs text-gray-500">
                      {s._count.videoProjects} video
                      {s._count.videoProjects !== 1 ? "s" : ""}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
