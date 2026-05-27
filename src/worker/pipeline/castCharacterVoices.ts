import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob, resolveStoryAssets } from "../shared";
import type { RenderJobData } from "@/lib/queue";
import { listVoices } from "@/server/services/tts";
import { TTS } from "@/lib/constants";
import { mergeProjectConfig } from "./shared";
import type { CharacterEntry } from "@/types/pipeline";
import type { StoryAssetInput } from "@/types/worker";

/**
 * Assign a distinct TTS voice to every character so a movie sounds cast, not
 * read by one narrator. User-provided character assets keep their chosen voice;
 * the rest are picked from the ElevenLabs library, gender-matched when possible,
 * avoiding the project narrator/default voice.
 */
async function castCharacterVoices(
  registry: CharacterEntry[],
  userAssets: StoryAssetInput[],
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

export async function castCharacterVoicesJob(job: Job<RenderJobData>) {
  const { videoProjectId } = job.data;
  try {
    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
    });
    if (!videoProject) throw new Error(`Video project not found: ${videoProjectId}`);

    await updateVideoStatus(videoProjectId, "SCRIPT_SUPERVISION");

    const continuityNotes = videoProject.config?.continuityNotes;
    if (!continuityNotes) throw new Error("No continuity notes — run supervise-script first");

    const assets = await resolveStoryAssets(videoProjectId);

    const characterRegistry = await castCharacterVoices(
      continuityNotes.characterRegistry ?? [],
      assets,
      videoProject.voiceId
    );

    await mergeProjectConfig(videoProjectId, {
      continuityNotes: { ...continuityNotes, characterRegistry },
    });

    console.log(
      `[cast-character-voices] Cast ${characterRegistry.length} character voice(s) for ${videoProjectId}`
    );
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[cast-character-voices] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
