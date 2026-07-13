"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "@/lib/axios";
import { AIChatInput } from "@/components/ui/ai-chat-input";

export default function StoryLandingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { mutateAsync, isPending, isError, error } = useMutation({
    mutationFn: async ({ message }: { message: string }) => {
      const res = await axios.post("/v2/story", { message });
      return res.data;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["story-sessions"] });
      router.push(`/c/${data.sessionId}`);
    },
  });

  return (
    <div className="h-full flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-2xl">
          {/* Hero */}
          <div className="mb-12 text-center">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-4">
              One sentence.<br />
              <span className="text-primary">A complete Film Bible.</span>
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed max-w-lg mx-auto">
              Collaborate with an AI showrunner to develop your idea — one decision at a time — into a premise, cast, visual look, beat sheet, screenplay, and shot list.
            </p>
          </div>

          <AIChatInput
            onSubmit={(message) => void mutateAsync({ message })}
            loading={isPending}
            error={isError ? (error?.message || "Something went wrong") : null}
          />
        </div>
      </main>
    </div>
  );
}
