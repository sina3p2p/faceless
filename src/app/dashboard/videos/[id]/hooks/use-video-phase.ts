import type { VideoDetail } from "../types";
import { hasPipelineRenderFailure, isLegacyFailedVideoStatus } from "@/lib/pipeline-resume";

const PROCESSING_STATUSES = [
  "PRODUCING", "STORY", "SCENE_SPLIT", "SCRIPT_SUPERVISION",
  "TTS_GENERATION", "CINEMATOGRAPHY", "STORYBOARD",
  "PROMPT_GENERATION", "MOTION_GENERATION", "IMAGE_GENERATION",
  "VIDEO_GENERATION", "RENDERING",
];

export type StudioPhaseId = "story" | "pre-production" | "production" | "final";

export interface PhaseInfo {
  id: StudioPhaseId;
  label: string;
  status: "locked" | "processing" | "review" | "done";
}

export interface VideoPhase {
  activePhaseId: StudioPhaseId;
  phases: PhaseInfo[];
  // New pipeline review gates
  isStoryReview: boolean;
  isPreProductionReview: boolean;
  isImagesReview: boolean;
  isProductionReview: boolean;
  // Legacy review statuses
  isScenesReview: boolean;
  isTTSReview: boolean;
  isPromptsReview: boolean;
  isNewMotionReview: boolean;
  isVideoReview: boolean;
  isImageReview: boolean;
  isVisualReview: boolean;
  isMotionReview: boolean;
  isNarrationReview: boolean;
  // Processing
  isProcessing: boolean;
  isFailed: boolean;
  isCompleted: boolean;
  hasTTSRun: boolean;
  // Status text
  processingMessage: string;
  headerTitle: string;
  headerDescription: string;
  // Scene card visibility flags
  showMotionEdit: boolean;
  showDirectorNote: boolean;
  showAudioPlayer: boolean;
  showDuration: boolean;
  showFrameActions: boolean;
  showFrameMotion: boolean;
  showFrameVideo: boolean;
}

export function useVideoPhase(video: VideoDetail | null): VideoPhase {
  const status = video?.status || "";
  const isMusicVideo = video?.series?.videoType === "music_video";

  const isVisualReview = status === "REVIEW_VISUAL";
  const isMotionReview = isVisualReview && !isMusicVideo;
  const isImageReview = status === "IMAGE_REVIEW";
  const isNarrationReview = status === "REVIEW_SCRIPT" && !isMusicVideo;

  const isStoryReview = status === "REVIEW_STORY";
  const isPreProductionReview = status === "REVIEW_PRE_PRODUCTION";
  const isImagesReview = status === "REVIEW_IMAGES";
  const isProductionReview = status === "REVIEW_PRODUCTION";

  const isScenesReview = status === "REVIEW_SCENES";
  const isTTSReview = status === "TTS_REVIEW";
  const isPromptsReview = status === "REVIEW_PROMPTS";
  const isNewMotionReview = status === "REVIEW_MOTION";
  const isVideoReview = status === "REVIEW_VIDEO";

  const rj = video?.renderJobs?.[0];
  const isFailed = hasPipelineRenderFailure(rj) || isLegacyFailedVideoStatus(status);
  const isProcessing = PROCESSING_STATUSES.includes(status) && !isFailed;
  const hasTTSRun = !isStoryReview && !isScenesReview && !isNarrationReview;

  const processingMessages: Record<string, string> = {
    PRODUCING: "Executive Producer is crafting the creative brief...",
    STORY: "Head Writer is writing your story...",
    SCENE_SPLIT: "Director is splitting story into scenes...",
    SCRIPT_SUPERVISION: "Script Supervisor is enforcing continuity...",
    TTS_GENERATION: "Generating audio narration...",
    CINEMATOGRAPHY: "Cinematographer is designing the visual style...",
    STORYBOARD: "Storyboard Agent is planning frame breakdown...",
    PROMPT_GENERATION: "Prompt Architect is creating image prompts...",
    MOTION_GENERATION: "Motion Director is designing motion for each frame...",
    IMAGE_GENERATION: "Generating images...",
    VIDEO_GENERATION: "Generating video clips...",
    RENDERING: "Composing final video...",
  };

  const headerTitle = video?.title ?? (
    isFailed ? "Generation failed" :
    isStoryReview ? "Review Story" :
    isPreProductionReview ? "Review Pre-Production" :
    isImagesReview ? "Review Images" :
    isProductionReview ? "Review Production" :
    isScenesReview ? "Review Scenes" :
    isTTSReview ? "Review Audio" :
    isPromptsReview ? "Review Image Prompts" :
    isNewMotionReview ? "Review Motion" :
    isVideoReview ? "Review Video Clips" :
    isMotionReview ? "Review Motion" :
    isVisualReview ? "Review Visuals" :
    isProcessing ? "Processing..." :
    "Review"
  );

  const headerDescription =
    isFailed
      ? "The pipeline stopped with an error. Review the message below, then resume from the failed step or start over from the series page."
    : isStoryReview ? "Review creative brief, story, scenes, and continuity. Then approve to generate audio." :
    isPreProductionReview ? "Review audio durations, visual style guide, and frame breakdown. Then approve to generate images." :
    isImagesReview ? "Review the generated images below. Regenerate any you don't like, then approve to generate video clips." :
    isProductionReview ? "Review the generated video clips below. Then approve to compose the final video." :
    isScenesReview ? "Review the scene breakdown and director's notes, then generate audio." :
    isTTSReview ? "Listen to the generated audio for each scene, then generate image prompts." :
    isPromptsReview ? "Review the image prompts before generating images." :
    isNewMotionReview ? "Review the motion descriptions for each frame, then generate video clips." :
    isVideoReview ? "Review the generated video clips. Regenerate any you don't like, then approve to compose the final video." :
    isProcessing ? "Your video is being processed..." :
    isImageReview ? "Review generated images, then approve to generate motion." :
    "Review your content and approve to continue.";

  // Phase categorization for sidebar
  const STORY_STATUSES = ["PENDING", "PRODUCING", "STORY", "SCENE_SPLIT", "SCRIPT_SUPERVISION", "REVIEW_STORY", "REVIEW_SCENES", "REVIEW_SCRIPT"];
  const PREPROD_STATUSES = ["TTS_GENERATION", "CINEMATOGRAPHY", "STORYBOARD", "REVIEW_PRE_PRODUCTION", "TTS_REVIEW", "REVIEW_PROMPTS"];
  const PRODUCTION_STATUSES = ["PROMPT_GENERATION", "IMAGE_GENERATION", "REVIEW_IMAGES", "MOTION_GENERATION", "VIDEO_GENERATION", "REVIEW_PRODUCTION", "IMAGE_REVIEW", "REVIEW_VISUAL", "REVIEW_MOTION", "REVIEW_VIDEO"];
  const FINAL_STATUSES = ["RENDERING", "COMPLETED"];

  function phaseStatus(phaseStatuses: string[]): "locked" | "processing" | "review" | "done" {
    if (isFailed) {
      const at = failedAt || "PENDING";
      if (phaseStatuses.includes(at)) return "processing";
      const allPhases = [STORY_STATUSES, PREPROD_STATUSES, PRODUCTION_STATUSES, FINAL_STATUSES];
      const failedIdx = allPhases.findIndex((p) => p.includes(at));
      const thisIdx = allPhases.indexOf(phaseStatuses);
      if (failedIdx === -1) return thisIdx === 0 ? "processing" : "locked";
      if (thisIdx < failedIdx) return "done";
      if (thisIdx === failedIdx) return "processing";
      return "locked";
    }
    if (phaseStatuses.includes(status)) {
      if (status.startsWith("REVIEW_") || status === "TTS_REVIEW" || status === "IMAGE_REVIEW") return "review";
      if (status === "COMPLETED") return "done";
      return "processing";
    }
    const allPhases = [STORY_STATUSES, PREPROD_STATUSES, PRODUCTION_STATUSES, FINAL_STATUSES];
    const currentIdx = allPhases.findIndex((p) => p.includes(status));
    const thisIdx = allPhases.indexOf(phaseStatuses);
    if (currentIdx > thisIdx) return "done";
    return "locked";
  }

  const failedAt = isFailed ? (isLegacyFailedVideoStatus(status) ? "PENDING" : status) : "";
  const activePhaseId: StudioPhaseId = isFailed
    ? (FINAL_STATUSES.includes(failedAt) ? "final"
      : PRODUCTION_STATUSES.includes(failedAt) ? "production"
        : PREPROD_STATUSES.includes(failedAt) ? "pre-production"
          : "story")
    : FINAL_STATUSES.includes(status) ? "final"
      : PRODUCTION_STATUSES.includes(status) ? "production"
        : PREPROD_STATUSES.includes(status) ? "pre-production"
          : "story";

  const phases: PhaseInfo[] = [
    { id: "story", label: "Story", status: phaseStatus(STORY_STATUSES) },
    { id: "pre-production", label: "Pre-Production", status: phaseStatus(PREPROD_STATUSES) },
    { id: "production", label: "Production", status: phaseStatus(PRODUCTION_STATUSES) },
    { id: "final", label: "Final", status: phaseStatus(FINAL_STATUSES) },
  ];

  return {
    activePhaseId,
    phases,
    isFailed,
    isStoryReview,
    isPreProductionReview,
    isImagesReview,
    isProductionReview,
    isScenesReview,
    isTTSReview,
    isPromptsReview,
    isNewMotionReview,
    isVideoReview,
    isImageReview,
    isVisualReview,
    isMotionReview,
    isNarrationReview,
    isProcessing,
    isCompleted: status === "COMPLETED",
    hasTTSRun,
    processingMessage: isFailed ? "Stopped with an error." : (processingMessages[status] || ""),
    headerTitle,
    headerDescription,
    showMotionEdit: isMotionReview || isNewMotionReview || isVideoReview || status === "COMPLETED",
    showDirectorNote: true,
    showAudioPlayer: isTTSReview || isPromptsReview || isNewMotionReview || status === "COMPLETED",
    showDuration: hasTTSRun,
    showFrameActions: isImagesReview || isProductionReview || isPromptsReview || isImageReview || isNewMotionReview || isVideoReview || status === "COMPLETED",
    showFrameMotion: isProductionReview || isNewMotionReview || isImageReview || isVideoReview || status === "COMPLETED",
    showFrameVideo: isProductionReview || isNewMotionReview || isVideoReview || status === "COMPLETED" || status === "VIDEO_GENERATION",
  };
}
