"use client";

import { useState, useRef, useEffect, useMemo, startTransition } from "react";
import { VideoEditorPanel, type Clip } from "./video-editor-panel";
import { Card } from "@/components/ui/card";
import { ChatInput } from "./chat-input";
import { formatQuestionsAnswers, QuestionsPicker } from "./questions-picker";
import { MessageList } from "./message-list";
import type {
  AssetRef,
  ClientMessage,
  QuestionsCall,
  GenerationGrid,
  ShotCompile,
} from "@/types/v2/story";
import { useMobileTab } from "@/components/story-shell";
import { cn } from "@/lib/utils";

const CHAT_MIN = 280;
const CHAT_MAX = 640;

export function StoryChat({
  sessionId,
  initialMessages,
  initialHasMore = false,
  initialOldestCreatedAt = null,
}: {
  sessionId: string;
  initialMessages: ClientMessage[];
  initialHasMore?: boolean;
  initialOldestCreatedAt?: string | null;
}) {
  const [messages, setMessages] = useState<ClientMessage[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [oldestCreatedAt, setOldestCreatedAt] = useState<string | null>(initialOldestCreatedAt);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [status, setStatus] = useState<"idle" | "streaming">("idle");
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const hasAutoSent = useRef(false);
  const loadingOlderRef = useRef(false);

  // video editor state — clipOrder preserves first-seen shot order across
  // message stream updates (text deltas must not reshuffle the timeline).
  const [clipOrder, setClipOrder] = useState<string[]>(() =>
    initialMessages
      .filter((m) => m.shotResult?.videoUrl)
      .map((m) => m.shotResult!.toolCallId),
  );
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  // resizable chat sidebar
  const [chatWidth, setChatWidth] = useState(() => {
    if (typeof window === "undefined") return 400;
    return Number(localStorage.getItem("chat-sidebar-width") ?? 400);
  });
  const [chatVisible, setChatVisible] = useState(true);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(0);
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const chatRowRef = useRef<HTMLDivElement>(null);
  const [rowWidth, setRowWidth] = useState(0);

  const isStreaming = status === "streaming";
  const mobileTab = useMobileTab();

  const pendingQuestions = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.questions && !msg.questions.answers) {
        return msg.questions;
      }
    }
    return null;
  }, [messages]);

  useEffect(() => {
    if (!chatRowRef.current) return;
    const el = chatRowRef.current;
    const update = () => setRowWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Key only on shot identities / media fields — ignore text_delta noise so
  // this effect (and the clips memo below) don't fire on every stream token.
  const shotsKey = useMemo(() => {
    const parts: string[] = [];
    for (const m of messages) {
      const s = m.shotResult;
      if (!s?.videoUrl) continue;
      parts.push(
        `${s.toolCallId}\0${s.videoUrl}\0${s.duration ?? ""}\0${s.approved ? 1 : 0}\0${s.filmstripUrl ?? ""}\0${s.filmstripTiles ?? ""}`
      );
    }
    return parts.join("\n");
  }, [messages]);

  useEffect(() => {
    if (!shotsKey) return;
    const newIds = shotsKey.split("\n").map((row) => row.split("\0")[0]!).filter(Boolean);
    setClipOrder((prev) => {
      const existingIds = new Set(prev);
      const toAdd = newIds.filter((id) => !existingIds.has(id));
      if (toAdd.length === 0) return prev;
      return [...prev, ...toAdd];
    });
  }, [shotsKey]);

  const clipsByTcId = useMemo(() => {
    const map = new Map<string, Clip>();
    for (const m of messages) {
      if (m.shotResult?.videoUrl) {
        map.set(m.shotResult.toolCallId, {
          toolCallId: m.shotResult.toolCallId,
          videoUrl: m.shotResult.videoUrl,
          filmstripUrl: m.shotResult.filmstripUrl,
          filmstripTiles: m.shotResult.filmstripTiles,
          duration: m.shotResult.duration,
          approved: m.shotResult.approved,
        });
      }
    }
    return map;
    // shotsKey is the content identity; messages alone would rebuild on every text_delta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotsKey]);

  const clips = useMemo(
    () => clipOrder.map((id) => clipsByTcId.get(id)).filter(Boolean) as Clip[],
    [clipOrder, clipsByTcId]
  );

  useEffect(() => {
    if (hasAutoSent.current) return;
    hasAutoSent.current = true;
    const hasUser = initialMessages.some((m) => m.role === "user");
    const hasAssistant = initialMessages.some((m) => m.role === "assistant");
    if (hasUser && !hasAssistant) {
      void streamResponse({ type: "trigger" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Job-events SSE (shots + background image generation) ─────────────────────
  const jobEventsRef = useRef<EventSource | null>(null);

  function hasPendingJobs(msgs: ClientMessage[]) {
    return msgs.some(
      (m) =>
        m.shotResult?.loading ||
        m.shotCompile?.rendering ||
        m.assetRef?.loading ||
        m.assetRef?.items?.some((i) => i.loading) ||
        m.generationGrid?.loading
    );
  }

  function openJobEventsStream() {
    if (jobEventsRef.current) return;
    const es = new EventSource(`/api/v2/story/${sessionId}/job-events`);
    jobEventsRef.current = es;

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data as string) as Record<string, unknown>;
        if (event.type === "shot_complete") {
          const toolCallId = event.toolCallId as string;
          const videoUrl = event.videoUrl as string;
          const duration = event.durationSeconds as number | undefined;
          const filmstripUrl = event.filmstripUrl as string | undefined;
          const filmstripTiles = event.filmstripTiles as number | undefined;
          setMessages((prev) => {
            const next = prev.map((m) =>
              m.shotResult?.toolCallId === toolCallId || m.shotCompile?.toolCallId === toolCallId
                ? {
                    ...m,
                    shotCompile: {
                      ...(m.shotCompile ?? { toolCallId, loading: false }),
                      rendering: false,
                      videoUrl,
                      filmstripUrl,
                      filmstripTiles,
                      error: undefined,
                    },
                    shotResult: {
                      toolCallId,
                      loading: false,
                      videoUrl,
                      duration,
                      filmstripUrl,
                      filmstripTiles,
                      approved: m.shotResult?.approved ?? m.shotCompile?.approved,
                    },
                  }
                : m
            );
            if (!hasPendingJobs(next)) closeJobEventsStream();
            return next;
          });
        } else if (event.type === "shot_error") {
          const toolCallId = event.toolCallId as string;
          const error = event.error as string;
          setMessages((prev) => {
            const next = prev.map((m) =>
              m.shotResult?.toolCallId === toolCallId || m.shotCompile?.toolCallId === toolCallId
                ? {
                    ...m,
                    shotCompile: {
                      ...(m.shotCompile ?? { toolCallId, loading: false }),
                      rendering: false,
                      videoUrl: undefined,
                      error,
                    },
                    shotResult: { toolCallId, loading: false, error },
                  }
                : m
            );
            if (!hasPendingJobs(next)) closeJobEventsStream();
            return next;
          });
        } else if (event.type === "asset_ref") {
          const toolCallId = event.toolCallId as string;
          setMessages((prev) => {
            const next = prev.map((m) =>
              m.assetRef?.toolCallId === toolCallId
                ? {
                    ...m,
                    assetRef: {
                      ...m.assetRef!,
                      loading: false,
                      items: (event.items as AssetRef["items"] | undefined) ??
                        (event.images
                          ? [
                              {
                                assetHandle:
                                  (event.assetHandle as string) ??
                                  m.assetRef!.items?.[0]?.assetHandle ??
                                  "asset",
                                assetKind:
                                  (event.assetKind as AssetRef["items"][0]["assetKind"]) ??
                                  m.assetRef!.items?.[0]?.assetKind ??
                                  "character",
                                candidates: (event.images as string[]).map((url) => ({
                                  id: url,
                                  url,
                                })),
                              },
                            ]
                          : m.assetRef!.items),
                      error: event.error as string | undefined,
                    },
                  }
                : m
            );
            if (!hasPendingJobs(next)) closeJobEventsStream();
            return next;
          });
        } else if (event.type === "generation_grid") {
          const toolCallId = event.toolCallId as string;
          setMessages((prev) => {
            const next = prev.map((m) =>
              m.generationGrid?.toolCallId === toolCallId
                ? {
                    ...m,
                    generationGrid: {
                      ...m.generationGrid!,
                      loading: false,
                      sceneId: (event.sceneId as string | number) ?? m.generationGrid!.sceneId,
                      generationId: (event.generationId as string | undefined) ?? m.generationGrid!.generationId,
                      shotIds: (event.shotIds as number[] | undefined) ?? m.generationGrid!.shotIds,
                      estimatedDurationSeconds:
                        (event.estimatedDurationSeconds as number | undefined) ??
                        m.generationGrid!.estimatedDurationSeconds,
                      previousGenerationId:
                        (event.previousGenerationId as string | null | undefined) ??
                        m.generationGrid!.previousGenerationId,
                      sceneAnchorHandle:
                        (event.sceneAnchorHandle as string | null | undefined) ??
                        m.generationGrid!.sceneAnchorHandle,
                      incomingAnchorHandle:
                        (event.incomingAnchorHandle as string | null | undefined) ??
                        m.generationGrid!.incomingAnchorHandle,
                      continuityBreakReason:
                        (event.continuityBreakReason as string | null | undefined) ??
                        m.generationGrid!.continuityBreakReason,
                      panelCount: (event.panelCount as number | undefined) ?? m.generationGrid!.panelCount,
                      panelCaptions:
                        (event.panelCaptions as GenerationGrid["panelCaptions"]) ??
                        m.generationGrid!.panelCaptions,
                      aspectRatio:
                        (event.aspectRatio as GenerationGrid["aspectRatio"]) ??
                        m.generationGrid!.aspectRatio,
                      images: event.images as string[] | undefined,
                      error: event.error as string | undefined,
                    },
                  }
                : m
            );
            if (!hasPendingJobs(next)) closeJobEventsStream();
            return next;
          });
        }
      } catch {
        // malformed event — ignore
      }
    };

    es.onerror = () => {
      setMessages((prev) => {
        if (!hasPendingJobs(prev)) closeJobEventsStream();
        return prev;
      });
    };
  }

  function closeJobEventsStream() {
    jobEventsRef.current?.close();
    jobEventsRef.current = null;
  }

  useEffect(() => () => closeJobEventsStream(), []);

  useEffect(() => {
    if (hasPendingJobs(initialMessages)) openJobEventsStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Streaming ─────────────────────────────────────────────────────────────────
  async function streamResponse(body: object) {
    setStatus("streaming");
    const tempId = crypto.randomUUID();
    setStreamingMsgId(tempId);
    setMessages((prev) => [...prev, { id: tempId, role: "assistant", text: "" }]);

    try {
      const res = await fetch(`/api/v2/story/${sessionId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok || !res.body) throw new Error(`Request failed: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop()!;

        for (const chunk of parts) {
          if (!chunk.startsWith("data: ")) continue;
          const event = JSON.parse(chunk.slice(6)) as Record<string, unknown>;
          handleEvent(event, tempId);
        }
      }
    } catch (err) {
      console.error("Stream error:", err);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setStatus("idle");
      setStreamingMsgId(null);
    }
  }

  function handleEvent(event: Record<string, unknown>, tempId: string) {
    if (event.type === "text_delta") {
      startTransition(() =>
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId ? { ...m, text: m.text + (event.text as string) } : m
          )
        )
      );
    } else if (event.type === "questions_loading") {
      const questions: QuestionsCall = { toolCallId: event.toolCallId as string, loading: true };
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, questions } : m))
      );
    } else if (event.type === "questions") {
      const questions: QuestionsCall = {
        toolCallId: event.toolCallId as string,
        loading: false,
        questions: event.questions as QuestionsCall["questions"],
      };
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, questions } : m))
      );
    } else if (event.type === "asset_ref_loading") {
      const assetRef: AssetRef = { toolCallId: event.toolCallId as string, loading: true, items: [] };
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, assetRef } : m))
      );
    } else if (event.type === "asset_ref") {
      const pending = event.pending === true || (!event.items && !event.images);
      const items =
        (event.items as AssetRef["items"] | undefined) ??
        (event.assetHandle
          ? [
              {
                assetHandle: event.assetHandle as string,
                assetKind: (event.assetKind as AssetRef["items"][0]["assetKind"]) ?? "character",
                loading: pending,
                candidates: event.images
                  ? (event.images as string[]).map((url) => ({ id: url, url }))
                  : undefined,
                error: event.error as string | undefined,
              },
            ]
          : []);
      const assetRef: AssetRef = {
        toolCallId: event.toolCallId as string,
        loading: pending,
        items,
        error: event.error as string | undefined,
      };
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, assetRef } : m))
      );
      if (pending) openJobEventsStream();
    } else if (event.type === "generation_grid_loading") {
      const generationGrid: GenerationGrid = { toolCallId: event.toolCallId as string, loading: true };
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, generationGrid } : m))
      );
    } else if (event.type === "generation_grid") {
      const pending = event.pending === true || (!event.images && !event.error);
      const generationGrid: GenerationGrid = {
        toolCallId: event.toolCallId as string,
        loading: pending,
        sceneId: event.sceneId as string | number,
        generationId: event.generationId as string | undefined,
        shotIds: event.shotIds as number[] | undefined,
        estimatedDurationSeconds: event.estimatedDurationSeconds as number | undefined,
        previousGenerationId: event.previousGenerationId as string | null | undefined,
        sceneAnchorHandle: event.sceneAnchorHandle as string | null | undefined,
        incomingAnchorHandle: event.incomingAnchorHandle as string | null | undefined,
        continuityBreakReason: event.continuityBreakReason as string | null | undefined,
        images: event.images as string[] | undefined,
        panelCount: event.panelCount as number | undefined,
        panelCaptions: event.panelCaptions as GenerationGrid["panelCaptions"],
        aspectRatio: event.aspectRatio as GenerationGrid["aspectRatio"],
        error: event.error as string | undefined,
      };
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, generationGrid } : m))
      );
      if (pending) openJobEventsStream();
    } else if (event.type === "shot_compile_loading") {
      const shotCompile: ShotCompile = { toolCallId: event.toolCallId as string, loading: true };
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, shotCompile } : m))
      );
    } else if (event.type === "shot_compiled") {
      const shotCompile: ShotCompile = {
        toolCallId: event.toolCallId as string,
        loading: false,
        renderPrompt: event.renderPrompt as string,
        referenceImageUrls: event.referenceImageUrls as string[],
        referenceAudioUrls: event.referenceAudioUrls as string[] | undefined,
        duration: event.duration as number,
        aspectRatio: event.aspectRatio as ShotCompile["aspectRatio"],
        continuityMode: event.continuityMode as ShotCompile["continuityMode"],
        sourceVideoUrl: event.sourceVideoUrl as string | undefined,
      };
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, shotCompile } : m))
      );
    } else if (event.type === "shot_compile_gap" || event.type === "shot_compile_error") {
      const gaps = event.gaps as string[] | undefined;
      const shotCompile: ShotCompile = {
        toolCallId: event.toolCallId as string,
        loading: false,
        error:
          (event.error as string | undefined) ??
          (gaps?.length ? gaps.join("; ") : "Compile gap"),
      };
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, shotCompile } : m))
      );
    } else if (event.type === "shot_submitted") {
      const toolCallId = event.toolCallId as string;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? {
                ...m,
                shotCompile: m.shotCompile?.toolCallId === toolCallId
                  ? { ...m.shotCompile, rendering: true, videoUrl: undefined, error: undefined }
                  : m.shotCompile,
                shotResult: { toolCallId, loading: true },
              }
            : m
        )
      );
      openJobEventsStream();
    } else if (event.type === "shot_generated") {
      const toolCallId = event.toolCallId as string;
      const videoUrl = event.videoUrl as string;
      const filmstripUrl = event.filmstripUrl as string | undefined;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? {
                ...m,
                shotCompile: {
                  ...(m.shotCompile ?? { toolCallId, loading: false }),
                  rendering: false,
                  videoUrl,
                  filmstripUrl,
                  error: undefined,
                },
                shotResult: { toolCallId, loading: false, videoUrl, filmstripUrl },
              }
            : m
        )
      );
    } else if (event.type === "shot_error") {
      const toolCallId = event.toolCallId as string;
      const error = event.error as string;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? {
                ...m,
                shotCompile: {
                  ...(m.shotCompile ?? { toolCallId, loading: false }),
                  rendering: false,
                  videoUrl: undefined,
                  error,
                },
                shotResult: { toolCallId, loading: false, error },
              }
            : m
        )
      );
    } else if (event.type === "done") {
      setMessages((prev) => {
        const next = prev.map((m) => (m.id === tempId ? { ...m, id: event.messageId as string } : m));
        if (event.jobsQueued === true || hasPendingJobs(next)) openJobEventsStream();
        return next;
      });
    }
  }

  // ── Load older messages ───────────────────────────────────────────────────────
  async function loadOlderMessages() {
    if (!hasMore || !oldestCreatedAt || loadingOlderRef.current) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const res = await fetch(
        `/api/v2/story/${sessionId}/messages?before=${encodeURIComponent(oldestCreatedAt)}`
      );
      if (!res.ok) throw new Error(`Load older failed: ${res.status}`);
      const page = (await res.json()) as {
        messages: ClientMessage[];
        hasMore: boolean;
        oldestCreatedAt: string | null;
      };
      setMessages((prev) => {
        const existing = new Set(prev.map((m) => m.id));
        const older = page.messages.filter((m) => !existing.has(m.id));
        return older.length ? [...older, ...prev] : prev;
      });
      setHasMore(page.hasMore);
      setOldestCreatedAt(page.oldestCreatedAt);
    } catch (err) {
      console.error("Load older messages:", err);
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }

  // ── Action handlers ───────────────────────────────────────────────────────────
  async function sendUserMessage(text: string) {
    // Free-text while a question fork is open = answer it (dismisses the picker)
    // and send questions_result so tool history stays valid.
    if (pendingQuestions?.toolCallId && pendingQuestions.questions?.length) {
      const answers = pendingQuestions.questions.map((_, i) => (i === 0 ? text : ""));
      await handleQuestionsSubmit(pendingQuestions.toolCallId, answers);
      return;
    }
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text }]);
    await streamResponse({ type: "user", text });
  }

  async function handleQuestionsSubmit(toolCallId: string, answers: string[]) {
    const host = messages.find(
      (m) => m.role === "assistant" && m.questions?.toolCallId === toolCallId
    );
    const qs = host?.questions?.questions;
    const qaText = qs
      ? formatQuestionsAnswers(qs, answers)
      : answers.join("\n");

    setMessages((prev) => [
      ...prev.map((m) =>
        m.role === "assistant" && m.questions?.toolCallId === toolCallId
          ? { ...m, questions: { ...m.questions!, answers } }
          : m
      ),
      { id: crypto.randomUUID(), role: "user" as const, text: qaText },
    ]);
    await streamResponse({ type: "questions_result", toolCallId, answers });
  }

  async function handleShotApproval(toolCallId: string, videoUrl: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.shotCompile?.toolCallId === toolCallId || m.shotResult?.toolCallId === toolCallId
          ? {
              ...m,
              shotCompile: m.shotCompile
                ? { ...m.shotCompile, approved: true }
                : m.shotCompile,
              shotResult: m.shotResult
                ? { ...m.shotResult, approved: true }
                : m.shotResult,
            }
          : m
      )
    );
    await streamResponse({ type: "shot_approval", toolCallId, videoUrl });
  }

  async function handleRenderShot(toolCallId: string, renderPrompt: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.shotCompile?.toolCallId === toolCallId
          ? {
              ...m,
              shotCompile: {
                ...m.shotCompile!,
                rendering: true,
                renderPrompt,
                videoUrl: undefined,
                error: undefined,
              },
              shotResult: { toolCallId, loading: true },
            }
          : m
      )
    );
    try {
      const res = await fetch(`/api/v2/story/${sessionId}/render-shot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolCallId, renderPrompt }),
      });
      if (!res.ok) throw new Error(`Render failed: ${res.status}`);
      openJobEventsStream();
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.shotCompile?.toolCallId === toolCallId
            ? {
                ...m,
                shotCompile: {
                  ...m.shotCompile!,
                  rendering: false,
                  error: String(err),
                },
                shotResult: { toolCallId, loading: false, error: String(err) },
              }
            : m
        )
      );
    }
  }

  async function retryTool(toolCallId: string) {
    const host = messages.find(
      (m) =>
        m.generationGrid?.toolCallId === toolCallId ||
        m.assetRef?.toolCallId === toolCallId ||
        m.shotCompile?.toolCallId === toolCallId ||
        m.shotResult?.toolCallId === toolCallId
    );
    // Continuity/panel validation failures can't be fixed by replaying the same args —
    // send the rejection back to the agent so it can correct the chain fields.
    const gridError = host?.generationGrid?.toolCallId === toolCallId
      ? host.generationGrid.error
      : undefined;
    if (gridError) {
      await streamResponse({ type: "trigger" });
      return;
    }

    setMessages((prev) =>
      prev.map((m) => {
        if (m.shotCompile?.toolCallId === toolCallId || m.shotResult?.toolCallId === toolCallId) {
          return {
            ...m,
            shotCompile: m.shotCompile
              ? {
                  ...m.shotCompile,
                  rendering: true,
                  videoUrl: undefined,
                  error: undefined,
                  approved: undefined,
                }
              : { toolCallId, loading: false, rendering: true },
            shotResult: { toolCallId, loading: true },
          };
        }
        if (m.assetRef?.toolCallId === toolCallId)
          return {
            ...m,
            assetRef: {
              ...m.assetRef!,
              loading: true,
              error: undefined,
              items: (m.assetRef!.items ?? []).map((i) => ({
                ...i,
                loading: true,
                candidates: undefined,
                error: undefined,
              })),
            },
          };
        if (m.generationGrid?.toolCallId === toolCallId)
          return { ...m, generationGrid: { ...m.generationGrid!, loading: true, error: undefined, images: undefined } };
        return m;
      })
    );

    try {
      const res = await fetch(`/api/v2/story/${sessionId}/retry-tool`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolCallId }),
      });
      if (!res.ok) throw new Error(`Retry failed: ${res.status}`);
      openJobEventsStream();
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.shotCompile?.toolCallId === toolCallId || m.shotResult?.toolCallId === toolCallId) {
            return {
              ...m,
              shotCompile: m.shotCompile
                ? { ...m.shotCompile, rendering: false, error: String(err) }
                : { toolCallId, loading: false, error: String(err) },
              shotResult: { toolCallId, loading: false, error: String(err) },
            };
          }
          if (m.assetRef?.toolCallId === toolCallId)
            return {
              ...m,
              assetRef: {
                ...m.assetRef!,
                loading: false,
                error: String(err),
                items: (m.assetRef!.items ?? []).map((i) => ({ ...i, loading: false })),
              },
            };
          if (m.generationGrid?.toolCallId === toolCallId)
            return { ...m, generationGrid: { ...m.generationGrid!, loading: false, error: String(err) } };
          return m;
        })
      );
    }
  }

  async function handleAssetApproval(
    toolCallId: string,
    approvals: Array<{ assetHandle: string; candidateId: string; approvedUrl: string }>
  ) {
    setMessages((prev) =>
      prev.map((m) =>
        m.role === "assistant" && m.assetRef?.toolCallId === toolCallId
          ? {
              ...m,
              assetRef: {
                ...m.assetRef!,
                approved: true,
                items: (m.assetRef!.items ?? []).map((item) => {
                  const a = approvals.find((x) => x.assetHandle === item.assetHandle);
                  return a
                    ? {
                        ...item,
                        approvedCandidateId: a.candidateId,
                        approvedUrl: a.approvedUrl,
                        rejected: false,
                      }
                    : item;
                }),
              },
            }
          : m
      )
    );
    await streamResponse({ type: "asset_approval", toolCallId, approvals });
  }

  async function handleAssetReject(toolCallId: string, assetHandle: string, objection: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.role === "assistant" && m.assetRef?.toolCallId === toolCallId
          ? {
              ...m,
              assetRef: {
                ...m.assetRef!,
                items: (m.assetRef!.items ?? []).map((item) =>
                  item.assetHandle === assetHandle
                    ? { ...item, rejected: true, objection, loading: true, candidates: undefined }
                    : item
                ),
              },
            }
          : m
      )
    );
    try {
      const res = await fetch(`/api/v2/story/${sessionId}/retry-tool`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolCallId, assetHandle, objection }),
      });
      if (!res.ok) throw new Error(await res.text());
      openJobEventsStream();
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.assetRef?.toolCallId === toolCallId
            ? {
                ...m,
                assetRef: {
                  ...m.assetRef!,
                  items: (m.assetRef!.items ?? []).map((item) =>
                    item.assetHandle === assetHandle
                      ? { ...item, loading: false, rejected: false, error: String(err) }
                      : item
                  ),
                },
              }
            : m
        )
      );
    }
  }

  async function handleGridApproval(toolCallId: string, sceneId: string | number, approvedUrl: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.role === "assistant" && m.generationGrid?.toolCallId === toolCallId
          ? { ...m, generationGrid: { ...m.generationGrid!, approvedUrl } }
          : m
      )
    );
    await streamResponse({ type: "grid_approval", toolCallId, sceneId, approvedUrl });
  }

  // ── Drag-to-resize ────────────────────────────────────────────────────────────
  function onDragHandlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = chatWidth;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onDragHandlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDraggingRef.current) return;
    const delta = dragStartXRef.current - e.clientX;
    const next = Math.min(CHAT_MAX, Math.max(CHAT_MIN, dragStartWidthRef.current + delta));
    if (chatPanelRef.current) chatPanelRef.current.style.width = next + "px";
  }

  function onDragHandlePointerUp() {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    const w = chatPanelRef.current ? parseFloat(chatPanelRef.current.style.width) || chatWidth : chatWidth;
    setChatWidth(w);
    localStorage.setItem("chat-sidebar-width", String(w));
  }

  return (
    <div ref={chatRowRef} className="flex-1 flex flex-col md:flex-row overflow-hidden relative min-h-0 min-w-0">
      {/* ── Center: Video Editor ── */}
      <Card
        variant="panel"
        padding="none"
        className={cn(
          "flex-1 rounded-none min-w-0 min-h-0",
          mobileTab && mobileTab.tab !== "editor" && "max-md:hidden"
        )}
      >
        <VideoEditorPanel
          clips={clips}
          sessionId={sessionId}
          selectedClipId={selectedClipId}
          onSelectClip={setSelectedClipId}
          isHidden={!!(mobileTab && mobileTab.tab !== "editor")}
        />
      </Card>

      {/* ── Show-chat button (when sidebar is hidden and not expanded) ── */}
      {!chatVisible && !chatExpanded && (
        <button
          onClick={() => setChatVisible(true)}
          title="Show chat"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 z-20 w-6 h-12 hidden md:flex items-center justify-center glass-base rounded-l-lg text-muted-foreground/60 hover:text-foreground transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* ── Right: Chat Sidebar ── */}
      <div
        ref={chatPanelRef}
        style={{ width: chatExpanded ? rowWidth : chatVisible ? chatWidth : 0 }}
        className={cn(
          "shrink-0 min-h-0 relative",
          !isDragging && "transition-all duration-200",
          mobileTab && mobileTab.tab !== "chat" && "max-md:hidden",
          mobileTab?.tab === "chat" && "max-md:w-full! max-md:flex-1!"
        )}
      >
        {/* Left-edge drag handle */}
        {chatVisible && !chatExpanded && (
          <div
            onPointerDown={onDragHandlePointerDown}
            onPointerMove={onDragHandlePointerMove}
            onPointerUp={onDragHandlePointerUp}
            onPointerCancel={onDragHandlePointerUp}
            className="absolute left-0 top-0 h-full w-2 cursor-col-resize z-20 hidden md:block group"
            title="Drag to resize"
          >
            <div className="absolute left-0 top-0 h-full w-px bg-white/8 group-hover:bg-primary/50 group-active:bg-primary transition-colors" />
          </div>
        )}
        <Card
          variant="panel"
          padding="none"
          className={cn(
            "w-full h-full rounded-none min-h-0",
            mobileTab?.tab === "chat" && "max-md:[box-shadow:none]! max-md:border-0!"
          )}
        >
          {/* seed label + toggle */}
          <div className="border-b border-white/8 px-4 py-3 shrink-0 flex justify-end items-center gap-2">
            <button
              onClick={() => setChatExpanded((v) => !v)}
              title={chatExpanded ? "Shrink chat" : "Expand chat"}
              className="max-md:hidden shrink-0 w-6 h-6 flex items-center justify-center rounded text-muted-foreground/40 hover:text-muted-foreground hover:bg-white/8 transition-colors"
            >
              {chatExpanded ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M6 5l7 7-7 7" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
                </svg>
              )}
            </button>
            {!chatExpanded && (
              <button
                onClick={() => setChatVisible(false)}
                title="Hide chat"
                className="max-md:hidden shrink-0 w-6 h-6 flex items-center justify-center rounded text-muted-foreground/40 hover:text-muted-foreground hover:bg-white/8 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>

          <MessageList
            messages={messages}
            isStreaming={isStreaming}
            streamingMsgId={streamingMsgId}
            hasMore={hasMore}
            loadingOlder={loadingOlder}
            onLoadOlder={() => void loadOlderMessages()}
            onAssetApproval={handleAssetApproval}
            onAssetReject={handleAssetReject}
            onGridApproval={handleGridApproval}
            onRetry={retryTool}
            onRenderShot={handleRenderShot}
            onShotApproval={handleShotApproval}
          />

          <div className="shrink-0 min-h-0 max-h-[45%] max-w-3xl mx-auto w-full px-3 flex flex-col">
            {pendingQuestions?.loading && (
              <p className="text-xs text-muted-foreground/40 italic animate-pulse px-1">
                Preparing questions…
              </p>
            )}
            {pendingQuestions?.questions && (
              <QuestionsPicker
                key={pendingQuestions.toolCallId}
                questions={pendingQuestions.questions}
                onSubmit={(answers) =>
                  void handleQuestionsSubmit(pendingQuestions.toolCallId, answers)
                }
                disabled={isStreaming}
              />
            )}
          </div>

          <ChatInput isStreaming={isStreaming} onSend={(text) => void sendUserMessage(text)} />
        </Card>
      </div>
    </div>
  );
}
