"use client";

import { useState, useRef } from "react";
import type { Scene } from "../types";

export function SceneRefTextarea({
  value,
  onChange,
  scenes,
  currentSceneId,
  rows,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  scenes: Scene[];
  currentSceneId: string;
  rows: number;
  placeholder: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [atIndex, setAtIndex] = useState(-1);

  const availableScenes = scenes.filter(
    (s) => s.id !== currentSceneId && s.assetUrl
  );

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    onChange(val);

    const pos = e.target.selectionStart;
    const textBefore = val.slice(0, pos);
    const lastAt = textBefore.lastIndexOf("@");

    if (lastAt !== -1) {
      const afterAt = textBefore.slice(lastAt + 1);
      if (/^(scene\d*)?$/i.test(afterAt)) {
        setAtIndex(lastAt);
        setShowDropdown(true);
        return;
      }
    }
    setShowDropdown(false);
  }

  function insertRef(sceneIndex: number) {
    const tag = `@scene${sceneIndex + 1}`;
    const before = value.slice(0, atIndex);
    const pos = textareaRef.current?.selectionStart ?? value.length;
    const textAfterAt = value.slice(atIndex, pos);
    const afterCursor = value.slice(atIndex + textAfterAt.length);
    const newValue = before + tag + " " + afterCursor;
    onChange(newValue);
    setShowDropdown(false);

    requestAnimationFrame(() => {
      const cursor = before.length + tag.length + 1;
      textareaRef.current?.setSelectionRange(cursor, cursor);
      textareaRef.current?.focus();
    });
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
        onKeyDown={(e) => { if (e.key === "Escape") setShowDropdown(false); }}
        rows={rows}
        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white resize-y focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
        placeholder={placeholder}
      />
      {showDropdown && availableScenes.length > 0 && (
        <div className="absolute z-100 w-full bg-gray-800 border border-white/10 rounded-xl shadow-2xl overflow-hidden bottom-full mb-1">
          <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-gray-500 font-medium border-b border-white/5">
            Reference a scene
          </div>
          <div className="max-h-48 overflow-y-auto">
            {availableScenes.map((s) => {
              const idx = scenes.indexOf(s);
              return (
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); insertRef(idx); }}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-violet-500/10 text-left transition-colors"
                >
                  {s.assetUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.assetUrl}
                      alt=""
                      className="w-8 h-8 rounded object-cover shrink-0 border border-white/10"
                    />
                  )}
                  <div className="min-w-0">
                    <span className="text-xs font-medium text-violet-400">@scene{idx + 1}</span>
                    <p className="text-xs text-gray-400 truncate">{s.text.slice(0, 60)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
