import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { filmSessions, filmSessionMessages } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq } from "drizzle-orm";
import {
  renderAndUploadShot,
  generateAssetImages,
  generateContinuityPackImages,
  generateGenerationGridImages,
  validatePanelCaptionCount,
} from "@/server/services/showrunner";
import { validateContinuityPackKeyframes, validateGenerationGridContinuity } from "@/server/services/showrunner/tools";

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

  if (toolName === "compileShot") {
    const key = `v2/shots/${sessionId}/${toolCallId}-retry-${Date.now()}.mp4`;
    const { url: persistentUrl, durationSeconds } = await renderAndUploadShot(
      {
        prompt: tcArgs.prompt as string,
        referenceImageUrls: (tcArgs.referenceImageUrls as string[]) ?? [],
        aspectRatio: (tcArgs.aspectRatio as "16:9" | "9:16" | "1:1") ?? "16:9",
        duration: tcArgs.duration as number,
        continuityMode: (tcArgs.continuityMode as "fresh" | "extend_video") ?? "fresh",
        sourceVideoUrl: tcArgs.sourceVideoUrl as string | undefined,
      },
      sessionId,
      key
    );
    // Retry doesn't go through filmShotJobs (that's only for the async
    // worker path) — just patch the message the client reads.
    await patchRow({ videoUrl: persistentUrl, renderedDurationSeconds: durationSeconds });
    return NextResponse.json({ videoUrl: persistentUrl, durationSeconds });
  }

  if (toolName === "generateAssetReferences") {
    const { assetHandle, assetKind, imagePrompt } = tcArgs as {
      assetHandle: string;
      assetKind: "character" | "location" | "object";
      imagePrompt: string;
    };
    const generatedImages = await generateAssetImages(imagePrompt, assetKind);
    await patchRow({ generatedImages });
    return NextResponse.json({ assetHandle, assetKind, images: generatedImages });
  }

  if (toolName === "generateContinuityPack") {
    const {
      sceneId,
      packHandle,
      notes,
      keyframes,
      referenceImageUrls,
      aspectRatio,
    } = tcArgs as {
      sceneId: string | number;
      packHandle: string;
      notes: Record<string, string>;
      keyframes?: { role: string; caption: string; imagePrompt: string }[];
      referenceImageUrls: string[];
      aspectRatio?: "16:9" | "9:16" | "1:1";
    };
    const keyframeError = validateContinuityPackKeyframes(keyframes);
    if (keyframeError) {
      return badRequest(keyframeError);
    }
    const generatedImages = await generateContinuityPackImages(
      keyframes!,
      referenceImageUrls,
      aspectRatio ?? "16:9"
    );
    await patchRow({ generatedImages });
    return NextResponse.json({
      sceneId,
      packHandle,
      notes,
      keyframes,
      images: generatedImages,
    });
  }

  if (toolName === "generateGenerationGrid" || toolName === "generateSceneGrid") {
    const {
      sceneId,
      generationId,
      shotIds,
      estimatedDurationSeconds,
      previousGenerationId,
      incomingAnchorHandle,
      incomingAnchorKind,
      incomingAnchorPanel,
      continuityBreakReason,
      isFirstInScene,
      imagePrompt,
      referenceImageUrls,
      panelCount,
      panelCaptions,
      aspectRatio,
    } = tcArgs as {
      sceneId: string | number;
      generationId?: string;
      shotIds?: number[];
      estimatedDurationSeconds?: number;
      previousGenerationId?: string | null;
      incomingAnchorHandle?: string | null;
      incomingAnchorKind?: string | null;
      incomingAnchorPanel?: number | null;
      continuityBreakReason?: string | null;
      isFirstInScene?: boolean;
      imagePrompt: string;
      referenceImageUrls: string[];
      panelCount?: number;
      panelCaptions?: { motionArc: string; handoff: string }[];
      aspectRatio?: "16:9" | "9:16" | "1:1";
    };
    const captionError = validatePanelCaptionCount(panelCount, panelCaptions, shotIds);
    if (captionError) {
      return badRequest(captionError);
    }
    const continuityError = validateGenerationGridContinuity({
      isFirstInScene,
      previousGenerationId,
      incomingAnchorHandle,
      incomingAnchorKind,
      incomingAnchorPanel,
      continuityBreakReason,
      referenceImageUrls,
    });
    if (continuityError) {
      return badRequest(continuityError);
    }
    const generatedImages = await generateGenerationGridImages(
      imagePrompt,
      referenceImageUrls,
      aspectRatio ?? "16:9"
    );
    await patchRow({ generatedImages });
    return NextResponse.json({
      sceneId,
      generationId,
      shotIds,
      estimatedDurationSeconds,
      images: generatedImages,
      panelCount,
      panelCaptions,
    });
  }

  return badRequest(`Tool "${toolName}" is not retryable`);
}
