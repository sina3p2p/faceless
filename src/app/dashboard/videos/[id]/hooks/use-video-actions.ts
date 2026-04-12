"use client";

import { useState, useCallback, useEffect } from "react";
import type { Scene, SceneFrame, VideoDetail, RefinedScene } from "../types";

export function useVideoActions(id: string) {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [approving, setApproving] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingAllFrames, setGeneratingAllFrames] = useState(false);
  const [generatingMotion, setGeneratingMotion] = useState(false);
  const [generatingSceneIds, setGeneratingSceneIds] = useState<Set<string>>(new Set());
  const [generatingFrameIds, setGeneratingFrameIds] = useState<Set<string>>(new Set());
  const [generatingFrameVideoIds, setGeneratingFrameVideoIds] = useState<Set<string>>(new Set());
  const [generatingFrameMotionIds, setGeneratingFrameMotionIds] = useState<Set<string>>(new Set());
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [scenesRes, videoRes, framesRes] = await Promise.all([
        fetch(`/api/videos/${id}/scenes`),
        fetch(`/api/videos/${id}`),
        fetch(`/api/videos/${id}/frames`),
      ]);

      const framesMap: Record<string, SceneFrame[]> = {};
      if (framesRes.ok) {
        const framesData = await framesRes.json();
        for (const sf of framesData.scenes ?? []) {
          framesMap[sf.sceneId] = sf.frames ?? [];
        }
      }

      if (scenesRes.ok) {
        const data = await scenesRes.json();
        setScenes(
          data.scenes.map((s: Scene) => ({
            ...s,
            duration: s.duration ?? 5,
            frames: framesMap[s.id] ?? [],
          }))
        );
      }

      if (videoRes.ok) {
        const data = await videoRes.json();
        setVideo(data);
      }

      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (video?.status === "COMPLETED" && !downloadUrl) {
      fetch(`/api/videos/${id}/download`)
        .then((r) => r.json())
        .then((data) => { if (data.url) setDownloadUrl(data.url); })
        .catch(() => {});
    }
  }, [video?.status, downloadUrl, id]);

  function handleUpdateScene(
    sceneId: string,
    updates: { text?: string; duration?: number; speaker?: string; visualDescription?: string; sceneTitle?: string; directorNote?: string }
  ) {
    setScenes((prev) =>
      prev.map((s) => (s.id === sceneId ? { ...s, ...updates } : s))
    );
    fetch(`/api/videos/${id}/scenes/${sceneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
  }

  function handleUpdateAssetRefs(sceneId: string, refs: string[]) {
    setScenes((prev) =>
      prev.map((s) => (s.id === sceneId ? { ...s, assetRefs: refs } : s))
    );
    fetch(`/api/videos/${id}/scenes/${sceneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetRefs: refs }),
    });
  }

  function handleDeleteScene(sceneId: string) {
    setScenes((prev) => prev.filter((s) => s.id !== sceneId));
    fetch(`/api/videos/${id}/scenes/${sceneId}`, { method: "DELETE" });
  }

  async function handleUploadImage(sceneId: string, file: File) {
    setGeneratingSceneIds((prev) => new Set(prev).add(sceneId));
    try {
      const fd = new FormData();
      fd.append("file", file);
      const uploadRes = await fetch("/api/upload-temp", { method: "POST", body: fd });
      if (!uploadRes.ok) return;
      const { url: key } = await uploadRes.json();
      await fetch(`/api/videos/${id}/scenes/${sceneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetUrl: key, imageUrl: key, assetType: "image" }),
      });
      await loadData();
    } finally {
      setGeneratingSceneIds((prev) => { const next = new Set(prev); next.delete(sceneId); return next; });
    }
  }

  async function generateImageForScene(
    sceneId: string,
    promptOverride?: string,
    mode: "regenerate" | "edit" = "regenerate",
    referenceSceneIds?: string[],
    modelOverride?: string
  ) {
    setGeneratingSceneIds((prev) => new Set(prev).add(sceneId));
    try {
      const body: Record<string, unknown> = { mode };
      if (promptOverride) body.imagePrompt = promptOverride;
      if (referenceSceneIds && referenceSceneIds.length > 0) body.referenceSceneIds = referenceSceneIds;
      if (modelOverride) body.imageModel = modelOverride;
      const res = await fetch(`/api/videos/${id}/scenes/${sceneId}/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) await loadData();
    } finally {
      setGeneratingSceneIds((prev) => { const next = new Set(prev); next.delete(sceneId); return next; });
    }
  }

  async function handleGenerateAllImages(regenerateExisting = false) {
    setGeneratingAll(true);
    try {
      await fetch(`/api/videos/${id}/generate-images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerateExisting }),
      });
      setVideo((prev) => prev ? { ...prev, status: "IMAGE_GENERATION" } : prev);
    } catch {
      setGeneratingAll(false);
    }
  }

  async function handleGenerateFrameImage(frameId: string, promptOverride?: string, modelOverride?: string) {
    setGeneratingFrameIds((prev) => new Set(prev).add(frameId));
    try {
      const body: Record<string, unknown> = {};
      if (promptOverride) body.imagePrompt = promptOverride;
      if (modelOverride) body.imageModel = modelOverride;
      const res = await fetch(`/api/videos/${id}/frames/${frameId}/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) await loadData();
    } finally {
      setGeneratingFrameIds((prev) => { const next = new Set(prev); next.delete(frameId); return next; });
    }
  }

  async function handleGenerateAllFrameImages(regenerateExisting = false) {
    setGeneratingAllFrames(true);
    try {
      await fetch(`/api/videos/${id}/generate-frame-images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerateExisting }),
      });
      setVideo((prev) => prev ? { ...prev, status: "IMAGE_GENERATION" } : prev);
    } catch {
      setGeneratingAllFrames(false);
    }
  }

  async function handleUpdateFramePrompt(frameId: string, imagePrompt: string) {
    await fetch(`/api/videos/${id}/frames/${frameId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imagePrompt }),
    });
  }

  async function handleUpdateFrameMotion(frameId: string, visualDescription: string) {
    await fetch(`/api/videos/${id}/frames/${frameId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visualDescription }),
    });
  }

  async function handleRegenerateFrameVideo(frameId: string, videoModel?: string) {
    setGeneratingFrameVideoIds((prev) => new Set(prev).add(frameId));
    try {
      const body: Record<string, unknown> = {};
      if (videoModel) body.videoModel = videoModel;
      const res = await fetch(`/api/videos/${id}/frames/${frameId}/generate-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) await loadData();
    } finally {
      setGeneratingFrameVideoIds((prev) => { const next = new Set(prev); next.delete(frameId); return next; });
    }
  }

  async function handleRegenerateFrameMotion(frameId: string) {
    setGeneratingFrameMotionIds((prev) => new Set(prev).add(frameId));
    try {
      const res = await fetch(`/api/videos/${id}/frames/${frameId}/generate-motion`, { method: "POST" });
      if (res.ok) await loadData();
    } finally {
      setGeneratingFrameMotionIds((prev) => { const next = new Set(prev); next.delete(frameId); return next; });
    }
  }

  async function handleGenerateMotion() {
    setGeneratingMotion(true);
    try {
      await fetch(`/api/videos/${id}/generate-motion`, { method: "POST" });
      setVideo((prev) => prev ? { ...prev, status: "VIDEO_SCRIPT" } : prev);
    } catch {
      setGeneratingMotion(false);
    }
  }

  async function handleApprove(endpoint: string) {
    setApproving(true);
    try {
      await fetch(`/api/videos/${id}/${endpoint}`, { method: "POST" });
      await loadData();
    } catch { /* retry */ }
    setApproving(false);
  }

  async function handleSaveStory(updatedMarkdown: string) {
    await fetch(`/api/videos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script: updatedMarkdown }),
    });
    setVideo((prev) => prev ? { ...prev, script: updatedMarkdown } : prev);
  }

  async function handleStartRendering() {
    setRendering(true);
    try {
      const res = await fetch(`/api/videos/${id}/render`, { method: "POST" });
      if (res.ok) await loadData();
    } catch {}
    setRendering(false);
  }

  async function handleSelectMedia(sceneId: string, mediaId: string) {
    try {
      const res = await fetch(`/api/videos/${id}/scenes/${sceneId}/select-media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId }),
      });
      if (res.ok) await loadData();
    } catch {
      console.error("Failed to select media version");
    }
  }

  async function handleDownload() {
    setDownloading(true);
    const res = await fetch(`/api/videos/${id}/download`);
    const data = await res.json();
    if (data.url) {
      setDownloadUrl(data.url);
      window.open(data.url, "_blank");
    }
    setDownloading(false);
  }

  async function handleTogglePipelineMode() {
    const next = video?.config?.pipelineMode === "auto" ? "manual" : "auto";
    await fetch(`/api/videos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipelineMode: next }),
    });
    setVideo((prev) => prev ? { ...prev, config: { ...prev.config, pipelineMode: next } } : prev);
  }

  async function handleApplyRefinedScript(refined: RefinedScene[], title: string) {
    const updatedScenes = [...scenes];
    for (let i = 0; i < refined.length; i++) {
      const r = refined[i];
      const existing = updatedScenes[i];
      if (existing) {
        const updates: Record<string, unknown> = {};
        if (r.text !== existing.text) updates.text = r.text;
        if (r.sceneTitle && r.sceneTitle !== (existing.sceneTitle || "")) updates.sceneTitle = r.sceneTitle;
        if (r.directorNote && r.directorNote !== (existing.directorNote || "")) updates.directorNote = r.directorNote;
        if (r.imagePrompt !== (existing.imagePrompt || "")) updates.imagePrompt = r.imagePrompt;
        if (r.visualDescription !== (existing.visualDescription || "")) updates.visualDescription = r.visualDescription;
        if (r.searchQuery !== (existing.searchQuery || "")) updates.searchQuery = r.searchQuery;
        if (r.duration !== existing.duration) updates.duration = r.duration;
        if (Object.keys(updates).length > 0) {
          await fetch(`/api/videos/${id}/scenes/${existing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          });
        }
      }
    }
    if (title && title !== video?.title) {
      await fetch(`/api/videos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
    }
    await loadData();
  }

  async function handleRecompose() {
    setRendering(true);
    try {
      const res = await fetch(`/api/videos/${id}/recompose`, { method: "POST" });
      if (res.ok) {
        setVideo((prev) => prev ? { ...prev, status: "RENDERING" } : prev);
        setDownloadUrl(null);
      }
    } catch {}
    setRendering(false);
  }

  async function handleSelectFrameVariant(frameId: string, variantId: string, type: "image" | "video") {
    try {
      const res = await fetch(`/api/videos/${id}/frames/${frameId}/select-variant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId, type }),
      });
      if (res.ok) await loadData();
    } catch {
      console.error("Failed to select frame variant");
    }
  }

  return {
    scenes,
    setScenes,
    video,
    setVideo,
    loading,
    rendering,
    approving,
    generatingAll,
    generatingAllFrames,
    generatingMotion,
    generatingSceneIds,
    generatingFrameIds,
    generatingFrameVideoIds,
    generatingFrameMotionIds,
    downloadUrl,
    downloading,
    loadData,
    handleUpdateScene,
    handleUpdateAssetRefs,
    handleDeleteScene,
    handleUploadImage,
    generateImageForScene,
    handleGenerateAllImages,
    handleGenerateFrameImage,
    handleGenerateAllFrameImages,
    handleUpdateFramePrompt,
    handleUpdateFrameMotion,
    handleRegenerateFrameVideo,
    handleRegenerateFrameMotion,
    handleGenerateMotion,
    handleApprove,
    handleSaveStory,
    handleStartRendering,
    handleSelectMedia,
    handleSelectFrameVariant,
    handleRecompose,
    handleDownload,
    handleTogglePipelineMode,
    handleApplyRefinedScript,
  };
}
