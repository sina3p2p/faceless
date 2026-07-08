/**
 * One-off data migration: for existing `film_shot_jobs` rows created before
 * `media_id` existed, create a `media` row from the old `video_url` (probing
 * real duration via ffprobe directly against the URL — no full download)
 * and point `media_id` at it.
 *
 * Adds the `media_id` column itself (IF NOT EXISTS) so this is safe to run
 * before you've applied that schema migration. Does NOT touch/drop the old
 * `video_url` column — run your migration to drop it only after this
 * script reports 0 remaining rows to backfill.
 *
 * Idempotent — only touches succeeded rows with a video_url and no media_id
 * yet, safe to re-run.
 *
 * Run once:  npx tsx src/scripts/backfill-shot-media.ts
 */
import { exec } from "child_process";
import { promisify } from "util";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";

const execAsync = promisify(exec);

async function probeDurationFromUrl(url: string): Promise<number | null> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${url}"`
    );
    const duration = parseFloat(stdout.trim());
    return isNaN(duration) ? null : duration;
  } catch {
    return null;
  }
}

function keyFromVideoUrl(url: string): string {
  return url.replace(/^https?:\/\/[^/]+\/api\/media\//, "");
}

async function main() {
  await db.execute(sql`ALTER TABLE film_shot_jobs ADD COLUMN IF NOT EXISTS media_id text REFERENCES media(id)`);

  const rows = await db.execute<{ id: string; session_id: string; video_url: string | null }>(
    sql`SELECT id, session_id, video_url FROM film_shot_jobs
        WHERE status = 'succeeded' AND video_url IS NOT NULL AND media_id IS NULL`
  );

  console.log(`[backfill-shot-media] ${rows.length} shot job(s) to backfill.`);

  let ok = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const [session] = await db
        .select({ userId: schema.filmSessions.userId })
        .from(schema.filmSessions)
        .where(eq(schema.filmSessions.id, row.session_id));
      if (!session) throw new Error("session not found");

      const videoUrl = row.video_url!;
      const duration = await probeDurationFromUrl(videoUrl);

      const [mediaRow] = await db
        .insert(schema.media)
        .values({
          userId: session.userId,
          type: "video",
          url: keyFromVideoUrl(videoUrl),
          modelUsed: "backfill",
          metadata: duration != null ? { duration } : null,
        })
        .returning({ id: schema.media.id });

      await db.execute(sql`UPDATE film_shot_jobs SET media_id = ${mediaRow.id} WHERE id = ${row.id}`);
      ok++;
      console.log(`[backfill-shot-media] ${row.id} -> media ${mediaRow.id} (duration=${duration ?? "unknown"})`);
    } catch (err) {
      failed++;
      console.error(`[backfill-shot-media] Failed for ${row.id}:`, err);
    }
  }

  console.log(`[backfill-shot-media] Done. ${ok} succeeded, ${failed} failed, out of ${rows.length}.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[backfill-shot-media] Fatal:", err);
  process.exit(1);
});
