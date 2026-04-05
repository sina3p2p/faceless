import { Job } from "bullmq";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { v4 as uuid } from "uuid";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { generateVideoScript } from "@/server/services/llm";
import { generateSpeech } from "@/server/services/tts";
import { getMediaForScene, type MediaAsset } from "@/server/services/media";
import {
  composeVideo,
  downloadFile,
  type ComposerScene,
} from "@/server/services/composer";
import { uploadFile } from "@/lib/storage";
import { recordUsage } from "@/lib/usage";
import type { RenderJobData } from "@/lib/queue";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client, { schema });

async function updateJobStep(
  videoProjectId: string,
  step: typeof schema.renderStepEnum.enumValues[number],
  status: typeof schema.jobStatusEnum.enumValues[number],
  progress: number
) {
  await db
    .update(schema.renderJobs)
    .set({ step, status, progress })
    .where(eq(schema.renderJobs.videoProjectId, videoProjectId));
}

async function updateVideoStatus(
  videoProjectId: string,
  status: typeof schema.videoStatusEnum.enumValues[number],
  extra?: Partial<typeof schema.videoProjects.$inferInsert>
) {
  await db
    .update(schema.videoProjects)
    .set({ status, ...extra })
    .where(eq(schema.videoProjects.id, videoProjectId));
}

export async function renderVideoJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId, userId } = job.data;
  const workDir = path.join(os.tmpdir(), `faceless-render-${uuid()}`);
  await fs.mkdir(workDir, { recursive: true });

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });

    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    // Step 1: Generate Script
    await updateVideoStatus(videoProjectId, "GENERATING_SCRIPT");
    await updateJobStep(videoProjectId, "SCRIPT", "ACTIVE", 10);
    await job.updateProgress(10);

    const topicIdeas = seriesRecord.topicIdeas as string[];
    const topicIdea =
      topicIdeas.length > 0
        ? topicIdeas[Math.floor(Math.random() * topicIdeas.length)]
        : undefined;

    const script = await generateVideoScript(
      seriesRecord.niche,
      seriesRecord.style,
      topicIdea
    );

    await db
      .update(schema.videoProjects)
      .set({
        title: script.title,
        script: JSON.stringify(script),
        duration: script.totalDuration,
      })
      .where(eq(schema.videoProjects.id, videoProjectId));

    for (let i = 0; i < script.scenes.length; i++) {
      await db.insert(schema.videoScenes).values({
        videoProjectId,
        sceneOrder: i,
        text: script.scenes[i].text,
        duration: script.scenes[i].duration,
      });
    }

    await updateJobStep(videoProjectId, "SCRIPT", "ACTIVE", 25);
    await job.updateProgress(25);

    // Step 2: Generate TTS
    await updateVideoStatus(videoProjectId, "GENERATING_ASSETS");
    await updateJobStep(videoProjectId, "TTS", "ACTIVE", 30);
    await job.updateProgress(30);

    const allText = [script.hook, ...script.scenes.map((s) => s.text), script.cta];
    const audioPaths: string[] = [];

    for (let i = 0; i < allText.length; i++) {
      const ttsResult = await generateSpeech(allText[i], {
        voiceId: seriesRecord.defaultVoiceId ?? undefined,
      });
      const audioPath = path.join(workDir, `audio_${i}.mp3`);
      await fs.writeFile(audioPath, ttsResult.audioBuffer);
      audioPaths.push(audioPath);
      await job.updateProgress(30 + Math.floor((i / allText.length) * 20));
    }

    await updateJobStep(videoProjectId, "TTS", "ACTIVE", 50);
    await job.updateProgress(50);

    // Step 3: Fetch Media
    await updateJobStep(videoProjectId, "MEDIA", "ACTIVE", 55);
    await job.updateProgress(55);

    const allVisuals = [
      script.hook,
      ...script.scenes.map((s) => s.visualDescription),
      script.cta,
    ];
    const mediaPaths: { path: string; type: "video" | "image" }[] = [];

    for (let i = 0; i < allVisuals.length; i++) {
      let asset: MediaAsset;
      try {
        asset = await getMediaForScene(allVisuals[i]);
      } catch {
        asset = {
          url: "",
          type: "image",
          source: "pexels",
          width: 1080,
          height: 1920,
        };
      }

      const ext = asset.type === "video" ? "mp4" : "jpg";
      const mediaPath = path.join(workDir, `media_${i}.${ext}`);

      if (asset.url) {
        await downloadFile(asset.url, mediaPath);
      }

      mediaPaths.push({ path: mediaPath, type: asset.type });
      await job.updateProgress(55 + Math.floor((i / allVisuals.length) * 15));
    }

    await updateJobStep(videoProjectId, "MEDIA", "ACTIVE", 70);
    await job.updateProgress(70);

    // Step 4: Compose Video
    await updateVideoStatus(videoProjectId, "RENDERING");
    await updateJobStep(videoProjectId, "COMPOSE", "ACTIVE", 75);
    await job.updateProgress(75);

    const durations = [3, ...script.scenes.map((s) => s.duration), 3];

    const composerScenes: ComposerScene[] = allText.map((text, i) => ({
      audioPath: audioPaths[i],
      mediaPath: mediaPaths[i].path,
      mediaType: mediaPaths[i].type,
      text,
      duration: durations[i],
    }));

    const outputPath = await composeVideo({
      scenes: composerScenes,
      captionStyle: seriesRecord.captionStyle,
    });

    await job.updateProgress(90);

    // Step 5: Upload to S3
    const outputBuffer = await fs.readFile(outputPath);
    const s3Key = `videos/${userId}/${videoProjectId}/output.mp4`;
    await uploadFile(s3Key, outputBuffer, "video/mp4");

    await updateVideoStatus(videoProjectId, "COMPLETED", { outputUrl: s3Key });
    await updateJobStep(videoProjectId, "DONE", "COMPLETED", 100);
    await job.updateProgress(100);

    await recordUsage(userId, "video_generated", 1, {
      videoProjectId,
      duration: script.totalDuration,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    await updateVideoStatus(videoProjectId, "FAILED");
    await db
      .update(schema.renderJobs)
      .set({ status: "FAILED", error: errorMessage })
      .where(eq(schema.renderJobs.videoProjectId, videoProjectId));
    throw error;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
