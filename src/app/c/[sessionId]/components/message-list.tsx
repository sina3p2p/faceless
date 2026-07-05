"use client";

import { useEffect, useRef, useState } from "react";
import { AssistantText } from "./assistant-text";
import { ForkSelector } from "./fork-selector";
import { AssetRefPanel } from "./asset-ref-panel";
import { SceneGridPanel } from "./scene-grid-panel";
import { ShotCompilePanel } from "./shot-compile-panel";
import { ShotPreviewPanel } from "./shot-preview-panel";
import type { ClientMessage } from "@/types/v2/story";

export function MessageList({
  messages,
  isStreaming,
  streamingMsgId,
  onForkChoice,
  onAssetApproval,
  onGridApproval,
  onRetry,
  onRenderShot,
  onShotApproval,
}: {
  messages: ClientMessage[];
  isStreaming: boolean;
  streamingMsgId: string | null;
  onForkChoice: (toolCallId: string, value: string, optionId?: string) => void;
  onAssetApproval: (toolCallId: string, assetHandle: string, url: string) => void;
  onGridApproval: (toolCallId: string, sceneId: string | number, url: string) => void;
  onRetry: (toolCallId: string) => void;
  onRenderShot: (toolCallId: string, renderPrompt: string) => void;
  onShotApproval: (toolCallId: string, videoUrl: string) => void;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // Content height can grow without `messages` changing — e.g. the typing
  // animation in AssistantText reveals a table/hr over many frames after a
  // single text_delta lands. A ResizeObserver catches that growth directly
  // instead of relying on the messages array as a proxy for DOM size.
  useEffect(() => {
    const el = scrollContainerRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const ro = new ResizeObserver(() => {
      if (isAtBottomRef.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  function handleScroll() {
    const el = scrollContainerRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setShowScrollBtn(!isAtBottomRef.current);
  }

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 [scrollbar-width:thin] [scrollbar-color:#333_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-white/30"
      >
        <div ref={contentRef} className="space-y-7 pb-4 max-w-3xl mx-auto w-full">
          {messages.map((msg) => {
            if (msg.role === "user") {
              return (
                <div key={msg.id} className="flex justify-end group">
                  <div className="relative max-w-[85%]">
                    <button
                      onClick={() => void navigator.clipboard.writeText(msg.text)}
                      className="absolute -left-7 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-muted-foreground/40 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity max-md:hidden"
                      title="Copy"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                    <div className="bg-secondary text-secondary-foreground rounded-3xl px-4 py-2.5 text-[14px] leading-relaxed">
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
                  <AssistantText
                    text={msg.text}
                    isTyping={isStreaming && msg.id === streamingMsgId && !fork}
                  />
                )}

                {msg.text && !isStreaming && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => void navigator.clipboard.writeText(msg.text)}
                      className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-muted-foreground hover:bg-white/5 transition-colors"
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
                      <p className="text-xs text-muted-foreground/40 italic animate-pulse">Preparing options…</p>
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
                              onForkChoice(
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
                  <AssetRefPanel
                    assetRef={msg.assetRef}
                    disabled={isStreaming}
                    onApprove={
                      msg.assetRef.approvedUrl
                        ? undefined
                        : (url: string) => onAssetApproval(msg.assetRef!.toolCallId, msg.assetRef!.assetHandle!, url)
                    }
                    onRetry={!msg.assetRef.approvedUrl && !msg.assetRef.loading ? () => onRetry(msg.assetRef!.toolCallId) : undefined}
                  />
                )}

                {msg.sceneGrid && (
                  <SceneGridPanel
                    sceneGrid={msg.sceneGrid}
                    disabled={isStreaming}
                    onApprove={
                      msg.sceneGrid.approvedUrl
                        ? undefined
                        : (url: string) => onGridApproval(msg.sceneGrid!.toolCallId, msg.sceneGrid!.sceneId!, url)
                    }
                    onRetry={!msg.sceneGrid.approvedUrl && !msg.sceneGrid.loading ? () => onRetry(msg.sceneGrid!.toolCallId) : undefined}
                  />
                )}

                {msg.shotCompile && (
                  <ShotCompilePanel
                    compile={msg.shotCompile}
                    disabled={isStreaming}
                    onApprove={(renderPrompt) => onRenderShot(msg.shotCompile!.toolCallId, renderPrompt)}
                  />
                )}

                {msg.shotResult && (
                  <ShotPreviewPanel
                    shotResult={msg.shotResult}
                    disabled={isStreaming}
                    onApprove={
                      msg.shotResult.videoUrl && !msg.shotResult.approved && !msg.shotResult.loading
                        ? () => onShotApproval(msg.shotResult!.toolCallId, msg.shotResult!.videoUrl!)
                        : undefined
                    }
                    onRetry={!msg.shotResult.loading ? () => onRetry(msg.shotResult!.toolCallId) : undefined}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {showScrollBtn && (
        <button
          onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-black/10 backdrop-blur-2xl border border-white/10 shadow-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors z-20"
          title="Scroll to bottom"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}
    </div>
  );
}
