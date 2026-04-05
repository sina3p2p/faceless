import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { v4 as uuid } from "uuid";
import { VIDEO_DEFAULTS } from "@/lib/constants";
import type { WordTimestamp } from "@/server/services/tts";

const execAsync = promisify(exec);

export interface ComposerScene {
  audioPath: string;
  mediaPath: string;
  mediaType: "video" | "image";
  text: string;
  duration: number;
  wordTimestamps: WordTimestamp[];
}

export interface ComposerOptions {
  scenes: ComposerScene[];
  captionStyle: string;
  backgroundMusicPath?: string;
  outputFormat?: string;
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download: ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(dest, buffer);
}

async function getAudioDuration(audioPath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${audioPath}"`
    );
    const duration = parseFloat(stdout.trim());
    return isNaN(duration) ? 5 : duration;
  } catch {
    return 5;
  }
}

async function getMediaDuration(mediaPath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${mediaPath}"`
    );
    const duration = parseFloat(stdout.trim());
    return isNaN(duration) ? 0 : duration;
  } catch {
    return 0;
  }
}

function escapeAss(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");
}

interface CaptionStyleConfig {
  primaryColor: string;
  highlightColor: string;
  outlineColor: string;
  fontSize: number;
  outline: number;
  shadow: number;
  bold: boolean;
}

function getCaptionStyle(style: string): CaptionStyleConfig {
  const styles: Record<string, CaptionStyleConfig> = {
    default: {
      primaryColor: "&H00FFFFFF",
      highlightColor: "&H0000FFFF",
      outlineColor: "&H00000000",
      fontSize: 22,
      outline: 3,
      shadow: 2,
      bold: true,
    },
    bold: {
      primaryColor: "&H0000FFFF",
      highlightColor: "&H000080FF",
      outlineColor: "&H00000000",
      fontSize: 26,
      outline: 4,
      shadow: 3,
      bold: true,
    },
    typewriter: {
      primaryColor: "&H00FFFFFF",
      highlightColor: "&H0000FF00",
      outlineColor: "&H00000000",
      fontSize: 20,
      outline: 2,
      shadow: 1,
      bold: false,
    },
    neon: {
      primaryColor: "&H00FFFF00",
      highlightColor: "&H00FF00FF",
      outlineColor: "&H00663300",
      fontSize: 24,
      outline: 3,
      shadow: 0,
      bold: true,
    },
  };
  return styles[style] || styles.default;
}

function groupWords(words: WordTimestamp[], wordsPerGroup: number): { text: string; start: number; end: number }[] {
  const groups: { text: string; start: number; end: number }[] = [];
  for (let i = 0; i < words.length; i += wordsPerGroup) {
    const chunk = words.slice(i, i + wordsPerGroup);
    groups.push({
      text: chunk.map((w) => w.word).join(" "),
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end,
    });
  }
  return groups;
}

function estimateWordTimestamps(text: string, duration: number): WordTimestamp[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const wordDuration = duration / words.length;
  return words.map((word, i) => ({
    word,
    start: i * wordDuration,
    end: (i + 1) * wordDuration,
  }));
}

function generateAssSubtitles(
  scenes: ComposerScene[],
  style: CaptionStyleConfig,
  sceneDurations: number[]
): string {
  const W = VIDEO_DEFAULTS.width;
  const H = VIDEO_DEFAULTS.height;

  let header = `[Script Info]
Title: Faceless Captions
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: WordCaption,Arial,${style.fontSize},${style.primaryColor},${style.highlightColor},${style.outlineColor},&H80000000,${style.bold ? -1 : 0},0,0,0,100,100,0,0,1,${style.outline},${style.shadow},2,40,40,${Math.round(H * 0.2)},1
Style: HighlightCaption,Arial,${Math.round(style.fontSize * 1.15)},${style.highlightColor},${style.primaryColor},${style.outlineColor},&H80000000,-1,0,0,0,100,100,0,0,1,${style.outline + 1},${style.shadow},2,40,40,${Math.round(H * 0.2)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  let timeOffset = 0;

  for (let si = 0; si < scenes.length; si++) {
    const scene = scenes[si];
    const duration = sceneDurations[si];

    const timestamps = scene.wordTimestamps.length > 0
      ? scene.wordTimestamps
      : estimateWordTimestamps(scene.text, duration);

    const groups = groupWords(timestamps, 3);

    for (const group of groups) {
      const absStart = timeOffset + group.start;
      const absEnd = timeOffset + group.end;

      const startStr = formatAssTime(absStart);
      const endStr = formatAssTime(absEnd);

      const escaped = escapeAss(group.text.toUpperCase());

      header += `Dialogue: 0,${startStr},${endStr},HighlightCaption,,0,0,0,,${escaped}\n`;
    }

    timeOffset += duration;
  }

  return header;
}

function formatAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export async function composeVideo(
  options: ComposerOptions
): Promise<string> {
  const { scenes, captionStyle, backgroundMusicPath } = options;
  const workDir = path.join(os.tmpdir(), `faceless-${uuid()}`);
  await fs.mkdir(workDir, { recursive: true });
  const W = VIDEO_DEFAULTS.width;
  const H = VIDEO_DEFAULTS.height;
  const FPS = VIDEO_DEFAULTS.fps;

  try {
    const scenePaths: string[] = [];
    const sceneDurations: number[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const sceneOutput = path.join(workDir, `scene_${i}.mp4`);

      const audioDuration = await getAudioDuration(scene.audioPath);
      const duration = Math.max(audioDuration + 0.5, 2);
      sceneDurations.push(duration);

      const fadeOutStart = Math.max(0, duration - 0.4);

      if (scene.mediaType === "video") {
        const videoDuration = await getMediaDuration(scene.mediaPath);
        const needsLoop = videoDuration > 0 && videoDuration < duration;

        const videoFilter = [
          `scale=${W}:${H}:force_original_aspect_ratio=increase`,
          `crop=${W}:${H}`,
          `setsar=1`,
          `fps=${FPS}`,
          `fade=t=in:st=0:d=0.3,fade=t=out:st=${fadeOutStart}:d=0.4`,
        ].join(",");

        const loopFlag = needsLoop ? `-stream_loop -1` : "";

        await execAsync(
          `ffmpeg -y ${loopFlag} -i "${scene.mediaPath}" -i "${scene.audioPath}" ` +
            `-filter_complex "[0:v]${videoFilter}[outv];[1:a]aresample=44100[outa]" ` +
            `-map "[outv]" -map "[outa]" ` +
            `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p ` +
            `-c:a aac -b:a 192k -ar 44100 ` +
            `-t ${duration} "${sceneOutput}"`
        );
      } else {
        const totalFrames = Math.ceil(duration * FPS);
        const effects = [
          { zoom: `min(zoom+0.0008,1.2)`, x: `iw/2-(iw/zoom/2)`, y: `ih/2-(ih/zoom/2)` },
          { zoom: `if(eq(on,1),1.2,max(zoom-0.0008,1.0))`, x: `iw/2-(iw/zoom/2)`, y: `ih/2-(ih/zoom/2)` },
          { zoom: `min(zoom+0.0006,1.15)`, x: `iw/4-(iw/zoom/4)`, y: `ih/2-(ih/zoom/2)` },
          { zoom: `min(zoom+0.0007,1.18)`, x: `iw*3/4-(iw/zoom*3/4)`, y: `ih/3-(ih/zoom/3)` },
        ];
        const effect = effects[i % effects.length];

        const imageFilter = [
          `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase`,
          `crop=${W * 2}:${H * 2}`,
          `setsar=1`,
          `zoompan=z='${effect.zoom}':x='${effect.x}':y='${effect.y}':d=${totalFrames}:s=${W}x${H}:fps=${FPS}`,
          `fade=t=in:st=0:d=0.3,fade=t=out:st=${fadeOutStart}:d=0.4`,
        ].join(",");

        await execAsync(
          `ffmpeg -y -loop 1 -i "${scene.mediaPath}" -i "${scene.audioPath}" ` +
            `-filter_complex "[0:v]${imageFilter}[outv];[1:a]aresample=44100[outa]" ` +
            `-map "[outv]" -map "[outa]" ` +
            `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p ` +
            `-c:a aac -b:a 192k -ar 44100 ` +
            `-t ${duration} "${sceneOutput}"`
        );
      }

      scenePaths.push(sceneOutput);
    }

    const rawConcat = path.join(workDir, "raw_concat.mp4");

    if (scenePaths.length === 1) {
      await fs.copyFile(scenePaths[0], rawConcat);
    } else {
      const concatList = path.join(workDir, "concat.txt");
      const concatContent = scenePaths.map((p) => `file '${p}'`).join("\n");
      await fs.writeFile(concatList, concatContent);

      await execAsync(
        `ffmpeg -y -f concat -safe 0 -i "${concatList}" ` +
          `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p ` +
          `-c:a aac -b:a 192k "${rawConcat}"`
      );
    }

    const styleConfig = getCaptionStyle(captionStyle);
    const assContent = generateAssSubtitles(scenes, styleConfig, sceneDurations);
    const assPath = path.join(workDir, "captions.ass");
    await fs.writeFile(assPath, assContent);

    const withCaptions = path.join(workDir, "with_captions.mp4");
    const assPathEscaped = assPath.replace(/'/g, "'\\''").replace(/:/g, "\\:");
    await execAsync(
      `ffmpeg -y -i "${rawConcat}" ` +
        `-vf "ass='${assPathEscaped}'" ` +
        `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p ` +
        `-c:a copy "${withCaptions}"`
    );

    if (backgroundMusicPath) {
      const finalOutput = path.join(workDir, "final.mp4");
      await execAsync(
        `ffmpeg -y -i "${withCaptions}" -i "${backgroundMusicPath}" ` +
          `-filter_complex "[1:a]volume=0.10[bg];[0:a][bg]amix=inputs=2:duration=first[outa]" ` +
          `-map 0:v -map "[outa]" -c:v copy -c:a aac -b:a 192k "${finalOutput}"`
      );
      return finalOutput;
    }

    return withCaptions;
  } catch (error) {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export { downloadFile };
