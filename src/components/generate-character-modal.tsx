"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface GenerateCharacterModalProps {
  open: boolean;
  onClose: () => void;
  assetType?: "character" | "location" | "prop";
  onCharacterGenerated: (character: {
    url: string;
    previewUrl: string;
    description: string;
  }) => void;
}

interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: {
    success: boolean;
    r2Key?: string;
    previewUrl?: string;
    prompt?: string;
    error?: string;
  };
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
}

const ASSET_LABELS: Record<string, { title: string; placeholder: string; hint: string }> = {
  character: {
    title: "Generate Character",
    placeholder: "Describe your character...",
    hint: 'e.g. "A fierce viking warrior woman with braided red hair and battle scars"',
  },
  location: {
    title: "Generate Location",
    placeholder: "Describe the location...",
    hint: 'e.g. "A cozy Victorian living room with warm fireplace and bookshelves"',
  },
  prop: {
    title: "Generate Prop",
    placeholder: "Describe the prop/object...",
    hint: 'e.g. "An ancient leather-bound spellbook with glowing runes"',
  },
};

export function GenerateCharacterModal({
  open,
  onClose,
  assetType = "character",
  onCharacterGenerated,
}: GenerateCharacterModalProps) {
  const labels = ASSET_LABELS[assetType] || ASSET_LABELS.character;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setMessages([]);
      setInput("");
      setLoading(false);
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const latestImage = useLatestImage(messages);

  const sendMessage = useCallback(
    async (userText: string) => {
      if (!userText.trim() || loading) return;

      setLoading(true);
      setError(null);

      const updatedMessages: ChatMessage[] = [
        ...messages,
        { role: "user", content: userText },
      ];
      setMessages(updatedMessages);

      try {
        const res = await fetch("/api/generate-character", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: updatedMessages, assetType }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Request failed");
        }

        const data = await res.json();

        setMessages([
          ...updatedMessages,
          {
            role: "assistant",
            content: data.content || "",
            toolCalls: data.toolCalls,
          },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    },
    [messages, loading]
  );

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    sendMessage(text);
  }

  function handleAccept() {
    if (!latestImage) return;
    onCharacterGenerated({
      url: latestImage.r2Key,
      previewUrl: latestImage.previewUrl,
      description: latestImage.prompt,
    });
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg bg-gray-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">
            {labels.title}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-[250px]">
          {messages.length === 0 && !loading && (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-full bg-violet-500/10 border border-violet-500/30 flex items-center justify-center mx-auto mb-3">
                <svg
                  className="w-6 h-6 text-violet-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                  />
                </svg>
              </div>
              <p className="text-gray-400 text-sm">
                Describe the {assetType} you want to create.
              </p>
              <p className="text-gray-600 text-xs mt-1">
                {labels.hint}
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} isLatest={i === messages.length - 1} onAccept={handleAccept} />
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <span
                      className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                  {messages.length > 0 &&
                    messages[messages.length - 1].role === "user" && (
                      <span className="text-xs text-gray-600 ml-1">
                        Thinking...
                      </span>
                    )}
                </div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {error && (
          <div className="px-6 pb-2">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Input area */}
        <div className="px-6 py-4 border-t border-white/10">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={
                messages.length === 0
                  ? labels.placeholder
                  : latestImage
                    ? `Ask for changes or describe a new ${assetType}...`
                    : "Answer the questions or add more details..."
              }
              rows={2}
              disabled={loading}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none transition-colors resize-none disabled:opacity-50"
            />
            <Button
              type="submit"
              disabled={!input.trim() || loading}
              className="self-end shrink-0"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </Button>
          </form>
          <p className="text-xs text-gray-600 mt-1.5">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}

function useLatestImage(messages: ChatMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.toolCalls) {
      for (let j = msg.toolCalls.length - 1; j >= 0; j--) {
        const tc = msg.toolCalls[j];
        if (tc.result?.success && tc.result.previewUrl && tc.result.r2Key) {
          return {
            previewUrl: tc.result.previewUrl,
            r2Key: tc.result.r2Key,
            prompt: tc.result.prompt || "",
          };
        }
      }
    }
  }
  return null;
}

function MessageBubble({
  message,
  isLatest,
  onAccept,
}: {
  message: ChatMessage;
  isLatest: boolean;
  onAccept: () => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap bg-violet-600 text-white">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-3">
        {/* Tool call results — rendered as images */}
        {message.toolCalls?.map((tc) => (
          <ToolCallResult key={tc.id} toolCall={tc} isLatest={isLatest} onAccept={onAccept} />
        ))}

        {/* Text content */}
        {message.content && (
          <div className="rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap bg-white/5 border border-white/10 text-gray-300">
            {message.content}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCallResult({
  toolCall,
  isLatest,
  onAccept,
}: {
  toolCall: ToolCall;
  isLatest: boolean;
  onAccept: () => void;
}) {
  const result = toolCall.result;

  if (!result) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex items-center gap-3">
        <div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-400">Generating image...</span>
      </div>
    );
  }

  if (!result.success) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
        {result.error || "Image generation failed"}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-white/10 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={result.previewUrl}
          alt="Generated character"
          className="w-full aspect-square object-cover"
        />
      </div>

      {isLatest && (
        <div className="flex gap-2">
          <Button
            onClick={onAccept}
            className="flex-1 bg-green-600 hover:bg-green-700 text-sm"
          >
            <svg
              className="w-4 h-4 mr-1.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            Accept
          </Button>
        </div>
      )}
    </div>
  );
}
