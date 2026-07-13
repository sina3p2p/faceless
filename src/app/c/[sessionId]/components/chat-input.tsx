"use client";

import { useRef, useState } from "react";

export function ChatInput({
  isStreaming,
  onSend,
}: {
  isStreaming: boolean;
  onSend: (text: string) => void;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [hasInput, setHasInput] = useState(false);

  function autoResize() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function send() {
    const trimmed = inputRef.current?.value.trim() ?? "";
    if (!trimmed || isStreaming) return;
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.style.height = "auto";
      setHasInput(false);
    }
    onSend(trimmed);
  }

  return (
    <div className="px-3 pt-3 shrink-0 border-t border-white/10" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
      <div className="flex gap-2 bg-white/10 rounded-2xl px-3 py-2 items-end max-w-3xl mx-auto w-full">
        <textarea
          ref={inputRef}
          rows={1}
          onChange={(e) => {
            setHasInput(e.target.value.trim().length > 0);
            autoResize();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={isStreaming ? "Showrunner is writing…" : "Ask a question or give feedback…"}
          disabled={isStreaming}
          className="flex-1 bg-transparent text-base md:text-[14px] text-foreground placeholder:text-muted-foreground/60 outline-none disabled:opacity-50 py-0.5 resize-none overflow-y-auto leading-relaxed max-h-40"
        />
        <button
          onClick={send}
          disabled={!hasInput || isStreaming}
          className="w-7 h-7 mb-0.5 rounded-full bg-white flex items-center justify-center text-black hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
