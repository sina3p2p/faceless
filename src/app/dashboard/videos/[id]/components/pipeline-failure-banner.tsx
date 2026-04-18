"use client";

import { Button } from "@/components/ui/button";
import { ActivityFeed } from "./activity-feed";
import type { Scene, VideoDetail } from "../types";
import { inferResumeJobFromVideoStatus } from "@/lib/infer-resume-job";
import {
  canShowResumeForVideo,
  hasPipelineRenderFailure,
  pipelineJobDisplayName,
} from "@/lib/pipeline-resume";

type VideoWithJobs = VideoDetail & {
  renderJobs?: Array<{ error: string | null; status?: string }>;
};

export function PipelineFailureBanner({
  video,
  scenes,
  onResume,
  resuming,
}: {
  video: VideoWithJobs;
  scenes: Scene[];
  onResume: () => void;
  resuming: boolean;
}) {
  const err = video.renderJobs?.[0]?.error;
  const canResume = canShowResumeForVideo(video);
  const rj0 = video.renderJobs?.[0];
  const inferredJob =
    inferResumeJobFromVideoStatus(video.status, { hasSceneFrames: true, renderJobStep: rj0?.step }) ??
    inferResumeJobFromVideoStatus(video.status, { hasSceneFrames: false, renderJobStep: rj0?.step });
  const feedStatus = video.status;

  return (
    <div className="mb-6 space-y-4">
      <div className="rounded-xl border border-red-500/25 bg-red-950/35 px-4 py-4">
        <p className="text-sm font-medium text-red-100 mb-1">Pipeline stopped</p>
        <p className="text-xs text-red-200/80 mb-3">
          {hasPipelineRenderFailure(video.renderJobs?.[0]) && inferredJob
            ? `Failed during: ${pipelineJobDisplayName(inferredJob)} · ${video.status.replace(/_/g, " ")}`
            : "Use Retry on the series page to start over from the beginning."}
        </p>
        {err && (
          <pre className="text-[11px] text-red-200/90 font-mono whitespace-pre-wrap wrap-break-word bg-black/20 rounded-lg px-3 py-2 mb-3 max-h-40 overflow-y-auto">
            {err}
          </pre>
        )}
        {canResume ? (
          <Button variant="primary" size="sm" loading={resuming} onClick={onResume}>
            Resume from this step
          </Button>
        ) : (
          <p className="text-xs text-gray-500">
            Use <span className="text-gray-400">Start over</span> on the series page to run the pipeline from the beginning.
          </p>
        )}
      </div>
      {feedStatus && (
        <ActivityFeed currentStatus={feedStatus} scenes={scenes} highlightFailedStep />
      )}
    </div>
  );
}
