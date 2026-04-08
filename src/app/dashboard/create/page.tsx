"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  ART_STYLES,
  CAPTION_STYLES,
  DEFAULT_LLM_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  DEFAULT_VIDEO_SIZE,
  LANGUAGES,
  DEFAULT_LANGUAGE,
} from "@/lib/constants";
import { VoiceSelector } from "@/components/voice-selector";
import { VideoTypeSelector, LLMModelSelector, ImageModelSelector, VideoModelSelector, VideoSizeSelector } from "@/components/model-selectors";
import { GenerateCharacterModal } from "@/components/generate-character-modal";

interface PendingCharacter {
  file: File | null;
  preview: string;
  name: string;
  description: string;
  generatedUrl?: string;
  voiceId?: string;
}

export default function CreateVideoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingCharacters, setPendingCharacters] = useState<PendingCharacter[]>([]);
  const [describingIdx, setDescribingIdx] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showCharGenModal, setShowCharGenModal] = useState(false);

  const [form, setForm] = useState({
    prompt: "",
    videoType: "ai_video" as string,
    style: ART_STYLES[0].id as string,
    captionStyle: CAPTION_STYLES[1].id as string,
    llmModel: DEFAULT_LLM_MODEL as string,
    imageModel: DEFAULT_IMAGE_MODEL as string,
    videoModel: DEFAULT_VIDEO_MODEL as string,
    videoSize: DEFAULT_VIDEO_SIZE as string,
    language: DEFAULT_LANGUAGE as string,
    sceneContinuity: true,
    voiceId: "",
    targetDuration: 45,
  });

  async function uploadCharacterImage(file: File): Promise<string | null> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload-temp", { method: "POST", body: fd });
    if (!res.ok) return null;
    const data = await res.json();
    return data.url;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.prompt.trim()) return;

    setLoading(true);
    setError("");

    try {
      const characters: Array<{ imageUrl: string; name: string; description: string; voiceId?: string }> = [];

      for (const char of pendingCharacters) {
        if (char.generatedUrl) {
          characters.push({
            imageUrl: char.generatedUrl,
            name: char.name,
            description: char.description,
            voiceId: char.voiceId || undefined,
          });
        } else if (char.file) {
          const url = await uploadCharacterImage(char.file);
          if (url) {
            characters.push({
              imageUrl: url,
              name: char.name,
              description: char.description,
              voiceId: char.voiceId || undefined,
            });
          }
        }
      }

      const res = await fetch("/api/videos/standalone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: form.prompt,
          videoType: form.videoType,
          style: form.style,
          captionStyle: form.captionStyle,
          llmModel: form.llmModel,
          imageModel: form.imageModel,
          videoModel: form.videoModel,
          videoSize: form.videoSize,
          language: form.language,
          sceneContinuity: form.sceneContinuity,
          voiceId: form.voiceId || undefined,
          targetDuration: form.targetDuration,
          characters: characters.length > 0 ? characters : undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/dashboard/videos/${data.videoId}/review`);
      } else {
        const err = await res.json().catch(() => ({ error: "Failed to create video" }));
        setError(err.error || "Failed to create video");
        setLoading(false);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Create Video</h1>
        <p className="text-gray-400 mt-1">
          Describe a story, idea, or topic and we&apos;ll generate a video for you.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Your Story</h2>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Story / Idea / Prompt
              </label>
              <textarea
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-gray-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none transition-colors min-h-[160px] resize-y"
                placeholder={"Tell the story of Cinderella...\n\nor just type an idea like:\n\"A brave cat saves a village from a dragon\""}
                value={form.prompt}
                onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                You can write a title, a short idea, or a full story. The AI will adapt accordingly.
              </p>
            </div>

            <VideoTypeSelector value={form.videoType} onChange={(v) => setForm({ ...form, videoType: v })} />

            <VideoSizeSelector value={form.videoSize} onChange={(v) => setForm({ ...form, videoSize: v })} />

            <Select
              label="Art Style"
              value={form.style}
              onChange={(e) => setForm({ ...form, style: e.target.value })}
              options={ART_STYLES.map((s) => ({
                value: s.id,
                label: s.label,
              }))}
            />

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Duration
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={10}
                  max={120}
                  step={5}
                  value={form.targetDuration}
                  onChange={(e) => setForm({ ...form, targetDuration: Number(e.target.value) })}
                  className="flex-1 accent-violet-500"
                />
                <span className="text-sm text-white font-medium w-12 text-right">{form.targetDuration}s</span>
              </div>
            </div>

            <LLMModelSelector value={form.llmModel} onChange={(v) => setForm({ ...form, llmModel: v })} />
            <ImageModelSelector value={form.imageModel} onChange={(v) => setForm({ ...form, imageModel: v })} />

            {form.videoType !== "faceless" && (
              <VideoModelSelector value={form.videoModel} onChange={(v) => setForm({ ...form, videoModel: v })} />
            )}

            {form.videoType !== "faceless" && (
              <div
                onClick={() => setForm({ ...form, sceneContinuity: !form.sceneContinuity })}
                className={`rounded-xl border p-4 cursor-pointer transition-all ${
                  form.sceneContinuity
                    ? "border-violet-500 bg-violet-500/10 ring-1 ring-violet-500"
                    : "border-white/10 bg-white/5 hover:border-white/20"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-white">Scene Continuity</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Each video clip smoothly transitions from one scene image to the next.
                    </p>
                  </div>
                  <div className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 ${
                    form.sceneContinuity ? "bg-violet-500" : "bg-white/10"
                  }`}>
                    <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      form.sceneContinuity ? "translate-x-5" : "translate-x-0"
                    }`} />
                  </div>
                </div>
              </div>
            )}

            {/* Characters */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Characters (optional)
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Upload character images with names so the AI keeps them consistent throughout the video.
              </p>

              <div className="space-y-4">
                {pendingCharacters.map((char, idx) => (
                  <div key={idx} className="flex gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="relative shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={char.preview} alt={char.name || `Character ${idx + 1}`} className="w-24 h-24 rounded-lg border border-white/10 object-cover" />
                      <button
                        type="button"
                        onClick={() => {
                          URL.revokeObjectURL(char.preview);
                          setPendingCharacters((prev) => prev.filter((_, i) => i !== idx));
                        }}
                        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] hover:bg-red-400"
                      >
                        &times;
                      </button>
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <Input
                        placeholder="Character name (e.g. Cinderella)"
                        value={char.name}
                        onChange={(e) => {
                          setPendingCharacters((prev) =>
                            prev.map((c, i) => (i === idx ? { ...c, name: e.target.value } : c))
                          );
                        }}
                        className="py-1.5! text-sm!"
                      />
                      <textarea
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none transition-colors resize-none h-[52px]"
                        placeholder="Describe this character..."
                        value={char.description}
                        onChange={(e) => {
                          setPendingCharacters((prev) =>
                            prev.map((c, i) => (i === idx ? { ...c, description: e.target.value } : c))
                          );
                        }}
                      />
                      {char.file && (
                        <button
                          type="button"
                          disabled={describingIdx === idx}
                          onClick={async () => {
                            setDescribingIdx(idx);
                            try {
                              const fd = new FormData();
                              fd.append("file", char.file!);
                              const res = await fetch("/api/describe-character", {
                                method: "POST",
                                body: fd,
                              });
                              if (res.ok) {
                                const data = await res.json();
                                setPendingCharacters((prev) =>
                                  prev.map((c, i) => (i === idx ? { ...c, description: data.description } : c))
                                );
                              }
                            } finally {
                              setDescribingIdx(null);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-500/10 border border-violet-500/30 text-violet-300 text-xs font-medium hover:bg-violet-500/20 transition-colors disabled:opacity-50"
                        >
                          {describingIdx === idx ? (
                            <>
                              <span className="w-3 h-3 border border-violet-300 border-t-transparent rounded-full animate-spin" />
                              Analyzing...
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                              AI Describe
                            </>
                          )}
                        </button>
                      )}
                      <div className="mt-2">
                        <label className="block text-[10px] uppercase tracking-wider text-gray-600 font-medium mb-1">
                          Voice
                        </label>
                        <VoiceSelector
                          value={char.voiceId || ""}
                          onChange={(voiceId) => {
                            setPendingCharacters((prev) =>
                              prev.map((c, i) => (i === idx ? { ...c, voiceId } : c))
                            );
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 mt-3">
                <label className="flex-1 flex items-center justify-center h-20 rounded-xl border-2 border-dashed border-white/10 hover:border-violet-500/50 cursor-pointer transition-colors bg-white/5">
                  <div className="text-center">
                    <p className="text-sm text-gray-400">+ Upload Image</p>
                    <p className="text-xs text-gray-600 mt-0.5">JPG, PNG, WebP</p>
                  </div>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setPendingCharacters((prev) => [
                          ...prev,
                          { file, preview: URL.createObjectURL(file), name: "", description: "" },
                        ]);
                      }
                      e.target.value = "";
                    }}
                  />
                </label>

                <button
                  type="button"
                  onClick={() => setShowCharGenModal(true)}
                  className="flex-1 flex items-center justify-center h-20 rounded-xl border-2 border-dashed border-violet-500/30 hover:border-violet-500/50 bg-violet-500/5 hover:bg-violet-500/10 transition-colors"
                >
                  <div className="text-center">
                    <p className="text-sm text-violet-400">+ AI Generate</p>
                    <p className="text-xs text-violet-400/60 mt-0.5">Describe & create</p>
                  </div>
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Collapsible Settings */}
        <Card className="mt-4">
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="w-full px-6 py-4 flex items-center justify-between text-left"
          >
            <h2 className="font-semibold text-white">Settings</h2>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${showSettings ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showSettings && (
            <CardContent className="space-y-6 pt-0">
              <Select
                label="Script Language"
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
                options={LANGUAGES.map((l) => ({
                  value: l.id,
                  label: l.label,
                }))}
              />

              <Select
                label="Caption Style"
                value={form.captionStyle}
                onChange={(e) => setForm({ ...form, captionStyle: e.target.value })}
                options={CAPTION_STYLES.map((c) => ({
                  value: c.id,
                  label: `${c.label} — ${c.description}`,
                }))}
              />

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  {form.videoType === "dialogue" ? "Narrator / Default Voice" : "Voice"}
                </label>
                <VoiceSelector
                  value={form.voiceId}
                  onChange={(voiceId) => setForm({ ...form, voiceId })}
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  {form.videoType === "dialogue"
                    ? "Used for Narrator lines and characters without an assigned voice."
                    : "Leave unselected to use the default voice."}
                </p>
              </div>
            </CardContent>
          )}
        </Card>

        {form.videoType === "dialogue" && (() => {
          const charsWithVoices = pendingCharacters.filter((c) => c.voiceId);
          return charsWithVoices.length < 2 ? (
            <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
              Assign voices to at least 2 characters to use Dialogue mode.
            </div>
          ) : null;
        })()}

        {error && (
          <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            loading={loading}
            disabled={
              !form.prompt.trim() ||
              (form.videoType === "dialogue" && pendingCharacters.filter((c) => c.voiceId).length < 2)
            }
          >
            Generate Video
          </Button>
        </div>
      </form>

      <GenerateCharacterModal
        open={showCharGenModal}
        onClose={() => setShowCharGenModal(false)}
        onCharacterGenerated={(char) => {
          setPendingCharacters((prev) => [
            ...prev,
            {
              file: null,
              preview: char.previewUrl,
              name: "",
              description: char.description,
              generatedUrl: char.url,
            },
          ]);
        }}
      />
    </div>
  );
}
