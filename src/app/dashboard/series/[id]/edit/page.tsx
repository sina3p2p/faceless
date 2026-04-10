"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { NICHES, ART_STYLES, CAPTION_STYLES, DEFAULT_LLM_MODEL, DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL, DEFAULT_VIDEO_SIZE, LANGUAGES, DEFAULT_LANGUAGE } from "@/lib/constants";
import { VoiceSelector } from "@/components/voice-selector";
import { VideoTypeSelector, LLMModelSelector, ImageModelSelector, VideoModelSelector, VideoSizeSelector } from "@/components/model-selectors";
import { GenerateCharacterModal } from "@/components/generate-character-modal";

type AssetType = "character" | "location" | "prop";

interface StoryAsset {
  id: string;
  type: AssetType;
  name: string;
  description: string;
  url: string;
  sheetUrl?: string;
  voiceId?: string;
}

interface SeriesData {
  id: string;
  name: string;
  niche: string;
  style: string;
  captionStyle: string;
  videoType: string;
  llmModel: string | null;
  imageModel: string | null;
  videoModel: string | null;
  videoSize: string | null;
  language: string | null;
  sceneContinuity: number;
  storyAssets: StoryAsset[] | null;
  defaultVoiceId: string | null;
  topicIdeas: string[];
}

const ASSET_TYPES: { id: AssetType; label: string }[] = [
  { id: "character", label: "Character" },
  { id: "location", label: "Location" },
  { id: "prop", label: "Prop" },
];

export default function EditSeriesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assets, setAssets] = useState<StoryAsset[]>([]);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [newAssetType, setNewAssetType] = useState<AssetType>("character");
  const [describingIdx, setDescribingIdx] = useState<number | null>(null);
  const [generatingSheetId, setGeneratingSheetId] = useState<string | null>(null);
  const [pendingSheet, setPendingSheet] = useState<{ assetId: string; sheetUrl: string; previewUrl: string } | null>(null);
  const [showCharGenModal, setShowCharGenModal] = useState(false);
  const [form, setForm] = useState({
    name: "",
    niche: "",
    style: "",
    captionStyle: "",
    videoType: "",
    llmModel: DEFAULT_LLM_MODEL as string,
    imageModel: DEFAULT_IMAGE_MODEL as string,
    videoModel: DEFAULT_VIDEO_MODEL as string,
    videoSize: DEFAULT_VIDEO_SIZE as string,
    language: DEFAULT_LANGUAGE as string,
    sceneContinuity: false,
    defaultVoiceId: "",
    topicIdeas: "",
  });

  useEffect(() => {
    fetch(`/api/series/${id}`)
      .then((r) => r.json())
      .then((data: SeriesData) => {
        setForm({
          name: data.name,
          niche: data.niche,
          style: data.style,
          captionStyle: data.captionStyle,
          videoType: data.videoType || "standalone",
          llmModel: data.llmModel || DEFAULT_LLM_MODEL,
          imageModel: data.imageModel || DEFAULT_IMAGE_MODEL,
          videoModel: data.videoModel || DEFAULT_VIDEO_MODEL,
          videoSize: data.videoSize || DEFAULT_VIDEO_SIZE,
          language: data.language || DEFAULT_LANGUAGE,
          sceneContinuity: !!data.sceneContinuity,
          defaultVoiceId: data.defaultVoiceId || "",
          topicIdeas: (data.topicIdeas || []).join("\n"),
        });
        setAssets(data.storyAssets || []);
        setLoading(false);
      });
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const topicIdeas = form.topicIdeas
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);

    const res = await fetch(`/api/series/${id}`, {
      method: "PATCH",
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
        defaultVoiceId: form.defaultVoiceId || null,
        topicIdeas,
      }),
    });

    if (res.ok) {
      router.push(`/dashboard/series/${id}`);
    } else {
      setSaving(false);
    }
  }

  async function handleDeleteAsset(assetId: string) {
    const res = await fetch(`/api/series/${id}/story-assets`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId }),
    });
    if (res.ok) {
      const data = await res.json();
      setAssets(data.storyAssets);
    }
  }

  async function handleUpdateAsset(assetId: string, updates: Partial<Pick<StoryAsset, "name" | "description" | "type" | "sheetUrl" | "voiceId">>) {
    const res = await fetch(`/api/series/${id}/story-assets`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId, ...updates }),
    });
    if (res.ok) {
      const data = await res.json();
      setAssets(data.storyAssets);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Edit Series</h1>
        <p className="text-gray-400 mt-1">
          Update your series settings. Changes apply to new videos only.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Series Details</h2>
          </CardHeader>
          <CardContent className="space-y-6">
            <Input label="Series Name" placeholder="e.g., Dark History Tales" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />

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
                    <p className="text-xs text-gray-400 mt-1">Each video clip smoothly transitions from one scene image to the next.</p>
                  </div>
                  <div className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 ${form.sceneContinuity ? "bg-violet-500" : "bg-white/10"}`}>
                    <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${form.sceneContinuity ? "translate-x-5" : "translate-x-0"}`} />
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
              <label className="block text-sm font-medium text-gray-300 mb-2">Story Assets</label>
              <p className="text-xs text-gray-500 mb-3">
                Add characters, locations, and props. The AI will keep them consistent across scenes. Works best with Nano Banana 2 + Kling v3.
              </p>

              <div className="space-y-4">
                {assets.map((asset, idx) => (
                  <div key={asset.id} className="flex gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="relative shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={asset.url.startsWith("http") ? asset.url : `/api/media/${asset.url}`}
                        alt={asset.name || `Asset ${idx + 1}`}
                        className="w-24 h-24 rounded-lg border border-white/10 object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => handleDeleteAsset(asset.id)}
                        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] hover:bg-red-400"
                      >
                        &times;
                      </button>
                      <span className={`absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                        asset.type === "character" ? "bg-violet-500/80 text-white" :
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
                          onChange={(e) => handleUpdateAsset(asset.id, { type: e.target.value as AssetType })}
                          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white focus:border-violet-500 focus:outline-none"
                        >
                          {ASSET_TYPES.map((t) => (<option key={t.id} value={t.id}>{t.label}</option>))}
                        </select>
                        <Input
                          placeholder={asset.type === "character" ? "Character name" : asset.type === "location" ? "Location name" : "Prop name"}
                          value={asset.name}
                          onChange={(e) => setAssets((prev) => prev.map((a) => a.id === asset.id ? { ...a, name: e.target.value } : a))}
                          onBlur={() => handleUpdateAsset(asset.id, { name: asset.name })}
                          className="py-1.5! text-sm! flex-1"
                        />
                      </div>
                      <textarea
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none transition-colors resize-none h-[52px]"
                        placeholder={`Describe this ${asset.type}...`}
                        value={asset.description}
                        onChange={(e) => setAssets((prev) => prev.map((a) => a.id === asset.id ? { ...a, description: e.target.value } : a))}
                        onBlur={() => handleUpdateAsset(asset.id, { description: asset.description })}
                      />
                      <button
                        type="button"
                        disabled={describingIdx === idx}
                        onClick={async () => {
                          setDescribingIdx(idx);
                          try {
                            const res = await fetch("/api/describe-character", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ imageUrl: asset.url }),
                            });
                            if (res.ok) {
                              const data = await res.json();
                              setAssets((prev) => prev.map((a) => a.id === asset.id ? { ...a, description: data.description } : a));
                              await handleUpdateAsset(asset.id, { description: data.description });
                            }
                          } finally {
                            setDescribingIdx(null);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-500/10 border border-violet-500/30 text-violet-300 text-xs font-medium hover:bg-violet-500/20 transition-colors disabled:opacity-50"
                      >
                        {describingIdx === idx ? (<><span className="w-3 h-3 border border-violet-300 border-t-transparent rounded-full animate-spin" />Analyzing...</>) : (<><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>AI Describe</>)}
                      </button>
                      {/* Reference Sheet */}
                      <div className="mt-2 p-2 rounded-lg bg-white/[0.02] border border-white/5">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] uppercase tracking-wider text-emerald-600 font-medium">Reference Sheet</span>
                          {generatingSheetId === asset.id && (
                            <div className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                              <div className="animate-spin w-2.5 h-2.5 border border-emerald-400 border-t-transparent rounded-full" />
                              Generating...
                            </div>
                          )}
                        </div>
                        {/* Show pending sheet preview (not yet saved) */}
                        {pendingSheet?.assetId === asset.id && (
                          <div className="space-y-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={pendingSheet.previewUrl} alt="Reference sheet preview" className="w-full max-w-[160px] rounded-lg border border-emerald-500/30" />
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={async () => {
                                  await handleUpdateAsset(asset.id, { sheetUrl: pendingSheet.sheetUrl });
                                  setAssets((prev) => prev.map((a) => a.id === asset.id ? { ...a, sheetUrl: pendingSheet.sheetUrl } : a));
                                  setPendingSheet(null);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-medium hover:bg-emerald-500 transition-colors"
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                disabled={generatingSheetId === asset.id}
                                onClick={async () => {
                                  setPendingSheet(null);
                                  setGeneratingSheetId(asset.id);
                                  try {
                                    const res = await fetch(`/api/series/${id}/story-assets/generate-sheet`, {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ assetId: asset.id }),
                                    });
                                    if (res.ok) {
                                      const data = await res.json();
                                      setPendingSheet({ assetId: asset.id, sheetUrl: data.sheetUrl, previewUrl: data.previewUrl });
                                    }
                                  } finally {
                                    setGeneratingSheetId(null);
                                  }
                                }}
                                className="px-2.5 py-1 rounded-lg bg-white/5 text-gray-400 text-[10px] font-medium hover:text-white transition-colors"
                              >
                                Regenerate
                              </button>
                            </div>
                          </div>
                        )}
                        {/* Show saved sheet */}
                        {pendingSheet?.assetId !== asset.id && asset.sheetUrl && (
                          <div className="space-y-1.5">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={asset.sheetUrl.startsWith("http") ? asset.sheetUrl : `/api/media/${asset.sheetUrl}`}
                              alt="Reference sheet"
                              className="w-full max-w-[160px] rounded-lg border border-white/10"
                            />
                            <button
                              type="button"
                              disabled={generatingSheetId === asset.id}
                              onClick={async () => {
                                setGeneratingSheetId(asset.id);
                                try {
                                  const res = await fetch(`/api/series/${id}/story-assets/generate-sheet`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ assetId: asset.id }),
                                  });
                                  if (res.ok) {
                                    const data = await res.json();
                                    setPendingSheet({ assetId: asset.id, sheetUrl: data.sheetUrl, previewUrl: data.previewUrl });
                                  }
                                } finally {
                                  setGeneratingSheetId(null);
                                }
                              }}
                              className="text-[10px] text-emerald-500/60 hover:text-emerald-400 transition-colors inline-flex items-center gap-0.5"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                              Regenerate Sheet
                            </button>
                          </div>
                        )}
                        {/* No sheet yet */}
                        {pendingSheet?.assetId !== asset.id && !asset.sheetUrl && generatingSheetId !== asset.id && (
                          <button
                            type="button"
                            onClick={async () => {
                              setGeneratingSheetId(asset.id);
                              try {
                                const res = await fetch(`/api/series/${id}/story-assets/generate-sheet`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ assetId: asset.id }),
                                });
                                if (res.ok) {
                                  const data = await res.json();
                                  setPendingSheet({ assetId: asset.id, sheetUrl: data.sheetUrl, previewUrl: data.previewUrl });
                                }
                              } finally {
                                setGeneratingSheetId(null);
                              }
                            }}
                            className="text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors"
                          >
                            Generate Reference Sheet
                          </button>
                        )}
                      </div>

                      {asset.type === "character" && (
                        <div className="mt-2">
                          <label className="block text-[10px] uppercase tracking-wider text-gray-600 font-medium mb-1">Voice</label>
                          <VoiceSelector
                            value={asset.voiceId || ""}
                            onChange={async (voiceId) => {
                              setAssets((prev) => prev.map((a) => a.id === asset.id ? { ...a, voiceId } : a));
                              await handleUpdateAsset(asset.id, { voiceId });
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Asset type selector */}
              <div className="flex items-center gap-2 mt-3 mb-2">
                <span className="text-xs text-gray-500">Add as:</span>
                {ASSET_TYPES.map((t) => (
                  <button key={t.id} type="button" onClick={() => setNewAssetType(t.id)} className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${newAssetType === t.id ? "bg-violet-500/20 border border-violet-500/50 text-violet-300" : "bg-white/5 border border-white/10 text-gray-400 hover:border-white/20"}`}>{t.label}</button>
                ))}
              </div>

              <div className="flex gap-3">
                <label className={`flex-1 flex items-center justify-center h-20 rounded-xl border-2 border-dashed border-white/10 hover:border-violet-500/50 cursor-pointer transition-colors bg-white/5 ${uploadingAsset ? "opacity-50 pointer-events-none" : ""}`}>
                  <div className="text-center">
                    <p className="text-sm text-gray-400">{uploadingAsset ? "Uploading..." : "+ Upload Image"}</p>
                    <p className="text-xs text-gray-600 mt-0.5">JPG, PNG, WebP</p>
                  </div>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploadingAsset(true);
                      try {
                        const fd = new FormData();
                        fd.append("file", file);
                        fd.append("type", newAssetType);
                        const res = await fetch(`/api/series/${id}/story-assets`, {
                          method: "POST",
                          body: fd,
                        });
                        if (res.ok) {
                          const data = await res.json();
                          setAssets(data.storyAssets);
                        }
                      } finally {
                        setUploadingAsset(false);
                        e.target.value = "";
                      }
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

        <div className="flex justify-end gap-3 mt-6">
          <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" loading={saving}>Save Changes</Button>
        </div>
      </form>

      <GenerateCharacterModal
        open={showCharGenModal}
        onClose={() => setShowCharGenModal(false)}
        assetType={newAssetType}
        onCharacterGenerated={async (char) => {
          const res = await fetch(`/api/series/${id}/story-assets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: char.url, description: char.description, type: newAssetType }),
          });
          if (res.ok) {
            const data = await res.json();
            setAssets(data.storyAssets);
          }
        }}
      />
    </div>
  );
}
