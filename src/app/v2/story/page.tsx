"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import axios from "@/lib/axios";

export default function StoryLandingPage() {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [length, setLength] = useState(0);

  const { mutateAsync, isPending, isError, error } = useMutation({
    mutationFn: async ({ message }: { message: string }) => {
      const res = await axios.post("/v2/story", { message });
      return res.data;
    },
    onSuccess: (data) => {
      router.push(`/v2/story/${data.sessionId}`);
    },
  });

  function handleCreate() {
    const trimmed = textareaRef.current?.value.trim() ?? "";
    if (!trimmed || isPending) return;
    void mutateAsync({ message: trimmed });
  }

  return (
    <div className="h-full flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-2xl">
          {/* Hero */}
          <div className="mb-12 text-center">
            <h1 className="text-4xl font-bold tracking-tight mb-4">
              One sentence.<br />
              <span className="text-violet-400">A complete Film Bible.</span>
            </h1>
            <p className="text-gray-400 text-lg leading-relaxed max-w-lg mx-auto">
              Collaborate with an AI showrunner to develop your idea — one decision at a time — into a premise, cast, visual look, beat sheet, screenplay, and shot list.
            </p>
          </div>

          {/* Input */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Your idea, in one sentence
            </label>
            <textarea
              ref={textareaRef}
              onChange={(e) => setLength(e.target.value.length)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !isPending) {
                  e.preventDefault();
                  handleCreate();
                }
              }}
              placeholder="e.g. Aliens helped build the pyramids, and one archaeologist is about to prove it"
              rows={3}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 resize-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none text-sm leading-relaxed"
            />
            {isError && (
              <p className="mt-2 text-red-400 text-sm">{error?.message || "Something went wrong"}</p>
            )}
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-gray-600">{length} / 500</span>
              <Button
                onClick={handleCreate}
                loading={isPending}
                disabled={length === 0 || length > 500}
                size="lg"
              >
                Start the story room
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
