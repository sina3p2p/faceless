"use client";

import { useEffect, useState, useRef } from "react";
import type { Scene, ChatMsg, RefinedScene, SceneChange } from "../types";

function DiffBlock({ change }: { change: SceneChange }) {
  const [expanded, setExpanded] = useState(true);
  const label =
    change.type === "added" ? "Added" :
      change.type === "removed" ? "Removed" : `${change.fields.length} change${change.fields.length > 1 ? "s" : ""}`;
  const color =
    change.type === "added" ? "text-green-400" :
      change.type === "removed" ? "text-red-400" : "text-violet-300";

  return (
    <div className="rounded-lg border border-white/10 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-1.5 bg-white/5 hover:bg-white/10 transition-colors"
      >
        <span className="text-xs font-medium text-white">Scene {change.scene}</span>
        <span className={`text-[10px] font-medium ${color}`}>{label}</span>
      </button>
      {expanded && (
        <div className="px-3 py-2 space-y-2">
          {change.fields.map((f, i) => (
            <div key={i}>
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{f.field}</span>
              {f.old && (
                <div className="mt-0.5 rounded bg-red-500/10 border border-red-500/20 px-2 py-1">
                  <p className="text-xs text-red-300/80 line-through wrap-break-word">{f.old.length > 150 ? f.old.slice(0, 150) + "…" : f.old}</p>
                </div>
              )}
              {f.new && (
                <div className="mt-0.5 rounded bg-green-500/10 border border-green-500/20 px-2 py-1">
                  <p className="text-xs text-green-300 wrap-break-word">{f.new.length > 150 ? f.new.slice(0, 150) + "…" : f.new}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ScriptChatPanel({
  videoId,
  onApply,
  onClose,
}: {
  videoId: string;
  scenes: Scene[];
  onApply: (refined: RefinedScene[], title: string) => void;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingResult, setPendingResult] = useState<{
    scenes: RefinedScene[];
    title: string;
    changes: SceneChange[];
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingResult]);

  async function handleSend() {
    const msg = input.trim();
    if (!msg || loading) return;

    const userMsg: ChatMsg = { role: "user", content: msg };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setPendingResult(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/videos/${videoId}/refine-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          chatHistory: messages,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessages([...newMessages, { role: "assistant", content: `Error: ${err.error || "Something went wrong"}` }]);
        return;
      }

      const data = await res.json();
      const changes: SceneChange[] = data.changes || [];
      const changedCount = changes.length;
      const briefSummary = changedCount === 0
        ? "No changes detected."
        : `${changedCount} scene${changedCount > 1 ? "s" : ""} modified:`;

      setPendingResult({
        scenes: data.scenes,
        title: data.title,
        changes,
      });
      setMessages([...newMessages, { role: "assistant", content: briefSummary }]);
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Error: Network request failed" }]);
    } finally {
      setLoading(false);
    }
  }

  function handleApply() {
    if (!pendingResult) return;
    onApply(pendingResult.scenes, pendingResult.title);
    setPendingResult(null);
    setMessages((prev) => [...prev, { role: "assistant", content: "Changes applied to the script." }]);
  }

  return (
    <div className="fixed bottom-4 right-4 w-[440px] max-h-[75vh] bg-gray-900 border border-white/10 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
          <h3 className="text-sm font-semibold text-white">Refine Script with AI</h3>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400 mb-3">Tell the AI how you&apos;d like to improve the script</p>
            <div className="space-y-1.5">
              {["Make the hook more dramatic", "Scene 3 is weak, make it more intense", "Change the tone to be funnier", "Add a plot twist at the end"].map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="block w-full text-left text-xs text-gray-500 hover:text-violet-400 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                >
                  &quot;{s}&quot;
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${msg.role === "user"
              ? "bg-violet-600 text-white"
              : "bg-white/5 border border-white/10 text-gray-300"
              }`}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        {pendingResult && pendingResult.changes.length > 0 && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              {pendingResult.changes.map((ch, i) => (
                <DiffBlock key={i} change={ch} />
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleApply}
                className="flex-1 px-3 py-2 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-500 transition-colors"
              >
                Apply {pendingResult.changes.length} Change{pendingResult.changes.length > 1 ? "s" : ""}
              </button>
              <button
                onClick={() => setPendingResult(null)}
                className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 text-xs font-medium hover:text-white transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-white/10 p-3 shrink-0">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={1}
            placeholder="e.g. &quot;Make scene 2 more dramatic&quot;"
            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white resize-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="px-3 py-2 rounded-xl bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
