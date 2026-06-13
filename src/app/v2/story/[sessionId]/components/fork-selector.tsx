"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export type ForkOption = {
  id: string;
  label: string;
  content: string;
  tradeoffs: string;
};

export function ForkSelector({
  options,
  recommendedId,
  recommendationReason,
  onChoose,
  selectedId,
  disabled,
}: {
  options: ForkOption[];
  recommendedId: string;
  recommendationReason: string;
  onChoose?: (optionId: string | undefined, customText?: string) => void;
  selectedId?: string;
  disabled?: boolean;
}) {
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState("");

  const isReadOnly = !onChoose || selectedId !== undefined;
  const activeSelectedId = selectedId ?? null;

  function handleOptionClick(option: ForkOption) {
    if (disabled || isReadOnly) return;
    onChoose!(option.id);
  }

  function handleCustomSubmit() {
    if (!customText.trim() || disabled || isReadOnly) return;
    onChoose!(undefined, customText.trim());
  }

  return (
    <div className="mt-3 space-y-2">
      {/* Recommendation badge */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-xs text-gray-500 italic">{recommendationReason}</span>
      </div>

      {/* Options */}
      <div className="space-y-2">
        {options.map((option) => {
          const isRecommended = option.id === recommendedId;
          const isSelected = activeSelectedId === option.id;

          return (
            <button
              key={option.id}
              onClick={() => handleOptionClick(option)}
              disabled={disabled || isReadOnly}
              className={`w-full text-left rounded-xl border transition-all duration-200 p-4 group
                ${isSelected
                  ? "border-violet-500 bg-violet-500/10"
                  : isRecommended
                    ? "border-violet-400/40 bg-violet-500/5 hover:border-violet-400/70 hover:bg-violet-500/10"
                    : "border-white/10 bg-white/3 hover:border-white/20 hover:bg-white/5"
                }
                ${disabled || isReadOnly ? "cursor-default" : "cursor-pointer"}
              `}
            >
              <div className="flex items-start gap-3">
                {/* Letter badge */}
                <div
                  className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-colors
                  ${isSelected
                      ? "bg-violet-500 text-white"
                      : isRecommended
                        ? "bg-violet-500/20 text-violet-300"
                        : "bg-white/10 text-gray-400"
                    }`}
                >
                  {option.id}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-sm font-semibold ${isSelected ? "text-violet-300" : "text-white"}`}
                    >
                      {option.label}
                    </span>
                    {isRecommended && (
                      <span className="text-[10px] font-medium text-violet-400 bg-violet-400/10 border border-violet-400/20 rounded-full px-2 py-0.5">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-300 leading-relaxed mb-2">{option.content}</p>
                  <p className="text-xs text-gray-500 leading-relaxed italic">{option.tradeoffs}</p>
                </div>

                {isSelected && (
                  <div className="shrink-0 text-violet-400 mt-0.5">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Custom direction (only when interactive and nothing selected yet) */}
      {!isReadOnly && activeSelectedId === null && (
        <div className="pt-1">
          {!customMode ? (
            <button
              onClick={() => setCustomMode(true)}
              disabled={disabled}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-1"
            >
              + Write my own direction
            </button>
          ) : (
            <div className="rounded-xl border border-white/10 p-3 space-y-2">
              <p className="text-xs text-gray-400">
                Describe your own direction or blend multiple options:
              </p>
              <textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="e.g. A mix of A and C, but set in modern day instead of the past…"
                rows={3}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 resize-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleCustomSubmit}
                  disabled={!customText.trim() || disabled}
                >
                  Use this direction
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setCustomMode(false);
                    setCustomText("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
