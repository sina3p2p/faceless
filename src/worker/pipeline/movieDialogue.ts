import * as fs from "fs/promises";
import * as path from "path";
import { execAsync, generateTTSParallel } from "../shared";
import { TTS } from "@/lib/constants";
import { generateDialogue, type DialogueTurn } from "@/server/services/tts-dialogue";
import { emotionToVoiceSettings, type TTSResult } from "@/server/services/tts";
import type { CharacterEntry } from "@/types/pipeline";

interface DialogueScene {
  text: string;
  speaker: string | null;
  emotion: string | null;
  emotionIntensity: string | null;
}

/** Speaker → cast voice id; Narrator/empty falls back to the project voice. */
function resolveSceneVoiceId(
  scene: DialogueScene,
  voiceByName: Map<string, string>,
  fallbackVoice: string
): string {
  const speaker = scene.speaker?.trim();
  if (!speaker || speaker.toLowerCase() === "narrator") return fallbackVoice;
  return voiceByName.get(speaker.toLowerCase()) ?? fallbackVoice;
}

/** Maximal contiguous scene groups under the per-request char/turn caps. */
function groupScenes(scenes: DialogueScene[]): number[][] {
  const groups: number[][] = [];
  let current: number[] = [];
  let chars = 0;
  for (let i = 0; i < scenes.length; i++) {
    const len = scenes[i].text.length;
    const wouldOverflow =
      current.length > 0 &&
      (chars + len > TTS.dialogMaxChars ||
        current.length >= TTS.dialogMaxTurns);
    if (wouldOverflow) {
      groups.push(current);
      current = [];
      chars = 0;
    }
    current.push(i);
    chars += len;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

async function ffprobeDuration(file: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${file}"`
    );
    return parseFloat(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

/** Parse `silencedetect` stderr into [start,end] silence intervals. */
function parseSilences(log: string): Array<{ start: number; end: number }> {
  const silences: Array<{ start: number; end: number }> = [];
  const tokens = [
    ...log.matchAll(/silence_(start|end):\s*(-?[0-9.]+)/g),
  ].map((t) => ({ kind: t[1], value: parseFloat(t[2]) }));
  let pendingStart: number | null = null;
  for (const tok of tokens) {
    if (tok.kind === "start") pendingStart = tok.value;
    else if (tok.kind === "end" && pendingStart !== null) {
      silences.push({ start: pendingStart, end: tok.value });
      pendingStart = null;
    }
  }
  return silences;
}

/**
 * Split a combined dialogue audio file into one mp3 per scene.
 *
 * Primary: cut at the midpoints of the (turns-1) longest detected silences.
 * Fallback: split the duration proportionally to each scene's word count.
 * Either way per-scene `captionData` is left empty downstream so the composer
 * estimates word timing — consistent with the existing v3 degradation stance.
 */
async function sliceCombined(
  combinedPath: string,
  texts: string[],
  outPaths: string[]
): Promise<number[]> {
  const total = await ffprobeDuration(combinedPath);
  const n = texts.length;

  // No measurable audio → let the caller fall back to per-scene TTS rather
  // than emit empty slices.
  if (total <= 0) throw new Error("combined dialogue audio has no duration");

  if (n === 1) {
    await fs.copyFile(combinedPath, outPaths[0]);
    return [total];
  }

  let boundaries: number[] | null = null;

  try {
    // ffmpeg writes silencedetect lines to stderr and exits 0 for `-f null -`.
    const { stderr } = await execAsync(
      `ffmpeg -hide_banner -i "${combinedPath}" -af silencedetect=noise=-35dB:d=0.35 -f null -`
    ).catch((e: { stdout?: string; stderr?: string }) => ({
      stderr: `${e.stdout ?? ""}${e.stderr ?? ""}`,
    }));
    const internal = parseSilences(stderr ?? "")
      .filter((s) => s.start > 0.15 && s.end < total - 0.15)
      .sort((a, b) => b.end - b.start - (a.end - a.start))
      .slice(0, n - 1)
      .sort((a, b) => a.start - b.start);
    if (internal.length === n - 1) {
      boundaries = internal.map((s) => (s.start + s.end) / 2);
    }
  } catch {
    /* fall through to proportional split */
  }

  if (!boundaries) {
    const wordCounts = texts.map(
      (t) => t.split(/\s+/).filter(Boolean).length || 1
    );
    const totalWords = wordCounts.reduce((a, b) => a + b, 0);
    let acc = 0;
    boundaries = wordCounts.slice(0, -1).map((w) => {
      acc += w;
      return (acc / totalWords) * total;
    });
  }

  const cuts = [0, ...boundaries, total];
  const durations: number[] = [];
  for (let i = 0; i < n; i++) {
    const start = cuts[i];
    const end = cuts[i + 1];
    await execAsync(
      `ffmpeg -y -hide_banner -i "${combinedPath}" -ss ${start.toFixed(3)} -to ${end.toFixed(3)} ` +
        `-c:a libmp3lame -q:a 4 "${outPaths[i]}"`
    );
    durations.push(Math.max(end - start, 0.5));
  }
  return durations;
}

/**
 * Generate movie audio via the v3 Text-to-Dialogue API, grouped into
 * contiguous exchanges and sliced back to one mp3 per scene. Produces the
 * same `audioPaths[]` / `ttsResults[]` arrays (indexed by scene order) that
 * the legacy per-scene path returns, so the caller's upload loop and every
 * downstream stage are unchanged. On any per-group API failure it falls back
 * to the legacy per-scene synthesis for that group only.
 */
export async function generateMovieDialogueAudio(
  scenes: DialogueScene[],
  registry: CharacterEntry[],
  projectVoiceId: string | null | undefined,
  workDir: string
): Promise<{ audioPaths: string[]; ttsResults: TTSResult[] }> {
  const fallbackVoice = projectVoiceId || TTS.defaultVoiceId;
  const voiceByName = new Map<string, string>();
  for (const c of registry) {
    if (c.voiceId) voiceByName.set(c.canonicalName.toLowerCase(), c.voiceId);
  }

  const audioPaths: string[] = new Array(scenes.length);
  const ttsResults: TTSResult[] = new Array(scenes.length);

  const groups = groupScenes(scenes);
  console.log(
    `[movie-dialogue] ${scenes.length} scenes → ${groups.length} dialogue group(s)`
  );

  for (let g = 0; g < groups.length; g++) {
    const idxs = groups[g];
    const turns: DialogueTurn[] = idxs.map((i) => ({
      text: scenes[i].text,
      voiceId: resolveSceneVoiceId(scenes[i], voiceByName, fallbackVoice),
      emotion: scenes[i].emotion,
      emotionIntensity: scenes[i].emotionIntensity,
    }));
    const outPaths = idxs.map((i) => path.join(workDir, `audio_${i}.mp3`));

    try {
      const { audioBuffer } = await generateDialogue(turns);
      const combinedPath = path.join(workDir, `dialogue_group_${g}.mp3`);
      await fs.writeFile(combinedPath, audioBuffer);
      const durations = await sliceCombined(
        combinedPath,
        idxs.map((i) => scenes[i].text),
        outPaths
      );
      idxs.forEach((sceneIdx, k) => {
        audioPaths[sceneIdx] = outPaths[k];
        ttsResults[sceneIdx] = {
          audioBuffer: Buffer.alloc(0),
          contentType: "audio/mpeg",
          wordTimestamps: [],
        };
      });
      console.log(
        `[movie-dialogue] Group ${g}: ${idxs.length} turn(s), sliced into ${durations.length} scene(s)`
      );
    } catch (err) {
      console.warn(
        `[movie-dialogue] Group ${g} dialogue API failed (${err instanceof Error ? err.message : err}) — falling back to per-scene TTS for this group.`
      );
      const groupTexts = idxs.map((i) => scenes[i].text);
      const groupVoiceIds = idxs.map((i) =>
        resolveSceneVoiceId(scenes[i], voiceByName, fallbackVoice)
      );
      const groupSettings = idxs.map((i) => ({
        ...emotionToVoiceSettings(scenes[i].emotion, scenes[i].emotionIntensity),
        emotion: scenes[i].emotion,
        emotionIntensity: scenes[i].emotionIntensity,
      }));
      // generateTTSParallel writes group-local audio_<k>.mp3; give each
      // fallback group its own dir so files never collide across groups.
      const groupDir = path.join(workDir, `fallback_group_${g}`);
      await fs.mkdir(groupDir, { recursive: true });
      const { audioPaths: gp, ttsResults: gr } = await generateTTSParallel(
        groupTexts,
        fallbackVoice,
        groupDir,
        undefined,
        groupVoiceIds,
        groupSettings
      );
      idxs.forEach((sceneIdx, k) => {
        audioPaths[sceneIdx] = gp[k];
        ttsResults[sceneIdx] = gr[k];
      });
    }
  }

  return { audioPaths, ttsResults };
}
