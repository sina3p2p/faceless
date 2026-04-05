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

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (currentLine.length + word.length + 1 > maxCharsPerLine) {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine += (currentLine ? " " : "") + word;
    }
  }
  if (currentLine) lines.push(currentLine.trim());

  return lines.slice(0, 3);
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\\\\\")
    .replace(/'/g, "'\\''")
    .replace(/:/g, "\\:")
    .replace(/%/g, "%%")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function buildCaptionFilter(text: string, style: string): string {
  const lines = wrapText(text, 30);

  const styles: Record<string, { fontsize: number; color: string; borderw: number; bordercolor: string; shadowx: number; shadowy: number; shadowcolor: string }> = {
    default: { fontsize: 52, color: "white", borderw: 3, bordercolor: "black", shadowx: 2, shadowy: 2, shadowcolor: "black@0.6" },
    bold: { fontsize: 58, color: "yellow", borderw: 4, bordercolor: "black", shadowx: 3, shadowy: 3, shadowcolor: "black@0.8" },
    typewriter: { fontsize: 48, color: "white", borderw: 2, bordercolor: "black@0.8", shadowx: 0, shadowy: 0, shadowcolor: "black@0" },
    neon: { fontsize: 54, color: "#00ffff", borderw: 3, bordercolor: "#003366", shadowx: 0, shadowy: 0, shadowcolor: "#0066ff@0.5" },
  };

  const s = styles[style] || styles.default;
  const lineHeight = s.fontsize + 10;
  const totalHeight = lines.length * lineHeight;
  const baseY = `(h - ${totalHeight}) * 3/4`;

  const filters = lines.map((line, i) => {
    const escaped = escapeDrawtext(line);
    const y = `${baseY} + ${i * lineHeight}`;
    return `drawtext=text='${escaped}':fontsize=${s.fontsize}:fontcolor=${s.color}:borderw=${s.borderw}:bordercolor=${s.bordercolor}:shadowx=${s.shadowx}:shadowy=${s.shadowy}:shadowcolor=${s.shadowcolor}:x=(w-tw)/2:y=${y}`;
  });

  return filters.join(",");
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

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const sceneOutput = path.join(workDir, `scene_${i}.mp4`);

      const audioDuration = await getAudioDuration(scene.audioPath);
      const duration = Math.max(audioDuration + 0.3, 2);

      const captionFilter = buildCaptionFilter(scene.text, captionStyle);
      const fadeOutStart = Math.max(0, duration - 0.5);

      if (scene.mediaType === "video") {
        const videoFilter = [
          `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${FPS}`,
          captionFilter,
          `fade=t=in:st=0:d=0.3,fade=t=out:st=${fadeOutStart}:d=0.5`,
        ].join(",");

        await execAsync(
          `ffmpeg -y -i "${scene.mediaPath}" -i "${scene.audioPath}" ` +
            `-filter_complex "${videoFilter}[outv];[1:a]aresample=44100[outa]" ` +
            `-map "[outv]" -map "[outa]" ` +
            `-c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p ` +
            `-c:a aac -b:a 192k -ar 44100 ` +
            `-t ${duration} -shortest "${sceneOutput}"`
        );
      } else {
        const totalFrames = Math.ceil(duration * FPS);
        const zoomIncrement = 0.15 / totalFrames;
        const zoomDirection = i % 2 === 0 ? 1 : -1;

        let zoomExpr: string;
        let panX: string;
        let panY: string;

        if (zoomDirection > 0) {
          zoomExpr = `min(zoom+${zoomIncrement.toFixed(6)},1.15)`;
          panX = `iw/2-(iw/zoom/2)`;
          panY = `ih/2-(ih/zoom/2)`;
        } else {
          zoomExpr = `if(eq(on,1),1.15,max(zoom-${zoomIncrement.toFixed(6)},1.0))`;
          panX = `iw/2-(iw/zoom/2)`;
          panY = `ih/3-(ih/zoom/3)`;
        }

        const imageFilter = [
          `[0:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},setsar=1`,
          `zoompan=z='${zoomExpr}':x='${panX}':y='${panY}':d=${totalFrames}:s=${W}x${H}:fps=${FPS}`,
          captionFilter,
          `fade=t=in:st=0:d=0.3,fade=t=out:st=${fadeOutStart}:d=0.5`,
        ].join(",");

        await execAsync(
          `ffmpeg -y -loop 1 -i "${scene.mediaPath}" -i "${scene.audioPath}" ` +
            `-filter_complex "${imageFilter}[outv];[1:a]aresample=44100[outa]" ` +
            `-map "[outv]" -map "[outa]" ` +
            `-c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p ` +
            `-c:a aac -b:a 192k -ar 44100 ` +
            `-t ${duration} -shortest "${sceneOutput}"`
        );
      }

      scenePaths.push(sceneOutput);
    }

    const finalOutput = path.join(workDir, "final.mp4");

    if (scenePaths.length === 1) {
      await fs.copyFile(scenePaths[0], finalOutput);
    } else {
      const inputs = scenePaths.map((p) => `-i "${p}"`).join(" ");
      const n = scenePaths.length;
      const xfadeDuration = 0.4;

      let filterComplex = "";
      let currentLabel = "[0:v]";
      let audioFilter = "";

      for (let i = 1; i < n; i++) {
        const offset = i === 1
          ? await getSceneDuration(scenePaths[0]) - xfadeDuration
          : await getAccumulatedOffset(scenePaths, i, xfadeDuration);

        const outLabel = i < n - 1 ? `[xf${i}]` : `[outv]`;
        filterComplex += `${currentLabel}[${i}:v]xfade=transition=fade:duration=${xfadeDuration}:offset=${Math.max(0, offset).toFixed(2)}${outLabel};`;
        currentLabel = outLabel === "[outv]" ? "[outv]" : outLabel;
      }

      const audioInputs = Array.from({ length: n }, (_, i) => `[${i}:a]`).join("");
      audioFilter = `${audioInputs}concat=n=${n}:v=0:a=1[outa]`;
      filterComplex += audioFilter;

      await execAsync(
        `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" ` +
          `-map "[outv]" -map "[outa]" ` +
          `-c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p ` +
          `-c:a aac -b:a 192k -ar 44100 ` +
          `"${finalOutput}"`
      );
    }

    if (backgroundMusicPath) {
      const withMusicOutput = path.join(workDir, "with_music.mp4");
      await execAsync(
        `ffmpeg -y -i "${finalOutput}" -i "${backgroundMusicPath}" ` +
          `-filter_complex "[1:a]volume=0.12[bg];[0:a][bg]amix=inputs=2:duration=first[outa]" ` +
          `-map 0:v -map "[outa]" -c:v copy -c:a aac -b:a 192k "${withMusicOutput}"`
      );
      return withMusicOutput;
    }

    return finalOutput;
  } catch (error) {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function getSceneDuration(scenePath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${scenePath}"`
    );
    return parseFloat(stdout.trim()) || 5;
  } catch {
    return 5;
  }
}

async function getAccumulatedOffset(
  scenePaths: string[],
  currentIndex: number,
  xfadeDuration: number
): Promise<number> {
  let totalOffset = 0;
  for (let i = 0; i < currentIndex; i++) {
    const dur = await getSceneDuration(scenePaths[i]);
    totalOffset += dur - (i > 0 ? xfadeDuration : 0);
  }
  return totalOffset - xfadeDuration;
}

export { downloadFile };
