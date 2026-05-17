/**
 * One-off data migration: rename the `dialogue` video type to `movie`.
 *
 * `video_type` is a plain text column (no enum / schema change), so only the
 * stored values need updating. Idempotent — safe to run more than once.
 *
 * Run once:  npx tsx src/scripts/migrate-dialogue-to-movie.ts
 */
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";

async function main() {
  const series = await db
    .update(schema.series)
    .set({ videoType: "movie" })
    .where(eq(schema.series.videoType, "dialogue"))
    .returning({ id: schema.series.id });

  const projects = await db
    .update(schema.videoProjects)
    .set({ videoType: "movie" })
    .where(eq(schema.videoProjects.videoType, "dialogue"))
    .returning({ id: schema.videoProjects.id });

  console.log(
    `[migrate-dialogue-to-movie] Updated ${series.length} series and ${projects.length} video projects.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate-dialogue-to-movie] Failed:", err);
  process.exit(1);
});
