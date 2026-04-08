"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { NICHES, ART_STYLES, CAPTION_STYLES, DEFAULT_LLM_MODEL, DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL, LANGUAGES, DEFAULT_LANGUAGE } from "@/lib/constants";
import { VoiceSelector } from "@/components/voice-selector";
import { VideoTypeSelector, LLMModelSelector, ImageModelSelector, VideoModelSelector } from "@/components/model-selectors";

interface CharacterImage {
  url: string;
  description: string;
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
  language: string | null;
  sceneContinuity: number;
  characterImages: CharacterImage[] | null;
  defaultVoiceId: string | null;
  topicIdeas: string[];
}

export default function EditSeriesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [characters, setCharacters] = useState<CharacterImage[]>([]);
  const [uploadingChar, setUploadingChar] = useState(false);
  const [describingIdx, setDescribingIdx] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    niche: "",
    style: "",
    captionStyle: "",
    videoType: "",
    llmModel: DEFAULT_LLM_MODEL as string,
    imageModel: DEFAULT_IMAGE_MODEL as string,
    videoModel: DEFAULT_VIDEO_MODEL as string,
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
          videoType: data.videoType || "faceless",
          llmModel: data.llmModel || DEFAULT_LLM_MODEL,
          imageModel: data.imageModel || DEFAULT_IMAGE_MODEL,
          videoModel: data.videoModel || DEFAULT_VIDEO_MODEL,
          language: data.language || DEFAULT_LANGUAGE,
          sceneContinuity: !!data.sceneContinuity,
          defaultVoiceId: data.defaultVoiceId || "",
          topicIdeas: (data.topicIdeas || []).join("\n"),
        });
        setCharacters(data.characterImages || []);
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
            <Input
              label="Series Name"
              placeholder="e.g., Dark History Tales"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />

            <VideoTypeSelector value={form.videoType} onChange={(v) => setForm({ ...form, videoType: v })} />

            <LLMModelSelector value={form.llmModel} onChange={(v) => setForm({ ...form, llmModel: v })} />
            <ImageModelSelector value={form.imageModel} onChange={(v) => setForm({ ...form, imageModel: v })} />

            {(form.videoType === "ai_video" || form.videoType === "music_video") && (
              <VideoModelSelector value={form.videoModel} onChange={(v) => setForm({ ...form, videoModel: v })} />
            )}

            {(form.videoType === "ai_video" || form.videoType === "music_video") && (
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
                      Each video clip smoothly transitions from one scene image to the next,
                      creating seamless visual flow. An ending scene is auto-generated.
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

            <Select
              label="Niche"
              value={form.niche}
              onChange={(e) => setForm({ ...form, niche: e.target.value })}
              options={NICHES.map((n) => ({
                value: n.id,
                label: `${n.label} — ${n.description}`,
              }))}
            />

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
              label="Art Style"
              value={form.style}
              onChange={(e) => setForm({ ...form, style: e.target.value })}
              options={ART_STYLES.map((s) => ({
                value: s.id,
                label: s.label,
              }))}
            />

            <Select
              label="Caption Style"
              value={form.captionStyle}
              onChange={(e) =>
                setForm({ ...form, captionStyle: e.target.value })
              }
              options={CAPTION_STYLES.map((c) => ({
                value: c.id,
                label: `${c.label} — ${c.description}`,
              }))}
            />

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Voice
              </label>
              <VoiceSelector
                value={form.defaultVoiceId}
                onChange={(voiceId) =>
                  setForm({ ...form, defaultVoiceId: voiceId })
                }
              />
              <p className="text-xs text-gray-500 mt-1.5">
                Click the play button to preview. Leave unselected to use the default voice.
                Browse more voices on the{" "}
                <a href="https://elevenlabs.io/voice-library" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 underline">
                  ElevenLabs Voice Library
                </a>{" "}
                and copy the Voice ID to use with &quot;Custom Voice ID&quot;.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Topic Ideas (optional, one per line)
              </label>
              <textarea
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-gray-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none transition-colors min-h-[100px] resize-y"
                placeholder={"The fall of the Roman Empire\nCleopatra's secret life\nThe curse of King Tut's tomb"}
                value={form.topicIdeas}
                onChange={(e) =>
                  setForm({ ...form, topicIdeas: e.target.value })
                }
              />
              <p className="text-xs text-gray-500 mt-1">
                Leave empty to let AI pick topics automatically.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Characters (optional)
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Upload clear frontal images of your characters. All videos in this series will maintain their appearance. Works best with Nano Banana 2 + Kling v3.
              </p>

              <div className="space-y-4">
                {characters.map((char, idx) => (
                  <div key={`${char.url}-${idx}`} className="flex gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="relative shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={char.url.startsWith("http") ? char.url : `/api/media/${char.url}`}
                        alt={`Character ${idx + 1}`}
                        className="w-24 h-24 rounded-lg border border-white/10 object-cover"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await fetch(`/api/series/${id}/character-image`, {
                            method: "DELETE",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ index: idx }),
                          });
                          if (res.ok) {
                            const data = await res.json();
                            setCharacters(data.characterImages);
                          }
                        }}
                        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] hover:bg-red-400"
                      >
                        &times;
                      </button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <textarea
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none transition-colors resize-none h-[72px]"
                        placeholder="Describe this character..."
                        value={char.description}
                        onChange={(e) => {
                          setCharacters((prev) =>
                            prev.map((c, i) => i === idx ? { ...c, description: e.target.value } : c)
                          );
                        }}
                        onBlur={async () => {
                          await fetch(`/api/series/${id}/character-image`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ index: idx, description: char.description }),
                          });
                        }}
                      />
                      <button
                        type="button"
                        disabled={describingIdx === idx}
                        onClick={async () => {
                          setDescribingIdx(idx);
                          try {
                            const res = await fetch(`/api/series/${id}/character-image/describe`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ index: idx }),
                            });
                            if (res.ok) {
                              const data = await res.json();
                              setCharacters(data.characterImages);
                            }
                          } finally {
                            setDescribingIdx(null);
                          }
                        }}
                        className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-500/10 border border-violet-500/30 text-violet-300 text-xs font-medium hover:bg-violet-500/20 transition-colors disabled:opacity-50"
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
                    </div>
                  </div>
                ))}
              </div>

              <label className={`flex items-center justify-center w-full h-20 rounded-xl border-2 border-dashed border-white/10 hover:border-violet-500/50 cursor-pointer transition-colors bg-white/5 mt-3 ${uploadingChar ? "opacity-50 pointer-events-none" : ""}`}>
                <div className="text-center">
                  <p className="text-sm text-gray-400">{uploadingChar ? "Uploading..." : "+ Add Character"}</p>
                  <p className="text-xs text-gray-600 mt-0.5">JPG, PNG, WebP up to 10MB</p>
                </div>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploadingChar(true);
                    try {
                      const fd = new FormData();
                      fd.append("file", file);
                      const res = await fetch(`/api/series/${id}/character-image`, {
                        method: "POST",
                        body: fd,
                      });
                      if (res.ok) {
                        const data = await res.json();
                        setCharacters(data.characterImages);
                      }
                    } finally {
                      setUploadingChar(false);
                      e.target.value = "";
                    }
                  }}
                />
              </label>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 mt-6">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}
