import { NextRequest } from "next/server";
import { getAuthUser, unauthorized, notFound } from "@/lib/api-utils";
import { db } from "@/server/db";
import { filmSessions, workerJobs, media } from "@/server/db/schema";
import { eq, sql } from "drizzle-orm";
import { mediaUrl, mediaUrls } from "@/lib/storage";
import { JOB_NAMES } from "@/lib/worker-queue";

export const runtime = "nodejs";

const POLL_MS = 3_000;
const MAX_WAIT_MS = 10 * 60 * 1_000;

type JobResult = {
  images?: string[];
  videoUrl?: string;
  filmstripUrl?: string;
  filmstripTiles?: number;
  mediaId?: string;
  durationSeconds?: number;
  error?: string;
} | null;

type JobPayload = {
  toolCallId?: string;
  assetHandle?: string;
  assetKind?: string;
  sceneId?: string | number;
  packHandle?: string;
  notes?: Record<string, string>;
  keyframes?: unknown;
  aspectRatio?: string;
  generationId?: string;
  shotIds?: number[];
  estimatedDurationSeconds?: number;
  previousGenerationId?: string | null;
  sceneAnchorHandle?: string | null;
  incomingAnchorHandle?: string | null;
  continuityBreakReason?: string | null;
  panelCount?: number;
  panelCaptions?: unknown;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { sessionId } = await params;

  const [session] = await db
    .select({ id: filmSessions.id, userId: filmSessions.userId })
    .from(filmSessions)
    .where(eq(filmSessions.id, sessionId));

  if (!session || session.userId !== user.id) return notFound("Session not found");

  const encoder = new TextEncoder();

  const body = new ReadableStream({
    async start(controller) {
      const enqueue = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // controller already closed (client disconnected)
        }
      };

      const notified = new Set<string>();
      const start = Date.now();

      const ping = setInterval(() => {
        try { controller.enqueue(encoder.encode(": ping\n\n")); } catch { clearInterval(ping); }
      }, 25_000);

      while (Date.now() - start < MAX_WAIT_MS) {
        await sleep(POLL_MS);

        const jobs = await db
          .select({
            id: workerJobs.id,
            jobName: workerJobs.jobName,
            status: workerJobs.status,
            payload: workerJobs.payload,
            result: workerJobs.result,
            createdAt: workerJobs.createdAt,
            mediaUrl: media.url,
            mediaMetadata: media.metadata,
          })
          .from(workerJobs)
          .leftJoin(media, eq(media.id, sql`${workerJobs.result}->>'mediaId'`))
          .where(eq(workerJobs.sessionId, sessionId));

        // Only the latest job per toolCallId matters (retries create new rows).
        const latestByToolCall = new Map<string, (typeof jobs)[number]>();
        for (const job of jobs) {
          const toolCallId = (job.payload as JobPayload | null)?.toolCallId;
          if (!toolCallId) continue;
          const prev = latestByToolCall.get(toolCallId);
          if (!prev || job.createdAt > prev.createdAt) {
            latestByToolCall.set(toolCallId, job);
          }
        }
        const latestJobs = [...latestByToolCall.values()];

        for (const job of latestJobs) {
          if (notified.has(job.id)) continue;
          if (job.status !== "succeeded" && job.status !== "failed") continue;

          notified.add(job.id);
          const payload = (job.payload ?? {}) as JobPayload;
          const result = (job.result ?? null) as JobResult;
          const toolCallId = payload.toolCallId;
          if (!toolCallId) continue;

          if (job.jobName === JOB_NAMES.GENERATE_SHOT) {
            if (job.status === "succeeded" && (job.mediaUrl || result?.videoUrl)) {
              const durationSeconds =
                result?.durationSeconds ??
                (job.mediaMetadata as { duration?: number } | null)?.duration;
              const filmstripKey =
                result?.filmstripUrl ??
                (job.mediaMetadata as { filmstripUrl?: string } | null)?.filmstripUrl;
              const filmstripTiles =
                result?.filmstripTiles ??
                (job.mediaMetadata as { filmstripTiles?: number } | null)?.filmstripTiles;
              enqueue({
                type: "shot_complete",
                toolCallId,
                videoUrl: await mediaUrl(job.mediaUrl || result!.videoUrl!),
                durationSeconds,
                filmstripUrl: filmstripKey ? await mediaUrl(filmstripKey) : undefined,
                filmstripTiles,
              });
            } else {
              enqueue({
                type: "shot_error",
                toolCallId,
                error: result?.error ?? "Generation failed",
              });
            }
            continue;
          }

          if (job.status === "failed") {
            const error = result?.error ?? "Generation failed";
            if (job.jobName === JOB_NAMES.GENERATE_ASSET_IMAGES) {
              enqueue({
                type: "asset_ref",
                toolCallId,
                assetHandle: payload.assetHandle,
                assetKind: payload.assetKind,
                error,
              });
            } else if (job.jobName === JOB_NAMES.GENERATE_CONTINUITY_PACK) {
              enqueue({
                type: "continuity_pack",
                toolCallId,
                sceneId: payload.sceneId,
                packHandle: payload.packHandle,
                notes: payload.notes,
                keyframes: payload.keyframes,
                aspectRatio: payload.aspectRatio ?? "16:9",
                error,
              });
            } else if (job.jobName === JOB_NAMES.GENERATE_GENERATION_GRID) {
              enqueue({
                type: "generation_grid",
                toolCallId,
                sceneId: payload.sceneId,
                generationId: payload.generationId,
                shotIds: payload.shotIds,
                estimatedDurationSeconds: payload.estimatedDurationSeconds,
                previousGenerationId: payload.previousGenerationId,
                sceneAnchorHandle: payload.sceneAnchorHandle,
                incomingAnchorHandle: payload.incomingAnchorHandle,
                continuityBreakReason: payload.continuityBreakReason,
                panelCount: payload.panelCount,
                panelCaptions: payload.panelCaptions,
                aspectRatio: payload.aspectRatio ?? "16:9",
                error,
              });
            }
            continue;
          }

          const images = await mediaUrls(result?.images ?? []);
          if (job.jobName === JOB_NAMES.GENERATE_ASSET_IMAGES) {
            enqueue({
              type: "asset_ref",
              toolCallId,
              assetHandle: payload.assetHandle,
              assetKind: payload.assetKind,
              images,
            });
          } else if (job.jobName === JOB_NAMES.GENERATE_CONTINUITY_PACK) {
            enqueue({
              type: "continuity_pack",
              toolCallId,
              sceneId: payload.sceneId,
              packHandle: payload.packHandle,
              notes: payload.notes,
              keyframes: payload.keyframes,
              aspectRatio: payload.aspectRatio ?? "16:9",
              images,
            });
          } else if (job.jobName === JOB_NAMES.GENERATE_GENERATION_GRID) {
            enqueue({
              type: "generation_grid",
              toolCallId,
              sceneId: payload.sceneId,
              generationId: payload.generationId,
              shotIds: payload.shotIds,
              estimatedDurationSeconds: payload.estimatedDurationSeconds,
              previousGenerationId: payload.previousGenerationId,
              sceneAnchorHandle: payload.sceneAnchorHandle,
              incomingAnchorHandle: payload.incomingAnchorHandle,
              continuityBreakReason: payload.continuityBreakReason,
              panelCount: payload.panelCount,
              panelCaptions: payload.panelCaptions,
              aspectRatio: payload.aspectRatio ?? "16:9",
              images,
            });
          }
        }

        const running = latestJobs.filter((j) => j.status === "pending" || j.status === "in_progress");
        if (latestJobs.length > 0 && running.length === 0) break;
      }

      clearInterval(ping);
      try { controller.close(); } catch { /* already closed */ }
    },
    cancel() {
      // Client disconnected — the while-loop will exit on the next sleep iteration.
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
