/**
 * Resume the pipeline when a human clears a review gate. The next job is
 * resolved from the declarative topology (not hardcoded per endpoint), so e.g.
 * clearing REVIEW_IMAGES on a timelapse correctly skips the motion stage.
 */

import { db } from "@/server/db";
import { videoProjects } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { renderQueue } from "@/lib/queue";
import {
  resolveVideoType,
  stepAfterGate,
  type ReviewGateStatus,
} from "@/worker/pipeline/topology";

export async function enqueueAfterReviewGate(
  videoProjectId: string,
  reviewStatus: ReviewGateStatus,
  extra: Record<string, unknown> = {}
): Promise<string | null> {
  const project = await db.query.videoProjects.findFirst({
    where: eq(videoProjects.id, videoProjectId),
    columns: { videoType: true, config: true },
  });
  if (!project) return null;

  const job = stepAfterGate(
    {
      videoType: resolveVideoType(project.videoType),
      config: project.config ?? {},
    },
    reviewStatus
  );
  if (!job) return null;

  await renderQueue.add(job, { videoProjectId, ...extra });
  return job;
}
