import type { ModelMessage } from "ai";
import type { AssetRef, ClientMessage, ForkCall, ShotCompile, ShotResult } from "@/types/v2/story";

type DbRow = {
  messageId: string;
  role: string;
  type: string;
  parts: unknown;
};

type RawToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: Record<string, unknown> };
};

function rowData(row: DbRow): Record<string, unknown> {
  return ((row.parts as unknown[])[0] ?? {}) as Record<string, unknown>;
}

function getToolCalls(d: Record<string, unknown>): RawToolCall[] {
  if (Array.isArray(d.toolCalls)) return d.toolCalls as RawToolCall[];

  // Legacy format
  const calls: RawToolCall[] = [];
  if (d.forkCall) {
    const fc = d.forkCall as Record<string, unknown>;
    calls.push({ id: fc.toolCallId as string, type: "function", function: { name: "presentFork", arguments: fc } });
  }
  if (d.assetCall) {
    const ac = d.assetCall as Record<string, unknown>;
    calls.push({ id: ac.toolCallId as string, type: "function", function: { name: "generateAssetReferences", arguments: { ...ac, generatedImages: ac.images } } });
  }
  return calls;
}

export function rowsToClientMessages(rows: DbRow[]): ClientMessage[] {
  const forkResults = new Map<string, { optionId?: string; value: string }>();
  const assetApprovals = new Map<string, string>();
  const shotApprovals = new Set<string>();

  for (const row of rows) {
    if (row.role === "user" && row.type === "fork_result") {
      const d = rowData(row);
      forkResults.set(d.toolCallId as string, { optionId: d.optionId as string | undefined, value: d.value as string });
    } else if (row.role === "user" && row.type === "asset_approval") {
      const d = rowData(row);
      assetApprovals.set(d.toolCallId as string, d.approvedUrl as string);
    } else if (row.role === "user" && row.type === "shot_approval") {
      const d = rowData(row);
      shotApprovals.add(d.toolCallId as string);
    }
  }

  const messages: ClientMessage[] = [];
  for (const row of rows) {
    if (row.role === "user" && (row.type === "fork_result" || row.type === "asset_approval" || row.type === "shot_approval")) continue;

    const d = rowData(row);
    if (row.role === "user") {
      messages.push({ id: row.messageId, role: "user", text: d.text as string });
    } else if (row.role === "assistant") {
      const calls = getToolCalls(d);
      let fork: ForkCall | undefined;
      let assetRef: AssetRef | undefined;
      let shotResult: ShotResult | undefined;
      let shotCompile: ShotCompile | undefined;

      for (const tc of calls) {
        const args = tc.function.arguments;
        if (tc.function.name === "presentFork") {
          fork = {
            toolCallId: tc.id,
            loading: false,
            options: args.options as ForkCall["options"],
            recommendedId: args.recommendedId as string,
            recommendationReason: args.recommendationReason as string,
            result: forkResults.get(tc.id),
          };
        } else if (tc.function.name === "generateAssetReferences") {
          assetRef = {
            toolCallId: tc.id,
            loading: false,
            assetHandle: args.assetHandle as string,
            assetKind: args.assetKind as AssetRef["assetKind"],
            images: (args.generatedImages ?? args.images) as string[] | undefined,
            approvedUrl: assetApprovals.get(tc.id),
          };
        } else if (tc.function.name === "compileShot") {
          const isPending = (args.pending as boolean | undefined) === true;
          const hasVideo = !!(args.videoUrl as string | undefined);
          if (isPending || hasVideo) {
            // Render has started (or finished) — show the video panel
            shotResult = {
              toolCallId: tc.id,
              loading: isPending,
              videoUrl: args.videoUrl as string | undefined,
              error: args.shotError as string | undefined,
              approved: shotApprovals.has(tc.id),
            };
          } else {
            // Render not started yet — show the compile-review panel
            shotCompile = {
              toolCallId: tc.id,
              loading: false,
              renderPrompt: args.prompt as string,
              referenceImageUrls: args.referenceImageUrls as string[],
              duration: args.duration as number,
              aspectRatio: args.aspectRatio as ShotCompile["aspectRatio"],
            };
          }
        }
      }

      messages.push({ id: row.messageId, role: "assistant", text: (d.text as string) ?? "", fork, assetRef, shotResult, shotCompile });
    }
  }
  return messages;
}

export function rowsToModelMessages(rows: DbRow[]): ModelMessage[] {
  // Pre-collect all tool results so we can provide synthetic ones for unapproved calls.
  // This prevents AI_MissingToolResultsError when the LLM made multiple tool calls in one
  // turn but the user hasn't responded to all of them yet.
  const collectedResults = new Map<string, string>(); // toolCallId → human-readable result text

  for (const row of rows) {
    if (row.role === "user" && row.type === "fork_result") {
      const d = rowData(row);
      const optionId = d.optionId as string | null;
      const value = d.value as string;
      collectedResults.set(
        d.toolCallId as string,
        optionId
          ? `User selected option ${optionId}. Locked content: ${value}`
          : `User provided a custom direction: ${value}`
      );
    } else if (row.role === "user" && row.type === "asset_approval") {
      const d = rowData(row);
      collectedResults.set(
        d.toolCallId as string,
        `User approved reference image for "${d.assetHandle as string}": ${d.approvedUrl as string}`
      );
    } else if (row.role === "user" && row.type === "shot_approval") {
      const d = rowData(row);
      collectedResults.set(
        d.toolCallId as string,
        `Shot rendered and approved by user: ${d.videoUrl as string}. Proceed to the next shot.`
      );
    }
  }

  const msgs: ModelMessage[] = [];

  for (const row of rows) {
    if (row.role === "user" && (row.type === "fork_result" || row.type === "asset_approval" || row.type === "shot_approval")) continue;

    const d = rowData(row);

    if (row.role === "user" && row.type === "text") {
      msgs.push({ role: "user", content: d.text as string });
    } else if (row.role === "assistant" && row.type === "turn") {
      const text = (d.text as string) ?? "";
      const calls = getToolCalls(d);
      const storedToolResults = (d.toolResults ?? {}) as Record<string, { type: string; value: string }>;

      if (calls.length > 0) {
        const toolCallParts = calls.map((tc) => ({
          type: "tool-call" as const,
          toolCallId: tc.id,
          toolName: tc.function.name,
          // Strip server-side augmentation before sending to model
          input: Object.fromEntries(
            Object.entries(tc.function.arguments).filter(([k]) => !["generatedImages", "videoUrl", "pending", "shotError"].includes(k))
          ),
        }));
        msgs.push({
          role: "assistant",
          content: text ? [{ type: "text" as const, text }, ...toolCallParts] : toolCallParts,
        });

        // Add tool results immediately after the assistant turn.
        // loadReference: use the result stored in the DB row (captured from execute()).
        // User-facing tools: use real results where available; synthetic "pending" for the rest.
        const resultParts = calls.map((tc) => {
          if (tc.function.name === "loadReference") {
            const stored = storedToolResults[tc.id];
            return {
              type: "tool-result" as const,
              toolCallId: tc.id,
              toolName: tc.function.name,
              output: stored
                ? (stored as { type: "text"; value: string })
                : { type: "text" as const, value: "(reference file content unavailable)" },
            };
          }
          const resultText = collectedResults.get(tc.id) ?? (
            tc.function.name === "generateAssetReferences"
              ? `Reference images have been generated for "${tc.function.arguments.assetHandle as string}". User has not yet approved one.`
              : tc.function.name === "compileShot"
              ? tc.function.arguments.videoUrl
                ? `Shot rendered: ${tc.function.arguments.videoUrl as string}. Awaiting user approval to add to timeline.`
                : (tc.function.arguments.pending as boolean | undefined) === true
                ? "Shot render in progress — waiting for the video to finish."
                : "Shot prompt compiled and shown to user for review. Awaiting their approval before rendering starts."
              : "User has not yet responded to this decision."
          );
          return {
            type: "tool-result" as const,
            toolCallId: tc.id,
            toolName: tc.function.name,
            output: { type: "text" as const, value: resultText },
          };
        });
        msgs.push({ role: "tool", content: resultParts });
      } else {
        msgs.push({ role: "assistant", content: text });
      }
    }
  }

  return msgs;
}
