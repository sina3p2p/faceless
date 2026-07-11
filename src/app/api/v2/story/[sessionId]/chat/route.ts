import { NextRequest } from "next/server";
import { streamText, stepCountIs } from "ai";
import { db } from "@/server/db";
import { filmSessions, filmSessionMessages } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq, asc } from "drizzle-orm";
import { storyTools, MODEL, openrouter, generateAssetImages, generateSceneGridImages } from "@/server/services/showrunner";
import { rowsToModelMessages } from "@/server/services/showrunner/messages";
import { AI_FILM_STAGE1_SKILL } from "@/server/services/showrunner/system-prompt";
import { validatePanelCaptionCount } from "@/server/services/showrunner/tools";

function sseResponse(
  handler: (emit: (event: object) => void) => Promise<void>
): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const emit = (event: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        await handler(emit);
      } catch (err) {
        emit({ type: "error", message: String(err) });
      } finally {
        controller.close();
      }
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { sessionId } = await params;
  const body = await req.json() as Record<string, unknown>;

  const [session] = await db
    .select()
    .from(filmSessions)
    .where(eq(filmSessions.id, sessionId));

  if (!session || session.userId !== user.id) return notFound("Session not found");

  if (body.type === "user") {
    const text = (body.text as string)?.trim();
    if (!text) return badRequest("text required");
    await db.insert(filmSessionMessages).values({
      id: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
      sessionId,
      role: "user",
      type: "text",
      parts: [{ text }],
      createdAt: new Date(),
    });
  } else if (body.type === "fork_result") {
    await db.insert(filmSessionMessages).values({
      id: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
      sessionId,
      role: "user",
      type: "fork_result",
      parts: [{
        toolCallId: body.toolCallId,
        step: body.step,
        value: body.value,
        optionId: body.optionId ?? null,
      }],
      createdAt: new Date(),
    });
  } else if (body.type === "asset_approval") {
    await db.insert(filmSessionMessages).values({
      id: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
      sessionId,
      role: "user",
      type: "asset_approval",
      parts: [{
        toolCallId: body.toolCallId,
        assetHandle: body.assetHandle,
        approvedUrl: body.approvedUrl,
      }],
      createdAt: new Date(),
    });
  } else if (body.type === "grid_approval") {
    await db.insert(filmSessionMessages).values({
      id: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
      sessionId,
      role: "user",
      type: "grid_approval",
      parts: [{
        toolCallId: body.toolCallId,
        sceneId: body.sceneId,
        approvedUrl: body.approvedUrl,
      }],
      createdAt: new Date(),
    });
  } else if (body.type === "shot_approval") {
    const videoUrl = body.videoUrl as string;
    let lastFrameUrl: string | undefined;
    try {
      const { extractLastFrameJpeg } = await import("@/lib/media-probe");
      const { uploadFile, mediaUrl } = await import("@/lib/storage");
      const jpeg = await extractLastFrameJpeg(videoUrl);
      const key = `v2/frames/${sessionId}/${crypto.randomUUID()}.jpg`;
      await uploadFile(key, jpeg, "image/jpeg");
      lastFrameUrl = mediaUrl(key);
    } catch (err) {
      console.warn("[chat] last-frame extract on shot_approval failed", err);
    }
    await db.insert(filmSessionMessages).values({
      id: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
      sessionId,
      role: "user",
      type: "shot_approval",
      parts: [{
        toolCallId: body.toolCallId,
        videoUrl,
        ...(lastFrameUrl ? { lastFrameUrl } : {}),
      }],
      createdAt: new Date(),
    });
  } else if (body.type !== "trigger") {
    return badRequest("Unknown message type");
  }

  const rows = await db
    .select()
    .from(filmSessionMessages)
    .where(eq(filmSessionMessages.sessionId, sessionId))
    .orderBy(asc(filmSessionMessages.createdAt));

  const modelMessages = rowsToModelMessages(rows);
  if (modelMessages.length === 0) return badRequest("No messages to process");

  const assistantMsgId = crypto.randomUUID();

  return sseResponse(async (emit) => {
    const result = streamText({
      model: openrouter.chat(MODEL, { extraBody: { session_id: sessionId, cache_control: { type: "ephemeral" } } }),
      system: AI_FILM_STAGE1_SKILL,
      messages: modelMessages,
      tools: storyTools,
      seed: session.seed ?? undefined,
      // Allow the model to call loadReference / webExtract (auto-executed) and then continue
      // responding in the same turn. Cap at 10 to prevent runaway loops.
      stopWhen: stepCountIs(10),
      providerOptions: {
        openrouter: {
          cacheControl: { type: "ephemeral" },
          reasoning: { effort: "medium" }
        }
      }
    });

    type RawToolCall = {
      id: string;
      type: "function";
      function: { name: string; arguments: Record<string, unknown> };
    };

    let fullText = "";
    const toolCalls: RawToolCall[] = [];
    const pendingAssetIndices: number[] = [];
    const pendingGridIndices: number[] = [];
    const pendingShotIndices: number[] = [];
    // Auto-executed tools whose execute() output must be persisted for history replay
    const autoToolResults = new Map<string, unknown>(); // toolCallId → execute() return value

    for await (const chunk of result.fullStream) {
      if (chunk.type === "text-delta") {
        fullText += chunk.text;
        emit({ type: "text_delta", text: chunk.text });
      } else if (chunk.type === "tool-input-start") {
        if (chunk.toolName === "presentFork") {
          emit({ type: "fork_loading", toolCallId: chunk.id });
        } else if (chunk.toolName === "generateAssetReferences") {
          emit({ type: "asset_ref_loading", toolCallId: chunk.id });
        } else if (chunk.toolName === "generateSceneGrid") {
          emit({ type: "scene_grid_loading", toolCallId: chunk.id });
        } else if (chunk.toolName === "compileShot") {
          emit({ type: "shot_compile_loading", toolCallId: chunk.id });
        }
      } else if (chunk.type === "tool-call") {
        const args = chunk.input as Record<string, unknown>;
        const rawCall: RawToolCall = {
          id: chunk.toolCallId,
          type: "function",
          function: { name: chunk.toolName, arguments: args },
        };
        toolCalls.push(rawCall);

        if (chunk.toolName === "presentFork") {
          emit({ type: "fork", toolCallId: chunk.toolCallId, ...args });
        } else if (chunk.toolName === "generateAssetReferences") {
          pendingAssetIndices.push(toolCalls.length - 1);
        } else if (chunk.toolName === "generateSceneGrid") {
          pendingGridIndices.push(toolCalls.length - 1);
        } else if (chunk.toolName === "compileShot") {
          pendingShotIndices.push(toolCalls.length - 1);
        }
      } else if (
        chunk.type === "tool-result" &&
        (chunk.toolName === "loadReference" ||
          chunk.toolName === "webExtract" ||
          chunk.toolName === "recordSceneGridEntry")
      ) {
        autoToolResults.set(chunk.toolCallId, chunk.output);
      }
    }

    // Generate images for all asset reference tool calls in parallel
    if (pendingAssetIndices.length > 0) {
      await Promise.all(
        pendingAssetIndices.map(async (idx) => {
          const tc = toolCalls[idx]!;
          const args = tc.function.arguments as {
            assetHandle: string;
            assetKind: "character" | "location";
            imagePrompt: string;
          };
          const generatedImages = await generateAssetImages(args.imagePrompt, args.assetKind);
          tc.function.arguments = { ...args, generatedImages };
          emit({ type: "asset_ref", toolCallId: tc.id, assetHandle: args.assetHandle, assetKind: args.assetKind, images: generatedImages });
        })
      );
    }

    // Generate images for all scene grid tool calls in parallel
    if (pendingGridIndices.length > 0) {
      await Promise.all(
        pendingGridIndices.map(async (idx) => {
          const tc = toolCalls[idx]!;
          const args = tc.function.arguments as {
            sceneId: string | number;
            imagePrompt: string;
            referenceImageUrls: string[];
            panelCount?: number;
            panelCaptions?: { motionArc: string; handoff: string }[];
            aspectRatio: "16:9" | "9:16" | "1:1";
          };
          const captionError = validatePanelCaptionCount(args.panelCount, args.panelCaptions);
          if (captionError) {
            tc.function.arguments = { ...args, gridError: captionError };
            emit({
              type: "scene_grid",
              toolCallId: tc.id,
              sceneId: args.sceneId,
              error: captionError,
              panelCount: args.panelCount,
              panelCaptions: args.panelCaptions,
              aspectRatio: args.aspectRatio ?? "16:9",
            });
            return;
          }
          const aspectRatio = args.aspectRatio ?? "16:9";
          const generatedImages = await generateSceneGridImages(args.imagePrompt, args.referenceImageUrls, aspectRatio);
          tc.function.arguments = { ...args, generatedImages };
          emit({
            type: "scene_grid",
            toolCallId: tc.id,
            sceneId: args.sceneId,
            images: generatedImages,
            panelCount: args.panelCount,
            panelCaptions: args.panelCaptions,
            aspectRatio,
          });
        })
      );
    }

    // Save the assistant message before emitting shot_compiled events so the
    // row exists in DB for the /render-shot endpoint to find and patch later.
    const assistantRowId = crypto.randomUUID();
    await db.insert(filmSessionMessages).values({
      id: assistantRowId,
      messageId: assistantMsgId,
      sessionId,
      role: "assistant",
      type: "turn",
      parts: [{
        text: fullText,
        toolCalls,
        toolResults: Object.fromEntries(autoToolResults),
      }],
      createdAt: new Date(),
    });

    // Emit the compiled prompt for each shot so the client can show it for
    // user review. No render is started here — the client calls /render-shot
    // after the user approves (or edits) the prompt.
    for (const idx of pendingShotIndices) {
      const tc = toolCalls[idx]!;
      const args = tc.function.arguments as {
        prompt: string;
        referenceImageUrls: string[];
        duration: number;
        aspectRatio: "16:9" | "9:16" | "1:1";
        continuityMode?: "fresh" | "extend_video";
        sourceVideoUrl?: string;
      };
      emit({
        type: "shot_compiled",
        toolCallId: tc.id,
        renderPrompt: args.prompt,
        referenceImageUrls: args.referenceImageUrls ?? [],
        duration: args.duration,
        aspectRatio: args.aspectRatio ?? "16:9",
        continuityMode: args.continuityMode ?? "fresh",
        sourceVideoUrl: args.sourceVideoUrl,
      });
    }

    emit({ type: "done", messageId: assistantMsgId });
  });
}
