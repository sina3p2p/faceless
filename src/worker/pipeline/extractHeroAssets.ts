import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob } from "../shared";
import type { RenderJobData } from "@/lib/queue";
import { uploadFile } from "@/lib/storage";
import { generateImage } from "@/server/services/media";
import {
  extractHeroAssetPlan,
  buildHeroAssetSheetPrompt,
  aspectRatioForHeroAsset,
} from "@/server/services/ai/llm";
import { getAgentModels, mergeProjectConfig } from "./shared";
import type { HeroAssetPlan, ContinuityNotes } from "@/types/pipeline";

const STORAGE_PREFIX = "hero-assets";

export async function extractHeroAssetsJob(job: Job<RenderJobData>) {
  const { videoProjectId } = job.data;

  try {
    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
    });
    if (!videoProject) throw new Error(`Video project not found: ${videoProjectId}`);

    await updateVideoStatus(videoProjectId, "HERO_ASSET_EXTRACTION");

    const config = videoProject.config ?? {};
    if (!config.creativeBrief) throw new Error("No creative brief found");
    if (!config.continuityNotes) throw new Error("No continuity notes found — supervise-script must run first");

    // Idempotency: if any rows are already linked to this video by a previous run
    // of this stage and they're still pending, skip generation entirely.
    const existing = await db.query.videoStoryAssets.findMany({
      where: eq(schema.videoStoryAssets.videoProjectId, videoProjectId),
    });
    const existingByJob = existing.filter((r) => r.generatedByJobId);
    if (existingByJob.length > 0) {
      console.log(
        `[extract-hero-assets] ${existingByJob.length} agent-generated assets already exist for ${videoProjectId} — skipping generation`
      );
      return;
    }

    const scenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });

    const supervisorModel = getAgentModels(videoProject.modelSettings, 'supervisorModel');
    const imageModel = videoProject.modelSettings.imageModel;

    console.log(
      `[extract-hero-assets] Extracting hero asset plan for ${videoProjectId} (${scenes.length} scenes)`
    );

    const plan: HeroAssetPlan = await extractHeroAssetPlan(
      {
        script: videoProject.script ?? "",
        scenes: scenes.map((s) => ({
          sceneTitle: s.sceneTitle,
          text: s.text,
          directorNote: s.directorNote,
        })),
        brief: config.creativeBrief,
        continuity: config.continuityNotes,
        visualStyleGuide: config.visualStyleGuide,
      },
      supervisorModel
    );

    if (plan.entries.length === 0) {
      console.log(
        `[extract-hero-assets] Plan empty — no hero assets needed; skipping straight to storyboard.`
      );
      await mergeProjectConfig(videoProjectId, { heroAssetPlan: plan, heroAssetRefs: {} });
      return;
    }

    console.log(
      `[extract-hero-assets] Plan: ${plan.entries.length} entries — ${plan.entries
        .map((e) => `${e.name}(${e.type})`)
        .join(", ")}`
    );

    const heroAssetRefs: Record<string, string> = { ...(config.heroAssetRefs ?? {}) };

    for (let i = 0; i < plan.entries.length; i++) {
      const entry = plan.entries[i];
      const sheetPrompt = buildHeroAssetSheetPrompt(entry, config.visualStyleGuide);
      const aspect = aspectRatioForHeroAsset(entry.type);

      let storedKey: string | null = null;
      try {
        const result = await generateImage(sheetPrompt, imageModel!, [], aspect);
        const imgResp = await fetch(result.url);
        if (!imgResp.ok) throw new Error("Failed to download generated sheet image");
        const buffer = Buffer.from(await imgResp.arrayBuffer());
        const key = `${STORAGE_PREFIX}/${videoProjectId}/${slugify(entry.name)}_${Date.now()}.jpg`;
        await uploadFile(key, buffer, "image/jpeg");
        storedKey = key;
      } catch (err) {
        console.error(
          `[extract-hero-assets] Sheet generation failed for "${entry.name}":`,
          err instanceof Error ? err.message : err
        );
        continue;
      }

      const newAssetId = crypto.randomUUID();
      const now = new Date();
      await db.transaction(async (tx) => {
        await tx.insert(schema.storyAssets).values({
          id: newAssetId,
          userId: videoProject.userId,
          type: entry.type,
          name: entry.name,
          description: entry.description,
          url: storedKey!,
          sheetUrl: storedKey,
          createdAt: now,
          updatedAt: now,
        });
        await tx.insert(schema.videoStoryAssets).values({
          videoProjectId,
          storyAssetId: newAssetId,
          sortOrder: i,
          approvalStatus: "pending",
          generatedByJobId: job.id ?? null,
        });
      });

      entry.assetRef = newAssetId;
      entry.sheetUrl = storedKey;
      heroAssetRefs[entry.name.toLowerCase()] = newAssetId;

      await job.updateProgress(Math.round(((i + 1) / plan.entries.length) * 100));
    }

    // Backfill assetRef on continuity character/location registries by name match.
    const continuity: ContinuityNotes = {
      ...config.continuityNotes,
      characterRegistry: config.continuityNotes.characterRegistry.map((c) => ({
        ...c,
        assetRef:
          c.assetRef ??
          findAssetIdByName(plan, c.canonicalName, "character") ??
          null,
      })),
      locationRegistry: config.continuityNotes.locationRegistry.map((l) => ({
        ...l,
        assetRef:
          l.assetRef ??
          findAssetIdByName(plan, l.canonicalName, "location") ??
          null,
      })),
    };

    await mergeProjectConfig(videoProjectId, {
      heroAssetPlan: plan,
      heroAssetRefs,
      continuityNotes: continuity,
    });

    console.log(
      `[extract-hero-assets] Done. ${plan.entries.filter((e) => e.assetRef).length}/${plan.entries.length} sheets generated; awaiting user approval.`
    );
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[extract-hero-assets] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "asset";
}

function findAssetIdByName(
  plan: HeroAssetPlan,
  name: string,
  type: "character" | "location"
): string | null {
  const target = name.toLowerCase();
  const entry = plan.entries.find(
    (e) => e.type === type && e.name.toLowerCase() === target && e.assetRef
  );
  return entry?.assetRef ?? null;
}
