"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ForkSelector } from "./fork-selector";
import type { AssetRef, ClientMessage, ForkCall } from "@/types/v2/story";

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

  const isStreaming = status === "streaming";
  const seed = useMemo(() => messages.find((m) => m.role === "user")?.text ?? "", [messages]);

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
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="border-b border-white/10 px-6 py-3 shrink-0 bg-gray-950">
        <p className="text-xs text-gray-500 truncate max-w-2xl mx-auto">&ldquo;{seed}&rdquo;</p>
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <div className="max-w-3xl mx-auto space-y-8 pb-4">
              {messages.map((msg) => {
                if (msg.role === "user") {
                  return (
                    <div key={msg.id} className="flex justify-end group">
                      <div className="relative max-w-[70%]">
                        {/* hover copy */}
                        <button
                          onClick={() => void navigator.clipboard.writeText(msg.text)}
                          className="absolute -left-8 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-gray-600 hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Copy"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                        <div className="bg-[#2f2f2f] rounded-3xl px-5 py-3 text-[15px] text-white leading-relaxed">
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                        </div>
                      </div>
                    </div>
                  );
                }

                // assistant — no bubble, text on background
                const fork = msg.fork;
                return (
                  <div key={msg.id} className="space-y-3 group">
                    {(msg.text || (isStreaming && !fork)) && (
                      <div className="text-[15px] leading-[1.75] text-gray-100">
                        {msg.text ? (
                          <div className="prose prose-invert max-w-none
                            prose-p:my-2 prose-p:leading-[1.75] prose-p:text-gray-100
                            prose-headings:text-white prose-headings:font-semibold prose-headings:mt-6 prose-headings:mb-2
                            prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
                            prose-strong:text-white
                            prose-ul:my-2 prose-ul:pl-6 prose-ol:my-2 prose-ol:pl-6 prose-li:my-1 prose-li:text-gray-100
                            prose-code:text-violet-300 prose-code:bg-white/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[13px] prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
                          ">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                          </div>
                        ) : (
                          <Spinner />
                        )}
                        {msg.text && isStreaming && !fork && <InlineSpinner />}
                      </div>
                    )}

                    {/* action row — copy button, visible on hover */}
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
                        />
                      </div>
                    )}
                  </div>
                );
              })}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input bar */}
          <div className="px-4 py-4 shrink-0">
            <div className="max-w-3xl mx-auto flex gap-2 bg-[#2f2f2f] rounded-2xl px-4 py-2 items-center">
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
                className="flex-1 bg-transparent text-[15px] text-white placeholder:text-gray-500 outline-none disabled:opacity-50 py-1"
              />
              <button
                onClick={() => { void sendUserMessage(); }}
                disabled={!hasInput || isStreaming}
                className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-black hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
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

function AssetRefPanel({
  assetRef,
  disabled,
  onApprove,
}: {
  assetRef: AssetRef;
  disabled?: boolean;
  onApprove?: (url: string) => void;
}) {
  if (assetRef.loading) {
    return (
      <p className="text-xs text-gray-600 italic animate-pulse">Generating reference images…</p>
    );
  }

  const isLocked = !!assetRef.approvedUrl;

  return (
    <div className="mt-2 space-y-3">
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

      <div className="grid grid-cols-3 gap-2">
        {(assetRef.images ?? []).map((url) => {
          const isApproved = url === assetRef.approvedUrl;
          return (
            <button
              key={url}
              onClick={() => !isLocked && !disabled && onApprove?.(url)}
              disabled={isLocked || disabled}
              className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all duration-200 ${isApproved
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
                  <svg className="w-8 h-8 text-emerald-400 drop-shadow" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {!isLocked && (
        <p className="text-xs text-gray-600">Pick one to approve it as the reference for this asset.</p>
      )}
    </div>
  );
}
