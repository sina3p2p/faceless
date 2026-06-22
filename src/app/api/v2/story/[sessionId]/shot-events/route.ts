import { NextRequest } from "next/server";
import IORedis from "ioredis";
import { getAuthUser, unauthorized, notFound } from "@/lib/api-utils";
import { db } from "@/server/db";
import { filmSessions } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { shotEventsChannel } from "@/lib/shot-queue";
import { REDIS } from "@/lib/constants";

export const runtime = "nodejs";

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

  // Each SSE connection gets its own subscriber so different sessions (or tabs)
  // don't share a connection. ioredis subscriber connections must not be reused
  // for regular commands, so we create a dedicated instance here.
  const subscriber = new IORedis(REDIS.url, { maxRetriesPerRequest: null });

  const body = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      // Keep-alive ping every 25 s so proxies don't close the connection.
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(pingInterval);
        }
      }, 25_000);

      await subscriber.subscribe(shotEventsChannel(sessionId));

      subscriber.on("message", (_channel: string, message: string) => {
        try {
          const event = JSON.parse(message) as object;
          send(event);
        } catch {
          // malformed publish — ignore
        }
      });

      subscriber.on("error", () => {
        clearInterval(pingInterval);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
    cancel() {
      subscriber.unsubscribe().catch(() => undefined);
      subscriber.quit().catch(() => undefined);
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
