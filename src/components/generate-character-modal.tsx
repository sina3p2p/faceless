"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { IMAGE_MODELS } from "@/lib/constants";

interface GenerateCharacterModalProps {
  open: boolean;
  onClose: () => void;
  onCharacterGenerated: (character: {
    url: string;
    previewUrl: string;
    description: string;
  }) => void;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type ModalStep = "prompt" | "generating";

export function GenerateCharacterModal({
  open,
  onClose,
  onCharacterGenerated,
}: GenerateCharacterModalProps) {
  const [step, setStep] = useState<ModalStep>("prompt");
  const [input, setInput] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [refinedPrompt, setRefinedPrompt] = useState("");
  const [imageModel, setImageModel] = useState("dall-e-3");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedPreview, setGeneratedPreview] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setStep("prompt");
      setInput("");
      setChatHistory([]);
      setRefinedPrompt("");
      setImageModel("dall-e-3");
      setLoading(false);
      setError(null);
      setGeneratedPreview(null);
      setGeneratedUrl(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  if (!open) return null;

  async function handleSendPrompt() {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setLoading(true);
    setError(null);

    const newHistory: ChatMessage[] = [
      ...chatHistory,
      { role: "user", content: userMessage },
    ];
    setChatHistory(newHistory);

    try {
      const res = await fetch("/api/generate-character", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userMessage,
          conversationHistory: chatHistory,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to process description");
      }

      const data = await res.json();

      if (data.status === "clear") {
        setRefinedPrompt(data.refinedPrompt);
        setChatHistory([
          ...newHistory,
          {
            role: "assistant",
            content:
              "Your character description looks clear! I've prepared a detailed prompt. Choose an image model and click Generate to create your character.",
          },
        ]);
      } else {
        const questionText = data.questions.join("\n\n");
        setChatHistory([
          ...newHistory,
          { role: "assistant", content: questionText },
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setChatHistory(chatHistory);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    if (!refinedPrompt || loading) return;

    setStep("generating");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/generate-character?action=generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: refinedPrompt, imageModel }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Image generation failed");
      }

      const data = await res.json();
      setGeneratedPreview(data.previewUrl);
      setGeneratedUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setStep("prompt");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegenerate() {
    setGeneratedPreview(null);
    setGeneratedUrl(null);
    await handleGenerate();
  }

  function handleAccept() {
    if (!generatedUrl || !generatedPreview) return;
    onCharacterGenerated({
      url: generatedUrl,
      previewUrl: generatedPreview,
      description: refinedPrompt,
    });
    onClose();
  }

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
            Generate Character
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        {step === "generating" && loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
            <div className="w-12 h-12 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">
              Generating your character with {IMAGE_MODELS.find((m) => m.id === imageModel)?.label || imageModel}...
            </p>
            <p className="text-gray-600 text-xs">This may take 10-30 seconds</p>
          </div>
        ) : generatedPreview ? (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex justify-center mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={generatedPreview}
                alt="Generated character"
                className="w-64 h-64 rounded-xl border border-white/10 object-cover"
              />
            </div>
            <p className="text-xs text-gray-500 text-center mb-4">
              Does this look right?
            </p>
            <div className="flex justify-center gap-3">
              <Button onClick={handleAccept} className="bg-green-600 hover:bg-green-700">
                Accept Character
              </Button>
              <Button onClick={handleRegenerate} variant="outline" disabled={loading}>
                {loading ? "Regenerating..." : "Regenerate"}
              </Button>
            </div>
            {error && (
              <p className="text-red-400 text-sm text-center mt-3">{error}</p>
            )}
          </div>
        ) : (
          <>
            {/* Chat area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-[200px]">
              {chatHistory.length === 0 && (
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-full bg-violet-500/10 border border-violet-500/30 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                  </div>
                  <p className="text-gray-400 text-sm">
                    Describe the character you want to create.
                  </p>
                  <p className="text-gray-600 text-xs mt-1">
                    e.g. &quot;A fierce viking warrior woman with braided red hair and battle scars&quot;
                  </p>
                </div>
              )}

              {chatHistory.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-violet-600 text-white"
                        : "bg-white/5 border border-white/10 text-gray-300"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {loading && !generatedPreview && (
                <div className="flex justify-start">
                  <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                    <div className="flex gap-1.5">
                      <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Model selector + generate button (visible when prompt is refined) */}
            {refinedPrompt && (
              <div className="px-6 py-3 border-t border-white/10 bg-white/2">
                <div className="flex items-center gap-3">
                  <select
                    value={imageModel}
                    onChange={(e) => setImageModel(e.target.value)}
                    className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none"
                  >
                    {IMAGE_MODELS.map((m) => (
                      <option key={m.id} value={m.id} className="bg-gray-900">
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    onClick={handleGenerate}
                    disabled={loading}
                    className="shrink-0"
                  >
                    {loading ? "Generating..." : "Generate"}
                  </Button>
                </div>
              </div>
            )}

            {error && (
              <div className="px-6 pb-2">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Input area */}
            <div className="px-6 py-4 border-t border-white/10">
              <div className="flex gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendPrompt();
                    }
                  }}
                  placeholder={
                    chatHistory.length === 0
                      ? "Describe your character..."
                      : "Answer the questions or add more details..."
                  }
                  rows={2}
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none transition-colors resize-none"
                />
                <Button
                  onClick={handleSendPrompt}
                  disabled={!input.trim() || loading}
                  className="self-end shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </Button>
              </div>
              <p className="text-xs text-gray-600 mt-1.5">
                Press Enter to send, Shift+Enter for new line
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
