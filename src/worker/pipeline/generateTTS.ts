import { Job } from "bullmq";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { v4 as uuid } from "uuid";
import { db, schema, eq, updateVideoStatus, failJob } from "../shared";
import type { RenderJobData } from "@/lib/queue";
import { getStrategy } from "./strategies";

export async function generateTTSJob(job: Job<RenderJobData>) {
  const { videoProjectId } = job.data;
  const workDir = path.join(os.tmpdir(), `faceless-tts-${uuid()}`);
  await fs.mkdir(workDir, { recursive: true });

  try {
    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
    });
    if (!videoProject) throw new Error(`Video project not found: ${videoProjectId}`);

    await updateVideoStatus(videoProjectId, "TTS_GENERATION");

    const scenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });
    if (scenes.length === 0) throw new Error("No scenes for audio generation");

    await getStrategy(videoProject.videoType).runTts({
      videoProjectId,
      project: videoProject,
      scenes,
      workDir,
    });
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[generate-tts] Failed for ${videoProjectId}:`, msg);
    throw error;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => { });
  }
}
