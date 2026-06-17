import { NextRequest } from "next/server";
import { streamText, stepCountIs } from "ai";
import { db } from "@/server/db";
import { filmSessions, filmSessionMessages } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq, asc } from "drizzle-orm";
import { storyTools, MODEL, openrouter, generateShotWithFallback } from "@/server/services/showrunner";
import { rowsToModelMessages } from "@/server/services/showrunner/messages";
import { AI_FILM_STAGE1_SKILL } from "@/server/services/showrunner/system-prompt";
import { generateImage } from "@/server/services/media";
import { uploadFile, mediaUrl } from "@/lib/storage";

const ASSET_CANDIDATE_COUNT = 2;

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
  } else if (body.type === "shot_approval") {
    await db.insert(filmSessionMessages).values({
      id: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
      sessionId,
      role: "user",
      type: "shot_approval",
      parts: [{
        toolCallId: body.toolCallId,
        videoUrl: body.videoUrl,
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
      // Allow the model to call loadReference (auto-executed) and then continue
      // responding in the same turn. Cap at 10 to prevent runaway loops.
      stopWhen: stepCountIs(10),
      providerOptions: {
        openrouter: {
          cacheControl: { type: "ephemeral" }
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
    const pendingShotIndices: number[] = [];
    const loadReferenceResults = new Map<string, unknown>(); // toolCallId → execute() return value

    for await (const chunk of result.fullStream) {
      if (chunk.type === "text-delta") {
        fullText += chunk.text;
        emit({ type: "text_delta", text: chunk.text });
      } else if (chunk.type === "tool-input-start") {
        if (chunk.toolName === "presentFork") {
          emit({ type: "fork_loading", toolCallId: chunk.id });
        } else if (chunk.toolName === "generateAssetReferences") {
          emit({ type: "asset_ref_loading", toolCallId: chunk.id });
        } else if (chunk.toolName === "generateShot") {
          emit({ type: "shot_loading", toolCallId: chunk.id });
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
        } else if (chunk.toolName === "generateShot") {
          pendingShotIndices.push(toolCalls.length - 1);
        }
      } else if (chunk.type === "tool-result" && chunk.toolName === "loadReference") {
        loadReferenceResults.set(chunk.toolCallId, chunk.output);
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
          const ar = args.assetKind === "location" ? "16:9" as const : "1:1" as const;
          const results = await Promise.all(
            Array.from({ length: ASSET_CANDIDATE_COUNT }, () =>
              generateImage(args.imagePrompt, "gpt-image-1.5", undefined, ar)
            )
          );
          const generatedImages = results.map((r) => r.url);
          tc.function.arguments = { ...args, generatedImages };
          emit({ type: "asset_ref", toolCallId: tc.id, assetHandle: args.assetHandle, assetKind: args.assetKind, images: generatedImages });
        })
      );
    }

    // Render shots sequentially (one per call per SKILL.md contract)
    for (const idx of pendingShotIndices) {
      const tc = toolCalls[idx]!;
      const args = tc.function.arguments as {
        prompt: string;
        referenceImageUrls: string[];
        duration: number;
        aspectRatio: "16:9" | "9:16" | "1:1";
      };
      try {
        const result = await generateShotWithFallback(
          args.referenceImageUrls,
          args.prompt,
          args.aspectRatio,
          args.duration,
          sessionId
        );
        // Download from Replicate and upload to R2 so the URL never expires
        const videoResp = await fetch(result.videoUrl);
        const videoBuffer = Buffer.from(await videoResp.arrayBuffer());
        const key = `v2/shots/${sessionId}/${tc.id}.mp4`;
        await uploadFile(key, videoBuffer, "video/mp4");
        const persistentUrl = mediaUrl(key);
        tc.function.arguments = { ...args, videoUrl: persistentUrl };
        emit({ type: "shot_generated", toolCallId: tc.id, videoUrl: persistentUrl });
      } catch (err) {
        emit({ type: "shot_error", toolCallId: tc.id, error: String(err) });
      }
    }

    await db.insert(filmSessionMessages).values({
      id: crypto.randomUUID(),
      messageId: assistantMsgId,
      sessionId,
      role: "assistant",
      type: "turn",
      parts: [{
        text: fullText,
        toolCalls,
        toolResults: Object.fromEntries(loadReferenceResults),
      }],
      createdAt: new Date(),
    });

    emit({ type: "done", messageId: assistantMsgId });
  });
}
