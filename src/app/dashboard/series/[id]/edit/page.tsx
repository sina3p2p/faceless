"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { NICHES, ART_STYLES, CAPTION_STYLES, VIDEO_TYPES, LLM_MODELS, DEFAULT_LLM_MODEL, IMAGE_MODELS, DEFAULT_IMAGE_MODEL, VIDEO_MODELS, DEFAULT_VIDEO_MODEL } from "@/lib/constants";
import { VoiceSelector } from "@/components/voice-selector";

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
  sceneContinuity: number;
  defaultVoiceId: string | null;
  topicIdeas: string[];
}

export default function EditSeriesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    niche: "",
    style: "",
    captionStyle: "",
    videoType: "",
    llmModel: DEFAULT_LLM_MODEL as string,
    imageModel: DEFAULT_IMAGE_MODEL as string,
    videoModel: DEFAULT_VIDEO_MODEL as string,
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
          sceneContinuity: !!data.sceneContinuity,
          defaultVoiceId: data.defaultVoiceId || "",
          topicIdeas: (data.topicIdeas || []).join("\n"),
        });
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

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Video Type
              </label>
              <div className="grid grid-cols-2 gap-3">
                {VIDEO_TYPES.map((vt) => (
                  <button
                    key={vt.id}
                    type="button"
                    onClick={() => setForm({ ...form, videoType: vt.id })}
                    className={`rounded-xl border p-4 text-left transition-all ${
                      form.videoType === vt.id
                        ? "border-violet-500 bg-violet-500/10 ring-1 ring-violet-500"
                        : "border-white/10 bg-white/5 hover:border-white/20"
                    }`}
                  >
                    <p className="font-medium text-white">{vt.label}</p>
                    <p className="text-xs text-gray-400 mt-1">{vt.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                AI Script Model
              </label>
              <div className="space-y-2">
                {LLM_MODELS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setForm({ ...form, llmModel: m.id })}
                    className={`w-full rounded-xl border p-3 text-left transition-all ${
                      form.llmModel === m.id
                        ? "border-violet-500 bg-violet-500/10 ring-1 ring-violet-500"
                        : "border-white/10 bg-white/5 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-white text-sm">{m.label}</p>
                      {m.id === DEFAULT_LLM_MODEL && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300">
                          RECOMMENDED
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{m.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Image Generation Model
              </label>
              <div className="grid grid-cols-2 gap-3">
                {IMAGE_MODELS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setForm({ ...form, imageModel: m.id })}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      form.imageModel === m.id
                        ? "border-violet-500 bg-violet-500/10 ring-1 ring-violet-500"
                        : "border-white/10 bg-white/5 hover:border-white/20"
                    }`}
                  >
                    <p className="font-medium text-white text-sm">{m.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{m.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {form.videoType === "ai_video" && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Video Generation Model
                </label>
                <div className="space-y-2">
                  {VIDEO_MODELS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setForm({ ...form, videoModel: m.id })}
                      className={`w-full rounded-xl border p-3 text-left transition-all ${
                        form.videoModel === m.id
                          ? "border-violet-500 bg-violet-500/10 ring-1 ring-violet-500"
                          : "border-white/10 bg-white/5 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-white text-sm">{m.label}</p>
                        {m.id === DEFAULT_VIDEO_MODEL && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300">
                            RECOMMENDED
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{m.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {form.videoType === "ai_video" && (
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
