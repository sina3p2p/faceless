/**
 * Shared per-scene audio persistence tail used by the standalone and movie
 * TTS strategies (the music strategy persists differently — one global song
 * with aligned sections — so it does not use this).
 */

import * as fs from "fs/promises";
import { db, schema, eq, execAsync } from "../../shared";
import { uploadFile } from "@/lib/storage";
import type { TTSResult } from "@/server/services/tts";

type VideoSceneRow = typeof schema.videoScenes.$inferSelect;

export async function persistPerSceneAudio(
  videoProjectId: string,
  scenes: VideoSceneRow[],
  audioPaths: string[],
  ttsResults: TTSResult[]
): Promise<void> {
  for (const [index, scene] of scenes.entries()) {
    const audioBuffer = await fs.readFile(audioPaths[index]);
    const audioKey = `scenes/${videoProjectId}/audio_${scene.id}_${Date.now()}.mp3`;
    await uploadFile(audioKey, audioBuffer, "audio/mpeg");

    let durationSec = 5;
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of csv=p=0 "${audioPaths[index]}"`
      );
      durationSec = Math.ceil(parseFloat(stdout.trim()) || 5);
    } catch {
      /* fallback to 5s */
    }

    await db
      .update(schema.videoScenes)
      .set({
        audioUrl: audioKey,
        captionData: ttsResults[index].wordTimestamps,
        duration: durationSec,
      })
      .where(eq(schema.videoScenes.id, scene.id));

    console.log(`[generate-tts] Scene ${index}: ${durationSec}s audio uploaded`);
  }

  console.log(`[generate-tts] All TTS complete`);
}
