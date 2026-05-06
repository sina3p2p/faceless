"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export interface HeroAsset {
  id: string;
  type: "character" | "location" | "prop";
  name: string;
  description: string;
  url: string;
  sheetUrl: string | null;
  approvalStatus: "pending" | "approved" | "rejected";
  approvedAt: string | null;
  sortOrder: number;
  generated: boolean;
}

interface Props {
  videoId: string;
  approving: boolean;
  onApprove: (endpoint: string) => void;
}

export function HeroAssetsReview({ videoId, approving, onApprove }: Props) {
  const [assets, setAssets] = useState<HeroAsset[] | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [tweakById, setTweakById] = useState<Record<string, string>>({});
  const [tweakOpenId, setTweakOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/videos/${videoId}/hero-assets`);
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data = await res.json();
      setAssets(data.heroAssets ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load hero assets");
    }
  }, [videoId]);

  useEffect(() => {
    load();
  }, [load]);

  function setBusy(id: string, busy: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function approveOne(assetId: string) {
    setBusy(assetId, true);
    try {
      const res = await fetch(`/api/videos/${videoId}/hero-assets/${assetId}/approve`, {
        method: "POST",
      });
      if (res.ok) await load();
    } finally {
      setBusy(assetId, false);
    }
  }

  async function regenerate(assetId: string) {
    setBusy(assetId, true);
    try {
      const res = await fetch(`/api/videos/${videoId}/hero-assets/${assetId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptTweak: tweakById[assetId] ?? "" }),
      });
      if (res.ok) {
        setTweakById((prev) => ({ ...prev, [assetId]: "" }));
        setTweakOpenId(null);
        await load();
      }
    } finally {
      setBusy(assetId, false);
    }
  }

  async function deleteOne(assetId: string) {
    if (!confirm("Remove this hero asset from the video? It stays in your library.")) return;
    setBusy(assetId, true);
    try {
      const res = await fetch(
        `/api/videos/${videoId}/hero-assets?storyAssetId=${encodeURIComponent(assetId)}`,
        { method: "DELETE" }
      );
      if (res.ok) await load();
    } finally {
      setBusy(assetId, false);
    }
  }

  async function uploadOwn(file: File) {
    const name = window.prompt("Name for this hero asset (e.g. 'F-4 Phantom (Bravo Six)')");
    if (!name) return;
    const type = window.prompt("Type — character, location, or prop", "prop");
    if (type !== "character" && type !== "location" && type !== "prop") {
      alert("Type must be one of: character, location, prop");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("name", name);
    fd.append("type", type);
    const res = await fetch(`/api/videos/${videoId}/hero-assets`, { method: "POST", body: fd });
    if (res.ok) await load();
  }

  if (!assets) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const allApproved = assets.length > 0 && assets.every((a) => a.approvalStatus === "approved");

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 text-sm text-violet-300">
        Lock in your cast and key objects. Each sheet here will be used as a reference image for every
        frame the entity appears in — approving keeps identity (face, livery, materials) consistent
        across the whole video.
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {assets.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-gray-400">
            The Production Designer didn&apos;t identify any entities that need a locked reference.
            You can still upload your own (e.g. a brand mascot or product photo).
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {assets.map((a) => {
            const busy = busyIds.has(a.id);
            const isApproved = a.approvalStatus === "approved";
            const showTweak = tweakOpenId === a.id;
            return (
              <Card key={a.id}>
                <CardContent className="p-3 space-y-2">
                  <div className="aspect-square w-full rounded-lg overflow-hidden bg-black/40 border border-white/5">
                    {a.sheetUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.sheetUrl}
                        alt={a.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                        no image
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">{a.name}</span>
                    <span className="ml-auto text-[10px] uppercase tracking-wide text-gray-400 bg-white/5 px-1.5 py-0.5 rounded">
                      {a.type}
                    </span>
                    <span
                      className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                        isApproved
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-amber-500/20 text-amber-300"
                      }`}
                    >
                      {a.approvalStatus}
                    </span>
                  </div>

                  {a.description && (
                    <div className="text-xs text-gray-400 line-clamp-2">{a.description}</div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    {!isApproved && (
                      <Button
                        size="sm"
                        variant="primary"
                        loading={busy}
                        onClick={() => approveOne(a.id)}
                      >
                        Approve
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      loading={busy && showTweak}
                      onClick={() => setTweakOpenId(showTweak ? null : a.id)}
                    >
                      Regenerate
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteOne(a.id)}
                      disabled={busy}
                    >
                      Remove
                    </Button>
                  </div>

                  {showTweak && (
                    <div className="space-y-2 pt-1">
                      <textarea
                        rows={2}
                        value={tweakById[a.id] ?? ""}
                        onChange={(e) =>
                          setTweakById((prev) => ({ ...prev, [a.id]: e.target.value }))
                        }
                        placeholder="Describe what to change (e.g. 'lighter livery, more weathered panels')"
                        className="w-full bg-black/30 border border-white/10 rounded p-2 text-xs text-gray-200 focus:outline-none focus:border-violet-500/50 resize-none"
                      />
                      <Button
                        size="sm"
                        variant="primary"
                        loading={busy}
                        onClick={() => regenerate(a.id)}
                      >
                        Regenerate sheet
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="flex justify-between items-center pt-2">
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadOwn(f);
              e.target.value = "";
            }}
          />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            Upload your own
          </Button>
        </div>
        <Button
          variant="primary"
          size="lg"
          loading={approving}
          disabled={!allApproved}
          title={!allApproved ? "Approve every hero asset first" : undefined}
          onClick={() => onApprove("approve-hero-assets")}
        >
          Approve all &amp; continue to storyboard
        </Button>
      </div>
    </div>
  );
}
