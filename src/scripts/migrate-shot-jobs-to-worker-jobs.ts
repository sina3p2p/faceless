/**
 * One-off: copy film_shot_jobs → worker_jobs, then drop film_shot_jobs.
 * Run after schema push creates worker_jobs:
 *   npx tsx src/scripts/migrate-shot-jobs-to-worker-jobs.ts
 */
import { sql } from "drizzle-orm";
import { db } from "@/server/db";

async function main() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS worker_jobs (
      id text PRIMARY KEY,
      session_id text NOT NULL REFERENCES film_sessions(id) ON DELETE CASCADE,
      job_name text NOT NULL,
      payload json NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      result json,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS worker_jobs_session_id_status_idx
    ON worker_jobs (session_id, status)
  `);

  const exists = await db.execute(sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_name = 'film_shot_jobs'
    ) AS present
  `);
  const present = (exists[0] as { present?: boolean } | undefined)?.present;
  if (!present) {
    console.log("film_shot_jobs already gone — nothing to migrate");
    process.exit(0);
  }

  await db.execute(sql`
    INSERT INTO worker_jobs (id, session_id, job_name, payload, status, result, created_at, updated_at)
    SELECT
      id,
      session_id,
      'generate-shot',
      json_build_object(
        'toolCallId', tool_call_id,
        'assistantMessageRowId', assistant_message_row_id
      ),
      status,
      CASE
        WHEN status = 'failed' THEN json_build_object('error', COALESCE(error, 'Generation failed'))
        WHEN media_id IS NOT NULL OR video_url IS NOT NULL THEN json_build_object(
          'mediaId', media_id,
          'videoUrl', video_url
        )
        ELSE NULL
      END,
      created_at,
      updated_at
    FROM film_shot_jobs
    ON CONFLICT (id) DO NOTHING
  `);

  await db.execute(sql`DROP TABLE film_shot_jobs`);
  console.log("Migrated film_shot_jobs → worker_jobs and dropped film_shot_jobs");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
