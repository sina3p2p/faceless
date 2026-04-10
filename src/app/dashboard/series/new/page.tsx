"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { NICHES, ART_STYLES, CAPTION_STYLES, DEFAULT_LLM_MODEL, DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL, DEFAULT_VIDEO_SIZE, LANGUAGES, DEFAULT_LANGUAGE } from "@/lib/constants";
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

const ASSET_TYPES: { id: AssetType; label: string }[] = [
  { id: "character", label: "Character" },
  { id: "location", label: "Location" },
  { id: "prop", label: "Prop" },
];

export default function NewSeriesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [pendingAssets, setPendingAssets] = useState<PendingAsset[]>([]);
  const [newAssetType, setNewAssetType] = useState<AssetType>("character");
  const [describingIdx, setDescribingIdx] = useState<number | null>(null);
  const [showCharGenModal, setShowCharGenModal] = useState(false);
  const [form, setForm] = useState({
    name: "",
    niche: NICHES[0].id as string,
    style: ART_STYLES[0].id as string,
    captionStyle: CAPTION_STYLES[0].id as string,
    videoType: "standalone" as string,
    llmModel: DEFAULT_LLM_MODEL as string,
    imageModel: DEFAULT_IMAGE_MODEL as string,
    videoModel: DEFAULT_VIDEO_MODEL as string,
    videoSize: DEFAULT_VIDEO_SIZE as string,
    language: DEFAULT_LANGUAGE as string,
    sceneContinuity: true,
    defaultVoiceId: "",
    topicIdeas: "",
  });

  async function uploadTempImage(file: File): Promise<string | null> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload-temp", { method: "POST", body: fd });
    if (!res.ok) return null;
    const data = await res.json();
    return data.url;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const topicIdeas = form.topicIdeas
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);

    // Build storyAssets from pending
    const storyAssets: Array<{ id: string; type: AssetType; name: string; description: string; url: string }> = [];
    for (const asset of pendingAssets) {
      let imageUrl = asset.generatedUrl;
      if (!imageUrl && asset.file) {
        imageUrl = (await uploadTempImage(asset.file)) || undefined;
      }
      if (imageUrl) {
        storyAssets.push({
          id: crypto.randomUUID(),
          type: asset.type,
          name: asset.name || `${asset.type} ${storyAssets.length + 1}`,
          description: asset.description,
          url: imageUrl,
        });
      }
    }

    const res = await fetch("/api/series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        niche: form.niche,
        style: form.style,
        captionStyle: form.captionStyle,
        videoType: form.videoType,
        llmModel: form.llmModel,
        imageModel: form.imageModel,
        videoModel: form.videoModel,
        videoSize: form.videoSize,
        language: form.language,
        sceneContinuity: form.sceneContinuity,
        defaultVoiceId: form.defaultVoiceId || undefined,
        topicIdeas,
        storyAssets: storyAssets.length > 0 ? storyAssets : undefined,
      }),
    });

    if (res.ok) {
      const newSeries = await res.json();
      router.push(`/dashboard/series/${newSeries.id}`);
    } else {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Create New Series</h1>
        <p className="text-gray-400 mt-1">
          Set up a new content series. You can generate videos from it anytime.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Series Details</h2>
          </CardHeader>
          <CardContent className="space-y-6">
            <Input
              label="Series Name"
              placeholder="e.g., Dark History Tales"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />

            <VideoTypeSelector value={form.videoType} onChange={(v) => setForm({ ...form, videoType: v })} />
            <VideoSizeSelector value={form.videoSize} onChange={(v) => setForm({ ...form, videoSize: v })} />
            <LLMModelSelector value={form.llmModel} onChange={(v) => setForm({ ...form, llmModel: v })} />
            <ImageModelSelector value={form.imageModel} onChange={(v) => setForm({ ...form, imageModel: v })} />
            <VideoModelSelector value={form.videoModel} onChange={(v) => setForm({ ...form, videoModel: v })} />

            {(form.videoType !== "music_video") && (
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

            <Select label="Niche" value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} options={NICHES.map((n) => ({ value: n.id, label: `${n.label} — ${n.description}` }))} />
            <Select label="Script Language" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} options={LANGUAGES.map((l) => ({ value: l.id, label: l.label }))} />
            <Select label="Art Style" value={form.style} onChange={(e) => setForm({ ...form, style: e.target.value })} options={ART_STYLES.map((s) => ({ value: s.id, label: s.label }))} />
            <Select label="Caption Style" value={form.captionStyle} onChange={(e) => setForm({ ...form, captionStyle: e.target.value })} options={CAPTION_STYLES.map((c) => ({ value: c.id, label: `${c.label} — ${c.description}` }))} />

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Voice</label>
              <VoiceSelector value={form.defaultVoiceId} onChange={(voiceId) => setForm({ ...form, defaultVoiceId: voiceId })} />
              <p className="text-xs text-gray-500 mt-1.5">
                Click the play button to preview. Leave unselected to use the default voice.
                Browse more voices on the{" "}
                <a href="https://elevenlabs.io/voice-library" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 underline">ElevenLabs Voice Library</a>{" "}
                and copy the Voice ID to use with &quot;Custom Voice ID&quot;.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Topic Ideas (optional, one per line)</label>
              <textarea
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-gray-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none transition-colors min-h-[100px] resize-y"
                placeholder={"The fall of the Roman Empire\nCleopatra's secret life\nThe curse of King Tut's tomb"}
                value={form.topicIdeas}
                onChange={(e) => setForm({ ...form, topicIdeas: e.target.value })}
              />
              <p className="text-xs text-gray-500 mt-1">Leave empty to let AI pick topics automatically.</p>
            </div>

            {/* Story Assets */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Story Assets (optional)</label>
              <p className="text-xs text-gray-500 mb-3">
                Add characters, locations, and props. The AI will keep them consistent across scenes. Works best with Nano Banana 2 + Kling v3.
              </p>

              <div className="space-y-4">
                {pendingAssets.map((asset, idx) => (
                  <div key={idx} className="flex gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="relative shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={asset.preview} alt={asset.name || `Asset ${idx + 1}`} className="w-24 h-24 rounded-lg border border-white/10 object-cover" />
                      <button type="button" onClick={() => { URL.revokeObjectURL(asset.preview); setPendingAssets((prev) => prev.filter((_, i) => i !== idx)); }} className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] hover:bg-red-400">&times;</button>
                      <span className={`absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${asset.type === "character" ? "bg-violet-500/80 text-white" : asset.type === "location" ? "bg-blue-500/80 text-white" : "bg-amber-500/80 text-white"}`}>{asset.type}</span>
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex gap-2">
                        <select value={asset.type} onChange={(e) => { setPendingAssets((prev) => prev.map((a, i) => (i === idx ? { ...a, type: e.target.value as AssetType } : a))); }} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white focus:border-violet-500 focus:outline-none">
                          {ASSET_TYPES.map((t) => (<option key={t.id} value={t.id}>{t.label}</option>))}
                        </select>
                        <Input placeholder={asset.type === "character" ? "Character name" : asset.type === "location" ? "Location name" : "Prop name"} value={asset.name} onChange={(e) => { setPendingAssets((prev) => prev.map((a, i) => (i === idx ? { ...a, name: e.target.value } : a))); }} className="py-1.5! text-sm! flex-1" />
                      </div>
                      <textarea className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none transition-colors resize-none h-[52px]" placeholder={`Describe this ${asset.type}...`} value={asset.description} onChange={(e) => { setPendingAssets((prev) => prev.map((a, i) => (i === idx ? { ...a, description: e.target.value } : a))); }} />
                      {asset.file && (
                        <button type="button" disabled={describingIdx === idx} onClick={async () => { setDescribingIdx(idx); try { const fd = new FormData(); fd.append("file", asset.file!); const res = await fetch("/api/describe-character", { method: "POST", body: fd }); if (res.ok) { const data = await res.json(); setPendingAssets((prev) => prev.map((a, i) => (i === idx ? { ...a, description: data.description } : a))); } } finally { setDescribingIdx(null); } }} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-500/10 border border-violet-500/30 text-violet-300 text-xs font-medium hover:bg-violet-500/20 transition-colors disabled:opacity-50">
                          {describingIdx === idx ? (<><span className="w-3 h-3 border border-violet-300 border-t-transparent rounded-full animate-spin" />Analyzing...</>) : (<><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>AI Describe</>)}
                        </button>
                      )}
                      {asset.type === "character" && (
                        <div className="mt-2">
                          <label className="block text-[10px] uppercase tracking-wider text-gray-600 font-medium mb-1">Voice</label>
                          <VoiceSelector value={asset.voiceId || ""} onChange={(voiceId) => { setPendingAssets((prev) => prev.map((a, i) => (i === idx ? { ...a, voiceId } : a))); }} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 mt-3 mb-2">
                <span className="text-xs text-gray-500">Add as:</span>
                {ASSET_TYPES.map((t) => (
                  <button key={t.id} type="button" onClick={() => setNewAssetType(t.id)} className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${newAssetType === t.id ? "bg-violet-500/20 border border-violet-500/50 text-violet-300" : "bg-white/5 border border-white/10 text-gray-400 hover:border-white/20"}`}>{t.label}</button>
                ))}
              </div>

              <div className="flex gap-3">
                <label className="flex-1 flex items-center justify-center h-20 rounded-xl border-2 border-dashed border-white/10 hover:border-violet-500/50 cursor-pointer transition-colors bg-white/5">
                  <div className="text-center">
                    <p className="text-sm text-gray-400">+ Upload Image</p>
                    <p className="text-xs text-gray-600 mt-0.5">JPG, PNG, WebP</p>
                  </div>
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) { setPendingAssets((prev) => [...prev, { file, preview: URL.createObjectURL(file), name: "", description: "", type: newAssetType }]); } e.target.value = ""; }} />
                </label>
                <button type="button" onClick={() => setShowCharGenModal(true)} className="flex-1 flex items-center justify-center h-20 rounded-xl border-2 border-dashed border-violet-500/30 hover:border-violet-500/50 bg-violet-500/5 hover:bg-violet-500/10 transition-colors">
                  <div className="text-center">
                    <p className="text-sm text-violet-400">+ AI Generate</p>
                    <p className="text-xs text-violet-400/60 mt-0.5">Describe & create</p>
                  </div>
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {form.videoType === "dialogue" && (() => {
          const charsWithVoices = pendingAssets.filter((a) => a.type === "character" && a.voiceId);
          return charsWithVoices.length < 2 ? (
            <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
              Assign voices to at least 2 character assets to use Dialogue mode.
            </div>
          ) : null;
        })()}

        <div className="flex justify-end gap-3 mt-6">
          <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" loading={loading}>Create Series</Button>
        </div>
      </form>

      <GenerateCharacterModal
        open={showCharGenModal}
        onClose={() => setShowCharGenModal(false)}
        assetType={newAssetType}
        onCharacterGenerated={(char) => {
          setPendingAssets((prev) => [
            ...prev,
            { file: null, preview: char.previewUrl, name: "", description: char.description, type: newAssetType, generatedUrl: char.url },
          ]);
        }}
      />
    </div>
  );
}
