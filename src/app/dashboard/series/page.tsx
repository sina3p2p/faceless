"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface SeriesData {
  id: string;
  name: string;
  niche: string;
  style: string;
  captionStyle: string;
  createdAt: string;
  _count: { videoProjects: number };
}

export default function SeriesListPage() {
  const [series, setSeries] = useState<SeriesData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/series")
      .then((r) => r.json())
      .then((data) => {
        setSeries(data);
        setLoading(false);
      });
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">My Series</h1>
          <p className="text-gray-400 mt-1">
            Manage your content series and generate new videos.
          </p>
        </div>
        <Link href="/dashboard/series/new">
          <Button>Create New Series</Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full" />
        </div>
      ) : series.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <h3 className="text-lg font-medium mb-2">No series yet</h3>
            <p className="text-gray-400 mb-6">
              Create your first series to start generating faceless videos.
            </p>
            <Link href="/dashboard/series/new">
              <Button>Create Your First Series</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {series.map((s) => (
            <Link key={s.id} href={`/dashboard/series/${s.id}`}>
              <Card className="hover:bg-white/[0.04] transition-colors cursor-pointer h-full">
                <CardContent className="py-6">
                  <h3 className="text-lg font-medium mb-2">{s.name}</h3>
                  <div className="space-y-1 text-sm text-gray-400">
                    <p>Niche: {s.niche}</p>
                    <p>Style: {s.style}</p>
                    <p>Captions: {s.captionStyle}</p>
                  </div>
                  <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                    <span className="text-sm text-gray-500">
                      {s._count.videoProjects} video
                      {s._count.videoProjects !== 1 ? "s" : ""}
                    </span>
                    <span className="text-xs text-gray-600">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </span>
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
