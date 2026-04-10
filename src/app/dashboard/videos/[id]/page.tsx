"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { VideoModelSelector } from "@/components/model-selectors";

interface MediaVersion {
  id: string;
  type: "image" | "video";
  url: string;
  key: string;
  prompt: string | null;
  modelUsed: string | null;
  createdAt: string;
}

interface Scene {
  id: string;
  sceneOrder: number;
  text: string;
  imagePrompt: string | null;
  visualDescription: string | null;
  duration: number | null;
  assetType: string | null;
  assetUrl: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  imageKey: string | null;
  videoKey: string | null;
  audioUrl: string | null;
  media: MediaVersion[];
}

interface VideoDetail {
  id: string;
  title: string | null;
  status: string;
  script: string | null;
  duration: number | null;
  outputUrl: string | null;
  thumbnailUrl: string | null;
  createdAt: string;
  scenes: Scene[];
  renderJobs: Array<{
    step: string;
    status: string;
    progress: number;
    error: string | null;
    attempts: number;
  }>;
  series: {
    name: string;
    niche: string;
    videoModel: string | null;
    videoSize: string | null;
    videoType: string | null;
    sceneContinuity: number | null;
  };
}

const THUMB_MODELS = [
  { id: "dall-e-3", label: "DALL-E 3" },
  { id: "kling-image-v3", label: "Kling Image V3" },
  { id: "nano-banana-2", label: "Nano Banana 2" },
] as const;

function MusicReviewCard({ videoId, onStatusChange }: { videoId: string; onStatusChange: () => void }) {
  const [songUrl, setSongUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/videos/${videoId}`)
      .then((r) => r.json())
      .then((data) => {
        const config = data.config as Record<string, unknown> | null;
        const songKey = config?.songUrl as string | undefined;
        if (songKey) {
          setSongUrl(`/api/media/${songKey}`);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [videoId]);

  async function handleAcceptSong() {
    setActionLoading("accept");
    try {
      const res = await fetch(`/api/videos/${videoId}/generate-visuals`, { method: "POST" });
      if (res.ok) onStatusChange();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRerollSong() {
    setActionLoading("reroll");
    try {
      const res = await fetch(`/api/videos/${videoId}/generate-song`, { method: "POST" });
      if (res.ok) onStatusChange();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleBackToLyrics() {
    setActionLoading("back");
    try {
      const res = await fetch(`/api/videos/${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REVIEW_MUSIC_SCRIPT" }),
      });
      if (res.ok) onStatusChange();
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <Card className="mb-8 border-violet-500/30">
        <CardContent className="py-6 text-center">
          <div className="animate-spin w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full mx-auto" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-8 border-violet-500/30">
      <CardHeader>
        <h3 className="text-lg font-semibold">Listen to Your Song</h3>
      </CardHeader>
      <CardContent className="space-y-4">
        {songUrl ? (
          <audio controls className="w-full" src={songUrl}>
            Your browser does not support audio.
          </audio>
        ) : (
          <p className="text-gray-400 text-sm">Song audio not available.</p>
        )}

        <div className="flex flex-wrap gap-3 justify-center pt-2">
          <Button
            onClick={handleAcceptSong}
            disabled={!!actionLoading}
            className="bg-green-600 hover:bg-green-700"
          >
            {actionLoading === "accept" ? "Processing..." : "Accept & Generate Visuals"}
          </Button>
          <Button
            onClick={handleRerollSong}
            variant="outline"
            disabled={!!actionLoading}
          >
            {actionLoading === "reroll" ? "Re-rolling..." : "Re-roll Song"}
          </Button>
          <Button
            onClick={handleBackToLyrics}
            variant="ghost"
            disabled={!!actionLoading}
          >
            {actionLoading === "back" ? "..." : "Back to Edit Lyrics"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function VideoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [thumbPrompt, setThumbPrompt] = useState("");
  const [thumbModel, setThumbModel] = useState<string>("dall-e-3");
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [generatingThumb, setGeneratingThumb] = useState(false);
  const [showThumbPanel, setShowThumbPanel] = useState(false);
  const [thumbError, setThumbError] = useState<string | null>(null);

  // Derive progress from video status (pipeline jobs don't update renderJobs)
  const statusProgress: Record<string, number> = {
    PENDING: 0,
    STORY: 5,
    REVIEW_STORY: 10,
    SCENE_SPLIT: 15,
    REVIEW_SCENES: 20,
    TTS_GENERATION: 30,
    TTS_REVIEW: 40,
    PROMPT_GENERATION: 45,
    REVIEW_PROMPTS: 50,
    IMAGE_GENERATION: 55,
    IMAGE_REVIEW: 65,
    MOTION_GENERATION: 70,
    REVIEW_MOTION: 75,
    VIDEO_GENERATION: 80,
    RENDERING: 90,
    COMPLETED: 100,
    FAILED: 0,
  };

  // Per-scene video regeneration
  const [regenScene, setRegenScene] = useState<Scene | null>(null);
  const [regenPrompt, setRegenPrompt] = useState("");
  const [regenModel, setRegenModel] = useState("");
  const [regenDuration, setRegenDuration] = useState<number>(5);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  // Version picker
  const [versionScene, setVersionScene] = useState<Scene | null>(null);

  // Rerender
  const [rerendering, setRerendering] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const loadVideo = useCallback(() => {
    fetch(`/api/videos/${id}`)
      .then((r) => r.json())
      .then((data: VideoDetail) => {
        setVideo(data);
        if (data.thumbnailUrl && !thumbUrl) {
          setThumbUrl(`/api/media/${data.thumbnailUrl}`);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadScenes = useCallback(async () => {
    const res = await fetch(`/api/videos/${id}/scenes`);
    if (!res.ok) return;
    const data = await res.json();
    setVideo((prev) => prev ? { ...prev, scenes: data.scenes } : prev);
  }, [id]);

  useEffect(() => {
    loadVideo();
  }, [loadVideo]);

  useEffect(() => {
    if (!video) return;
    if (["COMPLETED", "FAILED", "REVIEW_STORY", "REVIEW_SCENES", "TTS_REVIEW", "REVIEW_PROMPTS", "IMAGE_REVIEW", "REVIEW_MOTION", "REVIEW_SCRIPT", "REVIEW_MUSIC_SCRIPT", "MUSIC_REVIEW", "REVIEW_VISUAL"].includes(video.status)) return;
    const interval = setInterval(loadVideo, 3000);
    return () => clearInterval(interval);
  }, [video, loadVideo]);

  useEffect(() => {
    if (video?.status === "COMPLETED" && video.scenes.length > 0 && !video.scenes[0]?.media) {
      loadScenes();
    }
  }, [video?.status, video?.scenes, loadScenes]);

  useEffect(() => {
    if (video?.status === "COMPLETED" && !downloadUrl) {
      fetch(`/api/videos/${id}/download`)
        .then((r) => r.json())
        .then((data) => {
          if (data.url) setDownloadUrl(data.url);
        });
    }
  }, [video?.status, downloadUrl, id]);

  async function handleRetry() {
    setRetrying(true);
    const res = await fetch(`/api/videos/${id}/retry`, { method: "POST" });
    if (res.ok) {
      loadVideo();
    }
    setRetrying(false);
  }

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

  async function handleRegenClip() {
    if (!regenScene) return;
    setRegenerating(true);
    setRegenError(null);
    try {
      const res = await fetch(`/api/videos/${id}/scenes/${regenScene.id}/generate-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visualDescription: regenPrompt || undefined,
          videoModel: regenModel || undefined,
          duration: regenDuration,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRegenError(data.error || "Video generation failed");
        return;
      }
      setRegenScene(null);
      setHasChanges(true);
      await loadScenes();
    } catch {
      setRegenError("Request failed");
    } finally {
      setRegenerating(false);
    }
  }

  async function handleSelectMedia(sceneId: string, mediaId: string) {
    const res = await fetch(`/api/videos/${id}/scenes/${sceneId}/select-media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaId }),
    });
    if (res.ok) {
      setHasChanges(true);
      setVersionScene(null);
      await loadScenes();
    }
  }

  async function handleRerender() {
    setRerendering(true);
    const res = await fetch(`/api/videos/${id}/rerender`, { method: "POST" });
    if (res.ok) {
      setHasChanges(false);
      setDownloadUrl(null);
      loadVideo();
    }
    setRerendering(false);
  }

  const statusVariant = (status: string) => {
    switch (status) {
      case "COMPLETED": return "success" as const;
      case "FAILED": return "danger" as const;
      case "REVIEW_STORY":
      case "REVIEW_SCENES":
      case "TTS_REVIEW":
      case "REVIEW_PROMPTS":
      case "IMAGE_REVIEW":
      case "REVIEW_MOTION":
      case "REVIEW_SCRIPT":
      case "REVIEW_MUSIC_SCRIPT":
      case "MUSIC_REVIEW":
      case "REVIEW_VISUAL": return "default" as const;
      case "STORY":
      case "SCENE_SPLIT":
      case "TTS_GENERATION":
      case "PROMPT_GENERATION":
      case "IMAGE_GENERATION":
      case "MOTION_GENERATION":
      case "VIDEO_GENERATION":
      case "RENDERING":
      case "SCRIPT":
      case "MUSIC_SCRIPT":
      case "MUSIC_GENERATION":
      case "VIDEO_SCRIPT": return "warning" as const;
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

      {/* ─── Review gates: show "Review" button ─── */}
      {video.status === "REVIEW_STORY" && (
        <Card className="mb-8 border-violet-500/30">
          <CardContent className="py-6">
            <div className="text-center mb-4">
              <p className="text-gray-300 mb-4">
                Your {video.series.videoType === "music_video" ? "lyrics are" : "story is"} ready! Review and edit before proceeding.
              </p>
              <Button onClick={() => router.push(`/dashboard/videos/${id}/review`)}>
                Review &amp; Edit {video.series.videoType === "music_video" ? "Lyrics" : "Story"}
              </Button>
            </div>
            {video.script && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Preview</p>
                <pre className="text-sm text-gray-400 whitespace-pre-wrap max-h-60 overflow-y-auto font-sans leading-relaxed">
                  {video.script.length > 1000 ? video.script.slice(0, 1000) + "..." : video.script}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {video.status === "REVIEW_SCENES" && (
        <Card className="mb-8 border-violet-500/30">
          <CardContent className="py-6 text-center">
            <p className="text-gray-300 mb-4">
              Scenes are ready! Review the breakdown before generating audio.
            </p>
            <Button onClick={() => router.push(`/dashboard/videos/${id}/review`)}>
              Review Scenes
            </Button>
          </CardContent>
        </Card>
      )}

      {video.status === "TTS_REVIEW" && (
        <Card className="mb-8 border-violet-500/30">
          <CardContent className="py-6 text-center">
            <p className="text-gray-300 mb-4">
              {video.series.videoType === "music_video" ? "Song is generated! Listen and approve." : "Audio narration is ready! Listen and approve."}
            </p>
            <Button onClick={() => router.push(`/dashboard/videos/${id}/review`)}>
              Review Audio
            </Button>
          </CardContent>
        </Card>
      )}

      {video.status === "REVIEW_PROMPTS" && (
        <Card className="mb-8 border-violet-500/30">
          <CardContent className="py-6 text-center">
            <p className="text-gray-300 mb-4">
              Visual prompts are ready! Review and edit them before generating images.
            </p>
            <Button onClick={() => router.push(`/dashboard/videos/${id}/review`)}>
              Review Prompts
            </Button>
          </CardContent>
        </Card>
      )}

      {video.status === "IMAGE_REVIEW" && (
        <Card className="mb-8 border-violet-500/30">
          <CardContent className="py-6 text-center">
            <p className="text-gray-300 mb-4">
              Preview images are ready! Review and approve them before generating video.
            </p>
            <Button onClick={() => router.push(`/dashboard/videos/${id}/review`)}>
              Review Images
            </Button>
          </CardContent>
        </Card>
      )}

      {video.status === "REVIEW_MOTION" && (
        <Card className="mb-8 border-violet-500/30">
          <CardContent className="py-6 text-center">
            <p className="text-gray-300 mb-4">
              Motion descriptions are ready! Review before generating video clips.
            </p>
            <Button onClick={() => router.push(`/dashboard/videos/${id}/review`)}>
              Review Motion
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Legacy review statuses */}
      {video.status === "REVIEW_SCRIPT" && (
        <Card className="mb-8 border-violet-500/30">
          <CardContent className="py-6 text-center">
            <p className="text-gray-300 mb-4">Your script is ready for review.</p>
            <Button onClick={() => router.push(`/dashboard/videos/${id}/review`)}>
              Review Script
            </Button>
          </CardContent>
        </Card>
      )}
      {video.status === "REVIEW_MUSIC_SCRIPT" && (
        <Card className="mb-8 border-violet-500/30">
          <CardContent className="py-6 text-center">
            <p className="text-gray-300 mb-4">Your lyrics are ready for review.</p>
            <Button onClick={() => router.push(`/dashboard/videos/${id}/review`)}>
              Review Lyrics
            </Button>
          </CardContent>
        </Card>
      )}
      {video.status === "MUSIC_REVIEW" && <MusicReviewCard videoId={id} onStatusChange={loadVideo} />}
      {video.status === "REVIEW_VISUAL" && (
        <Card className="mb-8 border-violet-500/30">
          <CardContent className="py-6 text-center">
            <p className="text-gray-300 mb-4">Visual prompts are ready for review.</p>
            <Button onClick={() => router.push(`/dashboard/videos/${id}/review`)}>
              Review Visuals
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ─── Processing steps: show spinner + progress ─── */}
      {["STORY", "SCENE_SPLIT", "TTS_GENERATION", "PROMPT_GENERATION", "IMAGE_GENERATION", "MOTION_GENERATION", "VIDEO_GENERATION", "RENDERING", "MUSIC_GENERATION", "VIDEO_SCRIPT", "SCRIPT"].includes(video.status) && (
        <Card className="mb-8 border-amber-500/30">
          <CardContent className="py-6">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="animate-spin w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full" />
              <p className="text-gray-300">
                {video.status === "STORY" || video.status === "SCRIPT" ? "Generating story..." :
                 video.status === "SCENE_SPLIT" ? "Splitting into scenes..." :
                 video.status === "TTS_GENERATION" || video.status === "MUSIC_GENERATION" ? (video.series.videoType === "music_video" ? "Generating song..." : "Generating audio...") :
                 video.status === "PROMPT_GENERATION" || video.status === "VIDEO_SCRIPT" ? "Generating visual prompts..." :
                 video.status === "IMAGE_GENERATION" ? "Generating images..." :
                 video.status === "MOTION_GENERATION" ? "Generating motion descriptions..." :
                 video.status === "VIDEO_GENERATION" ? "Generating video clips..." :
                 video.status === "RENDERING" ? "Composing final video..." :
                 "Processing..."}
              </p>
            </div>
            <Progress value={statusProgress[video.status] ?? 0} label="Pipeline Progress" />
          </CardContent>
        </Card>
      )}

      {/* Error + Retry */}
      {video.status === "FAILED" && (
        <Card className="mb-8 border-red-500/30">
          <CardContent className="py-4">
            {job?.error && (
              <p className="text-sm text-red-400 mb-4">{job.error}</p>
            )}
            <Button loading={retrying} onClick={handleRetry}>
              Retry Generation
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Re-render banner */}
      {hasChanges && video.status === "COMPLETED" && (
        <Card className="mb-8 border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-amber-300">Scene clips have been changed</p>
              <p className="text-xs text-gray-400 mt-0.5">Re-render to compose a new final video with your updated clips.</p>
            </div>
            <Button loading={rerendering} onClick={handleRerender}>
              Re-render Video
            </Button>
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
            {(() => {
              const vs = video.series?.videoSize;
              const arCss = vs === "16:9" ? "16/9" : vs === "1:1" ? "1/1" : "9/16";
              const maxW = vs === "16:9" ? "max-w-2xl" : vs === "1:1" ? "max-w-md" : "max-w-sm";
              return downloadUrl ? (
                <div className={`${maxW} mx-auto rounded-xl overflow-hidden bg-black mb-4`} style={{ aspectRatio: arCss }}>
                  <video
                    src={downloadUrl}
                    controls
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className={`${maxW} mx-auto rounded-xl bg-white/5 flex items-center justify-center mb-4`} style={{ aspectRatio: arCss }}>
                  <p className="text-gray-500">Click download to preview</p>
                </div>
              );
            })()}
            <div className="flex justify-center gap-3">
              <Button loading={downloading} onClick={handleDownload}>
                Download MP4
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push(`/dashboard/videos/${id}/edit`)}
              >
                Edit Video
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Thumbnail Generator */}
      {video.status === "COMPLETED" && (
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Thumbnail</h2>
              {!showThumbPanel && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowThumbPanel(true)}
                >
                  {thumbUrl ? "Regenerate" : "Generate Thumbnail"}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {thumbUrl && !showThumbPanel && (
              <div className="space-y-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbUrl}
                  alt="Thumbnail"
                  className="w-full max-w-md rounded-xl border border-white/10"
                />
                <div className="flex gap-2">
                  <a
                    href={thumbUrl}
                    download={`thumbnail_${id}.jpg`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/30 text-violet-300 text-xs font-medium hover:bg-violet-500/20 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Download
                  </a>
                  <button
                    onClick={() => setShowThumbPanel(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 text-xs font-medium hover:bg-white/10 transition-colors"
                  >
                    Regenerate
                  </button>
                </div>
              </div>
            )}

            {showThumbPanel && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    Thumbnail Prompt
                  </label>
                  <textarea
                    value={thumbPrompt}
                    onChange={(e) => setThumbPrompt(e.target.value)}
                    rows={3}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white resize-y focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
                    placeholder="Leave empty for AI-generated prompt based on your video title and content, or type a custom prompt..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    Image Model
                  </label>
                  <div className="flex gap-2">
                    {THUMB_MODELS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setThumbModel(m.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          thumbModel === m.id
                            ? "bg-violet-600 text-white"
                            : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/10"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {thumbUrl && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5">Current thumbnail:</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbUrl}
                      alt="Current thumbnail"
                      className="w-full max-w-xs rounded-lg border border-white/10"
                    />
                  </div>
                )}

                {thumbError && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                    <p className="text-sm text-red-400">{thumbError}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      You can try again with the same model or pick a different one above.
                    </p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    loading={generatingThumb}
                    disabled={false}
                    onClick={async () => {
                      setGeneratingThumb(true);
                      setThumbError(null);
                      try {
                        const res = await fetch(`/api/videos/${id}/thumbnail`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ prompt: thumbPrompt.trim() || undefined, imageModel: thumbModel }),
                        });
                        if (res.ok) {
                          const data = await res.json();
                          setThumbUrl(data.url);
                          setThumbError(null);
                          setShowThumbPanel(false);
                        } else {
                          const data = await res.json().catch(() => ({}));
                          setThumbError(data.error || "Thumbnail generation failed");
                        }
                      } finally {
                        setGeneratingThumb(false);
                      }
                    }}
                  >
                    Generate Thumbnail
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowThumbPanel(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {!thumbUrl && !showThumbPanel && (
              <p className="text-sm text-gray-500">
                No thumbnail yet. Click &quot;Generate Thumbnail&quot; to create one.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Scenes */}
      {video.scenes.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold">
              Scenes ({video.scenes.length})
            </h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {video.scenes.map((scene) => {
                const imageVersions = (scene.media || []).filter((m) => m.type === "image");
                const videoVersions = (scene.media || []).filter((m) => m.type === "video");

                return (
                  <div
                    key={scene.id}
                    className="rounded-xl bg-white/[0.02] border border-white/5 overflow-hidden"
                  >
                    <div className="flex gap-4 p-4">
                      <div className="w-8 h-8 rounded-full bg-violet-600/20 flex items-center justify-center text-sm font-medium text-violet-400 shrink-0">
                        {scene.sceneOrder + 1}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-gray-300 text-sm">{scene.text}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 flex-wrap">
                          {scene.duration && <span className="font-mono">{scene.duration}s</span>}
                          {scene.assetType && (
                            <Badge variant="default">{scene.assetType}</Badge>
                          )}
                          {scene.imageUrl && (
                            <a
                              href={scene.imageUrl}
                              download={`scene_${scene.sceneOrder + 1}.jpg`}
                              className="text-violet-400 hover:text-violet-300 transition-colors inline-flex items-center gap-1"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                              Image
                            </a>
                          )}
                          {scene.videoUrl && (
                            <a
                              href={scene.videoUrl}
                              download={`scene_${scene.sceneOrder + 1}.mp4`}
                              className="text-violet-400 hover:text-violet-300 transition-colors inline-flex items-center gap-1"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                              Video
                            </a>
                          )}
                          {scene.audioUrl && (
                            <a
                              href={scene.audioUrl}
                              download={`scene_${scene.sceneOrder + 1}_audio.mp3`}
                              className="text-violet-400 hover:text-violet-300 transition-colors inline-flex items-center gap-1"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                              Audio
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Scene media preview (right side) */}
                      <div className="shrink-0 flex flex-col gap-2 items-end">
                        {scene.videoUrl ? (
                          <video
                            src={scene.videoUrl}
                            className="w-24 h-24 rounded-lg object-cover bg-black"
                            muted
                            loop
                            onMouseEnter={(e) => e.currentTarget.play()}
                            onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                          />
                        ) : scene.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={scene.imageUrl}
                            alt={`Scene ${scene.sceneOrder + 1}`}
                            className="w-24 h-24 rounded-lg object-cover"
                          />
                        ) : null}
                      </div>
                    </div>

                    {/* Action bar for COMPLETED videos */}
                    {video.status === "COMPLETED" && (
                      <div className="border-t border-white/5 px-4 py-2 flex items-center gap-2 bg-white/[0.01]">
                        <button
                          onClick={() => {
                            setRegenScene(scene);
                            setRegenPrompt(scene.visualDescription || scene.text);
                            setRegenModel(video.series.videoModel || "");
                            setRegenDuration(Math.max(3, Math.round(scene.duration || 5)));
                            setRegenError(null);
                          }}
                          className="text-xs text-violet-400 hover:text-violet-300 transition-colors inline-flex items-center gap-1"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                          Regenerate Clip
                        </button>
                        {(imageVersions.length > 1 || videoVersions.length > 1) && (
                          <button
                            onClick={() => setVersionScene(scene)}
                            className="text-xs text-gray-400 hover:text-gray-300 transition-colors inline-flex items-center gap-1"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                            Versions ({imageVersions.length + videoVersions.length})
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
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

      {/* ─── Regenerate Clip Modal ─── */}
      {regenScene && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                Regenerate Clip — Scene {regenScene.sceneOrder + 1}
              </h3>
              <button
                onClick={() => setRegenScene(null)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Current clip preview */}
            {regenScene.videoUrl && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-1.5">Current clip:</p>
                <video
                  src={regenScene.videoUrl}
                  controls
                  className="w-full rounded-lg bg-black max-h-48 object-contain"
                />
              </div>
            )}

            {!regenScene.videoUrl && regenScene.imageUrl && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-1.5">Source image:</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={regenScene.imageUrl}
                  alt="Source"
                  className="w-full rounded-lg max-h-48 object-contain"
                />
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Visual Description
                </label>
                <textarea
                  value={regenPrompt}
                  onChange={(e) => setRegenPrompt(e.target.value)}
                  rows={3}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white resize-y focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
                  placeholder="Describe what the video clip should show..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Duration: <span className="text-violet-400 font-mono">{regenDuration}s</span>
                </label>
                <input
                  type="range"
                  min={3}
                  max={15}
                  step={1}
                  value={regenDuration}
                  onChange={(e) => setRegenDuration(Number(e.target.value))}
                  className="w-full accent-violet-500"
                />
                <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                  <span>3s</span>
                  <span>5s</span>
                  <span>10s</span>
                  <span>15s</span>
                </div>
              </div>

              <VideoModelSelector value={regenModel} onChange={setRegenModel} />

              {regenError && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                  <p className="text-sm text-red-400">{regenError}</p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  variant="primary"
                  loading={regenerating}
                  onClick={handleRegenClip}
                  disabled={!regenScene.imageUrl && !regenScene.assetUrl}
                >
                  Generate Video Clip
                </Button>
                <Button variant="ghost" onClick={() => setRegenScene(null)}>
                  Cancel
                </Button>
              </div>

              {!regenScene.imageUrl && !regenScene.assetUrl && (
                <p className="text-xs text-amber-400">
                  This scene has no source image. Generate an image first on the review page.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Version Picker Modal ─── */}
      {versionScene && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                Media Versions — Scene {versionScene.sceneOrder + 1}
              </h3>
              <button
                onClick={() => setVersionScene(null)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Images */}
            {(() => {
              const imgs = (versionScene.media || []).filter((m) => m.type === "image");
              if (imgs.length === 0) return null;
              return (
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-300 mb-3">Images ({imgs.length})</h4>
                  <div className="grid grid-cols-3 gap-3">
                    {imgs.map((m) => {
                      const isActive = versionScene.imageKey === m.key;
                      return (
                        <button
                          key={m.id}
                          onClick={() => handleSelectMedia(versionScene.id, m.id)}
                          className={`rounded-xl border overflow-hidden transition-all ${
                            isActive
                              ? "border-violet-500 ring-2 ring-violet-500/50"
                              : "border-white/10 hover:border-white/30"
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={m.url} alt="" className="w-full aspect-square object-cover" />
                          <div className="p-1.5 bg-black/40">
                            <p className="text-[10px] text-gray-400 truncate">{m.modelUsed || "unknown"}</p>
                            {isActive && (
                              <span className="text-[10px] font-medium text-violet-400">ACTIVE</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Videos */}
            {(() => {
              const vids = (versionScene.media || []).filter((m) => m.type === "video");
              if (vids.length === 0) return null;
              return (
                <div>
                  <h4 className="text-sm font-medium text-gray-300 mb-3">Video Clips ({vids.length})</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {vids.map((m) => {
                      const isActive = versionScene.videoKey === m.key;
                      return (
                        <button
                          key={m.id}
                          onClick={() => handleSelectMedia(versionScene.id, m.id)}
                          className={`rounded-xl border overflow-hidden transition-all ${
                            isActive
                              ? "border-violet-500 ring-2 ring-violet-500/50"
                              : "border-white/10 hover:border-white/30"
                          }`}
                        >
                          <video
                            src={m.url}
                            className="w-full aspect-video object-cover bg-black"
                            muted
                            loop
                            onMouseEnter={(e) => e.currentTarget.play()}
                            onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                          />
                          <div className="p-1.5 bg-black/40 flex items-center justify-between">
                            <p className="text-[10px] text-gray-400 truncate">{m.modelUsed || "unknown"}</p>
                            {isActive && (
                              <span className="text-[10px] font-medium text-violet-400">ACTIVE</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <div className="mt-4 flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setVersionScene(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
