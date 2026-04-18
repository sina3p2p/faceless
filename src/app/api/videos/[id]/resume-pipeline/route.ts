import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, videoScenes, sceneFrames, renderJobs } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { renderQueue } from "@/lib/queue";
import { count, desc, eq } from "drizzle-orm";
import {
  hasPipelineRenderFailure,
  inferResumeJobFromVideoStatus,
  isResumablePipelineJob,
  pipelineJobDisplayName,
  resumeRequiresSeriesId,
} from "@/lib/pipeline-resume";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const video = await db.query.videoProjects.findFirst({
    where: eq(videoProjects.id, id),
    with: {
      series: { columns: { userId: true } },
      renderJobs: { orderBy: desc(renderJobs.createdAt), limit: 1 },
    },
  });

  if (!video || video.userId !== user.id) return notFound("Video not found");

  const rj = video.renderJobs?.[0];
  if (!hasPipelineRenderFailure(rj)) {
    return badRequest("No failed pipeline job to resume.");
  }

  const [{ value: frameRowCount }] = await db
    .select({ value: count() })
    .from(sceneFrames)
    .innerJoin(videoScenes, eq(sceneFrames.sceneId, videoScenes.id))
    .where(eq(videoScenes.videoProjectId, id));

  const hasSceneFrames = frameRowCount > 0;
  const jobName = inferResumeJobFromVideoStatus(video.status, {
    hasSceneFrames,
    renderJobStep: rj?.step,
  });

  if (!jobName || !isResumablePipelineJob(jobName)) {
    return badRequest(
      "Could not infer which step to resume from the current status. Use Retry on the series page to start over."
    );
  }

  if (resumeRequiresSeriesId(jobName) && !video.seriesId) {
    return badRequest(
      `Cannot resume “${pipelineJobDisplayName(jobName)}” without a series. Use Retry to start over.`
    );
  }

  const seriesId = video.seriesId ?? "";

  await db
    .update(renderJobs)
    .set({ status: "QUEUED", error: null, progress: 0 })
    .where(eq(renderJobs.videoProjectId, id));

  const payload = { videoProjectId: id, userId: user.id, seriesId };

  await renderQueue.add(jobName, payload);

  return NextResponse.json({ resumed: true, jobName });
}
