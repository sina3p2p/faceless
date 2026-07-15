/**
 * Temporary: generate a filmstrip sprite for an existing media row.
 *
 *   npx tsx --env-file=.env scripts/generate-filmstrip.ts <mediaId>
 *
 * Downloads the MP4 from R2, builds a 6-tile JPEG via ffmpeg, uploads it,
 * updates media.metadata, and patches any shot tool-call that points at this media.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { media, workerJobs, filmSessionMessages } from "@/server/db/schema";
import { mediaUrl, uploadFile, storageKeyFrom } from "@/lib/storage";
import { generateFilmstripJpeg, probeVideoDuration } from "@/lib/media-probe";

type StoredTc = {
  id: string;
  type: "function";
  function: { name: string; arguments: Record<string, unknown> };
};

function toolCallIdFromStorageKey(key: string): string | null {
  // v2/shots/<sessionId>/<toolCallId>.mp4
  const base = key.split("/").pop() ?? "";
  const m = base.match(/^(toolu_[^.]+)/);
  return m?.[1] ?? null;
}

function sessionIdFromStorageKey(key: string): string | null {
  const parts = key.split("/");
  // v2 / shots / <sessionId> / <file>
  return parts.length >= 4 && parts[0] === "v2" && parts[1] === "shots" ? parts[2]! : null;
}

async function patchToolCallFilmstrip(
  messageRowId: string,
  toolCallId: string,
  filmstripKey: string,
  filmstripTiles: number,
): Promise<boolean> {
  const [msg] = await db
    .select()
    .from(filmSessionMessages)
    .where(eq(filmSessionMessages.id, messageRowId));
  if (!msg) return false;

  const d = ((msg.parts as unknown[])[0] ?? {}) as Record<string, unknown>;
  const calls = (Array.isArray(d.toolCalls) ? d.toolCalls : []) as StoredTc[];
  let changed = false;
  const updatedCalls = calls.map((tc) => {
    if (tc.id !== toolCallId) return tc;
    changed = true;
    return {
      ...tc,
      function: {
        ...tc.function,
        arguments: {
          ...tc.function.arguments,
          filmstripUrl: filmstripKey,
          filmstripTiles,
        },
      },
    };
  });
  if (!changed) return false;

  await db
    .update(filmSessionMessages)
    .set({ parts: [{ ...d, toolCalls: updatedCalls }] })
    .where(eq(filmSessionMessages.id, messageRowId));
  return true;
}

async function main() {
  const mediaId = process.argv[2];
  if (!mediaId) {
    console.error("Usage: npx tsx --env-file=.env scripts/generate-filmstrip.ts <mediaId>");
    process.exit(1);
  }

  const [row] = await db.select().from(media).where(eq(media.id, mediaId));
  if (!row) {
    console.error(`Media not found: ${mediaId}`);
    process.exit(1);
  }
  if (row.type !== "video") {
    console.error(`Media ${mediaId} is type="${row.type}", expected video`);
    process.exit(1);
  }

  const storageKey = storageKeyFrom(row.url) ?? row.url;
  const toolCallId = toolCallIdFromStorageKey(storageKey);
  const sessionId = sessionIdFromStorageKey(storageKey);
  console.log(`Media ${mediaId}`);
  console.log(`  storage key: ${storageKey}`);
  console.log(`  toolCallId:  ${toolCallId ?? "(unknown)"}`);
  console.log(`  sessionId:   ${sessionId ?? "(unknown)"}`);

  const signed = await mediaUrl(storageKey);
  if (!signed) {
    console.error("Failed to sign download URL");
    process.exit(1);
  }

  console.log("  downloading…");
  const resp = await fetch(signed);
  if (!resp.ok) {
    console.error(`Download failed: ${resp.status}`);
    process.exit(1);
  }
  const videoBuffer = Buffer.from(await resp.arrayBuffer());
  console.log(`  downloaded ${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB`);

  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const duration =
    (typeof meta.duration === "number" ? meta.duration : null) ??
    (await probeVideoDuration(videoBuffer)) ??
    5;
  console.log(`  duration: ${duration}s`);

  console.log("  generating filmstrip…");
  const { jpeg, tiles } = await generateFilmstripJpeg(videoBuffer, duration);
  const filmstripKey = storageKey.replace(/\.mp4$/i, "") + "-filmstrip.jpg";
  await uploadFile(filmstripKey, jpeg, "image/jpeg");
  console.log(`  uploaded ${filmstripKey} (${(jpeg.length / 1024).toFixed(1)} KB, ${tiles} frames)`);

  await db
    .update(media)
    .set({ metadata: { ...meta, duration, filmstripUrl: filmstripKey, filmstripTiles: tiles } })
    .where(eq(media.id, mediaId));
  console.log("  media.metadata updated");

  let patched = 0;

  // 1) Jobs linked by mediaId
  const jobs = await db
    .select({
      id: workerJobs.id,
      payload: workerJobs.payload,
      result: workerJobs.result,
    })
    .from(workerJobs)
    .where(sql`${workerJobs.result}->>'mediaId' = ${mediaId}`);

  for (const job of jobs) {
    const payload = (job.payload ?? {}) as {
      toolCallId?: string;
      assistantMessageRowId?: string;
    };
    if (!payload.toolCallId || !payload.assistantMessageRowId) continue;
    if (await patchToolCallFilmstrip(payload.assistantMessageRowId, payload.toolCallId, filmstripKey, tiles)) {
      patched++;
      console.log(`  patched via job ${job.id} → ${payload.assistantMessageRowId}`);
    }
    const result = (job.result ?? {}) as Record<string, unknown>;
    await db
      .update(workerJobs)
      .set({ result: { ...result, filmstripUrl: filmstripKey, filmstripTiles: tiles } })
      .where(eq(workerJobs.id, job.id));
  }

  // 2) Fallback: find session messages containing this toolCallId
  //    (covers older jobs that never stored mediaId on result)
  if (toolCallId && sessionId) {
    const msgs = await db
      .select()
      .from(filmSessionMessages)
      .where(eq(filmSessionMessages.sessionId, sessionId));

    for (const msg of msgs) {
      if (msg.role !== "assistant") continue;
      const d = ((msg.parts as unknown[])[0] ?? {}) as Record<string, unknown>;
      const calls = (Array.isArray(d.toolCalls) ? d.toolCalls : []) as StoredTc[];
      if (!calls.some((tc) => tc.id === toolCallId)) continue;
      if (await patchToolCallFilmstrip(msg.id, toolCallId, filmstripKey, tiles)) {
        patched++;
        console.log(`  patched via toolCall scan → ${msg.id}`);
      }
    }
  }

  console.log(`Done. Patched ${patched} message(s). Hard-reload the session to see the strip.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
