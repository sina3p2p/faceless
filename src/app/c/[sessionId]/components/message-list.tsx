"use client";

import { useEffect, useRef, useState } from "react";
import { AssistantText } from "./assistant-text";
import { AssetRefPanel } from "./asset-ref-panel";
import { VoiceAnchorPanel } from "./voice-anchor-panel";
import { GenerationGridPanel } from "./generation-grid-panel";
import { ShotCompilePanel } from "./shot-compile-panel";
import type { ClientMessage } from "@/types/v2/story";

export function MessageList({
  messages,
  isStreaming,
  streamingMsgId,
  hasMore = false,
  loadingOlder = false,
  onLoadOlder,
  onAssetApproval,
  onAssetReject,
  onVoiceApproval,
  onVoiceReject,
  onGridApproval,
  onRetry,
  onRenderShot,
  onShotApproval,
}: {
  messages: ClientMessage[];
  isStreaming: boolean;
  streamingMsgId: string | null;
  hasMore?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
  onAssetApproval: (
    toolCallId: string,
    approvals: Array<{ assetHandle: string; candidateId: string; approvedUrl: string }>
  ) => void;
  onAssetReject: (toolCallId: string, assetHandle: string, objection: string) => void;
  onVoiceApproval: (
    toolCallId: string,
    approvals: Array<{ handle: string; candidateId: string; approvedUrl: string }>
  ) => void;
  onVoiceReject: (toolCallId: string, handle: string, objection: string) => void;
  onGridApproval: (toolCallId: string, sceneId: string | number, url: string) => void;
  onRetry: (toolCallId: string) => void;
  onRenderShot: (toolCallId: string, renderPrompt: string) => void;
  onShotApproval: (toolCallId: string, videoUrl: string) => void;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const pendingPrependRef = useRef(false);
  const scrollHeightBeforeLoadRef = useRef(0);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // When loadingOlder flips true→false with more messages, restore scroll offset.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (loadingOlder) {
      if (!pendingPrependRef.current) {
        scrollHeightBeforeLoadRef.current = el.scrollHeight;
        pendingPrependRef.current = true;
        isAtBottomRef.current = false;
      }
      return;
    }
    if (pendingPrependRef.current) {
      pendingPrependRef.current = false;
      const delta = el.scrollHeight - scrollHeightBeforeLoadRef.current;
      if (delta > 0) el.scrollTop += delta;
    }
  }, [loadingOlder, messages.length]);

  // Content height can grow without `messages` changing — e.g. an image
  // finishing load. A ResizeObserver catches that growth directly instead
  // of relying on the messages array as a proxy for DOM size.
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
    if (hasMore && onLoadOlder && !loadingOlder && el.scrollTop < 80) {
      onLoadOlder();
    }
  }

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 [scrollbar-width:thin] [scrollbar-color:#333_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-white/30"
      >
        <div ref={contentRef} className="space-y-7 pb-4 max-w-3xl mx-auto w-full">
          {(hasMore || loadingOlder) && (
            <div className="flex justify-center py-1">
              {loadingOlder ? (
                <p className="text-[11px] text-muted-foreground/40 animate-pulse">Loading earlier messages…</p>
              ) : (
                <button
                  type="button"
                  onClick={onLoadOlder}
                  className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
                  Load earlier messages
                </button>
              )}
            </div>
          )}
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

            const qs = msg.questions;
            return (
              <div key={msg.id} className="space-y-3 group">
                {(msg.text || msg.reasoning || (isStreaming && !qs)) && (
                  <AssistantText
                    text={msg.text}
                    reasoning={msg.reasoning}
                    isTyping={isStreaming && msg.id === streamingMsgId && !qs}
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

                {msg.assetRef && (
                  <AssetRefPanel
                    assetRef={msg.assetRef}
                    disabled={isStreaming}
                    onApproveRemaining={
                      msg.assetRef.approved
                        ? undefined
                        : (approvals) => onAssetApproval(msg.assetRef!.toolCallId, approvals)
                    }
                    onReject={
                      msg.assetRef.approved
                        ? undefined
                        : (handle, objection) =>
                            onAssetReject(msg.assetRef!.toolCallId, handle, objection)
                    }
                    onRetry={
                      !msg.assetRef.approved && !msg.assetRef.loading
                        ? () => onRetry(msg.assetRef!.toolCallId)
                        : undefined
                    }
                  />
                )}

                {msg.voiceAnchor && (
                  <VoiceAnchorPanel
                    voiceAnchor={msg.voiceAnchor}
                    disabled={isStreaming}
                    onApproveRemaining={
                      msg.voiceAnchor.approved
                        ? undefined
                        : (approvals) => onVoiceApproval(msg.voiceAnchor!.toolCallId, approvals)
                    }
                    onReject={
                      msg.voiceAnchor.approved
                        ? undefined
                        : (handle, objection) =>
                            onVoiceReject(msg.voiceAnchor!.toolCallId, handle, objection)
                    }
                    onRetry={
                      !msg.voiceAnchor.approved && !msg.voiceAnchor.loading
                        ? () => onRetry(msg.voiceAnchor!.toolCallId)
                        : undefined
                    }
                  />
                )}

                {msg.generationGrid && (
                  <GenerationGridPanel
                    generationGrid={msg.generationGrid}
                    disabled={isStreaming}
                    onApprove={
                      msg.generationGrid.approvedUrl
                        ? undefined
                        : (url: string) =>
                            onGridApproval(
                              msg.generationGrid!.toolCallId,
                              msg.generationGrid!.sceneId!,
                              url
                            )
                    }
                    onRetry={
                      !msg.generationGrid.approvedUrl && !msg.generationGrid.loading
                        ? () => onRetry(msg.generationGrid!.toolCallId)
                        : undefined
                    }
                  />
                )}

                {msg.shotCompile && (
                  <ShotCompilePanel
                    compile={msg.shotCompile}
                    disabled={isStreaming}
                    onApproveRender={(renderPrompt) =>
                      onRenderShot(msg.shotCompile!.toolCallId, renderPrompt)
                    }
                    onApproveShot={
                      msg.shotCompile.videoUrl && !msg.shotCompile.approved && !msg.shotCompile.rendering
                        ? () => onShotApproval(msg.shotCompile!.toolCallId, msg.shotCompile!.videoUrl!)
                        : undefined
                    }
                    onRetry={
                      !msg.shotCompile.rendering && (msg.shotCompile.videoUrl || msg.shotCompile.error)
                        ? () => onRetry(msg.shotCompile!.toolCallId)
                        : undefined
                    }
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
