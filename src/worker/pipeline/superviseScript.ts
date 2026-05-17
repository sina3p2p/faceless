import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob, resolveStoryAssets } from "../shared";
import type { RenderJobData } from "@/lib/queue";
import { superviseScript } from "@/server/services/ai/llm";
import { countNarrationWords, estimateDurationSec } from "@/server/services/ai/llm/pacing";
import { getAgentModels, mergeProjectConfig, autoChainOrReview } from "./shared";
import { listVoices } from "@/server/services/tts";
import { TTS } from "@/lib/constants";
import type { StoryAsset } from "@/server/services/ai/llm";
import type { CharacterEntry, ContinuityNotes } from "@/types/pipeline";

export async function superviseScriptJob(job: Job<RenderJobData>) {
  const { videoProjectId } = job.data;

  try {
    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
    });
    if (!videoProject) throw new Error(`Video project not found: ${videoProjectId}`);

    await updateVideoStatus(videoProjectId, "SCRIPT_SUPERVISION");

    const config = videoProject.config ?? {};
    if (!config.creativeBrief) throw new Error("No creative brief found — run executive-produce first");

    const existingScenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });
    if (existingScenes.length === 0) throw new Error("No scenes to supervise");

    const assets = await resolveStoryAssets(videoProjectId);

    const supervisorModel = getAgentModels(videoProject.modelSettings, 'supervisorModel');

    console.log(`[supervise-script] Supervising ${existingScenes.length} scenes for ${videoProjectId}`);

    const result = await superviseScript(
      existingScenes,
      config.creativeBrief,
      assets,
      supervisorModel
    );

    const continuityNotes: ContinuityNotes =
      videoProject.videoType === "movie"
        ? {
            ...result.continuityNotes,
            characterRegistry: await castCharacterVoices(
              result.continuityNotes.characterRegistry,
              assets,
              videoProject.voiceId
            ),
          }
        : result.continuityNotes;

    await db.delete(schema.videoScenes).where(eq(schema.videoScenes.videoProjectId, videoProjectId));

    await db.insert(schema.videoScenes).values(result.scenes.map((s, i) => {
      const baseNote = s.directorNote.replace(/^\[Scene function:[^\]]*\]\s*/i, "");
      const surpriseLine = s.surpriseInjection ? `\n[Surprise injection: ${s.surpriseInjection}]` : "";
      const imageabilityScore = Math.min(5, Math.max(1, Math.round(s.imageabilityScore)));
      return {
        videoProjectId,
        sceneOrder: i,
        sceneTitle: s.sceneTitle,
        speaker: s.speaker ?? null,
        directorNote: `[Scene function: ${s.sceneFunction}]\n${baseNote}${surpriseLine}`,
        text: s.text,
        estimatedDurationSec: estimateDurationSec(
          countNarrationWords(s.text),
          s.voicePace ?? "standard"
        ),
        imageabilityScore,
      };
    }));

    await mergeProjectConfig(videoProjectId, { continuityNotes });

    console.log(`[supervise-script] Supervised: ${result.scenes.length} scenes, ${continuityNotes.characterRegistry.length} characters, ${continuityNotes.locationRegistry.length} locations`);

    await autoChainOrReview(videoProjectId, "REVIEW_STORY", "generate-tts");
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[supervise-script] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}

/**
 * Assign a distinct TTS voice to every character so a movie sounds cast, not
 * read by one narrator. User-provided character assets keep their chosen voice;
 * the rest are picked from the ElevenLabs library, gender-matched to
 * voiceProfile when possible, avoiding the project narrator/default voice.
 * Runs at supervisor stage because generate-tts executes before hero-asset
 * generation, so this is the earliest point the character registry exists.
 */
async function castCharacterVoices(
  registry: CharacterEntry[],
  userAssets: StoryAsset[],
  projectVoiceId: string | null | undefined
): Promise<CharacterEntry[]> {
  const narratorVoice = projectVoiceId || TTS.defaultVoiceId;

  const userVoiceByName = new Map<string, string>();
  for (const a of userAssets) {
    if (a.type === "character" && a.voiceId) {
      userVoiceByName.set(a.name.toLowerCase(), a.voiceId);
    }
  }

  const pool = await listVoices();
  const taken = new Set<string>([narratorVoice, ...userVoiceByName.values()]);
  const assignable = pool.filter((v) => !taken.has(v.id));

  const used = new Set<string>();
  const pickFromPool = (profile: CharacterEntry["voiceProfile"]): string => {
    if (assignable.length === 0) return narratorVoice;
    const gendered =
      profile === "male" || profile === "female"
        ? assignable.filter((v) => v.gender === profile)
        : [];
    const candidates = gendered.length > 0 ? gendered : assignable;
    const fresh = candidates.find((v) => !used.has(v.id));
    const chosen = fresh ?? candidates[used.size % candidates.length];
    used.add(chosen.id);
    return chosen.id;
  };

  return registry.map((c) => {
    const userVoice = userVoiceByName.get(c.canonicalName.toLowerCase());
    return { ...c, voiceId: userVoice ?? pickFromPool(c.voiceProfile ?? null) };
  });
}
