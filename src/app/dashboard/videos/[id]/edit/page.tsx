"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Player, type PlayerRef } from "@remotion/player";
import { Button } from "@/components/ui/button";
import {
  VideoComposition,
  type EditorScene,
} from "@/components/editor/VideoComposition";
import { Timeline } from "@/components/editor/Timeline";
import { ScenePanel } from "@/components/editor/ScenePanel";

const FPS = 30;
const WIDTH = 1080;
const HEIGHT = 1920;

export default function VideoEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const playerRef = useRef<PlayerRef>(null);
  const [scenes, setScenes] = useState<EditorScene[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rerendering, setRerendering] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [videoTitle, setVideoTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadScenes = useCallback(async () => {
    try {
      const [scenesRes, videoRes] = await Promise.all([
        fetch(`/api/videos/${id}/scenes`),
        fetch(`/api/videos/${id}`),
      ]);

      if (!scenesRes.ok || !videoRes.ok) {
        setError("Failed to load video data");
        return;
      }

      const scenesData = await scenesRes.json();
      const videoData = await videoRes.json();

      setScenes(
        scenesData.scenes.map((s: EditorScene) => ({
          ...s,
          duration: s.duration ?? 5,
          wordTimestamps: s.wordTimestamps ?? [],
        }))
      );
      setVideoTitle(videoData.title ?? "Untitled Video");
      setLoading(false);
    } catch {
      setError("Failed to load video data");
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadScenes();
  }, [loadScenes]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const handler = () => {
      setCurrentFrame(player.getCurrentFrame());
    };
    player.addEventListener("frameupdate", handler);
    return () => player.removeEventListener("frameupdate", handler);
  }, [scenes]);

  const totalDurationInFrames = Math.max(
    1,
    scenes.reduce((sum, s) => sum + Math.round(s.duration * FPS), 0)
  );

  const handleReorder = useCallback(
    async (reorderedScenes: EditorScene[]) => {
      setScenes(reorderedScenes);
      const sceneIds = reorderedScenes.map((s) => s.id);
      await fetch(`/api/videos/${id}/scenes/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneIds }),
      });
    },
    [id]
  );

  const handleUpdateScene = useCallback(
    async (sceneId: string, updates: { text?: string; duration?: number }) => {
      setScenes((prev) =>
        prev.map((s) => (s.id === sceneId ? { ...s, ...updates } : s))
      );
      await fetch(`/api/videos/${id}/scenes/${sceneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    },
    [id]
  );

  const handleDeleteScene = useCallback(
    async (sceneId: string) => {
      setScenes((prev) => prev.filter((s) => s.id !== sceneId));
      if (selectedSceneId === sceneId) setSelectedSceneId(null);
      await fetch(`/api/videos/${id}/scenes/${sceneId}`, {
        method: "DELETE",
      });
    },
    [id, selectedSceneId]
  );

  const handleRerender = useCallback(async () => {
    setRerendering(true);
    try {
      const res = await fetch(`/api/videos/${id}/rerender`, {
        method: "POST",
      });
      if (res.ok) {
        router.push(`/dashboard/videos/${id}`);
      } else {
        setError("Failed to start re-render");
      }
    } catch {
      setError("Failed to start re-render");
    }
    setRerendering(false);
  }, [id, router]);

  const selectedScene = scenes.find((s) => s.id === selectedSceneId) ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] gap-4">
        <p className="text-red-400">{error}</p>
        <Button onClick={() => router.push(`/dashboard/videos/${id}`)}>
          Back to Video
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -mx-6 -mt-6 overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-black/20">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/dashboard/videos/${id}`)}
          >
            &larr; Back
          </Button>
          <h1 className="text-sm font-medium text-gray-200 truncate max-w-sm">
            {videoTitle}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            loading={rerendering}
            onClick={handleRerender}
          >
            Re-render Video
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Center: Player */}
        <div className="flex-1 flex items-center justify-center bg-black/40 p-4">
          {scenes.length > 0 ? (
            <div className="rounded-xl overflow-hidden shadow-2xl" style={{ maxHeight: "100%" }}>
              <Player
                ref={playerRef}
                component={VideoComposition}
                inputProps={{ scenes, fps: FPS }}
                durationInFrames={totalDurationInFrames}
                fps={FPS}
                compositionWidth={WIDTH}
                compositionHeight={HEIGHT}
                style={{
                  width: "auto",
                  height: "min(100%, 70vh)",
                  aspectRatio: "9/16",
                }}
                controls
                autoPlay={false}
              />
            </div>
          ) : (
            <p className="text-gray-500">No scenes available</p>
          )}
        </div>

        {/* Right: Scene panel */}
        <ScenePanel scene={selectedScene} onUpdate={handleUpdateScene} />
      </div>

      {/* Bottom: Timeline */}
      <Timeline
        scenes={scenes}
        selectedSceneId={selectedSceneId}
        currentFrame={currentFrame}
        fps={FPS}
        onSelectScene={setSelectedSceneId}
        onReorder={handleReorder}
        onDeleteScene={handleDeleteScene}
      />
    </div>
  );
}
