"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { Scene } from "../types";

export function FullStoryView({ scenes }: { scenes: Scene[] }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Card className="mb-6">
      <CardContent className="p-0">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-white/5 transition-colors"
        >
          <span className="text-sm font-semibold text-white">Full Story</span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${collapsed ? "" : "rotate-180"}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {!collapsed && (
          <div className="px-6 pb-6 space-y-4 border-t border-white/5 pt-4">
            {scenes.map((scene, i) => (
              <div key={scene.id}>
                {scene.sceneTitle && (
                  <p className="text-xs font-semibold text-violet-400 mb-1">
                    {i + 1}. {scene.sceneTitle}
                  </p>
                )}
                <p className="text-sm text-gray-300 leading-relaxed">{scene.text}</p>
                {scene.directorNote && (
                  <p className="text-xs text-gray-600 mt-1 italic leading-relaxed">
                    {scene.directorNote}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
