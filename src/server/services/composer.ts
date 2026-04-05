import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { v4 as uuid } from "uuid";
import { VIDEO_DEFAULTS } from "@/lib/constants";

const execAsync = promisify(exec);

export interface ComposerScene {
  audioPath: string;
  mediaPath: string;
  mediaType: "video" | "image";
  text: string;
  duration: number;
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

function buildCaptionFilter(
  text: string,
  style: string,
  sceneIndex: number
): string {
  const escapedText = text
    .replace(/'/g, "'\\''")
    .replace(/:/g, "\\:")
    .replace(/\\/g, "\\\\");

  const baseSettings = {
    default: `fontsize=48:fontcolor=white:borderw=3:bordercolor=black:x=(w-tw)/2:y=h-h/4`,
    bold: `fontsize=56:fontcolor=yellow:borderw=4:bordercolor=black:x=(w-tw)/2:y=h-h/4`,
    typewriter: `fontsize=44:fontcolor=white:borderw=2:bordercolor=black:x=(w-tw)/2:y=h-h/4`,
    neon: `fontsize=50:fontcolor=#00ffff:borderw=3:bordercolor=#0066ff:x=(w-tw)/2:y=h-h/4`,
  };

  const settings =
    baseSettings[style as keyof typeof baseSettings] || baseSettings.default;

  return `drawtext=text='${escapedText}':${settings}`;
}

export async function composeVideo(
  options: ComposerOptions
): Promise<string> {
  const { scenes, captionStyle, backgroundMusicPath } = options;
  const workDir = path.join(os.tmpdir(), `faceless-${uuid()}`);
  await fs.mkdir(workDir, { recursive: true });

  try {
    const scenePaths: string[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const sceneOutput = path.join(workDir, `scene_${i}.mp4`);
      const captionFilter = buildCaptionFilter(scene.text, captionStyle, i);

      if (scene.mediaType === "video") {
        await execAsync(
          `ffmpeg -y -i "${scene.mediaPath}" -i "${scene.audioPath}" ` +
            `-filter_complex "[0:v]scale=${VIDEO_DEFAULTS.width}:${VIDEO_DEFAULTS.height}:force_original_aspect_ratio=increase,` +
            `crop=${VIDEO_DEFAULTS.width}:${VIDEO_DEFAULTS.height},` +
            `${captionFilter}[outv]" ` +
            `-map "[outv]" -map 1:a -c:v libx264 -preset fast -crf 23 ` +
            `-c:a aac -b:a 128k -t ${scene.duration} -shortest "${sceneOutput}"`
        );
      } else {
        await execAsync(
          `ffmpeg -y -loop 1 -i "${scene.mediaPath}" -i "${scene.audioPath}" ` +
            `-filter_complex "[0:v]scale=${VIDEO_DEFAULTS.width}:${VIDEO_DEFAULTS.height}:force_original_aspect_ratio=increase,` +
            `crop=${VIDEO_DEFAULTS.width}:${VIDEO_DEFAULTS.height},` +
            `zoompan=z='min(zoom+0.001,1.5)':d=${scene.duration * VIDEO_DEFAULTS.fps}:s=${VIDEO_DEFAULTS.width}x${VIDEO_DEFAULTS.height},` +
            `${captionFilter}[outv]" ` +
            `-map "[outv]" -map 1:a -c:v libx264 -preset fast -crf 23 ` +
            `-c:a aac -b:a 128k -t ${scene.duration} -shortest "${sceneOutput}"`
        );
      }

      scenePaths.push(sceneOutput);
    }

    const concatList = path.join(workDir, "concat.txt");
    const concatContent = scenePaths
      .map((p) => `file '${p}'`)
      .join("\n");
    await fs.writeFile(concatList, concatContent);

    const concatenatedOutput = path.join(workDir, "concatenated.mp4");
    await execAsync(
      `ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${concatenatedOutput}"`
    );

    if (backgroundMusicPath) {
      const finalOutput = path.join(workDir, "final.mp4");
      await execAsync(
        `ffmpeg -y -i "${concatenatedOutput}" -i "${backgroundMusicPath}" ` +
          `-filter_complex "[1:a]volume=0.15[bg];[0:a][bg]amix=inputs=2:duration=first[outa]" ` +
          `-map 0:v -map "[outa]" -c:v copy -c:a aac -b:a 128k "${finalOutput}"`
      );
      return finalOutput;
    }

    return concatenatedOutput;
  } catch (error) {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export { downloadFile };
