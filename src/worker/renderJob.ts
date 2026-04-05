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
import { generateSpeech, type WordTimestamp } from "@/server/services/tts";
import {
  getMediaForScene,
  generateImage,
  resetUsedMedia,
  type MediaAsset,
} from "@/server/services/media";
import {
  getAIVideoForScene,
  downloadAIVideo,
  uploadImageForFal,
} from "@/server/services/ai-video";
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

async function fetchFacelessMedia(
  script: Awaited<ReturnType<typeof generateVideoScript>>,
  seriesRecord: { niche: string; style: string },
  workDir: string,
  job: Job<RenderJobData>
): Promise<{ path: string; type: "video" | "image" }[]> {
  const mediaPaths: { path: string; type: "video" | "image" }[] = [];

  for (let i = 0; i < script.scenes.length; i++) {
    const scene = script.scenes[i];
    const searchQuery = scene.searchQuery || scene.visualDescription;
    const imagePrompt = scene.imagePrompt || scene.visualDescription;

    let asset: MediaAsset;
    try {
      asset = await getMediaForScene(searchQuery, imagePrompt, true);
    } catch (err) {
      console.warn(
        `Failed to get media for scene ${i}: ${err instanceof Error ? err.message : err}. Trying fallback.`
      );
      try {
        asset = await getMediaForScene(
          seriesRecord.niche,
          `A dramatic cinematic scene related to ${seriesRecord.niche}, ${seriesRecord.style} art style, moody lighting, photorealistic, no text`,
          false
        );
      } catch {
        throw new Error(
          `Could not find any media for scene ${i}. Check Pexels API key and OpenAI API key.`
        );
      }
    }

    const ext = asset.type === "video" ? "mp4" : "jpg";
    const mediaPath = path.join(workDir, `media_${i}.${ext}`);

    if (asset.url) {
      await downloadFile(asset.url, mediaPath);
    }

    console.log(`Scene ${i}: media from ${asset.source} (${asset.type})`);
    mediaPaths.push({ path: mediaPath, type: asset.type });
    await job.updateProgress(
      55 + Math.floor((i / script.scenes.length) * 15)
    );
  }

  return mediaPaths;
}

async function fetchAIVideoMedia(
  script: Awaited<ReturnType<typeof generateVideoScript>>,
  seriesRecord: { niche: string; style: string },
  workDir: string,
  job: Job<RenderJobData>
): Promise<{ path: string; type: "video" | "image" }[]> {
  const mediaPaths: { path: string; type: "video" | "image" }[] = [];
  const totalScenes = script.scenes.length;

  for (let i = 0; i < totalScenes; i++) {
    const scene = script.scenes[i];
    const imagePrompt = scene.imagePrompt || scene.visualDescription;
    const videoPrompt = `${scene.visualDescription}. Cinematic, ${seriesRecord.style} style, smooth camera motion, dramatic lighting.`;

    console.log(`Scene ${i}: Generating DALL-E image...`);

    const dalleImage = await generateImage(imagePrompt);
    if (!dalleImage) {
      throw new Error(
        `Could not generate DALL-E image for scene ${i}. Check OpenAI API key.`
      );
    }

    const imagePath = path.join(workDir, `ai_img_${i}.jpg`);
    await downloadFile(dalleImage.url, imagePath);

    console.log(`Scene ${i}: Uploading image to fal.ai...`);
    const falImageUrl = await uploadImageForFal(imagePath);

    console.log(`Scene ${i}: Generating AI video clip...`);
    const videoResult = await getAIVideoForScene(falImageUrl, videoPrompt, "5");

    const videoPath = path.join(workDir, `media_${i}.mp4`);
    await downloadAIVideo(videoResult.videoUrl, videoPath);

    console.log(`Scene ${i}: AI video clip ready`);
    mediaPaths.push({ path: videoPath, type: "video" });

    await job.updateProgress(
      55 + Math.floor(((i + 1) / totalScenes) * 15)
    );
  }

  return mediaPaths;
}

export async function renderVideoJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId, userId } = job.data;
  const workDir = path.join(os.tmpdir(), `faceless-render-${uuid()}`);
  await fs.mkdir(workDir, { recursive: true });

  resetUsedMedia();

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });

    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    const videoType = seriesRecord.videoType || "faceless";
    console.log(`Render job starting: type=${videoType}, series=${seriesId}`);

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

    // Step 2: Generate TTS with word-level timestamps
    await updateVideoStatus(videoProjectId, "GENERATING_ASSETS");
    await updateJobStep(videoProjectId, "TTS", "ACTIVE", 30);
    await job.updateProgress(30);

    const sceneTexts = script.scenes.map((s) => s.text);
    const audioPaths: string[] = [];
    const allWordTimestamps: WordTimestamp[][] = [];

    for (let i = 0; i < sceneTexts.length; i++) {
      const ttsResult = await generateSpeech(sceneTexts[i], {
        voiceId: seriesRecord.defaultVoiceId ?? undefined,
      });
      const audioPath = path.join(workDir, `audio_${i}.mp3`);
      await fs.writeFile(audioPath, ttsResult.audioBuffer);
      audioPaths.push(audioPath);
      allWordTimestamps.push(ttsResult.wordTimestamps);

      console.log(
        `Scene ${i}: TTS done, ${ttsResult.wordTimestamps.length} word timestamps`
      );
      await job.updateProgress(30 + Math.floor((i / sceneTexts.length) * 20));
    }

    await updateJobStep(videoProjectId, "TTS", "ACTIVE", 50);
    await job.updateProgress(50);

    // Step 3: Fetch Media (branching based on video type)
    await updateJobStep(videoProjectId, "MEDIA", "ACTIVE", 55);
    await job.updateProgress(55);

    let mediaPaths: { path: string; type: "video" | "image" }[];

    if (videoType === "ai_video") {
      mediaPaths = await fetchAIVideoMedia(script, seriesRecord, workDir, job);
    } else {
      mediaPaths = await fetchFacelessMedia(script, seriesRecord, workDir, job);
    }

    await updateJobStep(videoProjectId, "MEDIA", "ACTIVE", 70);
    await job.updateProgress(70);

    // Step 4: Compose Video with word-synced captions
    await updateVideoStatus(videoProjectId, "RENDERING");
    await updateJobStep(videoProjectId, "COMPOSE", "ACTIVE", 75);
    await job.updateProgress(75);

    const composerScenes: ComposerScene[] = sceneTexts.map((text, i) => ({
      audioPath: audioPaths[i],
      mediaPath: mediaPaths[i].path,
      mediaType: mediaPaths[i].type,
      text,
      duration: script.scenes[i].duration,
      wordTimestamps: allWordTimestamps[i],
    }));

    const outputPath = await composeVideo({
      scenes: composerScenes,
      captionStyle: seriesRecord.captionStyle,
    });

    await job.updateProgress(90);

    // Step 5: Upload to S3/R2
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
    console.error(`Render job failed for ${videoProjectId}:`, errorMessage);
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
