import { Job } from "bullmq";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { v4 as uuid } from "uuid";

import {
  db,
  schema,
  eq,
  insertMedia,
  updateJobStep,
  updateVideoStatus,
  resolveStoryAssets,
  reusePreApprovedAssets,
  failJob,
} from "./shared";
import {
  fetchAIVideoMediaParallel,
} from "./mediaJobs";
import { getVideoSize } from "@/lib/constants";
interface StoredMusicScript {
  sections: Array<{
    sectionName?: string;
    imagePrompt?: string;
    visualDescription?: string;
  }>;
}
import { type AlignedSection } from "@/server/services/music";
import {
  type AspectRatio,
} from "@/server/services/media";
import {
  composeVideo,
  downloadFile,
  type ComposerScene,
} from "@/server/services/composer";
import { uploadFile, getSignedDownloadUrl } from "@/lib/storage";
import { recordUsage } from "@/lib/usage";
import type { RenderJobData } from "@/lib/queue";

export async function rerenderVideoJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId, userId } = job.data;
  const workDir = path.join(os.tmpdir(), `faceless-rerender-${uuid()}`);
  await fs.mkdir(workDir, { recursive: true });

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    const scenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });

    if (scenes.length === 0) throw new Error("No scenes to re-render");

    console.log(`Re-render starting: ${scenes.length} scenes for ${videoProjectId}`);
    await updateVideoStatus(videoProjectId, "RENDERING");
    await job.updateProgress(10);

    const composerScenes: ComposerScene[] = await Promise.all(
      scenes.map(async (scene, i) => {
        const mediaKey = scene.videoUrl || scene.assetUrl || scene.imageUrl;
        const hasVideo = !!scene.videoUrl || scene.assetType === "video";
        const ext = hasVideo ? "mp4" : "jpg";
        const audioPath = path.join(workDir, `audio_${i}.mp3`);
        const mediaPath = path.join(workDir, `media_${i}.${ext}`);

        const [audioUrl, mediaUrl] = await Promise.all([
          scene.audioUrl ? getSignedDownloadUrl(scene.audioUrl) : null,
          mediaKey ? getSignedDownloadUrl(mediaKey) : null,
        ]);

        if (audioUrl) await downloadFile(audioUrl, audioPath);
        if (mediaUrl) await downloadFile(mediaUrl, mediaPath);

        return {
          audioPath,
          mediaPath,
          mediaType: (hasVideo ? "video" : "image") as "video" | "image",
          text: scene.text,
          duration: scene.duration ?? 5,
          wordTimestamps: (scene.captionData as { word: string; start: number; end: number }[]) || [],
        };
      })
    );

    await job.updateProgress(50);

    const sizeConfig = getVideoSize(seriesRecord.videoSize);
    const outputPath = await composeVideo({
      scenes: composerScenes,
      captionStyle: seriesRecord.captionStyle,
      sceneContinuity: !!seriesRecord.sceneContinuity,
      videoWidth: sizeConfig.width,
      videoHeight: sizeConfig.height,
    });

    await job.updateProgress(85);

    const outputBuffer = await fs.readFile(outputPath);
    const s3Key = `videos/${userId}/${videoProjectId}/output.mp4`;
    await uploadFile(s3Key, outputBuffer, "video/mp4");

    const totalDuration = composerScenes.reduce((s, sc) => s + sc.duration, 0);
    await db
      .update(schema.videoProjects)
      .set({ duration: Math.round(totalDuration) })
      .where(eq(schema.videoProjects.id, videoProjectId));

    await updateVideoStatus(videoProjectId, "COMPLETED", { outputUrl: s3Key });
    await job.updateProgress(100);
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`Re-render failed for ${videoProjectId}:`, msg);
    throw error;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => { });
  }
}

export async function renderMusicVideoJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId, userId } = job.data;
  const workDir = path.join(os.tmpdir(), `faceless-music-${uuid()}`);
  await fs.mkdir(workDir, { recursive: true });


  try {
    const seriesRecordRaw = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecordRaw) throw new Error(`Series not found: ${seriesId}`);

    const storyAssetsMV = await resolveStoryAssets(
      seriesRecordRaw.storyAssets as Array<{ id: string; type: "character" | "location" | "prop"; name: string; description: string; url: string }> | null,
      seriesRecordRaw.characterImages as Array<{ url: string; description: string }> | null
    );
    const seriesRecord = { ...seriesRecordRaw, storyAssets: storyAssetsMV };

    const existingScenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });

    if (existingScenes.length === 0) throw new Error("No scenes to render");

    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
      columns: { script: true, config: true },
    });

    const musicScript: StoredMusicScript | null = videoProject?.script ? JSON.parse(videoProject.script) : null;
    if (!musicScript) throw new Error("No music script found");

    const videoConfig = (videoProject?.config ?? {}) as Record<string, unknown>;
    const songKey = videoConfig.songUrl as string | undefined;
    const songSourceUrl = videoConfig.songSourceUrl as string | undefined;
    const storedAlignedSections = videoConfig.alignedSections as AlignedSection[] | null;

    if (!songKey && !songSourceUrl) throw new Error("No pre-generated song found. Generate the song first.");

    console.log(`Music video render starting: ${existingScenes.length} sections (using pre-generated song)`);

    await updateVideoStatus(videoProjectId, "VIDEO_GENERATION");
    await updateJobStep(videoProjectId, "MEDIA", "ACTIVE", 10);
    await job.updateProgress(10);

    const songPath = path.join(workDir, "full_song.mp3");
    const songUrl = songKey
      ? await getSignedDownloadUrl(songKey)
      : songSourceUrl!;
    await downloadFile(songUrl, songPath);

    console.log(`[music] Song loaded from storage`);
    await job.updateProgress(15);

    const actualDurationsSec = existingScenes.map((s) => s.duration ?? 5);

    await updateJobStep(videoProjectId, "MEDIA", "ACTIVE", 20);

    const { images: preImages, videos: preVideos } = await reusePreApprovedAssets(existingScenes, workDir);

    const sceneScript = {
      scenes: existingScenes.map((s, i) => ({
        text: s.text,
        visualDescription: s.visualDescription || musicScript.sections[i]?.visualDescription || s.text,
        searchQuery: s.searchQuery || musicScript.sections[i]?.sectionName || "cinematic",
        imagePrompt: s.imagePrompt || musicScript.sections[i]?.imagePrompt || s.text,
        assetRefs: (s.assetRefs as string[]) ?? [],
        duration: actualDurationsSec[i],
      })),
      sceneAssetRefs: existingScenes.map((s) => (s.assetRefs as string[] | null) ?? null),
    };

    const sizeConfig = getVideoSize(seriesRecord.videoSize);
    const ar = sizeConfig.id as AspectRatio;

    const mediaPaths = await fetchAIVideoMediaParallel(sceneScript, seriesRecord, workDir, undefined, preImages, preVideos, ar);

    await job.updateProgress(65);

    await Promise.all(
      existingScenes.map(async (scene, i) => {
        const mediaBuffer = await fs.readFile(mediaPaths[i].path);
        const mediaExt = mediaPaths[i].type === "video" ? "mp4" : "jpg";
        const mediaMime = mediaPaths[i].type === "video" ? "video/mp4" : "image/jpeg";
        const mediaKey = `scenes/${videoProjectId}/media_${i}.${mediaExt}`;
        await uploadFile(mediaKey, mediaBuffer, mediaMime);

        const isVideo = mediaPaths[i].type === "video";
        const model = seriesRecord.imageModel || "dall-e-3";

        await db
          .update(schema.videoScenes)
          .set({
            assetUrl: mediaKey,
            assetType: mediaPaths[i].type,
            [isVideo ? "videoUrl" : "imageUrl"]: mediaKey,
            modelUsed: model,
          })
          .where(eq(schema.videoScenes.id, scene.id));

        await insertMedia({ sceneId: scene.id }, isVideo ? "video" : "image", mediaKey, scene.imagePrompt, model);
      })
    );

    await job.updateProgress(70);

    await updateVideoStatus(videoProjectId, "RENDERING");
    await updateJobStep(videoProjectId, "COMPOSE", "ACTIVE", 75);

    const composerScenes: ComposerScene[] = existingScenes.map((scene, i) => ({
      audioPath: songPath,
      mediaPath: mediaPaths[i].path,
      mediaType: mediaPaths[i].type,
      text: scene.text.split("\n").join(" "),
      duration: actualDurationsSec[i],
      wordTimestamps: storedAlignedSections?.[i]?.wordTimestamps || (scene.captionData as ComposerScene["wordTimestamps"]) || [],
    }));

    const outputPath = await composeVideo({
      scenes: composerScenes,
      captionStyle: seriesRecord.captionStyle,
      globalAudioPath: songPath,
      sceneContinuity: !!seriesRecord.sceneContinuity,
      videoWidth: sizeConfig.width,
      videoHeight: sizeConfig.height,
    });

    await job.updateProgress(90);

    const outputBuffer = await fs.readFile(outputPath);
    const s3Key = `videos/${userId}/${videoProjectId}/output.mp4`;
    await uploadFile(s3Key, outputBuffer, "video/mp4");

    const totalDuration = composerScenes.reduce((s, sc) => s + sc.duration, 0);
    await db
      .update(schema.videoProjects)
      .set({ duration: Math.round(totalDuration) })
      .where(eq(schema.videoProjects.id, videoProjectId));

    await updateVideoStatus(videoProjectId, "COMPLETED", { outputUrl: s3Key });
    await updateJobStep(videoProjectId, "DONE", "COMPLETED", 100);
    await job.updateProgress(100);

    await recordUsage(userId, "video_generated", 1, {
      videoProjectId,
      duration: totalDuration,
    });
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`Music video render failed for ${videoProjectId}:`, msg);
    throw error;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => { });
  }
}
