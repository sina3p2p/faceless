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
