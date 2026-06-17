import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { filmSessions, filmSessionMessages } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq } from "drizzle-orm";
import { generateImage } from "@/server/services/media";
import { generateShotWithFallback } from "@/server/services/showrunner";
import { uploadFile, mediaUrl } from "@/lib/storage";

const ASSET_CANDIDATE_COUNT = 2;

type StoredTc = {
  id: string;
  type: "function";
  function: { name: string; arguments: Record<string, unknown> };
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { sessionId } = await params;
  const { toolCallId } = (await req.json()) as { toolCallId: string };
  if (!toolCallId) return badRequest("toolCallId required");

  const [session] = await db
    .select()
    .from(filmSessions)
    .where(eq(filmSessions.id, sessionId));
  if (!session || session.userId !== user.id) return notFound("Session not found");

  const allRows = await db
    .select()
    .from(filmSessionMessages)
    .where(eq(filmSessionMessages.sessionId, sessionId));

  let targetRowId: string | undefined;
  let targetTc: StoredTc | undefined;
  for (const row of allRows) {
    if (row.role !== "assistant") continue;
    const d = ((row.parts as unknown[])[0] ?? {}) as Record<string, unknown>;
    const calls = (Array.isArray(d.toolCalls) ? d.toolCalls : []) as StoredTc[];
    const found = calls.find((tc) => tc.id === toolCallId);
    if (found) { targetRowId = row.id; targetTc = found; break; }
  }
  if (!targetTc || !targetRowId) return badRequest("Tool call not found");

  const targetRow = allRows.find((r) => r.id === targetRowId)!;
  const { name: toolName, arguments: tcArgs } = targetTc.function;

  async function patchRow(newArgs: Record<string, unknown>) {
    const d = ((targetRow.parts as unknown[])[0]) as Record<string, unknown>;
    const updatedCalls = (d.toolCalls as StoredTc[]).map((tc) =>
      tc.id === toolCallId
        ? { ...tc, function: { ...tc.function, arguments: { ...tc.function.arguments, ...newArgs } } }
        : tc
    );
    await db.update(filmSessionMessages)
      .set({ parts: [{ ...d, toolCalls: updatedCalls }] })
      .where(eq(filmSessionMessages.id, targetRowId!));
  }

  if (toolName === "generateShot") {
    const result = await generateShotWithFallback(
      tcArgs.referenceImageUrls as string[],
      tcArgs.prompt as string,
      (tcArgs.aspectRatio as "16:9" | "9:16" | "1:1") ?? "16:9",
      tcArgs.duration as number,
      sessionId
    );
    const videoResp = await fetch(result.videoUrl);
    const videoBuffer = Buffer.from(await videoResp.arrayBuffer());
    const key = `v2/shots/${sessionId}/${toolCallId}-retry-${Date.now()}.mp4`;
    await uploadFile(key, videoBuffer, "video/mp4");
    const persistentUrl = mediaUrl(key);
    await patchRow({ videoUrl: persistentUrl });
    return NextResponse.json({ videoUrl: persistentUrl });
  }

  if (toolName === "generateAssetReferences") {
    const { assetHandle, assetKind, imagePrompt } = tcArgs as {
      assetHandle: string;
      assetKind: "character" | "location";
      imagePrompt: string;
    };
    const ar = assetKind === "location" ? "16:9" as const : "1:1" as const;
    const results = await Promise.all(
      Array.from({ length: ASSET_CANDIDATE_COUNT }, () =>
        generateImage(imagePrompt, "gpt-image-1.5", undefined, ar)
      )
    );
    const generatedImages = results.map((r) => r.url);
    await patchRow({ generatedImages });
    return NextResponse.json({ assetHandle, assetKind, images: generatedImages });
  }

  return badRequest(`Tool "${toolName}" is not retryable`);
}
