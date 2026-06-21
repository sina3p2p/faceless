import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { db } from "@/server/db";
import { filmSessions } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { editVideo } from "@/server/services/ai/video";
import { uploadFile, mediaUrl } from "@/lib/storage";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { sessionId } = await params;

  const [session] = await db
    .select()
    .from(filmSessions)
    .where(eq(filmSessions.id, sessionId));

  if (!session || session.userId !== user.id) return notFound("Session not found");

  const body = await req.json() as Record<string, unknown>;
  const videoUrl = body.videoUrl as string | undefined;
  const prompt = (body.prompt as string | undefined)?.trim();
  const duration = typeof body.duration === "number" ? body.duration : 5;
  const aspectRatio = (body.aspectRatio as TAspectRatio | undefined) ?? "16:9";

  if (!videoUrl) return badRequest("videoUrl required");
  if (!prompt) return badRequest("prompt required");

  try {
    const result = await editVideo(videoUrl, prompt, duration, aspectRatio, "480p");

    // Download from Replicate and re-upload to R2 so the URL never expires
    const videoResp = await fetch(result.videoUrl);
    const videoBuffer = Buffer.from(await videoResp.arrayBuffer());
    const key = `v2/edits/${sessionId}/${crypto.randomUUID()}.mp4`;
    await uploadFile(key, videoBuffer, "video/mp4");
    const persistentUrl = mediaUrl(key);

    return NextResponse.json({ videoUrl: persistentUrl });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
