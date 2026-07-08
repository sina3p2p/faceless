import { useState, type Dispatch, type SetStateAction } from "react";
import type { InternalClip } from "../timeline/types";

export interface AiEditPanelProps {
  sessionId: string;
  selectedClipId: string | null;
  internalClips: InternalClip[];
  setInternalClips: Dispatch<SetStateAction<InternalClip[]>>;
  setClipMeta: Dispatch<SetStateAction<Map<string, number>>>;
  onSelectClip: (id: string | null) => void;
  getRawDuration: (id: string) => number;
}

export function AiEditPanel({
  sessionId,
  selectedClipId,
  internalClips,
  setInternalClips,
  setClipMeta,
  onSelectClip,
  getRawDuration,
}: AiEditPanelProps) {
  const [aiEditPrompt, setAiEditPrompt] = useState("");
  const [aiEditLoading, setAiEditLoading] = useState(false);
  const [aiEditError, setAiEditError] = useState<string | null>(null);

  async function handleAiEdit() {
    if (!selectedClipId || !aiEditPrompt.trim() || aiEditLoading) return;
    const clip = internalClips.find((c) => c.id === selectedClipId);
    if (!clip) return;
    const rawDur = getRawDuration(selectedClipId);
    setAiEditLoading(true);
    setAiEditError(null);
    try {
      const res = await fetch(`/api/v2/story/${sessionId}/edit-clip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl: clip.videoUrl,
          prompt: aiEditPrompt.trim(),
          duration: rawDur > 0 ? rawDur : 5,
          aspectRatio: "16:9",
        }),
      });
      const data = await res.json() as { videoUrl?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Edit failed");
      // Replace the clip's video URL and reset its trim/meta
      const newId = `${clip.sourceId}-edit-${Date.now()}`;
      setInternalClips((prev) =>
        prev.map((c) =>
          c.id === selectedClipId
            ? { ...c, id: newId, videoUrl: data.videoUrl!, trimStart: 0, trimEnd: null }
            : c
        )
      );
      setClipMeta((prev) => { const m = new Map(prev); m.delete(selectedClipId); return m; });
      onSelectClip(newId);
      setAiEditPrompt("");
    } catch (err) {
      setAiEditError(String(err));
    } finally {
      setAiEditLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {!selectedClipId ? (
        <span className="text-xs text-muted-foreground/60">Select a clip in the timeline to edit it with AI.</span>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
            Describe the change to apply. The selected clip will be sent to Seedance and replaced with the AI-edited version.
          </p>
          <textarea
            value={aiEditPrompt}
            onChange={(e) => setAiEditPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { void handleAiEdit(); } }}
            placeholder="e.g. Change the lighting to golden hour, add slow motion to the action sequence…"
            rows={4}
            disabled={aiEditLoading}
            className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:border-primary/50 disabled:opacity-50"
          />
          {aiEditError && (
            <p className="text-[11px] text-red-400 leading-relaxed">{aiEditError}</p>
          )}
          <button
            onClick={() => { void handleAiEdit(); }}
            disabled={!aiEditPrompt.trim() || aiEditLoading}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary disabled:opacity-40 disabled:cursor-not-allowed text-foreground text-xs font-semibold transition-colors"
          >
            {aiEditLoading ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                </svg>
                Editing…
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                Edit with AI
              </>
            )}
          </button>
          <p className="text-[10px] text-muted-foreground/40">⌘↵ to submit</p>
        </>
      )}
    </div>
  );
}
