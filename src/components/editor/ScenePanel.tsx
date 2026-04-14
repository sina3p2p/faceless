"use client";

import { useState, useEffect } from "react";
import type { EditorScene } from "./VideoComposition";
import Image from "next/image";

interface ScenePanelProps {
  scene: EditorScene | null;
  onUpdate: (id: string, updates: { text?: string; duration?: number }) => void;
}

export function ScenePanel({ scene, onUpdate }: ScenePanelProps) {
  const [text, setText] = useState("");
  const [duration, setDuration] = useState(5);

  useEffect(() => {
    if (scene) {
      setText(scene.text);
      setDuration(scene.duration);
    }
  }, [scene?.id]);

  if (!scene) {
    return (
      <div className="w-72 bg-black/30 border-l border-white/5 p-4 flex items-center justify-center">
        <p className="text-sm text-gray-500 text-center">
          Select a scene to edit its properties
        </p>
      </div>
    );
  }

  function handleTextBlur() {
    if (text !== scene!.text) {
      onUpdate(scene!.id, { text });
    }
  }

  function handleDurationChange(value: number) {
    const clamped = Math.max(1, Math.min(30, value));
    setDuration(clamped);
    onUpdate(scene!.id, { duration: clamped });
  }

  return (
    <div className="w-72 bg-black/30 border-l border-white/5 p-4 flex flex-col gap-4 overflow-y-auto">
      <div>
        <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
          Scene {scene.sceneOrder + 1}
        </h3>

        {scene.assetUrl && (
          <div className="rounded-lg overflow-hidden mb-4 aspect-[9/16] bg-black">
            {scene.assetType === "image" ? (
              <Image
                src={scene.assetUrl}
                alt="Scene media"
                className="w-full h-full object-cover"
              />
            ) : (
              <video
                src={scene.assetUrl}
                className="w-full h-full object-cover"
                muted
                playsInline
              />
            )}
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1.5">Narration</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={handleTextBlur}
          rows={4}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white resize-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1.5">
          Duration ({duration.toFixed(1)}s)
        </label>
        <input
          type="range"
          min={1}
          max={30}
          step={0.5}
          value={duration}
          onChange={(e) => handleDurationChange(parseFloat(e.target.value))}
          className="w-full accent-violet-500"
        />
        <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
          <span>1s</span>
          <span>30s</span>
        </div>
      </div>
    </div>
  );
}
