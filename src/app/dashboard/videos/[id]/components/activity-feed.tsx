"use client";

import type { Scene } from "../types";

export interface PipelineStep {
  id: string;
  label: string;
  agent: string;
  status: "pending" | "running" | "done" | "failed";
}

const STORY_PIPELINE: Omit<PipelineStep, "status">[] = [
  { id: "PRODUCING", label: "Creative brief", agent: "Executive Producer" },
  { id: "STORY", label: "Story writing", agent: "Head Writer" },
  { id: "SCENE_SPLIT", label: "Scene breakdown", agent: "Director" },
  { id: "SCRIPT_SUPERVISION", label: "Continuity check", agent: "Script Supervisor" },
];

const PREPROD_PIPELINE: Omit<PipelineStep, "status">[] = [
  { id: "TTS_GENERATION", label: "Audio narration", agent: "Voice Studio" },
  { id: "CINEMATOGRAPHY", label: "Visual style", agent: "Cinematographer" },
  { id: "STORYBOARD", label: "Frame planning", agent: "Storyboard Agent" },
];

const PRODUCTION_PIPELINE: Omit<PipelineStep, "status">[] = [
  { id: "PROMPT_GENERATION", label: "Image prompts", agent: "Prompt Architect" },
  { id: "IMAGE_GENERATION", label: "Image generation", agent: "Image Models" },
  { id: "MOTION_GENERATION", label: "Motion design", agent: "Motion Director" },
  { id: "VIDEO_GENERATION", label: "Video clips", agent: "Video Models" },
];

const FINAL_PIPELINE: Omit<PipelineStep, "status">[] = [
  { id: "RENDERING", label: "Final composition", agent: "Render Engine" },
];

const ALL_STEPS = [...STORY_PIPELINE, ...PREPROD_PIPELINE, ...PRODUCTION_PIPELINE, ...FINAL_PIPELINE];

function getStepsForStatus(currentStatus: string): PipelineStep[] {
  const currentIdx = ALL_STEPS.findIndex((s) => s.id === currentStatus);
  if (currentIdx === -1) return [];

  // Show steps from the current phase group
  let pipeline: Omit<PipelineStep, "status">[];
  if (STORY_PIPELINE.some((s) => s.id === currentStatus)) pipeline = STORY_PIPELINE;
  else if (PREPROD_PIPELINE.some((s) => s.id === currentStatus)) pipeline = PREPROD_PIPELINE;
  else if (PRODUCTION_PIPELINE.some((s) => s.id === currentStatus)) pipeline = PRODUCTION_PIPELINE;
  else pipeline = FINAL_PIPELINE;

  return pipeline.map((step) => {
    const stepGlobalIdx = ALL_STEPS.findIndex((s) => s.id === step.id);
    let status: PipelineStep["status"];
    if (stepGlobalIdx < currentIdx) status = "done";
    else if (stepGlobalIdx === currentIdx) status = "running";
    else status = "pending";
    return { ...step, status };
  });
}

function withFailedHighlight(steps: PipelineStep[]): PipelineStep[] {
  return steps.map((s) => ({
    ...s,
    status: s.status === "running" ? "failed" : s.status,
  }));
}

export function ActivityFeed({
  currentStatus,
  scenes,
  highlightFailedStep,
}: {
  currentStatus: string;
  scenes: Scene[];
  /** When true, the active step is shown as failed (pipeline stopped there). */
  highlightFailedStep?: boolean;
}) {
  const raw = getStepsForStatus(currentStatus);
  const steps = highlightFailedStep ? withFailedHighlight(raw) : raw;
  if (steps.length === 0) return null;

  const isImageGen = currentStatus === "IMAGE_GENERATION";
  const isVideoGen = currentStatus === "VIDEO_GENERATION";
  const allFrames = scenes.flatMap((s) => s.frames ?? []);
  const totalFrames = allFrames.length || scenes.length;

  let completedCount = 0;
  if (isImageGen) {
    completedCount = allFrames.length > 0
      ? allFrames.filter((f) => f.imageUrl).length
      : scenes.filter((s) => s.assetUrl).length;
  } else if (isVideoGen) {
    completedCount = allFrames.filter((f) => f.videoUrl).length;
  }

  return (
    <div className="mb-6 rounded-xl border border-violet-500/20 bg-violet-500/5 overflow-hidden">
      {/* Steps */}
      <div className="p-4 space-y-1">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              step.status === "running" ? "bg-violet-500/10" :
              step.status === "failed" ? "bg-red-500/10" : ""
            }`}
          >
            {/* Status icon */}
            <div className="w-5 h-5 flex items-center justify-center shrink-0">
              {step.status === "done" && (
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              {step.status === "running" && (
                <div className="animate-spin w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full" />
              )}
              {step.status === "failed" && (
                <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {step.status === "pending" && (
                <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
              )}
            </div>

            {/* Label + agent */}
            <div className="flex-1 min-w-0">
              <span className={`text-xs font-medium ${
                step.status === "done" ? "text-gray-500" :
                step.status === "running" ? "text-violet-300" :
                step.status === "failed" ? "text-red-200" :
                "text-gray-600"
              }`}>
                {step.label}
              </span>
            </div>

            {/* Agent name */}
            <span className={`text-[10px] shrink-0 ${
              step.status === "running" ? "text-violet-400/80" :
              step.status === "failed" ? "text-red-400/80" :
              "text-gray-700"
            }`}>
              {step.agent}
            </span>
          </div>
        ))}
      </div>

      {/* Frame-level progress bar for image/video generation */}
      {(isImageGen || isVideoGen) && totalFrames > 0 && (
        <div className="px-4 pb-4 pt-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-violet-400 font-medium">
              {isImageGen ? "Images" : "Video clips"}: {completedCount}/{totalFrames}
            </span>
            <span className="text-[10px] text-violet-400/60 font-mono">
              {totalFrames > 0 ? Math.round((completedCount / totalFrames) * 100) : 0}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-500 transition-all duration-500"
              style={{ width: `${totalFrames > 0 ? (completedCount / totalFrames) * 100 : 0}%` }}
            />
          </div>

          {/* Frame thumbnails appearing as they complete */}
          {completedCount > 0 && (
            <div className="flex gap-1 mt-2 overflow-x-auto pb-1 scrollbar-thin">
              {(allFrames.length > 0 ? allFrames : scenes).map((item, i) => {
                const url = "imageUrl" in item ? item.imageUrl : (item as Scene).assetUrl;
                const hasOutput = isImageGen ? !!url : !!("videoUrl" in item ? item.videoUrl : null);
                return (
                  <div
                    key={"id" in item ? item.id : i}
                    className={`w-8 h-8 rounded shrink-0 overflow-hidden border transition-all ${
                      hasOutput
                        ? "border-violet-500/30 opacity-100"
                        : "border-white/5 opacity-30"
                    }`}
                  >
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-white/5 flex items-center justify-center">
                        <span className="text-[8px] text-gray-700">{i + 1}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Compact version for the inspector panel
export function ActivityFeedCompact({
  currentStatus,
  scenes,
  highlightFailedStep,
}: {
  currentStatus: string;
  scenes: Scene[];
  highlightFailedStep?: boolean;
}) {
  const raw = getStepsForStatus(currentStatus);
  const steps = highlightFailedStep ? withFailedHighlight(raw) : raw;
  if (steps.length === 0) return null;

  const currentStep = steps.find((s) => s.status === "running" || s.status === "failed");
  const doneCount = steps.filter((s) => s.status === "done").length;

  const isImageGen = currentStatus === "IMAGE_GENERATION";
  const isVideoGen = currentStatus === "VIDEO_GENERATION";
  const allFrames = scenes.flatMap((s) => s.frames ?? []);
  const totalFrames = allFrames.length || scenes.length;
  let completedCount = 0;
  if (isImageGen) {
    completedCount = allFrames.length > 0
      ? allFrames.filter((f) => f.imageUrl).length
      : scenes.filter((s) => s.assetUrl).length;
  } else if (isVideoGen) {
    completedCount = allFrames.filter((f) => f.videoUrl).length;
  }

  return (
    <div className="space-y-3">
      <span className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold">Activity</span>

      {/* Step progress dots */}
      <div className="flex items-center gap-1">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`h-1 flex-1 rounded-full transition-colors ${
              step.status === "done" ? "bg-emerald-500" :
              step.status === "running" ? "bg-violet-500 animate-pulse" :
              step.status === "failed" ? "bg-red-500" :
              "bg-white/10"
            }`}
            title={`${step.label} — ${step.status}`}
          />
        ))}
      </div>

      {/* Current step info */}
      {currentStep && (
        <div className="flex items-center gap-2">
          {currentStep.status === "failed" ? (
            <div className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
          ) : (
            <div className="animate-spin w-3 h-3 border border-violet-400 border-t-transparent rounded-full shrink-0" />
          )}
          <div className="min-w-0">
            <span className={`text-xs block ${currentStep.status === "failed" ? "text-red-200" : "text-violet-300"}`}>{currentStep.label}</span>
            <span className={`text-[10px] ${currentStep.status === "failed" ? "text-red-400/60" : "text-violet-400/60"}`}>{currentStep.agent} · Step {doneCount + 1}/{steps.length}</span>
          </div>
        </div>
      )}

      {/* Frame progress */}
      {(isImageGen || isVideoGen) && totalFrames > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-violet-400">{completedCount}/{totalFrames} {isImageGen ? "images" : "clips"}</span>
            <span className="text-[10px] text-violet-400/60 font-mono">{Math.round((completedCount / totalFrames) * 100)}%</span>
          </div>
          <div className="h-1 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full rounded-full bg-violet-500 transition-all duration-500" style={{ width: `${(completedCount / totalFrames) * 100}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
