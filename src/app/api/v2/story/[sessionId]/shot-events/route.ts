import { NextRequest } from "next/server";
import { getAuthUser, unauthorized, notFound } from "@/lib/api-utils";
import { db } from "@/server/db";
import { filmSessions, filmShotJobs } from "@/server/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

// How often the server checks the DB for completed shots while the client is waiting.
const POLL_MS = 3_000;
// Safety ceiling — close the stream after 10 min regardless.
const MAX_WAIT_MS = 10 * 60 * 1_000;

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

      const notified = new Set<string>(); // toolCallIds already pushed to client
      const start = Date.now();

      // Keep a ping running so proxies don't time out the connection.
      const ping = setInterval(() => {
        try { controller.enqueue(encoder.encode(": ping\n\n")); } catch { clearInterval(ping); }
      }, 25_000);

      while (Date.now() - start < MAX_WAIT_MS) {
        await sleep(POLL_MS);

        const jobs = await db
          .select()
          .from(filmShotJobs)
          .where(eq(filmShotJobs.sessionId, sessionId));

        for (const job of jobs) {
          if (notified.has(job.toolCallId)) continue;

          if (job.status === "succeeded" && job.videoUrl) {
            notified.add(job.toolCallId);
            enqueue({ type: "shot_complete", toolCallId: job.toolCallId, videoUrl: job.videoUrl });
          } else if (job.status === "failed") {
            notified.add(job.toolCallId);
            enqueue({ type: "shot_error", toolCallId: job.toolCallId, error: job.error ?? "Generation failed" });
          }
        }

        // Stop polling once all known jobs are in a terminal state.
        const running = jobs.filter((j) => j.status === "pending" || j.status === "in_progress");
        if (jobs.length > 0 && running.length === 0) break;
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
