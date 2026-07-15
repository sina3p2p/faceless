import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { FILMSTRIP_TILE_WIDTH, filmstripTileCount } from "@/lib/filmstrip";

const execAsync = promisify(exec);

export { FILMSTRIP_TILE_WIDTH, filmstripTileCount } from "@/lib/filmstrip";

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
 * Build a horizontal JPEG sprite (~1 frame per second) for timeline filmstrips.
 * Generated once at render time so the client never demuxes the full MP4.
 */
export async function generateFilmstripJpeg(
  videoBuffer: Buffer,
  durationSeconds: number,
): Promise<{ jpeg: Buffer; tiles: number }> {
  const id = crypto.randomUUID();
  const tmpVideo = path.join(os.tmpdir(), `strip-src-${id}.mp4`);
  const tmpOut = path.join(os.tmpdir(), `strip-out-${id}.jpg`);
  const tiles = filmstripTileCount(durationSeconds);
  try {
    await fs.writeFile(tmpVideo, videoBuffer);
    const dur = Math.max(0.5, durationSeconds || 1);
    // Exact N samples across the clip so tile=Nx1 always gets N frames.
    const fps = tiles / dur;
    await execAsync(
      `ffmpeg -y -hide_banner -i "${tmpVideo}" -vf "fps=${fps},scale=${FILMSTRIP_TILE_WIDTH}:-2,tile=${tiles}x1" -frames:v 1 -q:v 4 "${tmpOut}"`,
      { timeout: 90_000 },
    );
    const jpeg = await fs.readFile(tmpOut);
    return { jpeg, tiles };
  } finally {
    await fs.unlink(tmpVideo).catch(() => {});
    await fs.unlink(tmpOut).catch(() => {});
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
