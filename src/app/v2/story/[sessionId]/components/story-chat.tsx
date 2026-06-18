"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ForkSelector } from "./fork-selector";
import { VideoEditorPanel, type Clip } from "./video-editor-panel";
import type { AssetRef, ClientMessage, ForkCall, ShotResult } from "@/types/v2/story";

export function StoryChat({
  sessionId,
  initialMessages,
}: {
  sessionId: string;
  initialMessages: ClientMessage[];
}) {
  const [messages, setMessages] = useState<ClientMessage[]>(initialMessages);
  const [status, setStatus] = useState<"idle" | "streaming">("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const [hasInput, setHasInput] = useState(false);
  const hasAutoSent = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // video editor state
  const [clipOrder, setClipOrder] = useState<string[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  // resizable chat sidebar
  const CHAT_MIN = 280;
  const CHAT_MAX = 640;
  const [chatWidth, setChatWidth] = useState(() => {
    if (typeof window === "undefined") return 400;
    return Number(localStorage.getItem("chat-sidebar-width") ?? 400);
  });
  const [chatVisible, setChatVisible] = useState(true);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(0);

  function handleScroll() {
    const el = scrollContainerRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 80);
  }

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  function onDragHandlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = chatWidth;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onDragHandlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDraggingRef.current) return;
    // dragging left = increasing width (handle is on the left edge of the sidebar)
    const delta = dragStartXRef.current - e.clientX;
    const next = Math.min(CHAT_MAX, Math.max(CHAT_MIN, dragStartWidthRef.current + delta));
    setChatWidth(next);
  }

  function onDragHandlePointerUp() {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    localStorage.setItem("chat-sidebar-width", String(chatWidth));
  }

  const isStreaming = status === "streaming";
  const seed = useMemo(() => messages.find((m) => m.role === "user")?.text ?? "", [messages]);

  // sync clipOrder when new shots arrive
  useEffect(() => {
    setClipOrder((prev) => {
      const existingIds = new Set(prev);
      const newIds = messages
        .filter((m) => m.shotResult?.videoUrl)
        .map((m) => m.shotResult!.toolCallId)
        .filter((id) => !existingIds.has(id));
      if (newIds.length === 0) return prev;
      return [...prev, ...newIds];
    });
  }, [messages]);

  const clipsByTcId = useMemo(() => {
    const map = new Map<string, Clip>();
    for (const m of messages) {
      if (m.shotResult?.videoUrl) {
        map.set(m.shotResult.toolCallId, {
          toolCallId: m.shotResult.toolCallId,
          videoUrl: m.shotResult.videoUrl,
          approved: m.shotResult.approved,
        });
      }
    }
    return map;
  }, [messages]);

  const clips = useMemo(
    () => clipOrder.map((id) => clipsByTcId.get(id)).filter(Boolean) as Clip[],
    [clipOrder, clipsByTcId]
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  async function streamResponse(body: object) {
    setStatus("streaming");
    const tempId = crypto.randomUUID();
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
    }
  }

  function handleEvent(event: Record<string, unknown>, tempId: string) {
    if (event.type === "text_delta") {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, text: m.text + (event.text as string) } : m
        )
      );
    } else if (event.type === "fork_loading") {
      const fork: ForkCall = { toolCallId: event.toolCallId as string, loading: true };
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, fork } : m))
      );
    } else if (event.type === "fork") {
      const fork: ForkCall = {
        toolCallId: event.toolCallId as string,
        loading: false,
        options: event.options as ForkCall["options"],
        recommendedId: event.recommendedId as string,
        recommendationReason: event.recommendationReason as string,
      };
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, fork } : m))
      );
    } else if (event.type === "asset_ref_loading") {
      const assetRef: AssetRef = { toolCallId: event.toolCallId as string, loading: true };
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, assetRef } : m))
      );
    } else if (event.type === "asset_ref") {
      const assetRef: AssetRef = {
        toolCallId: event.toolCallId as string,
        loading: false,
        assetHandle: event.assetHandle as string,
        assetKind: event.assetKind as AssetRef["assetKind"],
        images: event.images as string[],
      };
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, assetRef } : m))
      );
    } else if (event.type === "shot_loading") {
      const shotResult: ShotResult = { toolCallId: event.toolCallId as string, loading: true };
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, shotResult } : m))
      );
    } else if (event.type === "shot_generated") {
      const shotResult: ShotResult = {
        toolCallId: event.toolCallId as string,
        loading: false,
        videoUrl: event.videoUrl as string,
      };
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, shotResult } : m))
      );
    } else if (event.type === "shot_error") {
      const shotResult: ShotResult = {
        toolCallId: event.toolCallId as string,
        loading: false,
        error: event.error as string,
      };
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, shotResult } : m))
      );
    } else if (event.type === "done") {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, id: event.messageId as string } : m))
      );
    }
  }

  async function sendUserMessage() {
    const trimmed = inputRef.current?.value.trim() ?? "";
    if (!trimmed || isStreaming) return;
    if (inputRef.current) { inputRef.current.value = ""; setHasInput(false); }
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text: trimmed }]);
    await streamResponse({ type: "user", text: trimmed });
  }

  async function handleForkChoice(toolCallId: string, value: string, optionId?: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.role === "assistant" && m.fork?.toolCallId === toolCallId
          ? { ...m, fork: { ...m.fork!, result: { optionId, value } } }
          : m
      )
    );
    await streamResponse({ type: "fork_result", toolCallId, value, optionId });
  }

  async function handleShotApproval(toolCallId: string, videoUrl: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.shotResult?.toolCallId === toolCallId
          ? { ...m, shotResult: { ...m.shotResult!, approved: true } }
          : m
      )
    );
    await streamResponse({ type: "shot_approval", toolCallId, videoUrl });
  }

  async function retryTool(toolCallId: string) {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.shotResult?.toolCallId === toolCallId)
          return { ...m, shotResult: { toolCallId, loading: true } };
        if (m.assetRef?.toolCallId === toolCallId)
          return { ...m, assetRef: { ...m.assetRef!, loading: true, error: undefined, images: undefined } };
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
      const data = (await res.json()) as Record<string, unknown>;

      setMessages((prev) =>
        prev.map((m) => {
          if (m.shotResult?.toolCallId === toolCallId)
            return { ...m, shotResult: { toolCallId, loading: false, videoUrl: data.videoUrl as string } };
          if (m.assetRef?.toolCallId === toolCallId)
            return {
              ...m,
              assetRef: {
                ...m.assetRef!,
                loading: false,
                error: undefined,
                images: data.images as string[],
              },
            };
          return m;
        })
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.shotResult?.toolCallId === toolCallId)
            return { ...m, shotResult: { toolCallId, loading: false, error: String(err) } };
          if (m.assetRef?.toolCallId === toolCallId)
            return { ...m, assetRef: { ...m.assetRef!, loading: false, error: String(err) } };
          return m;
        })
      );
    }
  }

  async function handleAssetApproval(toolCallId: string, assetHandle: string, approvedUrl: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.role === "assistant" && m.assetRef?.toolCallId === toolCallId
          ? { ...m, assetRef: { ...m.assetRef!, approvedUrl } }
          : m
      )
    );
    await streamResponse({ type: "asset_approval", toolCallId, assetHandle, approvedUrl });
  }

  return (
    <div className="h-screen flex overflow-hidden relative">
      {/* ── Center: Video Editor ── */}
      <VideoEditorPanel
        clips={clips}
        onReorderClips={setClipOrder}
        selectedClipId={selectedClipId}
        onSelectClip={setSelectedClipId}
      />

      {/* ── Show-chat button (when sidebar is hidden) ── */}
      {!chatVisible && (
        <button
          onClick={() => setChatVisible(true)}
          title="Show chat"
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-6 h-12 flex items-center justify-center bg-gray-900 border border-white/10 border-r-0 rounded-l-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* ── Drag handle (only when sidebar is visible) ── */}
      {chatVisible && (
        <div
          onPointerDown={onDragHandlePointerDown}
          onPointerMove={onDragHandlePointerMove}
          onPointerUp={onDragHandlePointerUp}
          onPointerCancel={onDragHandlePointerUp}
          className="w-1 shrink-0 cursor-col-resize group relative flex items-center justify-center hover:bg-violet-500/20 active:bg-violet-500/30 transition-colors z-10"
          title="Drag to resize"
        >
          <div className="absolute inset-y-0 w-px bg-white/8 group-hover:bg-violet-500/60 group-active:bg-violet-500 transition-colors" />
        </div>
      )}

      {/* ── Right: Chat Sidebar ── */}
      <div
        style={{ width: chatVisible ? chatWidth : 0 }}
        className="shrink-0 flex flex-col border-l border-white/10 bg-gray-950 overflow-hidden relative transition-[width] duration-200"
      >
        {/* seed label + toggle */}
        <div className="border-b border-white/10 px-4 py-3 shrink-0 flex items-center gap-2">
          <p className="text-xs text-gray-500 truncate flex-1">&ldquo;{seed}&rdquo;</p>
          <button
            onClick={() => setChatVisible(false)}
            title="Hide chat"
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-gray-600 hover:text-gray-300 hover:bg-white/8 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* messages */}
        <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 [scrollbar-width:thin] [scrollbar-color:#333_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-white/30">
          <div className="space-y-7 pb-4">
            {messages.map((msg) => {
              if (msg.role === "user") {
                return (
                  <div key={msg.id} className="flex justify-end group">
                    <div className="relative max-w-[85%]">
                      <button
                        onClick={() => void navigator.clipboard.writeText(msg.text)}
                        className="absolute -left-7 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-gray-600 hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Copy"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                      <div className="bg-[#2f2f2f] rounded-3xl px-4 py-2.5 text-[14px] text-white leading-relaxed">
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                      </div>
                    </div>
                  </div>
                );
              }

              const fork = msg.fork;
              return (
                <div key={msg.id} className="space-y-3 group">
                  {(msg.text || (isStreaming && !fork)) && (
                    <div className="text-[14px] leading-[1.75] text-gray-100">
                      {msg.text ? (
                        <div className="prose prose-invert max-w-none min-w-0 wrap-break-word
                          prose-p:my-1.5 prose-p:leading-[1.75] prose-p:text-gray-100
                          prose-headings:text-white prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-1.5
                          prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
                          prose-strong:text-white
                          prose-ul:my-1.5 prose-ul:pl-5 prose-ol:my-1.5 prose-ol:pl-5 prose-li:my-0.5 prose-li:text-gray-100
                          prose-code:text-gray-100 prose-code:bg-transparent prose-code:px-0 prose-code:py-0 prose-code:rounded-none prose-code:text-[14px] prose-code:font-sans prose-code:before:content-none prose-code:after:content-none
                        ">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                        </div>
                      ) : (
                        <Spinner />
                      )}
                      {msg.text && isStreaming && !fork && <InlineSpinner />}
                    </div>
                  )}

                  {msg.text && !isStreaming && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => void navigator.clipboard.writeText(msg.text)}
                        className="p-1.5 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-colors"
                        title="Copy"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  )}

                  {fork && (
                    <div>
                      {fork.loading ? (
                        <p className="text-xs text-gray-600 italic animate-pulse">Preparing options…</p>
                      ) : fork.options ? (
                        <ForkSelector
                          options={fork.options}
                          recommendedId={fork.recommendedId!}
                          recommendationReason={fork.recommendationReason!}
                          selectedId={fork.result?.optionId}
                          onChoose={
                            fork.result
                              ? undefined
                              : (optionId, customText) =>
                                handleForkChoice(
                                  fork.toolCallId,
                                  customText ?? fork.options!.find((o) => o.id === optionId)?.content ?? "",
                                  optionId
                                )
                          }
                          disabled={isStreaming}
                        />
                      ) : null}
                    </div>
                  )}

                  {msg.assetRef && (
                    <div>
                      <AssetRefPanel
                        assetRef={msg.assetRef}
                        disabled={isStreaming}
                        onApprove={
                          msg.assetRef.approvedUrl
                            ? undefined
                            : (url: string) =>
                              handleAssetApproval(msg.assetRef!.toolCallId, msg.assetRef!.assetHandle!, url)
                        }
                        onRetry={!msg.assetRef.approvedUrl && !msg.assetRef.loading ? () => void retryTool(msg.assetRef!.toolCallId) : undefined}
                      />
                    </div>
                  )}

                  {msg.shotResult && (
                    <ShotPreviewPanel
                      shotResult={msg.shotResult}
                      disabled={isStreaming}
                      onApprove={
                        msg.shotResult.videoUrl && !msg.shotResult.approved && !msg.shotResult.loading
                          ? () => void handleShotApproval(msg.shotResult!.toolCallId, msg.shotResult!.videoUrl!)
                          : undefined
                      }
                      onRetry={!msg.shotResult.loading ? () => void retryTool(msg.shotResult!.toolCallId) : undefined}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div ref={messagesEndRef} />
        </div>

        {/* scroll-to-bottom button */}
        {showScrollBtn && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-[72px] left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-[#2f2f2f] border border-white/10 shadow-lg flex items-center justify-center text-gray-300 hover:text-white hover:bg-[#3a3a3a] transition-colors z-20"
            title="Scroll to bottom"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}

        {/* input bar */}
        <div className="px-3 py-3 shrink-0 border-t border-white/10">
          <div className="flex gap-2 bg-[#2f2f2f] rounded-2xl px-3 py-2 items-center">
            <input
              ref={inputRef}
              type="text"
              onChange={(e) => setHasInput(e.target.value.length > 0)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendUserMessage();
                }
              }}
              placeholder={isStreaming ? "Showrunner is writing…" : "Ask a question or give feedback…"}
              disabled={isStreaming}
              className="flex-1 bg-transparent text-[14px] text-white placeholder:text-gray-500 outline-none disabled:opacity-50 py-0.5"
            />
            <button
              onClick={() => { void sendUserMessage(); }}
              disabled={!hasInput || isStreaming}
              className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-black hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span className="inline-flex gap-0.5 align-middle">
      {[0, 150, 300].map((d) => (
        <span key={d} className="w-1 h-1 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  );
}

function InlineSpinner() {
  return (
    <span className="inline-flex gap-0.5 ml-1 align-middle">
      {[0, 150, 300].map((d) => (
        <span key={d} className="w-1 h-1 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  );
}

function ShotPreviewPanel({
  shotResult,
  disabled,
  onApprove,
  onRetry,
}: {
  shotResult: ShotResult;
  disabled?: boolean;
  onApprove?: () => void;
  onRetry?: () => void;
}) {
  if (shotResult.loading) {
    return <p className="text-xs text-gray-600 italic animate-pulse">Rendering shot…</p>;
  }

  if (shotResult.videoUrl) {
    return (
      <div className="mt-1 space-y-2">
        <div className="rounded-xl overflow-hidden border border-white/10">
          <video src={shotResult.videoUrl} controls className="w-full" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {shotResult.approved ? (
            <span className="text-[10px] font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2 py-0.5">
              ✓ In timeline
            </span>
          ) : (
            <button
              onClick={onApprove}
              disabled={disabled || !onApprove}
              className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-400/30 hover:border-emerald-300/50 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
              </svg>
              Approve shot
            </button>
          )}
          {!shotResult.approved && onRetry && (
            <button
              onClick={onRetry}
              disabled={disabled}
              className="text-xs text-gray-500 hover:text-gray-300 border border-white/10 hover:border-white/20 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Regenerate
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-1 flex items-center gap-3">
      <p className="text-xs text-red-400">{shotResult.error ?? "Shot render failed."}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          disabled={disabled}
          className="text-xs text-violet-400 hover:text-violet-300 border border-violet-400/30 hover:border-violet-300/50 rounded-lg px-3 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Retry
        </button>
      )}
    </div>
  );
}

function AssetRefPanel({
  assetRef,
  disabled,
  onApprove,
  onRetry,
}: {
  assetRef: AssetRef;
  disabled?: boolean;
  onApprove?: (url: string) => void;
  onRetry?: () => void;
}) {
  if (assetRef.loading) {
    return (
      <p className="text-xs text-gray-600 italic animate-pulse">Generating reference images…</p>
    );
  }

  if (assetRef.error || !assetRef.images?.length) {
    return (
      <div className="mt-1 flex items-center gap-3">
        <p className="text-xs text-red-400">{assetRef.error ?? "Image generation failed."}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            disabled={disabled}
            className="text-xs text-violet-400 hover:text-violet-300 border border-violet-400/30 hover:border-violet-300/50 rounded-lg px-3 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  const isLocked = !!assetRef.approvedUrl;

  return (
    <div className="mt-1 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-violet-400">{assetRef.assetHandle}</span>
        <span className="text-gray-600">·</span>
        <span className="text-xs text-gray-500 capitalize">{assetRef.assetKind}</span>
        {isLocked && (
          <span className="ml-1 text-[10px] font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2 py-0.5">
            Approved
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {(assetRef.images ?? []).map((url) => {
          const isApproved = url === assetRef.approvedUrl;
          return (
            <button
              key={url}
              onClick={() => !isLocked && !disabled && onApprove?.(url)}
              disabled={isLocked || disabled}
              className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all duration-200 ${isApproved
                  ? "border-emerald-500 ring-2 ring-emerald-500/30"
                  : isLocked || disabled
                    ? "border-white/10 cursor-default opacity-60"
                    : "border-white/10 hover:border-violet-400 hover:ring-2 hover:ring-violet-400/20 cursor-pointer"
                }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="Reference candidate" className="w-full h-full object-cover" />
              {isApproved && (
                <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-emerald-400 drop-shadow" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {!isLocked && (
        <p className="text-xs text-gray-600">Pick one to approve as reference for this asset.</p>
      )}
    </div>
  );
}
