"use client";

import { ActivityFeed } from "../../components";
import type { VideoPhase, StudioPhaseId } from "../../hooks/use-video-phase";
import type { Scene, VideoDetail } from "../../types";

function StatusBanner({ color, icon, children }: { color: string; icon?: "spinner"; children: React.ReactNode }) {
  const colors: Record<string, string> = {
    violet: "border-violet-500/20 bg-violet-500/5 text-violet-300",
    emerald: "border-emerald-500/20 bg-emerald-500/5 text-emerald-300",
    amber: "border-amber-500/20 bg-amber-500/5 text-amber-300",
    cyan: "border-cyan-500/20 bg-cyan-500/5 text-cyan-300",
  };
  return (
    <div className={`rounded-xl border px-4 py-3 ${colors[color] || colors.violet} ${icon === "spinner" ? "flex items-center gap-3" : ""}`}>
      {icon === "spinner" && <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full shrink-0" />}
      <p className="text-sm">{children}</p>
    </div>
  );
}

export function CanvasOverlay({
  selectedPhaseId,
  phase,
  video,
  scenes,
  setVideo,
  onSaveStory,
  downloadUrl,
}: {
  selectedPhaseId: StudioPhaseId;
  phase: VideoPhase;
  video: VideoDetail | null;
  scenes: Scene[];
  setVideo: React.Dispatch<React.SetStateAction<VideoDetail>>;
  onSaveStory: (markdown: string) => void;
  downloadUrl: string | null;
}) {
  const status = video?.status || "";

  // Processing activity feed
  const isProcessingInPhase =
    (selectedPhaseId === "story" && phase.isProcessing && ["PRODUCING", "STORY", "SCENE_SPLIT", "SCRIPT_SUPERVISION"].includes(status)) ||
    (selectedPhaseId === "pre-production" && phase.isProcessing && ["TTS_GENERATION", "CINEMATOGRAPHY", "STORYBOARD"].includes(status)) ||
    (selectedPhaseId === "production" && phase.isProcessing && ["PROMPT_GENERATION", "IMAGE_GENERATION", "MOTION_GENERATION", "VIDEO_GENERATION"].includes(status)) ||
    (selectedPhaseId === "final" && phase.isProcessing && status === "RENDERING");

  if (isProcessingInPhase) {
    return (
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-full max-w-md px-4">
        <div className="rounded-xl bg-black/80 border border-white/10 backdrop-blur-sm p-4">
          <ActivityFeed currentStatus={status} scenes={scenes} />
        </div>
      </div>
    );
  }

  // Story review — editable script
  if (selectedPhaseId === "story" && phase.isStoryReview && video?.script) {
    return (
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-full max-w-lg px-4">
        <div className="rounded-xl bg-black/80 border border-white/10 backdrop-blur-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <StatusBanner color="violet">
              Review your story below. Edit directly if needed.
            </StatusBanner>
          </div>
          <div className="p-4">
            <textarea
              value={video.script}
              onChange={(e) => setVideo((prev) => prev ? { ...prev, script: e.target.value } : prev)}
              onBlur={() => { if (video.script) onSaveStory(video.script); }}
              rows={12}
              className="w-full bg-transparent border border-white/5 rounded-lg text-sm text-gray-200 resize-y focus:outline-none focus:border-violet-500/30 leading-relaxed font-mono p-3"
              placeholder="Your story will appear here..."
            />
          </div>
        </div>
      </div>
    );
  }

  // Pre-production review banner
  if (selectedPhaseId === "pre-production" && (phase.isTTSReview || phase.isPromptsReview || phase.isPreProductionReview)) {
    return (
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-full max-w-md px-4">
        <StatusBanner color={phase.isTTSReview ? "emerald" : phase.isPreProductionReview ? "violet" : "amber"}>
          {phase.isTTSReview
            ? "Listen to audio for each scene. Approve when satisfied."
            : phase.isPreProductionReview
              ? "Review the visual style guide and frame breakdown."
              : "Review image prompts. Edit before generating to save costs."}
        </StatusBanner>
      </div>
    );
  }

  // Production review banners
  if (selectedPhaseId === "production") {
    if (phase.isImagesReview || phase.isImageReview) {
      return (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-full max-w-md px-4">
          <StatusBanner color="cyan">
            Review generated images. Click a scene to regenerate in the inspector.
          </StatusBanner>
        </div>
      );
    }
    if (phase.isProductionReview || phase.isNewMotionReview || phase.isVideoReview || phase.isMotionReview) {
      return (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-full max-w-md px-4">
          <StatusBanner color={phase.isMotionReview || phase.isNewMotionReview ? "emerald" : "amber"}>
            {phase.isMotionReview || phase.isNewMotionReview
              ? "Review motion descriptions. Edit then generate video clips."
              : "Review video clips. Approve to compose the final video."}
          </StatusBanner>
        </div>
      );
    }
  }

  // Final — video player
  if (selectedPhaseId === "final" && status === "COMPLETED") {
    const vs = video?.series?.videoSize || "9:16";
    const arCss = vs === "16:9" ? "16/9" : vs === "1:1" ? "1/1" : "9/16";
    const maxW = vs === "16:9" ? "max-w-lg" : vs === "1:1" ? "max-w-xs" : "max-w-[200px]";

    return (
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-4">
        <div className="rounded-xl bg-black/80 border border-white/10 backdrop-blur-sm p-4">
          <div className={`${maxW} mx-auto rounded-xl overflow-hidden bg-black mb-3`} style={{ aspectRatio: arCss }}>
            {downloadUrl ? (
              <video src={downloadUrl} controls className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full flex items-center justify-center h-32">
                <div className="animate-spin w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full" />
              </div>
            )}
          </div>
          <StatusBanner color="emerald">
            Video complete. Edit scenes below and recompose as needed.
          </StatusBanner>
        </div>
      </div>
    );
  }

  // Story phase — scenes review / narration review banners
  if (selectedPhaseId === "story" && (phase.isScenesReview || phase.isNarrationReview)) {
    return (
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-full max-w-md px-4">
        <StatusBanner color="violet">
          {phase.isScenesReview
            ? "Review the scene breakdown. Edit any scene, then approve."
            : "Review your narration. When happy, generate preview images."}
        </StatusBanner>
      </div>
    );
  }

  return null;
}
