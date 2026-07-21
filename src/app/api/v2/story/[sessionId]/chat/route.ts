import { NextRequest } from "next/server";
import { streamText, stepCountIs } from "ai";
import { db } from "@/server/db";
import { filmSessions, filmSessionMessages } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq, asc } from "drizzle-orm";
import { storyTools, MODEL, openrouter } from "@/server/services/showrunner";
import {
  rowsToModelMessages,
  lightingStateByGenerationId,
} from "@/server/services/showrunner/messages";
import { AI_FILM_STAGE1_SKILL } from "@/server/services/showrunner/system-prompt";
import { toCompileShotArgs } from "@/server/services/showrunner/tools";
import type { AssetSpecInput } from "@/server/services/showrunner/tools/generate-asset-references";
import type { VoiceSpecInput } from "@/server/services/showrunner/tools/generate-voice-anchors";
import type { GenerateGenerationGridInput } from "@/server/services/showrunner/tools/generate-generation-grid";
import {
  effectiveGridRefs,
} from "@/server/services/showrunner/tools/generate-generation-grid";
import { createRecordGenerationGridEntryTool } from "@/server/services/showrunner/tools/record-generation-grid-entry";
import { createLoadApprovedImageTool } from "@/server/services/showrunner/tools/load-approved-image";
import { enqueueWorkerJob, JOB_NAMES, type WorkerJobName } from "@/lib/worker-queue";
import { storageKeyFrom } from "@/lib/storage";
import {
  approveHandle,
  gridHandleFromIds,
  lastFrameHandle,
  resolveHandles,
  shotClipHandle,
  unknownHandlesError,
} from "@/server/services/showrunner/handle-resolver";

/** Parse `{ ok, errors? }` from tool execute() output (raw or AI SDK wrapped). */
function parseToolOk(output: unknown): { ok: boolean; errors?: string[] } | null {
  const raw =
    typeof output === "object" &&
      output !== null &&
      "value" in output &&
      typeof (output as { value: unknown }).value === "string"
      ? (output as { value: string }).value
      : typeof output === "string"
        ? output
        : null;
  if (!raw) {
    if (typeof output === "object" && output !== null && "ok" in output) {
      return output as { ok: boolean; errors?: string[] };
    }
    return null;
  }
  try {
    return JSON.parse(raw) as { ok: boolean; errors?: string[] };
  } catch {
    return null;
  }
}

type StoredTc = {
  id: string;
  type: "function";
  function: { name: string; arguments: Record<string, unknown> };
};

/** Look up a tool call's arguments from session message history. */
async function findToolCallArgs(
  sessionId: string,
  toolCallId: string
): Promise<Record<string, unknown> | null> {
  const rows = await db
    .select()
    .from(filmSessionMessages)
    .where(eq(filmSessionMessages.sessionId, sessionId));
  for (const row of rows) {
    if (row.role !== "assistant") continue;
    const d = ((row.parts as unknown[])[0] ?? {}) as Record<string, unknown>;
    const calls = (Array.isArray(d.toolCalls) ? d.toolCalls : []) as StoredTc[];
    const found = calls.find((tc) => tc.id === toolCallId);
    if (found) return found.function.arguments;
  }
  return null;
}

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

/**
 * Map an incoming client message body to a filmSessionMessages row payload.
 * Returns null for "trigger" (nothing to persist) and { error } for invalid bodies.
 */
async function buildUserMessage(
  sessionId: string,
  body: Record<string, unknown>
): Promise<{ type: string; parts: object[] } | { error: string } | null> {
  switch (body.type) {
    case "trigger":
      return null;

    case "user": {
      const text = (body.text as string)?.trim();
      if (!text) return { error: "text required" };
      return { type: "text", parts: [{ text }] };
    }

    case "questions_result": {
      const answers = Array.isArray(body.answers)
        ? (body.answers as string[])
        : null;
      if (!answers?.length) return { error: "answers required" };
      return {
        type: "questions_result",
        parts: [{ toolCallId: body.toolCallId, answers }],
      };
    }

    case "asset_approval": {
      const approvals = Array.isArray(body.approvals)
        ? (body.approvals as Array<{
          assetHandle: string;
          candidateId: string;
          approvedUrl: string;
        }>)
        : body.assetHandle && body.approvedUrl
          ? [
            {
              assetHandle: body.assetHandle as string,
              candidateId: (body.candidateId as string) ?? (body.approvedUrl as string),
              approvedUrl: body.approvedUrl as string,
            },
          ]
          : null;
      if (!approvals?.length) return { error: "approvals required" };

      // Canonicalize each approved candidate under refs/{handle}.{ext}
      const canonicalized = await Promise.all(
        approvals.map(async (a) => {
          const src = a.candidateId || a.approvedUrl;
          try {
            const key = await approveHandle(sessionId, a.assetHandle, src);
            return { ...a, approvedUrl: key, candidateId: a.candidateId || src };
          } catch (err) {
            console.warn("[chat] approveHandle failed for asset", a.assetHandle, err);
            return a;
          }
        })
      );

      return {
        type: "asset_approval",
        parts: [{
          toolCallId: body.toolCallId,
          approvals: canonicalized,
          // Legacy single-asset fields (first approval) for older readers
          assetHandle: canonicalized[0]!.assetHandle,
          approvedUrl: canonicalized[0]!.approvedUrl,
        }],
      };
    }

    case "grid_approval": {
      const approvedUrl = body.approvedUrl as string;
      const toolCallId = body.toolCallId as string;
      let canonicalUrl = approvedUrl;
      try {
        const args = await findToolCallArgs(sessionId, toolCallId);
        const sceneId =
          (args?.sceneId as string | number | undefined) ??
          (typeof body.sceneId === "string" || typeof body.sceneId === "number"
            ? body.sceneId
            : undefined);
        const generationId = args?.generationId as string | undefined;
        if (sceneId != null && generationId) {
          const handle = gridHandleFromIds(sceneId, generationId);
          canonicalUrl = await approveHandle(sessionId, handle, approvedUrl);
        }
      } catch (err) {
        console.warn("[chat] approveHandle failed for grid", err);
      }
      return {
        type: "grid_approval",
        parts: [{
          toolCallId,
          sceneId: body.sceneId,
          approvedUrl: canonicalUrl,
        }],
      };
    }

    case "shot_approval": {
      const videoUrl = body.videoUrl as string;
      const toolCallId = body.toolCallId as string;
      let lastFrameUrl: string | undefined;
      let clipHandle: string | undefined;
      let frameHandle: string | undefined;

      const args = await findToolCallArgs(sessionId, toolCallId);
      const shotId = (args?.shot_id as string | undefined) ?? undefined;
      // Prefer explicit generation id from grid_reference (@scene3_gen3A_grid → 3A)
      const gridRef = args?.grid_reference as string | null | undefined;
      const genFromGrid = gridRef
        ? String(gridRef).match(/_gen([^_]+)_grid$/i)?.[1]
        : undefined;
      const generationId = genFromGrid;

      try {
        if (shotId) {
          clipHandle = shotClipHandle(shotId);
          const videoKey = storageKeyFrom(videoUrl) ?? videoUrl;
          await approveHandle(sessionId, clipHandle, videoKey, "mp4");
        }
      } catch (err) {
        console.warn("[chat] shot clip alias failed", err);
      }

      try {
        const { extractLastFrameJpeg } = await import("@/lib/media-probe");
        const { uploadFile } = await import("@/lib/storage");
        const jpeg = await extractLastFrameJpeg(videoUrl);
        if (generationId) {
          frameHandle = lastFrameHandle(generationId);
          // Upload to candidate then approve to canonical
          const { candidateKey } = await import(
            "@/server/services/showrunner/handle-resolver"
          );
          const cand = candidateKey(sessionId, frameHandle, "jpg");
          await uploadFile(cand, jpeg, "image/jpeg");
          lastFrameUrl = await approveHandle(sessionId, frameHandle, cand, "jpg");
        } else {
          const key = `v2/frames/${sessionId}/${crypto.randomUUID()}.jpg`;
          await uploadFile(key, jpeg, "image/jpeg");
          lastFrameUrl = key;
        }
      } catch (err) {
        console.warn("[chat] last-frame extract on shot_approval failed", err);
      }
      return {
        type: "shot_approval",
        parts: [{
          toolCallId,
          videoUrl,
          ...(lastFrameUrl ? { lastFrameUrl } : {}),
          ...(clipHandle ? { clipHandle: `@${clipHandle}` } : {}),
          ...(frameHandle ? { lastFrameHandle: `@${frameHandle}` } : {}),
        }],
      };
    }

    default:
      return { error: "Unknown message type" };
  }
}

type Emit = (event: object) => void;

type RawToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: Record<string, unknown> };
};

type QueuedImageJob = {
  jobName: WorkerJobName;
  toolCallId: string;
  payload: Record<string, unknown>;
};

/** Loading event streamed to the client as soon as a tool call's input starts. */
const TOOL_LOADING_EVENTS: Record<string, string> = {
  askQuestions: "questions_loading",
  generateAssetReferences: "asset_ref_loading",
  generateVoiceAnchors: "asset_ref_loading",
  generateGenerationGrid: "generation_grid_loading",
  compileShot: "shot_compile_loading",
};

/** Auto-executed tools whose execute() output must be persisted for history replay. */
const PERSISTED_RESULT_TOOLS = new Set([
  "loadReference",
  "loadApprovedImage",
  "webExtract",
  "recordGenerationGridEntry",
  "generateGenerationGrid",
  "compileShot",
]);

function gridEventPayload(toolCallId: string, args: GenerateGenerationGridInput) {
  return {
    type: "generation_grid" as const,
    toolCallId,
    sceneId: args.sceneId,
    generationId: args.generationId,
    shotIds: args.shotIds,
    estimatedDurationSeconds: args.estimatedDurationSeconds,
    previousGenerationId: args.previousGenerationId,
    sceneAnchorHandle: args.sceneAnchorHandle,
    incomingAnchorHandle: args.incomingAnchorHandle,
    continuityBreakReason: args.continuityBreakReason,
    panelCount: args.panelCount,
    panelCaptions: args.panelCaptions,
  };
}

function queueAssetRefJob(tc: RawToolCall, emit: Emit, userId: string): QueuedImageJob {
  const args = tc.function.arguments as {
    assets?: AssetSpecInput[];
    // Legacy single-asset shape
    assetHandle?: string;
    assetKind?: AssetSpecInput["assetKind"];
    imagePrompt?: string;
  };
  const assets: AssetSpecInput[] = args.assets?.length
    ? args.assets
    : args.assetHandle && args.assetKind && args.imagePrompt
      ? [
        {
          assetHandle: args.assetHandle,
          assetKind: args.assetKind,
          imagePrompt: args.imagePrompt,
        },
      ]
      : [];
  tc.function.arguments = { ...args, assets, pending: true };
  emit({
    type: "asset_ref",
    toolCallId: tc.id,
    pending: true,
    items: assets.map((a) => ({
      assetHandle: a.assetHandle,
      assetKind: a.assetKind,
      loading: true,
    })),
  });
  return {
    jobName: JOB_NAMES.GENERATE_ASSET_IMAGES,
    toolCallId: tc.id,
    payload: { assets, userId },
  };
}

function queueVoiceAnchorJob(tc: RawToolCall, emit: Emit, userId: string): QueuedImageJob {
  const args = tc.function.arguments as { voices?: VoiceSpecInput[] };
  const voices = args.voices ?? [];
  tc.function.arguments = { ...args, voices, pending: true };
  emit({
    type: "asset_ref",
    toolCallId: tc.id,
    pending: true,
    items: voices.map((v) => ({
      assetHandle: v.handle,
      assetKind: "voice" as const,
      sampleText: v.sampleText,
      loading: true,
    })),
  });
  return {
    jobName: JOB_NAMES.GENERATE_VOICE_ANCHORS,
    toolCallId: tc.id,
    payload: { voices, userId },
  };
}

async function queueGenerationGridJob(
  tc: RawToolCall,
  emit: Emit,
  sessionId: string
): Promise<QueuedImageJob | null> {
  const args = tc.function.arguments as GenerateGenerationGridInput & {
    resolvedReferenceUrls?: string[];
  };
  const handleList = effectiveGridRefs(args);
  const { keys, unknown } = await resolveHandles(sessionId, handleList);
  if (unknown.length > 0) {
    const err = await unknownHandlesError(sessionId, unknown);
    const gridError = err.errors.join("; ");
    tc.function.arguments = { ...args, gridError };
    emit({ ...gridEventPayload(tc.id, args), error: gridError });
    // Patch the auto tool result so the model sees the failure on replay
    return null;
  }

  tc.function.arguments = {
    ...args,
    pending: true,
    resolvedReferenceUrls: keys,
  };
  emit({ ...gridEventPayload(tc.id, args), pending: true });
  return {
    jobName: JOB_NAMES.GENERATE_GENERATION_GRID,
    toolCallId: tc.id,
    payload: {
      sceneId: args.sceneId,
      generationId: args.generationId,
      shotIds: args.shotIds,
      estimatedDurationSeconds: args.estimatedDurationSeconds,
      previousGenerationId: args.previousGenerationId,
      sceneAnchorHandle: args.sceneAnchorHandle,
      incomingAnchorHandle: args.incomingAnchorHandle,
      continuityBreakReason: args.continuityBreakReason,
      panelCount: args.panelCount,
      panelCaptions: args.panelCaptions,
      imagePrompt: args.imagePrompt,
      referenceImageUrls: keys,
    },
  };
}

/** Resolve compileShot handles → storage keys; patch onto args. Returns false on unknown. */
async function resolveCompileHandles(
  tc: RawToolCall,
  sessionId: string,
  emit: Emit
): Promise<boolean> {
  const args = tc.function.arguments;
  const references = (args.references as Array<{ handle: string }> | undefined) ?? [];
  const audioRefs =
    (args.audio_references as Array<{ handle: string }> | undefined) ?? [];
  const imageHandles = references.map((r) => r.handle).filter(Boolean);
  const audioHandles = audioRefs.map((r) => r.handle).filter(Boolean);
  const sourceClip =
    (args.source_clip_handle as string | null | undefined)?.trim() || null;

  const allHandles = [
    ...imageHandles,
    ...audioHandles,
    ...(sourceClip ? [sourceClip] : []),
  ];

  // Legacy URL packages: nothing to resolve
  if (
    allHandles.length === 0 &&
    ((args.reference_image_urls as string[] | undefined)?.length ?? 0) > 0
  ) {
    return true;
  }

  const { keys, unknown } = await resolveHandles(sessionId, allHandles);
  if (unknown.length > 0) {
    const err = await unknownHandlesError(sessionId, unknown);
    const shotError = err.errors.join("; ");
    tc.function.arguments = { ...args, shotError };
    emit({
      type: "shot_compile_error",
      toolCallId: tc.id,
      error: shotError,
      gaps: args.gaps,
    });
    return false;
  }

  const imageKeys = keys.slice(0, imageHandles.length);
  const audioKeys = keys.slice(
    imageHandles.length,
    imageHandles.length + audioHandles.length
  );
  const sourceKey =
    sourceClip != null
      ? keys[imageHandles.length + audioHandles.length]
      : undefined;

  tc.function.arguments = {
    ...args,
    resolvedReferenceUrls: imageKeys,
    resolvedAudioUrls: audioKeys,
    ...(sourceKey ? { resolvedSourceVideoUrl: sourceKey } : {}),
  };
  return true;
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

  const incoming = await buildUserMessage(sessionId, body);
  if (incoming && "error" in incoming) return badRequest(incoming.error);
  if (incoming) {
    await db.insert(filmSessionMessages).values({
      id: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
      sessionId,
      role: "user",
      type: incoming.type,
      parts: incoming.parts,
      createdAt: new Date(),
    });
  }

  const rows = await db
    .select()
    .from(filmSessionMessages)
    .where(eq(filmSessionMessages.sessionId, sessionId))
    .orderBy(asc(filmSessionMessages.createdAt));

  const modelMessages = await rowsToModelMessages(rows);
  if (modelMessages.length === 0) return badRequest("No messages to process");

  const lightingByGen = lightingStateByGenerationId(rows);
  const tools = {
    ...storyTools,
    loadApprovedImage: createLoadApprovedImageTool(sessionId),
    recordGenerationGridEntry: createRecordGenerationGridEntryTool({
      resolveLightingState: (generationId) => lightingByGen.get(generationId),
    }),
  };

  const assistantMsgId = crypto.randomUUID();

  return sseResponse(async (emit) => {
    const result = streamText({
      model: openrouter.chat(MODEL, { extraBody: { session_id: sessionId, cache_control: { type: "ephemeral" } } }),
      system: AI_FILM_STAGE1_SKILL,
      messages: modelMessages,
      tools,
      seed: session.seed ?? undefined,
      // Allow the model to call loadReference / loadApprovedImage / webExtract (auto-executed)
      // and then continue responding in the same turn. Cap at 10 to prevent runaway loops.
      stopWhen: stepCountIs(10),
      providerOptions: {
        openrouter: {
          cacheControl: { type: "ephemeral" },
          reasoning: { effort: "medium" }
        }
      }
    });

    let fullText = "";
    const toolCalls: RawToolCall[] = [];
    // Image-generating tool calls that passed validation — queued as worker jobs after the stream.
    const pendingImageCalls: RawToolCall[] = [];
    const pendingShotCalls: RawToolCall[] = [];
    const autoToolResults = new Map<string, unknown>(); // toolCallId → execute() return value

    for await (const chunk of result.fullStream) {
      if (chunk.type === "text-delta") {
        fullText += chunk.text;
        emit({ type: "text_delta", text: chunk.text });
      } else if (chunk.type === "tool-input-start") {
        const loadingEvent = TOOL_LOADING_EVENTS[chunk.toolName];
        if (loadingEvent) emit({ type: loadingEvent, toolCallId: chunk.id });
      } else if (chunk.type === "tool-call") {
        const args = chunk.input as Record<string, unknown>;
        const rawCall: RawToolCall = {
          id: chunk.toolCallId,
          type: "function",
          function: { name: chunk.toolName, arguments: args },
        };
        toolCalls.push(rawCall);

        if (chunk.toolName === "askQuestions") {
          emit({ type: "questions", toolCallId: chunk.toolCallId, ...args });
        } else if (chunk.toolName === "generateAssetReferences") {
          pendingImageCalls.push(rawCall);
        } else if (chunk.toolName === "generateVoiceAnchors") {
          pendingImageCalls.push(rawCall);
        }
        // compileShot / generateGenerationGrid are queued after execute() validates (see tool-result)
      } else if (chunk.type === "tool-result") {
        if (PERSISTED_RESULT_TOOLS.has(chunk.toolName)) {
          autoToolResults.set(chunk.toolCallId, chunk.output);
        }
        const tc = toolCalls.find((c) => c.id === chunk.toolCallId);
        if (!tc) continue;

        if (chunk.toolName === "compileShot") {
          const args = tc.function.arguments;
          const parsed = parseToolOk(chunk.output);
          if (parsed?.ok === false) {
            const shotError =
              Array.isArray(parsed.errors) && parsed.errors.length > 0
                ? parsed.errors.join("; ")
                : "Shot compile validation failed";
            tc.function.arguments = { ...args, shotError };
            emit({
              type: "shot_compile_error",
              toolCallId: chunk.toolCallId,
              error: shotError,
              gaps: args.gaps,
            });
          } else if ((args.status as string | undefined) === "gap") {
            emit({
              type: "shot_compile_gap",
              toolCallId: chunk.toolCallId,
              shotId: args.shot_id,
              gaps: args.gaps ?? [],
            });
          } else {
            pendingShotCalls.push(tc);
          }
        } else if (chunk.toolName === "generateGenerationGrid") {
          const args = tc.function.arguments as GenerateGenerationGridInput;
          const parsed = parseToolOk(chunk.output);
          if (parsed?.ok === false) {
            const gridError =
              Array.isArray(parsed.errors) && parsed.errors.length > 0
                ? parsed.errors.join("; ")
                : "Generation grid validation failed";
            tc.function.arguments = { ...args, gridError };
            emit({ ...gridEventPayload(chunk.toolCallId, args), error: gridError });
          } else {
            pendingImageCalls.push(tc);
          }
        }
      }
    }

    // Queue image jobs (do not await generation — worker continues if client disconnects).
    const pendingHandlers: Record<
      string,
      (tc: RawToolCall) => QueuedImageJob | null | Promise<QueuedImageJob | null>
    > = {
      generateAssetReferences: (tc) => queueAssetRefJob(tc, emit, session.userId),
      generateVoiceAnchors: (tc) => queueVoiceAnchorJob(tc, emit, session.userId),
      generateGenerationGrid: (tc) => queueGenerationGridJob(tc, emit, sessionId),
    };
    const queuedImageJobs: QueuedImageJob[] = [];
    for (const tc of pendingImageCalls) {
      const job = await pendingHandlers[tc.function.name]?.(tc);
      if (job) queuedImageJobs.push(job);
    }

    // Resolve compileShot handles before persisting / emitting for review.
    const resolvedShotCalls: RawToolCall[] = [];
    for (const tc of pendingShotCalls) {
      const ok = await resolveCompileHandles(tc, sessionId, emit);
      if (ok) resolvedShotCalls.push(tc);
    }

    // Save the assistant message before enqueueing so the worker can patch it.
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

    for (const job of queuedImageJobs) {
      await enqueueWorkerJob(sessionId, job.jobName, {
        toolCallId: job.toolCallId,
        assistantMessageRowId: assistantRowId,
        ...job.payload,
      });
    }

    // Emit the compiled prompt for each shot so the client can show it for
    // user review. No render is started here — the client calls /render-shot
    // after the user approves (or edits) the prompt.
    for (const tc of resolvedShotCalls) {
      const args = tc.function.arguments;
      const compiled = toCompileShotArgs(args);
      if (!compiled) continue;
      emit({
        type: "shot_compiled",
        toolCallId: tc.id,
        renderPrompt: compiled.prompt,
        referenceImageUrls: compiled.referenceImageUrls ?? [],
        referenceAudioUrls: compiled.referenceAudioUrls ?? [],
        duration: compiled.duration,
        aspectRatio: compiled.aspectRatio ?? "16:9",
        continuityMode: compiled.continuityMode ?? "fresh",
        sourceVideoUrl: compiled.sourceVideoUrl,
        shotId: args.shot_id,
        gridReference: args.grid_reference,
        references: args.references,
        audioReferences: args.audio_references,
        checks: args.checks,
      });
    }

    emit({
      type: "done",
      messageId: assistantMsgId,
      jobsQueued: queuedImageJobs.length > 0,
    });
  });
}
