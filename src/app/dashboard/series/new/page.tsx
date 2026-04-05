"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { NICHES, ART_STYLES, CAPTION_STYLES, VIDEO_TYPES } from "@/lib/constants";

export default function NewSeriesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    niche: NICHES[0].id as string,
    style: ART_STYLES[0].id as string,
    captionStyle: CAPTION_STYLES[0].id as string,
    videoType: VIDEO_TYPES[0].id as string,
    topicIdeas: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const topicIdeas = form.topicIdeas
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);

    const res = await fetch("/api/series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        niche: form.niche,
        style: form.style,
        captionStyle: form.captionStyle,
        videoType: form.videoType,
        topicIdeas,
      }),
    });

    if (res.ok) {
      const series = await res.json();
      router.push(`/dashboard/series/${series.id}`);
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
          <Button type="submit" loading={loading}>
            Create Series
          </Button>
        </div>
      </form>
    </div>
  );
}
