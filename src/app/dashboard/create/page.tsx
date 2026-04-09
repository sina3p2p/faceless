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

type AssetType = "character" | "location" | "prop";

interface PendingAsset {
  file: File | null;
  preview: string;
  name: string;
  description: string;
  type: AssetType;
  generatedUrl?: string;
  voiceId?: string;
}

const ASSET_TYPES: { id: AssetType; label: string; icon: string }[] = [
  { id: "character", label: "Character", icon: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" },
  { id: "location", label: "Location", icon: "M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" },
  { id: "prop", label: "Prop", icon: "M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" },
];

export default function CreateVideoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingAssets, setPendingAssets] = useState<PendingAsset[]>([]);
  const [newAssetType, setNewAssetType] = useState<AssetType>("character");
  const [describingIdx, setDescribingIdx] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showCharGenModal, setShowCharGenModal] = useState(false);

  const [form, setForm] = useState({
    prompt: "",
    videoType: "ai_video" as string,
    style: ART_STYLES[0].id as string,
    captionStyle: CAPTION_STYLES[0].id as string,
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
      const storyAssets: Array<{ id: string; type: AssetType; imageUrl: string; name: string; description: string; voiceId?: string }> = [];

      for (const asset of pendingAssets) {
        let imageUrl = asset.generatedUrl;
        if (!imageUrl && asset.file) {
          imageUrl = (await uploadCharacterImage(asset.file)) || undefined;
        }
        if (imageUrl) {
          storyAssets.push({
            id: crypto.randomUUID(),
            type: asset.type,
            imageUrl,
            name: asset.name || `${asset.type} ${storyAssets.length + 1}`,
            description: asset.description,
            voiceId: asset.voiceId || undefined,
          });
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
          storyAssets: storyAssets.length > 0 ? storyAssets : undefined,
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
            <VideoModelSelector value={form.videoModel} onChange={(v) => setForm({ ...form, videoModel: v })} />

            <div
              onClick={() => setForm({ ...form, sceneContinuity: !form.sceneContinuity })}
              className={`rounded-xl border p-4 cursor-pointer transition-all ${form.sceneContinuity
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
                <div className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 ${form.sceneContinuity ? "bg-violet-500" : "bg-white/10"
                  }`}>
                  <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${form.sceneContinuity ? "translate-x-5" : "translate-x-0"
                    }`} />
                </div>
              </div>
            </div>

            {/* Story Assets */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Story Assets (optional)
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Add characters, locations, and props. The AI will keep them consistent across scenes.
              </p>

              <div className="space-y-4">
                {pendingAssets.map((asset, idx) => (
                  <div key={idx} className="flex gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="relative shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={asset.preview} alt={asset.name || `Asset ${idx + 1}`} className="w-24 h-24 rounded-lg border border-white/10 object-cover" />
                      <button
                        type="button"
                        onClick={() => {
                          URL.revokeObjectURL(asset.preview);
                          setPendingAssets((prev) => prev.filter((_, i) => i !== idx));
                        }}
                        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] hover:bg-red-400"
                      >
                        &times;
                      </button>
                      <span className={`absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${asset.type === "character" ? "bg-violet-500/80 text-white" :
                        asset.type === "location" ? "bg-blue-500/80 text-white" :
                          "bg-amber-500/80 text-white"
                        }`}>
                        {asset.type}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex gap-2">
                        <select
                          value={asset.type}
                          onChange={(e) => {
                            setPendingAssets((prev) =>
                              prev.map((a, i) => (i === idx ? { ...a, type: e.target.value as AssetType } : a))
                            );
                          }}
                          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white focus:border-violet-500 focus:outline-none"
                        >
                          {ASSET_TYPES.map((t) => (
                            <option key={t.id} value={t.id}>{t.label}</option>
                          ))}
                        </select>
                        <Input
                          placeholder={asset.type === "character" ? "Character name" : asset.type === "location" ? "Location name" : "Prop name"}
                          value={asset.name}
                          onChange={(e) => {
                            setPendingAssets((prev) =>
                              prev.map((a, i) => (i === idx ? { ...a, name: e.target.value } : a))
                            );
                          }}
                          className="py-1.5! text-sm! flex-1"
                        />
                      </div>
                      <textarea
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none transition-colors resize-none h-[52px]"
                        placeholder={`Describe this ${asset.type}...`}
                        value={asset.description}
                        onChange={(e) => {
                          setPendingAssets((prev) =>
                            prev.map((a, i) => (i === idx ? { ...a, description: e.target.value } : a))
                          );
                        }}
                      />
                      {asset.file && (
                        <button
                          type="button"
                          disabled={describingIdx === idx}
                          onClick={async () => {
                            setDescribingIdx(idx);
                            try {
                              const fd = new FormData();
                              fd.append("file", asset.file!);
                              const res = await fetch("/api/describe-character", {
                                method: "POST",
                                body: fd,
                              });
                              if (res.ok) {
                                const data = await res.json();
                                setPendingAssets((prev) =>
                                  prev.map((a, i) => (i === idx ? { ...a, description: data.description } : a))
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
                      {asset.type === "character" && (
                        <div className="mt-2">
                          <label className="block text-[10px] uppercase tracking-wider text-gray-600 font-medium mb-1">
                            Voice
                          </label>
                          <VoiceSelector
                            value={asset.voiceId || ""}
                            onChange={(voiceId) => {
                              setPendingAssets((prev) =>
                                prev.map((a, i) => (i === idx ? { ...a, voiceId } : a))
                              );
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Asset type selector for new items */}
              <div className="flex items-center gap-2 mt-3 mb-2">
                <span className="text-xs text-gray-500">Add as:</span>
                {ASSET_TYPES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setNewAssetType(t.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${newAssetType === t.id
                      ? "bg-violet-500/20 border border-violet-500/50 text-violet-300"
                      : "bg-white/5 border border-white/10 text-gray-400 hover:border-white/20"
                      }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
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
                        setPendingAssets((prev) => [
                          ...prev,
                          { file, preview: URL.createObjectURL(file), name: "", description: "", type: newAssetType },
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
          const charsWithVoices = pendingAssets.filter((a) => a.type === "character" && a.voiceId);
          return charsWithVoices.length < 2 ? (
            <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
              Assign voices to at least 2 character assets to use Dialogue mode.
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
              (form.videoType === "dialogue" && pendingAssets.filter((a) => a.type === "character" && a.voiceId).length < 2)
            }
          >
            Generate Video
          </Button>
        </div>
      </form>

      <GenerateCharacterModal
        open={showCharGenModal}
        onClose={() => setShowCharGenModal(false)}
        assetType={newAssetType}
        onCharacterGenerated={(char) => {
          setPendingAssets((prev) => [
            ...prev,
            {
              file: null,
              preview: char.previewUrl,
              name: "",
              description: char.description,
              type: newAssetType,
              generatedUrl: char.url,
            },
          ]);
        }}
      />
    </div>
  );
}
