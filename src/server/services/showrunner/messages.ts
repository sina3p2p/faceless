import type { ModelMessage } from "ai";
import type {
  AssetGalleryItem,
  AssetRef,
  ClientMessage,
  QuestionItem,
  QuestionsCall,
  GenerationGrid,
  ShotCompile,
  ShotResult,
  VoiceAnchor,
  VoiceGalleryItem,
} from "@/types/v2/story";
import { mediaUrl, mediaUrls, agentMediaUrl, storageKeyFrom } from "@/lib/storage";
import { filmstripTileCount } from "@/lib/filmstrip";
import { db } from "@/server/db";
import { filmSessionMessages } from "@/server/db/schema";
import { and, desc, eq, lt } from "drizzle-orm";
import { toCompileShotArgs } from "./tools/compile-shot";

type DbRow = {
  messageId: string;
  role: string;
  type: string;
  parts: unknown;
  createdAt?: Date | null;
};

export const MESSAGES_PAGE_SIZE = 30;

/** Max non-pinned images auto-attached as vision when replaying session history. */
export const MAX_HISTORY_VISION_IMAGES = 5;

/**
 * Map generationId → lightingState from prior generateGenerationGrid calls.
 * Used to auto-fill recordGenerationGridEntry when the model omits lighting_state.
 */
export function lightingStateByGenerationId(rows: DbRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.role !== "assistant" || row.type !== "turn") continue;
    for (const tc of getToolCalls(rowData(row))) {
      if (tc.function.name !== "generateGenerationGrid") continue;
      const genId =
        (typeof tc.function.arguments.generationId === "string" &&
          tc.function.arguments.generationId) ||
        (typeof tc.function.arguments.generation_id === "string" &&
          tc.function.arguments.generation_id) ||
        "";
      const light =
        (typeof tc.function.arguments.lightingState === "string" &&
          tc.function.arguments.lightingState.trim()) ||
        (typeof tc.function.arguments.lighting_state === "string" &&
          tc.function.arguments.lighting_state.trim()) ||
        "";
      if (genId && light) map.set(genId, light);
    }
  }
  return map;
}

const VISION_UNVERIFIABLE =
  "vision_status:unverifiable — Image not attached (older than vision window). Call loadApprovedImage with pin:true for identity assets.";

type CollectedToolResult = {
  text: string;
  imageUrls?: string[];
  /** Pinned images stay attached across history replay (identity assets). */
  pin?: boolean;
};

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
  return Array.isArray(d.toolCalls) ? (d.toolCalls as RawToolCall[]) : [];
}

function formatQaText(questions: QuestionItem[], answers: string[]): string {
  return questions
    .map((q, i) => `Q: ${q.question}\nA: ${answers[i] ?? "(unanswered)"}`)
    .join("\n\n");
}

function parseAnswers(d: Record<string, unknown>): string[] | undefined {
  if (Array.isArray(d.answers)) return d.answers as string[];
  return undefined;
}

const USER_RESULT_TYPES = new Set([
  "questions_result",
  "asset_approval",
  "voice_approval",
  "grid_approval",
  "shot_approval",
]);

export async function rowsToClientMessages(rows: DbRow[]): Promise<ClientMessage[]> {
  const questionAnswers = new Map<string, string[]>();
  const assetApprovals = new Map<
    string,
    Array<{ assetHandle: string; candidateId: string; approvedUrl: string }>
  >();
  const voiceApprovals = new Map<
    string,
    Array<{ handle: string; candidateId: string; approvedUrl: string }>
  >();
  const gridApprovals = new Map<string, string>();
  const shotApprovals = new Set<string>();

  for (const row of rows) {
    if (row.role === "user" && row.type === "questions_result") {
      const d = rowData(row);
      const answers = parseAnswers(d);
      if (answers) questionAnswers.set(d.toolCallId as string, answers);
    } else if (row.role === "user" && row.type === "asset_approval") {
      const d = rowData(row);
      const approvals = Array.isArray(d.approvals)
        ? (d.approvals as Array<{
            assetHandle: string;
            candidateId: string;
            approvedUrl: string;
          }>)
        : d.assetHandle && d.approvedUrl
          ? [
              {
                assetHandle: d.assetHandle as string,
                candidateId: (d.candidateId as string) ?? (d.approvedUrl as string),
                approvedUrl: d.approvedUrl as string,
              },
            ]
          : [];
      if (approvals.length) assetApprovals.set(d.toolCallId as string, approvals);
    } else if (row.role === "user" && row.type === "voice_approval") {
      const d = rowData(row);
      const approvals = Array.isArray(d.approvals)
        ? (d.approvals as Array<{
            handle: string;
            candidateId: string;
            approvedUrl: string;
          }>)
        : [];
      if (approvals.length) voiceApprovals.set(d.toolCallId as string, approvals);
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
      let voiceAnchor: VoiceAnchor | undefined;
      let generationGrid: GenerationGrid | undefined;
      let shotResult: ShotResult | undefined;
      let shotCompile: ShotCompile | undefined;

      for (const tc of calls) {
        const args = tc.function.arguments;
        if (tc.function.name === "askQuestions") {
          questions = {
            toolCallId: tc.id,
            loading: false,
            questions: args.questions as QuestionItem[],
            answers: questionAnswers.get(tc.id),
          };
        } else if (tc.function.name === "generateAssetReferences") {
          const isPending = (args.pending as boolean | undefined) === true;
          const approvals = assetApprovals.get(tc.id) ?? [];
          const approvalByHandle = new Map(approvals.map((a) => [a.assetHandle, a]));
          const generatedAssets = args.generatedAssets as
            | Array<{
                assetHandle: string;
                assetKind: "character" | "location" | "object";
                candidates: Array<{ id: string; url: string }>;
              }>
            | undefined;
          const assetsArg = args.assets as
            | Array<{
                assetHandle: string;
                assetKind: "character" | "location" | "object";
                imagePrompt: string;
              }>
            | undefined;

          let items: AssetGalleryItem[];
          if (generatedAssets?.length) {
            items = await Promise.all(
              generatedAssets.map(async (g) => {
                const approval = approvalByHandle.get(g.assetHandle);
                return {
                  assetHandle: g.assetHandle,
                  assetKind: g.assetKind,
                  candidates: await Promise.all(
                    g.candidates.map(async (c) => ({
                      id: c.id,
                      url: (await mediaUrl(c.id)) || c.url,
                    }))
                  ),
                  approvedCandidateId: approval?.candidateId,
                  approvedUrl: approval ? await mediaUrl(approval.approvedUrl) : undefined,
                };
              })
            );
          } else if (assetsArg?.length) {
            items = assetsArg.map((a) => ({
              assetHandle: a.assetHandle,
              assetKind: a.assetKind,
              loading: isPending,
            }));
          } else if (args.assetHandle) {
            // Legacy single-asset tool calls
            const rawImages = (args.generatedImages ?? args.images) as string[] | undefined;
            const approval = approvals[0];
            items = [
              {
                assetHandle: args.assetHandle as string,
                assetKind: args.assetKind as AssetGalleryItem["assetKind"],
                candidates: rawImages
                  ? await Promise.all(
                      rawImages.map(async (img) => ({
                        id: img,
                        url: await mediaUrl(img),
                      }))
                    )
                  : undefined,
                approvedCandidateId: approval?.candidateId,
                approvedUrl: approval ? await mediaUrl(approval.approvedUrl) : undefined,
                loading: isPending && !rawImages,
              },
            ];
          } else {
            items = [];
          }

          assetRef = {
            toolCallId: tc.id,
            loading: isPending,
            items,
            approved: approvals.length > 0,
            error: args.error as string | undefined,
          };
        } else if (tc.function.name === "generateVoiceAnchors") {
          const isPending = (args.pending as boolean | undefined) === true;
          const approvals = voiceApprovals.get(tc.id) ?? [];
          const approvalByHandle = new Map(approvals.map((a) => [a.handle, a]));
          const generatedVoices = args.generatedVoices as
            | Array<{
                handle: string;
                characterHandle?: string;
                voiceId: string;
                sampleText: string;
                id: string;
                url: string;
              }>
            | undefined;
          const voicesArg = args.voices as
            | Array<{
                handle: string;
                characterHandle?: string;
                sampleText: string;
                voiceId?: string;
              }>
            | undefined;

          let voiceItems: VoiceGalleryItem[];
          if (generatedVoices?.length) {
            voiceItems = await Promise.all(
              generatedVoices.map(async (g) => {
                const approval = approvalByHandle.get(g.handle);
                return {
                  handle: g.handle,
                  characterHandle: g.characterHandle,
                  voiceId: g.voiceId,
                  sampleText: g.sampleText,
                  id: g.id,
                  url: (await mediaUrl(g.id)) || g.url,
                  approvedUrl: approval ? await mediaUrl(approval.approvedUrl) : undefined,
                };
              })
            );
          } else if (voicesArg?.length) {
            voiceItems = voicesArg.map((v) => ({
              handle: v.handle,
              characterHandle: v.characterHandle,
              sampleText: v.sampleText,
              voiceId: v.voiceId,
              loading: isPending,
            }));
          } else {
            voiceItems = [];
          }

          voiceAnchor = {
            toolCallId: tc.id,
            loading: isPending,
            items: voiceItems,
            approved: approvals.length > 0,
            error: args.error as string | undefined,
          };
        } else if (tc.function.name === "generateGenerationGrid") {
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
            sceneAnchorHandle: args.sceneAnchorHandle as string | null | undefined,
            incomingAnchorHandle: args.incomingAnchorHandle as string | null | undefined,
            continuityBreakReason: args.continuityBreakReason as string | null | undefined,
            matchCutSourceGenerationId: args.matchCutSourceGenerationId as
              | string
              | null
              | undefined,
            matchCutSourceHandle: args.matchCutSourceHandle as string | null | undefined,
            lightingState: args.lightingState as string | null | undefined,
            lightingTransitionException: args.lightingTransitionException as
              | boolean
              | null
              | undefined,
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
          const compiled = toCompileShotArgs(args);
          const refs =
            compiled?.referenceImageUrls ??
            (args.reference_image_urls as string[] | undefined) ??
            (args.referenceImageUrls as string[] | undefined);
          const sourceVideoUrl =
            compiled?.sourceVideoUrl ??
            (args.source_video_url as string | undefined) ??
            (args.sourceVideoUrl as string | undefined);
          const compileFields = {
            toolCallId: tc.id,
            loading: false as const,
            renderPrompt:
              compiled?.prompt ??
              (args.render_prompt as string | undefined) ??
              (args.prompt as string | undefined),
            referenceImageUrls: refs ? await mediaUrls(refs) : [],
            referenceAudioUrls: compiled?.referenceAudioUrls?.length
              ? await mediaUrls(compiled.referenceAudioUrls)
              : ((args.reference_audio_urls as string[] | undefined) ??
                  (args.referenceAudioUrls as string[] | undefined))
                ? await mediaUrls(
                    ((args.reference_audio_urls as string[] | undefined) ??
                      (args.referenceAudioUrls as string[] | undefined))!
                  )
                : [],
            duration:
              compiled?.duration ??
              (args.duration_seconds as number | undefined) ??
              (args.duration as number | undefined),
            aspectRatio:
              (compiled?.aspectRatio as ShotCompile["aspectRatio"]) ??
              (args.aspect_ratio as ShotCompile["aspectRatio"]) ??
              (args.aspectRatio as ShotCompile["aspectRatio"]),
            continuityMode:
              (compiled?.continuityMode as ShotCompile["continuityMode"]) ??
              (args.continuity_mode as ShotCompile["continuityMode"]) ??
              (args.continuityMode as ShotCompile["continuityMode"]),
            sourceVideoUrl: sourceVideoUrl
              ? await mediaUrl(sourceVideoUrl)
              : undefined,
          };
          if ((args.status as string | undefined) === "gap") {
            shotCompile = {
              ...compileFields,
              error: Array.isArray(args.gaps)
                ? (args.gaps as string[]).join("; ")
                : "Compile gap",
            };
          } else if (isPending) {
            // Keep the compile panel visible (disabled + shimmer) while the job runs.
            shotCompile = { ...compileFields, rendering: true };
            shotResult = { toolCallId: tc.id, loading: true };
          } else if (hasVideo || args.shotError) {
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
            const signedVideo = videoUrl ? await mediaUrl(videoUrl) : undefined;
            const signedFilmstrip = filmstripKey ? await mediaUrl(filmstripKey) : undefined;
            const approved = shotApprovals.has(tc.id);
            const error = args.shotError as string | undefined;
            shotCompile = {
              ...compileFields,
              videoUrl: signedVideo,
              filmstripUrl: signedFilmstrip,
              filmstripTiles,
              error,
              approved,
            };
            // Keep shotResult for the timeline editor.
            shotResult = {
              toolCallId: tc.id,
              loading: false,
              videoUrl: signedVideo,
              filmstripUrl: signedFilmstrip,
              filmstripTiles,
              duration,
              error,
              approved,
            };
          } else {
            shotCompile = compileFields;
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
        voiceAnchor,
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
  const collectedResults = new Map<string, CollectedToolResult>();
  // Need question text for Q/A formatting — scan assistant turns for askQuestions
  const questionsByToolCall = new Map<string, QuestionItem[]>();
  /** lightingState from generateGenerationGrid, keyed by toolCallId — echoed on approval. */
  const gridLightingByToolCall = new Map<string, string>();

  for (const row of rows) {
    if (row.role === "assistant" && row.type === "turn") {
      const d = rowData(row);
      for (const tc of getToolCalls(d)) {
        if (tc.function.name === "askQuestions") {
          questionsByToolCall.set(
            tc.id,
            tc.function.arguments.questions as QuestionItem[]
          );
        } else if (tc.function.name === "generateGenerationGrid") {
          const light =
            (typeof tc.function.arguments.lightingState === "string" &&
              tc.function.arguments.lightingState.trim()) ||
            (typeof tc.function.arguments.lighting_state === "string" &&
              tc.function.arguments.lighting_state.trim()) ||
            "";
          if (light) gridLightingByToolCall.set(tc.id, light);

          const rawImages = (tc.function.arguments.generatedImages ??
            tc.function.arguments.images) as string[] | undefined;
          const urls = (rawImages ?? [])
            .map((img) => agentMediaUrl(img))
            .filter((u): u is string => !!u);
          if (urls.length > 0) {
            collectedResults.set(tc.id, {
              text:
                `Motion sheet candidate generated. vision_status:attached — pre-screen for ONE lighting state, ` +
                `panel roles, and continuity before presenting. Wait for Approve-grid (never askQuestions).`,
              imageUrls: urls.slice(0, 2),
              pin: false,
            });
          }
        } else if (tc.function.name === "generateAssetReferences") {
          // Fresh gallery pixels — attach for pre-screen before approval (pinned identity).
          const generatedAssets = tc.function.arguments.generatedAssets as
            | Array<{
                assetHandle: string;
                assetKind: string;
                candidates: Array<{ id: string; url: string }>;
              }>
            | undefined;
          const urls: string[] = [];
          if (generatedAssets?.length) {
            const ordered = [
              ...generatedAssets.filter((a) => a.assetKind === "character"),
              ...generatedAssets.filter((a) => a.assetKind !== "character"),
            ];
            for (const a of ordered) {
              for (const c of a.candidates ?? []) {
                const u = agentMediaUrl(c.id) || agentMediaUrl(c.url);
                if (u) urls.push(u);
              }
            }
          } else {
            const rawImages = (tc.function.arguments.generatedImages ??
              tc.function.arguments.images) as string[] | undefined;
            for (const img of rawImages ?? []) {
              const u = agentMediaUrl(img);
              if (u) urls.push(u);
            }
          }
          if (urls.length > 0) {
            collectedResults.set(tc.id, {
              text:
                `Asset gallery generated (${urls.length} image(s)). ` +
                `vision_status:attached — pre-screen pixels NOW (twin-bug / plate checks) before the user approves. ` +
                `Approval is the gallery Approve button only — never askQuestions for approval.`,
              imageUrls: urls.slice(0, 8),
              pin: true,
            });
          }
        }
      }
    }
  }

  for (const row of rows) {
    if (row.role === "user" && row.type === "questions_result") {
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
      const approvals = Array.isArray(d.approvals)
        ? (d.approvals as Array<{
            assetHandle: string;
            candidateId: string;
            approvedUrl: string;
          }>)
        : d.assetHandle && d.approvedUrl
          ? [
              {
                assetHandle: d.assetHandle as string,
                candidateId: (d.candidateId as string) ?? (d.approvedUrl as string),
                approvedUrl: d.approvedUrl as string,
              },
            ]
          : [];
      const lines = approvals.map(
        (a) =>
          `"${a.assetHandle}" → candidate ${a.candidateId} (${agentMediaUrl(a.approvedUrl)})`
      );
      const imageUrls = approvals
        .map((a) => agentMediaUrl(a.approvedUrl))
        .filter((u): u is string => !!u);
      collectedResults.set(d.toolCallId as string, {
        text:
          `User approved the asset gallery (${approvals.length} bound): ${lines.join("; ")}. ` +
          `Each handle is bound to its approved candidate id (storage key / media URL). ` +
          (imageUrls.length
            ? "vision_status:attached — identity pixels pinned for verification."
            : "vision_status:unverifiable — no approved URLs to attach."),
        imageUrls,
        pin: true,
      });
    } else if (row.role === "user" && row.type === "voice_approval") {
      const d = rowData(row);
      const approvals = Array.isArray(d.approvals)
        ? (d.approvals as Array<{
            handle: string;
            candidateId: string;
            approvedUrl: string;
          }>)
        : [];
      const lines = approvals.map(
        (a) =>
          `"@${a.handle}" → ${a.candidateId} (${agentMediaUrl(a.approvedUrl)})`
      );
      collectedResults.set(d.toolCallId as string, {
        text:
          `User approved voice anchors (${approvals.length} bound): ${lines.join("; ")}. ` +
          `Attach these URLs as reference_audio_urls on dialogue compileShot calls. ` +
          `Bible §2 Voices handles now resolve.`,
      });
    } else if (row.role === "user" && row.type === "grid_approval") {
      const d = rowData(row);
      const approvedUrl = agentMediaUrl(d.approvedUrl as string);
      const storageKey =
        typeof d.approvedUrl === "string"
          ? storageKeyFrom(d.approvedUrl as string)
          : null;
      const toolCallId = d.toolCallId as string;
      const lightingState = gridLightingByToolCall.get(toolCallId);
      const lightingHint = lightingState
        ? `lighting_state will default to "${lightingState}" from generate if omitted. `
        : "";
      collectedResults.set(toolCallId, {
        text:
          `User approved this motion sheet for scene ${d.sceneId as string | number}: ${approvedUrl}. ` +
          `Record via recordGenerationGridEntry with approved_candidate_id=` +
          `${storageKey ?? d.approvedUrl} (storage key / media URL — NOT the toolCallId). ` +
          lightingHint +
          `The first approved sheet in a scene becomes the scene anchor for later sheets; later sheets must ` +
          `set previous_generation_id + incoming_anchor_* , continuity_break_reason, or match_cut_source_* ` +
          `and attach those images.`,
        imageUrls: approvedUrl ? [approvedUrl] : undefined,
        pin: false,
      });
    } else if (row.role === "user" && row.type === "shot_approval") {
      const d = rowData(row);
      const videoUrl = agentMediaUrl(d.videoUrl as string);
      const lastFrameUrl = d.lastFrameUrl
        ? agentMediaUrl(d.lastFrameUrl as string)
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
        imageUrls: lastFrameUrl ? [lastFrameUrl] : undefined,
      });
    }
  }

  // Vision window: pinned tool results always keep images; among non-pinned,
  // only the last MAX_HISTORY_VISION_IMAGES keep image-url parts on replay.
  const pinnedVision = new Set<string>();
  const fifoVision: string[] = [];
  for (const row of rows) {
    if (row.role !== "assistant" || row.type !== "turn") continue;
    for (const tc of getToolCalls(rowData(row))) {
      const collected = collectedResults.get(tc.id);
      if (collected?.imageUrls?.length) {
        if (collected.pin) pinnedVision.add(tc.id);
        else fifoVision.push(tc.id);
      } else if (
        tc.function.name === "loadApprovedImage" &&
        typeof tc.function.arguments.url === "string" &&
        tc.function.arguments.url.trim()
      ) {
        if (tc.function.arguments.pin === true) pinnedVision.add(tc.id);
        else fifoVision.push(tc.id);
      }
    }
  }
  const keepVision = new Set([
    ...pinnedVision,
    ...fifoVision.slice(-MAX_HISTORY_VISION_IMAGES),
  ]);

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
          toolName: tc.function.name,
          input: Object.fromEntries(
            Object.entries(tc.function.arguments).filter(
              ([k]) =>
                      ![
                        "generatedImages",
                        "generatedAssets",
                        "videoUrl",
                        "pending",
                        "shotError",
                        "renderedDurationSeconds",
                        "gridError",
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
            const toolName = tc.function.name;
            if (
              tc.function.name === "loadReference" ||
              tc.function.name === "webExtract" ||
              tc.function.name === "recordGenerationGridEntry"
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
              const pinned = tc.function.arguments.pin === true;
              const resolved = rawUrl ? agentMediaUrl(rawUrl) : null;
              if (!resolved) {
                return {
                  type: "tool-result" as const,
                  toolCallId: tc.id,
                  toolName,
                  output: toToolResultOutput(
                    storedToolResults[tc.id],
                    `vision_status:unverifiable — Could not resolve image URL: ${rawUrl || "(missing)"}`
                  ),
                };
              }
              const pinNote = pinned ? " (pinned)" : "";
              if (keepVision.has(tc.id)) {
                const loadedText = label
                  ? `vision_status:attached${pinNote} — Loaded image "${label}": ${resolved}`
                  : `vision_status:attached${pinNote} — Loaded image: ${resolved}`;
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
              const unverifiableText = label
                ? `vision_status:unverifiable — "${label}" (${resolved}). ${VISION_UNVERIFIABLE}`
                : `vision_status:unverifiable — ${resolved}. ${VISION_UNVERIFIABLE}`;
              return {
                type: "tool-result" as const,
                toolCallId: tc.id,
                toolName,
                output: {
                  type: "text" as const,
                  value: unverifiableText,
                },
              };
            }
            // Continuity-chain / panel validation failures — prefer stored execute() JSON
            // so the agent can fix isFirstInScene / sceneAnchorHandle / previousGenerationId / incomingAnchor_*.
            if (
              tc.function.name === "generateGenerationGrid" &&
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
              ? agentMediaUrl(tc.function.arguments.videoUrl as string)
              : undefined;
            const resultText =
              collected?.text ??
              (tc.function.name === "generateAssetReferences"
                ? `Asset gallery generated for ${
                    Array.isArray(tc.function.arguments.assets)
                      ? (tc.function.arguments.assets as { assetHandle: string }[])
                          .map((a) => a.assetHandle)
                          .join(", ")
                      : (tc.function.arguments.assetHandle as string | undefined) ?? "assets"
                  }. User has not yet approved (Approve remaining / reject individuals).`
                : tc.function.name === "generateVoiceAnchors"
                  ? `Voice anchors generated for ${
                      Array.isArray(tc.function.arguments.voices)
                        ? (tc.function.arguments.voices as { handle: string }[])
                            .map((v) => v.handle)
                            .join(", ")
                        : "voices"
                    }. User has not yet approved (Approve voices / reject individuals).`
                : tc.function.name === "generateGenerationGrid"
                  ? `A motion sheet candidate has been generated for ${
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
              Boolean(collected?.imageUrls?.length) && keepVision.has(tc.id);
            if (attachVision && collected?.imageUrls?.length) {
              return {
                type: "tool-result" as const,
                toolCallId: tc.id,
                toolName,
                output: {
                  type: "content" as const,
                  value: [
                    {
                      type: "text" as const,
                      text: resultText.includes("vision_status:")
                        ? resultText
                        : `${resultText} vision_status:attached`,
                    },
                    ...collected.imageUrls.map((url) => ({
                      type: "image-url" as const,
                      url,
                    })),
                  ],
                },
              };
            }
            const textOnly =
              collected?.imageUrls?.length && !keepVision.has(tc.id)
                ? `${resultText} (${VISION_UNVERIFIABLE})`
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
