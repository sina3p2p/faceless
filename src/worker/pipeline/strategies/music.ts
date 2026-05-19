import * as fs from "fs/promises";
import * as path from "path";
import { db, schema, eq } from "../../shared";
import { generateMusicLyrics } from "@/server/services/ai/llm";
import {
  generateSong,
  transcribeSong,
  alignLyricsToTranscription,
} from "@/server/services/music";
import { uploadFile, mediaUrl } from "@/lib/storage";
import { downloadFile } from "@/server/services/composer";
import { StandaloneStrategy } from "./standalone";
import type {
  SplitStageInput,
  StoryStageInput,
  StoryStageResult,
  TtsStageInput,
  ComposeAudioInput,
} from "./types";
import type { VideoType } from "../topology";

/** Lyrics-driven; a single generated song is the audio bed for the whole video. */
export class MusicStrategy extends StandaloneStrategy {
  readonly videoType: VideoType = "music_video";

  async generateStory(input: StoryStageInput): Promise<StoryStageResult> {
    const { project, topicIdea, config, storyModel, researchPack } = input;
    const preferred = config.duration?.preferred ?? 60;
    const song = await generateMusicLyrics({
      style: project.style,
      topicIdea,
      language: project.language ?? undefined,
      model: storyModel,
      musicGenreStyle: config.musicGenre,
      researchPack,
      targetDurationSec: preferred,
    });
    console.log(
      `[generate-story] Music lyrics ready: "${song.title}" (${song.lyrics.length} chars body)`
    );
    return { title: song.title, script: song.lyrics };
  }

  protected storyInputForDirector(input: SplitStageInput): string {
    const { project } = input;
    return `# ${project.title}\n\nGenre: ${project.config!.musicGenre!}\n\n${project.script!.trim()}`;
  }

  async runTts(input: TtsStageInput): Promise<void> {
    const { project, scenes, workDir, videoProjectId } = input;
    const projectConfig = project.config ?? {};
    const genre = projectConfig.musicGenre?.trim() || "pop, catchy";
    const title = project.title ?? "Untitled";
    const lyrics = project.script!.trim();
    const targetDurationSec = projectConfig.duration?.preferred;

    console.log(
      `[generate-tts] Music mode: generating song "${title}" (${genre}), ${lyrics.length} chars of lyrics${targetDurationSec ? `, target ~${targetDurationSec}s` : ""}`
    );

    const songResult = await generateSong(title, genre, lyrics, targetDurationSec);

    const songPath = path.join(workDir, "song.mp3");
    await downloadFile(songResult.audioUrl, songPath);
    const songBuffer = await fs.readFile(songPath);
    const songKey = `scenes/${videoProjectId}/song_${Date.now()}.mp3`;
    await uploadFile(songKey, songBuffer, "audio/mpeg");

    const whisperWords = await transcribeSong(songResult.audioUrl);
    const totalDurationMs = Math.round(songResult.duration * 1000);
    const alignedSections = alignLyricsToTranscription(scenes, whisperWords, totalDurationMs);

    await db
      .update(schema.videoProjects)
      .set({
        duration: Math.round(songResult.duration),
        config: { ...projectConfig, songUrl: songKey, alignedSections },
      })
      .where(eq(schema.videoProjects.id, videoProjectId));

    for (const [index, scene] of scenes.entries()) {
      const aligned = alignedSections[index];
      if (!aligned) continue;
      const durationSec = Math.ceil((aligned.endMs - aligned.startMs) / 1000);

      await db
        .update(schema.videoScenes)
        .set({
          audioUrl: songKey,
          captionData: aligned.wordTimestamps,
          duration: durationSec,
        })
        .where(eq(schema.videoScenes.id, scene.id));

      console.log(`[generate-tts] Section ${index} (${scene.sceneTitle}): ${durationSec}s`);
    }

    console.log(
      `[generate-tts] Song generated and aligned (${alignedSections.length} sections, ${songResult.duration.toFixed(1)}s total)`
    );
  }

  async resolveGlobalAudio(input: ComposeAudioInput): Promise<string | undefined> {
    const songKey = input.config.songUrl;
    if (!songKey) return undefined;
    const globalAudioPath = path.join(input.workDir, "global_song.mp3");
    await downloadFile(mediaUrl(songKey), globalAudioPath);
    return globalAudioPath;
  }
}
