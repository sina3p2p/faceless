import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

const execAsync = promisify(exec);

// ffprobe (already a dependency, used elsewhere in the render pipeline —
// see src/server/services/composer.ts) needs a seekable file to read a
// container's duration atom, not just a stream, so the buffer is written to
// a temp file first.
export async function probeVideoDuration(buffer: Buffer): Promise<number | null> {
  const tmpPath = path.join(os.tmpdir(), `probe-${crypto.randomUUID()}.mp4`);
  await fs.writeFile(tmpPath, buffer);
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${tmpPath}"`
    );
    const duration = parseFloat(stdout.trim());
    return isNaN(duration) ? null : duration;
  } catch {
    return null;
  } finally {
    await fs.unlink(tmpPath).catch(() => { });
  }
}

/**
 * Extract the last decoded frame of a video as a JPEG buffer.
 * Used for Stage 2 continuity: next solo can open from this still.
 */
export async function extractLastFrameJpeg(videoUrl: string): Promise<Buffer> {
  const id = crypto.randomUUID();
  const tmpVideo = path.join(os.tmpdir(), `frame-src-${id}.mp4`);
  const tmpFrame = path.join(os.tmpdir(), `frame-out-${id}.jpg`);
  try {
    const resp = await fetch(videoUrl);
    if (!resp.ok) throw new Error(`Failed to download video for frame extract: ${resp.status}`);
    await fs.writeFile(tmpVideo, Buffer.from(await resp.arrayBuffer()));

    // Seek near the end, then grab one frame. -sseof seeks from EOF.
    await execAsync(
      `ffmpeg -y -hide_banner -sseof -0.1 -i "${tmpVideo}" -frames:v 1 -q:v 2 "${tmpFrame}"`
    );
    return await fs.readFile(tmpFrame);
  } finally {
    await fs.unlink(tmpVideo).catch(() => {});
    await fs.unlink(tmpFrame).catch(() => {});
  }
}
