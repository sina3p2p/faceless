"use client";

import type { VideoPhase, StudioPhaseId } from "../../hooks/use-video-phase";
import type { Scene } from "../../types";
import type { SelectedMedia } from "../context/StudioContext";

interface DockTool {
  id: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  hidden?: boolean;
  variant?: "primary" | "danger";
}

function DockButton({ tool }: { tool: DockTool }) {
  return (
    <button
      onClick={tool.onClick}
      disabled={tool.disabled || tool.loading}
      className={`w-9 h-9 rounded-xl flex items-center justify-center relative group transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${tool.variant === "primary"
          ? "text-violet-400 hover:text-violet-300 hover:bg-violet-500/10"
          : tool.variant === "danger"
            ? "text-gray-500 hover:text-red-400 hover:bg-red-500/10"
            : "text-gray-500 hover:text-white hover:bg-white/10"
        }`}
    >
      {tool.loading ? (
        <div className="animate-spin w-4 h-4 border-[1.5px] border-current border-t-transparent rounded-full" />
      ) : (
        tool.icon
      )}

      {/* Tooltip */}
      <div className="absolute bottom-full mb-2 px-2.5 py-1.5 rounded-lg bg-black/90 border border-white/10 text-[10px] text-white font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
        {tool.label}
      </div>
    </button>
  );
}

function Separator() {
  return <div className="w-px h-5 bg-white/10 mx-0.5" />;
}

// SVG icon helpers
const icons = {
  approve: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ),
  images: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91M2.25 18V6a2.25 2.25 0 012.25-2.25h15A2.25 2.25 0 0121.75 6v12A2.25 2.25 0 0119.5 20.25H4.5A2.25 2.25 0 012.25 18z" />
    </svg>
  ),
  regenImages: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
    </svg>
  ),
  motion: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  ),
  video: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
    </svg>
  ),
  download: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  ),
  recompose: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" />
    </svg>
  ),
  edit: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  ),
  delete: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  ),
  compare: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  ),
  lab: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
    </svg>
  ),
  back: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  ),
  useForVideo: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  addVariant: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  ),
};

export function BottomDock({
  phase,
  selectedPhaseId,
  selectedScene,
  hasScenes,
  hasFrames,
  allImagesGenerated,
  someImagesGenerated,
  allFrameImagesGenerated,
  someFrameImagesGenerated,
  generatingAll,
  generatingAllFrames,
  generatingMotion,
  rendering,
  approving,
  downloadUrl,
  downloading,
  onApprove,
  onGenerateAllImages,
  onGenerateAllFrameImages,
  onGenerateMotion,
  onStartRendering,
  onRecompose,
  onDownload,
  canCompare,
  onCompare,
  isLabMode,
  onExitLab,
  hasLabFrames,
  onOpenLab,
  onEditScene,
  onDeleteScene,
  selectedMedia,
  onUseMediaForVideo,
  onGenerateVariant,
  onDeleteMedia,
}: {
  phase: VideoPhase;
  selectedPhaseId: StudioPhaseId;
  selectedScene: Scene | null;
  hasScenes: boolean;
  hasFrames: boolean;
  allImagesGenerated: boolean;
  someImagesGenerated: boolean;
  allFrameImagesGenerated: boolean;
  someFrameImagesGenerated: boolean;
  generatingAll: boolean;
  generatingAllFrames: boolean;
  generatingMotion: boolean;
  rendering: boolean;
  approving: boolean;
  downloadUrl: string | null;
  downloading: boolean;
  onApprove: (endpoint: string) => void;
  onGenerateAllImages: (regen: boolean) => void;
  onGenerateAllFrameImages: (regen: boolean) => void;
  onGenerateMotion: () => void;
  onStartRendering: () => void;
  onRecompose: () => void;
  onDownload: () => void;
  canCompare: boolean;
  onCompare: () => void;
  isLabMode: boolean;
  onExitLab: () => void;
  hasLabFrames: boolean;
  onOpenLab: () => void;
  onEditScene: () => void;
  onDeleteScene: () => void;
  selectedMedia: SelectedMedia | null;
  onUseMediaForVideo: (mediaId: string, frameId: string) => void;
  onGenerateVariant: (frameId: string) => void;
  onDeleteMedia: (mediaId: string) => void;
}) {
  // Determine approve endpoint based on current phase
  function getApproveAction(): { endpoint: string; label: string } | null {
    if (phase.isStoryReview || phase.isScenesReview) return { endpoint: "approve-story", label: "Approve Story" };
    if (phase.isTTSReview) return { endpoint: "approve-pre-production", label: "Approve Audio" };
    if (phase.isPreProductionReview) return { endpoint: "approve-pre-production", label: "Approve Pre-Prod" };
    if (phase.isPromptsReview) return { endpoint: "approve-pre-production", label: "Approve Prompts" };
    if (phase.isImagesReview || phase.isImageReview) return { endpoint: phase.isImagesReview ? "approve-images" : "approve-production", label: "Approve Images" };
    if (phase.isProductionReview || phase.isVideoReview) return { endpoint: "approve-production", label: "Approve & Compose" };
    if (phase.isNewMotionReview) return { endpoint: "approve-motion", label: "Approve Motion" };
    return null;
  }

  const approveAction = getApproveAction();

  const phaseTools: DockTool[] = [];

  // Approve button
  if (approveAction) {
    phaseTools.push({
      id: "approve",
      icon: icons.approve,
      label: approveAction.label,
      onClick: () => onApprove(approveAction.endpoint),
      loading: approving,
      variant: "primary",
    });
  }

  // Image generation
  if (selectedPhaseId === "production" && !phase.isProcessing && hasScenes) {
    if (phase.isImagesReview || phase.isImageReview) {
      phaseTools.push({
        id: "regen-images",
        icon: icons.regenImages,
        label: "Regenerate All Images",
        onClick: () => hasFrames ? onGenerateAllFrameImages(true) : onGenerateAllImages(true),
        loading: generatingAllFrames || generatingAll,
      });
    } else if (!allImagesGenerated && !allFrameImagesGenerated && !approveAction) {
      phaseTools.push({
        id: "gen-images",
        icon: icons.images,
        label: someImagesGenerated || someFrameImagesGenerated ? "Generate Remaining" : "Generate Images",
        onClick: () => hasFrames ? onGenerateAllFrameImages(false) : onGenerateAllImages(false),
        loading: generatingAll || generatingAllFrames,
      });
    }
  }

  // Motion
  if ((phase.isMotionReview || phase.isNewMotionReview) && !phase.isProcessing) {
    phaseTools.push({
      id: "regen-motion",
      icon: icons.motion,
      label: "Regenerate Motion",
      onClick: onGenerateMotion,
      loading: generatingMotion,
    });
  }

  // Video rendering
  if (selectedPhaseId === "production" && !phase.isProcessing && !approveAction && hasScenes && (allImagesGenerated || allFrameImagesGenerated)) {
    phaseTools.push({
      id: "gen-video",
      icon: icons.video,
      label: "Generate Video",
      onClick: onStartRendering,
      loading: rendering,
      variant: "primary",
    });
  }

  // Completed state
  if (phase.isCompleted) {
    phaseTools.push({
      id: "recompose",
      icon: icons.recompose,
      label: "Recompose Video",
      onClick: onRecompose,
      loading: rendering,
    });
    if (downloadUrl) {
      phaseTools.push({
        id: "download",
        icon: icons.download,
        label: "Download MP4",
        onClick: onDownload,
        loading: downloading,
        variant: "primary",
      });
    }
    // Also allow regen images in completed state
    phaseTools.push({
      id: "regen-images-final",
      icon: icons.regenImages,
      label: "Regenerate All Images",
      onClick: () => hasFrames ? onGenerateAllFrameImages(true) : onGenerateAllImages(true),
      loading: generatingAllFrames || generatingAll,
    });
  }

  // Scene-context tools
  const sceneTools: DockTool[] = [];

  if (isLabMode) {
    // In lab mode: show "Back" as first tool
    sceneTools.push({
      id: "exit-lab",
      icon: icons.back,
      label: "Back to Storyboard",
      onClick: onExitLab,
    });
  } else if (selectedScene) {
    // Storyboard mode with scene selected
    if (hasLabFrames) {
      sceneTools.push({
        id: "open-lab",
        icon: icons.lab,
        label: "Open Scene Lab",
        onClick: onOpenLab,
      });
    }
    if (canCompare) {
      sceneTools.push({
        id: "compare",
        icon: icons.compare,
        label: "Compare Variants",
        onClick: onCompare,
      });
    }
    sceneTools.push({
      id: "edit-scene",
      icon: icons.edit,
      label: "Edit Scene",
      onClick: onEditScene,
    });
    sceneTools.push({
      id: "delete-scene",
      icon: icons.delete,
      label: "Delete Scene",
      onClick: onDeleteScene,
      variant: "danger",
    });
  }

  // Media-context tools (when a node is selected in lab)
  const mediaTools: DockTool[] = [];

  if (isLabMode && selectedMedia) {
    mediaTools.push({
      id: "use-for-video",
      icon: icons.useForVideo,
      label: "Use for Video",
      onClick: () => onUseMediaForVideo(selectedMedia.mediaId, selectedMedia.frameId),
      variant: "primary",
    });
    mediaTools.push({
      id: "add-variant",
      icon: icons.addVariant,
      label: "Generate Variant",
      onClick: () => onGenerateVariant(selectedMedia.frameId),
    });
    mediaTools.push({
      id: "compare-media",
      icon: icons.compare,
      label: "Compare Variants",
      onClick: onCompare,
    });
    mediaTools.push({
      id: "delete-media",
      icon: icons.delete,
      label: "Delete",
      onClick: () => onDeleteMedia(selectedMedia.mediaId),
      variant: "danger",
    });
  }

  // In lab mode, hide storyboard-level phase tools
  const visiblePhaseTools = isLabMode ? [] : phaseTools;

  const hasAnyTools = visiblePhaseTools.length > 0 || sceneTools.length > 0 || mediaTools.length > 0;
  if (!hasAnyTools) return null;

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30">
      <div className="flex items-center gap-0.5 px-2 py-1.5 rounded-2xl bg-black/80 border border-white/10 backdrop-blur-sm shadow-2xl shadow-black/50">
        {visiblePhaseTools.map((tool) => (
          <DockButton key={tool.id} tool={tool} />
        ))}

        {visiblePhaseTools.length > 0 && sceneTools.length > 0 && <Separator />}

        {sceneTools.map((tool) => (
          <DockButton key={tool.id} tool={tool} />
        ))}

        {mediaTools.length > 0 && sceneTools.length > 0 && <Separator />}

        {mediaTools.map((tool) => (
          <DockButton key={tool.id} tool={tool} />
        ))}
      </div>
    </div>
  );
}
