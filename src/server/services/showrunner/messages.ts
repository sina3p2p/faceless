import type { ModelMessage } from "ai";
import type {
  AssetRef,
  ClientMessage,
  ContinuityPack,
  QuestionItem,
  QuestionsCall,
  GenerationGrid,
  ShotCompile,
  ShotResult,
} from "@/types/v2/story";
import { mediaUrl, mediaUrls, storageKeyFrom } from "@/lib/storage";
import { filmstripTileCount } from "@/lib/filmstrip";
import { db } from "@/server/db";
import { filmSessionMessages } from "@/server/db/schema";
import { and, desc, eq, lt } from "drizzle-orm";

type DbRow = {
  messageId: string;
  role: string;
  type: string;
  parts: unknown;
  createdAt?: Date | null;
};

export const MESSAGES_PAGE_SIZE = 30;

/** Max images auto-attached as vision when replaying session history. */
export const MAX_HISTORY_VISION_IMAGES = 5;

const VISION_HINT =
  "Image not attached — older than vision window. Call loadApprovedImage with the URL to inspect pixels.";

type RawToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: Record<string, unknown> };
};

/** AI SDK tool-result `output` discriminator values. */
const TOOL_RESULT_OUTPUT_TYPES = new Set([
  "text",
  "json",
  "error-text",
  "error-json",
  "content",
  "execution-denied",
]);

/**
 * fullStream's tool-result `output` is the raw execute() return value.
 * ModelMessage tool parts need ToolResultOutput `{ type, value }`.
 * loadReference already returns that shape; tavilyExtract returns a plain object.
 */
function toToolResultOutput(stored: unknown, fallback: string) {
  if (
    stored &&
    typeof stored === "object" &&
    "type" in stored &&
    typeof (stored as { type: unknown }).type === "string" &&
    TOOL_RESULT_OUTPUT_TYPES.has((stored as { type: string }).type)
  ) {
    return stored as { type: "text"; value: string };
  }
  if (stored !== undefined && stored !== null) {
    // JSONValue-compatible wrap for raw tool payloads (e.g. Tavily extract)
    return { type: "json" as const, value: stored as Record<string, unknown> };
  }
  return { type: "text" as const, value: fallback };
}

function rowData(row: DbRow): Record<string, unknown> {
  return ((row.parts as unknown[])[0] ?? {}) as Record<string, unknown>;
}

function getToolCalls(d: Record<string, unknown>): RawToolCall[] {
  if (Array.isArray(d.toolCalls)) return d.toolCalls as RawToolCall[];

  // Legacy format
  const calls: RawToolCall[] = [];
  if (d.forkCall) {
    const fc = d.forkCall as Record<string, unknown>;
    calls.push({
      id: fc.toolCallId as string,
      type: "function",
      function: { name: "presentFork", arguments: fc },
    });
  }
  if (d.assetCall) {
    const ac = d.assetCall as Record<string, unknown>;
    calls.push({
      id: ac.toolCallId as string,
      type: "function",
      function: {
        name: "generateAssetReferences",
        arguments: { ...ac, generatedImages: ac.images },
      },
    });
  }
  return calls;
}

/** Legacy presentFork args → QuestionItem[]. */
function legacyForkToQuestions(args: Record<string, unknown>): QuestionItem[] {
  const options = args.options as
    | Array<{ id?: string; label?: string; content?: string }>
    | undefined;
  if (!options?.length) {
    return [
      {
        question: (args.question as string) || "Pick a direction",
        options: [],
      },
    ];
  }
  const recommendedId = args.recommendedId as string | undefined;
  const recommendedIndex = recommendedId
    ? options.findIndex((o) => o.id === recommendedId)
    : undefined;
  return [
    {
      question: (args.question as string) || "Pick a direction",
      options: options.map((o) => {
        const label = o.label?.trim() ?? "";
        const content = o.content?.trim() ?? "";
        if (label && content) return `${label} — ${content}`;
        return label || content || o.id || "";
      }),
      recommendedIndex:
        recommendedIndex !== undefined && recommendedIndex >= 0
          ? recommendedIndex
          : undefined,
    },
  ];
}

function formatQaText(questions: QuestionItem[], answers: string[]): string {
  return questions
    .map((q, i) => `Q: ${q.question}\nA: ${answers[i] ?? "(unanswered)"}`)
    .join("\n\n");
}

function parseAnswers(d: Record<string, unknown>): string[] | undefined {
  if (Array.isArray(d.answers)) return d.answers as string[];
  // Legacy fork_result
  if (typeof d.value === "string") return [d.value];
  return undefined;
}

const USER_RESULT_TYPES = new Set([
  "questions_result",
  "fork_result",
  "asset_approval",
  "continuity_pack_approval",
  "grid_approval",
  "shot_approval",
]);

export async function rowsToClientMessages(rows: DbRow[]): Promise<ClientMessage[]> {
  const questionAnswers = new Map<string, string[]>();
  const assetApprovals = new Map<string, string>();
  const continuityPackApprovals = new Map<string, string[]>();
  const gridApprovals = new Map<string, string>();
  const shotApprovals = new Set<string>();

  for (const row of rows) {
    if (
      row.role === "user" &&
      (row.type === "questions_result" || row.type === "fork_result")
    ) {
      const d = rowData(row);
      const answers = parseAnswers(d);
      if (answers) questionAnswers.set(d.toolCallId as string, answers);
    } else if (row.role === "user" && row.type === "asset_approval") {
      const d = rowData(row);
      assetApprovals.set(d.toolCallId as string, d.approvedUrl as string);
    } else if (row.role === "user" && row.type === "continuity_pack_approval") {
      const d = rowData(row);
      continuityPackApprovals.set(
        d.toolCallId as string,
        (d.approvedUrls as string[]) ?? []
      );
    } else if (row.role === "user" && row.type === "grid_approval") {
      const d = rowData(row);
      gridApprovals.set(d.toolCallId as string, d.approvedUrl as string);
    } else if (row.role === "user" && row.type === "shot_approval") {
      const d = rowData(row);
      shotApprovals.add(d.toolCallId as string);
    }
  }

  const messages: ClientMessage[] = [];
  for (const row of rows) {
    if (row.role === "user" && USER_RESULT_TYPES.has(row.type)) continue;

    const d = rowData(row);
    const createdAt = row.createdAt?.toISOString();
    if (row.role === "user") {
      messages.push({ id: row.messageId, role: "user", text: d.text as string, createdAt });
    } else if (row.role === "assistant") {
      const calls = getToolCalls(d);
      let questions: QuestionsCall | undefined;
      let assetRef: AssetRef | undefined;
      let continuityPack: ContinuityPack | undefined;
      let generationGrid: GenerationGrid | undefined;
      let shotResult: ShotResult | undefined;
      let shotCompile: ShotCompile | undefined;

      for (const tc of calls) {
        const args = tc.function.arguments;
        if (
          tc.function.name === "askQuestions" ||
          tc.function.name === "presentFork"
        ) {
          const items =
            tc.function.name === "askQuestions"
              ? (args.questions as QuestionItem[])
              : legacyForkToQuestions(args);
          questions = {
            toolCallId: tc.id,
            loading: false,
            questions: items,
            answers: questionAnswers.get(tc.id),
          };
        } else if (tc.function.name === "generateAssetReferences") {
          const isPending = (args.pending as boolean | undefined) === true;
          const rawImages = (args.generatedImages ?? args.images) as string[] | undefined;
          const approved = assetApprovals.get(tc.id);
          assetRef = {
            toolCallId: tc.id,
            loading: isPending,
            assetHandle: args.assetHandle as string,
            assetKind: args.assetKind as AssetRef["assetKind"],
            images: rawImages ? await mediaUrls(rawImages) : undefined,
            approvedUrl: approved ? await mediaUrl(approved) : undefined,
            error: args.error as string | undefined,
          };
        } else if (tc.function.name === "generateContinuityPack") {
          const isPending = (args.pending as boolean | undefined) === true;
          const keyframes = args.keyframes as ContinuityPack["keyframes"];
          const rawImages = (args.generatedImages ?? args.images) as string[] | undefined;
          const approved = continuityPackApprovals.get(tc.id);
          continuityPack = {
            toolCallId: tc.id,
            loading: isPending,
            sceneId: args.sceneId as string | number,
            packHandle: args.packHandle as string,
            notes: args.notes as ContinuityPack["notes"],
            keyframes,
            images: rawImages ? await mediaUrls(rawImages) : undefined,
            aspectRatio: args.aspectRatio as ContinuityPack["aspectRatio"],
            approvedUrls: approved ? await mediaUrls(approved) : undefined,
            error: args.packError as string | undefined,
          };
        } else if (
          tc.function.name === "generateGenerationGrid" ||
          tc.function.name === "generateSceneGrid"
        ) {
          const isPending = (args.pending as boolean | undefined) === true;
          const rawImages = (args.generatedImages ?? args.images) as string[] | undefined;
          const approved = gridApprovals.get(tc.id);
          generationGrid = {
            toolCallId: tc.id,
            loading: isPending,
            sceneId: args.sceneId as string | number,
            generationId: args.generationId as string | undefined,
            shotIds: args.shotIds as number[] | undefined,
            estimatedDurationSeconds: args.estimatedDurationSeconds as number | undefined,
            previousGenerationId: args.previousGenerationId as string | null | undefined,
            incomingAnchorHandle: args.incomingAnchorHandle as string | null | undefined,
            continuityBreakReason: args.continuityBreakReason as string | null | undefined,
            images: rawImages ? await mediaUrls(rawImages) : undefined,
            panelCount: args.panelCount as number | undefined,
            panelCaptions: args.panelCaptions as GenerationGrid["panelCaptions"],
            aspectRatio: args.aspectRatio as GenerationGrid["aspectRatio"],
            approvedUrl: approved ? await mediaUrl(approved) : undefined,
            error: args.gridError as string | undefined,
          };
        } else if (tc.function.name === "compileShot") {
          const isPending = (args.pending as boolean | undefined) === true;
          const hasVideo = !!(args.videoUrl as string | undefined);
          if (isPending || hasVideo) {
            const videoUrl = args.videoUrl as string | undefined;
            const videoKey = videoUrl ? storageKeyFrom(videoUrl) : null;
            // Prefer explicit key; otherwise conventional sibling of the MP4
            // (…/toolCallId-filmstrip.jpg) so backfilled strips show without a message rewrite.
            const filmstripKey =
              (args.filmstripUrl as string | undefined) ??
              (videoKey ? videoKey.replace(/\.mp4$/i, "") + "-filmstrip.jpg" : undefined);
            const duration = args.renderedDurationSeconds as number | undefined;
            const filmstripTiles =
              (args.filmstripTiles as number | undefined) ??
              (duration != null ? filmstripTileCount(duration) : undefined);
            shotResult = {
              toolCallId: tc.id,
              loading: isPending,
              videoUrl: videoUrl ? await mediaUrl(videoUrl) : undefined,
              filmstripUrl: filmstripKey ? await mediaUrl(filmstripKey) : undefined,
              filmstripTiles,
              duration,
              error: args.shotError as string | undefined,
              approved: shotApprovals.has(tc.id),
            };
          } else {
            const refs = args.referenceImageUrls as string[] | undefined;
            const sourceVideoUrl = args.sourceVideoUrl as string | undefined;
            shotCompile = {
              toolCallId: tc.id,
              loading: false,
              renderPrompt: args.prompt as string,
              referenceImageUrls: refs ? await mediaUrls(refs) : [],
              duration: args.duration as number,
              aspectRatio: args.aspectRatio as ShotCompile["aspectRatio"],
              continuityMode: args.continuityMode as ShotCompile["continuityMode"],
              sourceVideoUrl: sourceVideoUrl
                ? await mediaUrl(sourceVideoUrl)
                : undefined,
            };
          }
        }
      }

      messages.push({
        id: row.messageId,
        role: "assistant",
        text: (d.text as string) ?? "",
        createdAt,
        questions,
        assetRef,
        continuityPack,
        generationGrid,
        shotResult,
        shotCompile,
      });

      if (questions?.answers && questions.questions?.length) {
        messages.push({
          id: `${row.messageId}-answers`,
          role: "user",
          text: formatQaText(questions.questions, questions.answers),
          createdAt,
        });
      }
    }
  }
  return messages;
}

export type MessagesPage = {
  messages: ClientMessage[];
  hasMore: boolean;
  oldestCreatedAt: string | null;
};

/** Latest (or older-than-`before`) page of client messages with signed media URLs. */
export async function loadMessagesPage(
  sessionId: string,
  before?: string | null
): Promise<MessagesPage> {
  const rows = await db
    .select()
    .from(filmSessionMessages)
    .where(
      and(
        eq(filmSessionMessages.sessionId, sessionId),
        before ? lt(filmSessionMessages.createdAt, new Date(before)) : undefined
      )
    )
    .orderBy(desc(filmSessionMessages.createdAt))
    .limit(MESSAGES_PAGE_SIZE * 3);

  const chronological = [...rows].reverse();
  const messages = await rowsToClientMessages(chronological);
  const pageMessages = messages.slice(-MESSAGES_PAGE_SIZE);
  const hasMore = messages.length > MESSAGES_PAGE_SIZE || rows.length >= MESSAGES_PAGE_SIZE * 3;
  const oldestCreatedAt = pageMessages[0]?.createdAt ?? null;

  return { messages: pageMessages, hasMore, oldestCreatedAt };
}

export async function rowsToModelMessages(rows: DbRow[]): Promise<ModelMessage[]> {
  // Pre-collect all tool results so we can provide synthetic ones for unapproved calls.
  // This prevents AI_MissingToolResultsError when the LLM made multiple tool calls in one
  // turn but the user hasn't responded to all of them yet.
  const collectedResults = new Map<string, { text: string; imageUrl?: string }>();
  // Need question text for Q/A formatting — scan assistant turns for askQuestions/presentFork
  const questionsByToolCall = new Map<string, QuestionItem[]>();

  for (const row of rows) {
    if (row.role === "assistant" && row.type === "turn") {
      const d = rowData(row);
      for (const tc of getToolCalls(d)) {
        if (tc.function.name === "askQuestions") {
          questionsByToolCall.set(
            tc.id,
            tc.function.arguments.questions as QuestionItem[]
          );
        } else if (tc.function.name === "presentFork") {
          questionsByToolCall.set(
            tc.id,
            legacyForkToQuestions(tc.function.arguments)
          );
        }
      }
    }
  }

  for (const row of rows) {
    if (
      row.role === "user" &&
      (row.type === "questions_result" || row.type === "fork_result")
    ) {
      const d = rowData(row);
      const answers = parseAnswers(d);
      if (!answers) continue;
      const toolCallId = d.toolCallId as string;
      const qs = questionsByToolCall.get(toolCallId);
      collectedResults.set(toolCallId, {
        text: qs
          ? formatQaText(qs, answers)
          : answers.map((a) => `A: ${a}`).join("\n"),
      });
    } else if (row.role === "user" && row.type === "asset_approval") {
      const d = rowData(row);
      const approvedUrl = await mediaUrl(d.approvedUrl as string);
      collectedResults.set(d.toolCallId as string, {
        text: `User approved this reference image for "${d.assetHandle as string}": ${approvedUrl}`,
        imageUrl: approvedUrl,
      });
    } else if (row.role === "user" && row.type === "continuity_pack_approval") {
      const d = rowData(row);
      const approvedUrls = await mediaUrls((d.approvedUrls as string[]) ?? []);
      collectedResults.set(d.toolCallId as string, {
        text:
          `User approved continuity pack "${d.packHandle as string}" for scene ${d.sceneId as string | number} ` +
          `with ${approvedUrls.length} keyframe(s): ${approvedUrls.join(", ")}. ` +
          `Record via recordContinuityPackEntry, then generate generation grids. ` +
          `Keyframes are continuity references only — not a Seedance shot sequence.`,
        imageUrl: approvedUrls[0],
      });
    } else if (row.role === "user" && row.type === "grid_approval") {
      const d = rowData(row);
      const approvedUrl = await mediaUrl(d.approvedUrl as string);
      collectedResults.set(d.toolCallId as string, {
        text: `User approved this generation grid for scene ${d.sceneId as string | number}: ${approvedUrl}`,
        imageUrl: approvedUrl,
      });
    } else if (row.role === "user" && row.type === "shot_approval") {
      const d = rowData(row);
      const videoUrl = await mediaUrl(d.videoUrl as string);
      const lastFrameUrl = d.lastFrameUrl
        ? await mediaUrl(d.lastFrameUrl as string)
        : undefined;
      collectedResults.set(d.toolCallId as string, {
        text: lastFrameUrl
          ? `Shot rendered and approved by user: ${videoUrl}. Last frame (for CONTEXT footing only): ${lastFrameUrl}. ` +
            `For continuity into the next beat use continuityMode "extend_video" with sourceVideoUrl=${videoUrl}. ` +
            `For a clean break / new take use continuityMode "fresh" with stills. ` +
            `CONTEXT must restate footing from the last frame before new action.`
          : `Shot rendered and approved by user: ${videoUrl}. ` +
            `For continuity into the next beat use continuityMode "extend_video" with sourceVideoUrl=${videoUrl}. ` +
            `For a clean break / new take use continuityMode "fresh" with stills.`,
        imageUrl: lastFrameUrl,
      });
    }
  }

  // Chronological vision candidates (approvals + prior loadApprovedImage calls).
  // Only the last MAX_HISTORY_VISION_IMAGES keep image-url parts on replay.
  const visionOrder: string[] = [];
  for (const row of rows) {
    if (row.role !== "assistant" || row.type !== "turn") continue;
    for (const tc of getToolCalls(rowData(row))) {
      if (collectedResults.get(tc.id)?.imageUrl) {
        visionOrder.push(tc.id);
      } else if (
        tc.function.name === "loadApprovedImage" &&
        typeof tc.function.arguments.url === "string" &&
        tc.function.arguments.url.trim()
      ) {
        visionOrder.push(tc.id);
      }
    }
  }
  const keepVision = new Set(visionOrder.slice(-MAX_HISTORY_VISION_IMAGES));

  const msgs: ModelMessage[] = [];

  for (const row of rows) {
    if (row.role === "user" && USER_RESULT_TYPES.has(row.type)) continue;

    const d = rowData(row);

    if (row.role === "user" && row.type === "text") {
      msgs.push({ role: "user", content: d.text as string });
    } else if (row.role === "assistant" && row.type === "turn") {
      const text = (d.text as string) ?? "";
      const calls = getToolCalls(d);
      const storedToolResults = (d.toolResults ?? {}) as Record<string, unknown>;

      if (calls.length > 0) {
        const toolCallParts = calls.map((tc) => ({
          type: "tool-call" as const,
          toolCallId: tc.id,
          // Replay legacy presentFork under askQuestions name so the live tool set matches
          toolName:
            tc.function.name === "presentFork" ? "askQuestions" : tc.function.name,
          input:
            tc.function.name === "presentFork"
              ? { questions: legacyForkToQuestions(tc.function.arguments) }
              : Object.fromEntries(
                  Object.entries(tc.function.arguments).filter(
                    ([k]) =>
                      ![
                        "generatedImages",
                        "videoUrl",
                        "pending",
                        "shotError",
                        "renderedDurationSeconds",
                        "gridError",
                        "packError",
                      ].includes(k)
                  )
                ),
        }));
        msgs.push({
          role: "assistant",
          content: text
            ? [{ type: "text" as const, text }, ...toolCallParts]
            : toolCallParts,
        });

        const resultParts = await Promise.all(
          calls.map(async (tc) => {
            const toolName =
              tc.function.name === "presentFork" ? "askQuestions" : tc.function.name;
            if (
              tc.function.name === "loadReference" ||
              tc.function.name === "webExtract" ||
              tc.function.name === "recordContinuityPackEntry" ||
              tc.function.name === "recordGenerationGridEntry" ||
              tc.function.name === "recordSceneGridEntry"
            ) {
              const fallback =
                tc.function.name === "loadReference"
                  ? "(reference file content unavailable)"
                  : tc.function.name === "webExtract"
                    ? "(web extract content unavailable)"
                    : JSON.stringify({
                        ok: false,
                        errors: ["(registry entry result unavailable)"],
                      });
              return {
                type: "tool-result" as const,
                toolCallId: tc.id,
                toolName,
                output: toToolResultOutput(storedToolResults[tc.id], fallback),
              };
            }
            // Rebuild from args so historical loads respect the vision window
            // (stored content would otherwise re-attach every past image).
            if (tc.function.name === "loadApprovedImage") {
              const rawUrl =
                typeof tc.function.arguments.url === "string"
                  ? tc.function.arguments.url.trim()
                  : "";
              const label =
                typeof tc.function.arguments.label === "string"
                  ? tc.function.arguments.label.trim()
                  : "";
              const resolved = rawUrl ? await mediaUrl(rawUrl) : null;
              if (!resolved) {
                return {
                  type: "tool-result" as const,
                  toolCallId: tc.id,
                  toolName,
                  output: toToolResultOutput(
                    storedToolResults[tc.id],
                    `Could not resolve image URL: ${rawUrl || "(missing)"}`
                  ),
                };
              }
              const loadedText = label
                ? `Loaded image "${label}": ${resolved}`
                : `Loaded image: ${resolved}`;
              if (keepVision.has(tc.id)) {
                return {
                  type: "tool-result" as const,
                  toolCallId: tc.id,
                  toolName,
                  output: {
                    type: "content" as const,
                    value: [
                      { type: "text" as const, text: loadedText },
                      { type: "image-url" as const, url: resolved },
                    ],
                  },
                };
              }
              return {
                type: "tool-result" as const,
                toolCallId: tc.id,
                toolName,
                output: {
                  type: "text" as const,
                  value: `${loadedText} (${VISION_HINT})`,
                },
              };
            }
            // Continuity-chain / panel validation failures — prefer stored execute() JSON
            // so the agent can fix isFirstInScene / previousGenerationId / incomingAnchor_*.
            if (
              (tc.function.name === "generateGenerationGrid" ||
                tc.function.name === "generateSceneGrid") &&
              typeof tc.function.arguments.gridError === "string"
            ) {
              const gridError = tc.function.arguments.gridError as string;
              return {
                type: "tool-result" as const,
                toolCallId: tc.id,
                toolName,
                output: toToolResultOutput(
                  storedToolResults[tc.id],
                  JSON.stringify({ ok: false, errors: [gridError] })
                ),
              };
            }
            const collected = collectedResults.get(tc.id);
            const shotVideoUrl = tc.function.arguments.videoUrl
              ? await mediaUrl(tc.function.arguments.videoUrl as string)
              : undefined;
            const resultText =
              collected?.text ??
              (tc.function.name === "generateAssetReferences"
                ? `Reference images have been generated for "${tc.function.arguments.assetHandle as string}". User has not yet approved one.`
                : tc.function.name === "generateContinuityPack"
                  ? (tc.function.arguments.packError as string | undefined)
                    ? `Continuity pack rejected: ${tc.function.arguments.packError as string}`
                    : `A continuity pack candidate (notes + keyframes) has been generated for ${
                        (tc.function.arguments.packHandle as string | undefined) ??
                        `scene ${tc.function.arguments.sceneId as string | number}`
                      }. User has not yet approved it.`
                : tc.function.name === "generateGenerationGrid" ||
                    tc.function.name === "generateSceneGrid"
                  ? `A generation grid candidate has been generated for ${
                      (tc.function.arguments.generationId as string | undefined) ??
                      `scene ${tc.function.arguments.sceneId as string | number}`
                    }. User has not yet approved it.`
                  : tc.function.name === "compileShot"
                    ? shotVideoUrl
                      ? `Shot rendered: ${shotVideoUrl}. Awaiting user approval to add to timeline.`
                      : (tc.function.arguments.pending as boolean | undefined) ===
                          true
                        ? "Shot render in progress — waiting for the video to finish."
                        : "Shot prompt compiled and shown to user for review. Awaiting their approval before rendering starts."
                    : "User has not yet answered these questions.");
            const attachVision =
              Boolean(collected?.imageUrl) && keepVision.has(tc.id);
            if (attachVision && collected?.imageUrl) {
              return {
                type: "tool-result" as const,
                toolCallId: tc.id,
                toolName,
                output: {
                  type: "content" as const,
                  value: [
                    { type: "text" as const, text: resultText },
                    { type: "image-url" as const, url: collected.imageUrl },
                  ],
                },
              };
            }
            const textOnly =
              collected?.imageUrl && !keepVision.has(tc.id)
                ? `${resultText} (${VISION_HINT})`
                : resultText;
            return {
              type: "tool-result" as const,
              toolCallId: tc.id,
              toolName,
              output: { type: "text" as const, value: textOnly },
            };
          })
        );
        msgs.push({ role: "tool", content: resultParts } as ModelMessage);
      } else {
        msgs.push({ role: "assistant", content: text });
      }
    }
  }

  return msgs;
}
