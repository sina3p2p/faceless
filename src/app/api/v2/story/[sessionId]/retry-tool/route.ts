import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { filmSessions, filmSessionMessages } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq } from "drizzle-orm";
import { enqueueWorkerJob, JOB_NAMES } from "@/lib/worker-queue";
import {
  validatePanelCaptionCount,
  validateGenerationGridContinuity,
  toCompileShotArgs,
} from "@/server/services/showrunner/tools";

type StoredTc = {
  id: string;
  type: "function";
  function: { name: string; arguments: Record<string, unknown> };
};

type AssetSpec = {
  assetHandle: string;
  assetKind: "character" | "location" | "object";
  imagePrompt: string;
};

type GeneratedAsset = {
  assetHandle: string;
  assetKind: "character" | "location" | "object";
  candidates: Array<{ id: string; url: string }>;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { sessionId } = await params;
  const body = (await req.json()) as {
    toolCallId: string;
    /** Reject one asset in a gallery and regenerate with objection folded in. */
    assetHandle?: string;
    objection?: string;
  };
  const { toolCallId, assetHandle, objection } = body;
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
    if (found) {
      targetRowId = row.id;
      targetTc = found;
      break;
    }
  }
  if (!targetTc || !targetRowId) return badRequest("Tool call not found");

  const targetRow = allRows.find((r) => r.id === targetRowId)!;
  const { name: toolName, arguments: tcArgs } = targetTc.function;

  async function patchRow(newArgs: Record<string, unknown>) {
    const d = ((targetRow.parts as unknown[])[0]) as Record<string, unknown>;
    const updatedCalls = (d.toolCalls as StoredTc[]).map((tc) =>
      tc.id === toolCallId
        ? {
            ...tc,
            function: {
              ...tc.function,
              arguments: { ...tc.function.arguments, ...newArgs },
            },
          }
        : tc
    );
    await db
      .update(filmSessionMessages)
      .set({ parts: [{ ...d, toolCalls: updatedCalls }] })
      .where(eq(filmSessionMessages.id, targetRowId!));
  }

  if (toolName === "compileShot") {
    const compiled = toCompileShotArgs(tcArgs);
    if (!compiled) return badRequest("Cannot retry a gap compile — fix upstream and recompile");
    await patchRow({ pending: true, shotError: undefined, videoUrl: undefined });
    await enqueueWorkerJob(sessionId, JOB_NAMES.GENERATE_SHOT, {
      toolCallId,
      assistantMessageRowId: targetRowId,
      referenceImageUrls: compiled.referenceImageUrls ?? [],
      prompt: compiled.prompt,
      aspectRatio: compiled.aspectRatio ?? "16:9",
      duration: compiled.duration,
      continuityMode: compiled.continuityMode ?? "fresh",
      sourceVideoUrl: compiled.sourceVideoUrl,
    });
    return NextResponse.json({ queued: true });
  }

  if (toolName === "generateAssetReferences") {
    const assets: AssetSpec[] =
      Array.isArray(tcArgs.assets) && (tcArgs.assets as AssetSpec[]).length > 0
        ? (tcArgs.assets as AssetSpec[])
        : tcArgs.assetHandle && tcArgs.assetKind && tcArgs.imagePrompt
          ? [
              {
                assetHandle: tcArgs.assetHandle as string,
                assetKind: tcArgs.assetKind as AssetSpec["assetKind"],
                imagePrompt: tcArgs.imagePrompt as string,
              },
            ]
          : [];
    if (!assets.length) return badRequest("No assets on tool call");

    const existingGeneratedAssets = (tcArgs.generatedAssets as GeneratedAsset[] | undefined) ?? [];

    // Single-asset reject → fold objection into that asset's prompt and regen only it
    if (assetHandle) {
      if (!objection?.trim()) return badRequest("objection required when regenerating one asset");
      const spec = assets.find((a) => a.assetHandle === assetHandle);
      if (!spec) return badRequest(`Asset ${assetHandle} not found in gallery`);
      const imagePrompt = `${spec.imagePrompt}\n\nUSER OBJECTION (must fix): ${objection.trim()}`;
      const updatedAssets = assets.map((a) =>
        a.assetHandle === assetHandle ? { ...a, imagePrompt } : a
      );
      await patchRow({
        assets: updatedAssets,
        pending: true,
        error: undefined,
      });
      await enqueueWorkerJob(sessionId, JOB_NAMES.GENERATE_ASSET_IMAGES, {
        toolCallId,
        assistantMessageRowId: targetRowId,
        assetHandle,
        assetKind: spec.assetKind,
        imagePrompt,
        existingGeneratedAssets,
        userId: session.userId,
      });
      return NextResponse.json({ queued: true, assetHandle });
    }

    // Full gallery retry
    await patchRow({
      pending: true,
      generatedAssets: undefined,
      generatedImages: undefined,
      error: undefined,
    });
    await enqueueWorkerJob(sessionId, JOB_NAMES.GENERATE_ASSET_IMAGES, {
      toolCallId,
      assistantMessageRowId: targetRowId,
      assets,
      userId: session.userId,
    });
    return NextResponse.json({ queued: true });
  }

  if (toolName === "generateGenerationGrid") {
    const {
      sceneId,
      generationId,
      shotIds,
      estimatedDurationSeconds,
      previousGenerationId,
      sceneAnchorHandle,
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
      sceneId?: string | number;
      generationId?: string;
      shotIds?: number[];
      estimatedDurationSeconds?: number;
      previousGenerationId?: string | null;
      sceneAnchorHandle?: string | null;
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
      sceneAnchorHandle,
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
    await patchRow({ pending: true, generatedImages: undefined, gridError: undefined });
    await enqueueWorkerJob(sessionId, JOB_NAMES.GENERATE_GENERATION_GRID, {
      toolCallId,
      assistantMessageRowId: targetRowId,
      sceneId,
      generationId,
      shotIds,
      estimatedDurationSeconds,
      previousGenerationId,
      sceneAnchorHandle,
      incomingAnchorHandle,
      continuityBreakReason,
      panelCount,
      panelCaptions,
      imagePrompt,
      referenceImageUrls: referenceImageUrls ?? [],
      aspectRatio: aspectRatio ?? "16:9",
    });
    return NextResponse.json({ queued: true });
  }

  return badRequest(`Tool "${toolName}" is not retryable`);
}
