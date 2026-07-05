import type { Dispatch, SetStateAction } from "react";

function linearToDb(vol: number): number {
  return vol > 0 ? 20 * Math.log10(vol) : -Infinity;
}
function dbToLinear(db: number): number {
  return db <= -60 ? 0 : Math.pow(10, db / 20);
}
function formatDb(db: number): string {
  if (!isFinite(db) || db <= -60) return "-∞";
  return `${db >= 0 ? "+" : ""}${db.toFixed(0)}dB`;
}

export interface VolumePanelProps {
  selectedClipId: string | null;
  clipVolumes: Map<string, number>;
  setClipVolumes: Dispatch<SetStateAction<Map<string, number>>>;
  clipFadeIns: Map<string, number>;
  setClipFadeIns: Dispatch<SetStateAction<Map<string, number>>>;
  clipFadeOuts: Map<string, number>;
  setClipFadeOuts: Dispatch<SetStateAction<Map<string, number>>>;
}

export function VolumePanel({
  selectedClipId,
  clipVolumes,
  setClipVolumes,
  clipFadeIns,
  setClipFadeIns,
  clipFadeOuts,
  setClipFadeOuts,
}: VolumePanelProps) {
  function setVolume(vol: number) {
    if (!selectedClipId) return;
    setClipVolumes((prev) => new Map(prev).set(selectedClipId, vol));
  }

  function setFadeIn(sec: number) {
    if (!selectedClipId) return;
    setClipFadeIns((prev) => new Map(prev).set(selectedClipId, sec));
  }

  function setFadeOut(sec: number) {
    if (!selectedClipId) return;
    setClipFadeOuts((prev) => new Map(prev).set(selectedClipId, sec));
  }

  function resetVolumeSettings() {
    if (!selectedClipId) return;
    setClipVolumes((prev) => { const m = new Map(prev); m.delete(selectedClipId); return m; });
    setClipFadeIns((prev) => { const m = new Map(prev); m.delete(selectedClipId); return m; });
    setClipFadeOuts((prev) => { const m = new Map(prev); m.delete(selectedClipId); return m; });
  }

  const currentVolume = selectedClipId ? (clipVolumes.get(selectedClipId) ?? 1) : 1;
  const currentVolumeDb = Math.max(-60, linearToDb(currentVolume));
  const currentFadeIn = selectedClipId ? (clipFadeIns.get(selectedClipId) ?? 0) : 0;
  const currentFadeOut = selectedClipId ? (clipFadeOuts.get(selectedClipId) ?? 0) : 0;

  return (
    <div className="flex flex-col px-4 pt-3 pb-3 gap-4 select-none">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-white/80">Audio</span>
        <button onClick={resetVolumeSettings} disabled={!selectedClipId} title="Reset" className="text-muted-foreground/40 hover:text-muted-foreground transition-colors disabled:opacity-30">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
        </button>
      </div>
      <div>
        <span className="text-[11px] text-muted-foreground/60 mb-2 block">Volume</span>
        <div className="flex items-center gap-3">
          <input type="range" min={-60} max={0} step={0.5} value={currentVolumeDb} onChange={(e) => setVolume(dbToLinear(Number(e.target.value)))} disabled={!selectedClipId}
            className="flex-1 h-1 appearance-none bg-white/15 rounded-full cursor-pointer disabled:opacity-30 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md"
          />
          <span className="text-xs font-mono bg-white/8 text-foreground rounded-lg px-3 py-1.5 w-16 text-center shrink-0">{formatDb(currentVolumeDb)}</span>
        </div>
      </div>
      <div>
        <span className="text-[11px] text-muted-foreground/60 mb-2 block">Fade-in duration</span>
        <div className="flex items-center gap-3">
          <input type="range" min={0} max={5} step={0.1} value={currentFadeIn} onChange={(e) => setFadeIn(Number(e.target.value))} disabled={!selectedClipId}
            className="flex-1 h-1 appearance-none bg-white/15 rounded-full cursor-pointer disabled:opacity-30 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md"
          />
          <span className="text-xs font-mono bg-white/8 text-foreground rounded-lg px-3 py-1.5 w-16 text-center shrink-0">{currentFadeIn.toFixed(1)}s</span>
        </div>
      </div>
      <div>
        <span className="text-[11px] text-muted-foreground/60 mb-2 block">Fade-out duration</span>
        <div className="flex items-center gap-3">
          <input type="range" min={0} max={5} step={0.1} value={currentFadeOut} onChange={(e) => setFadeOut(Number(e.target.value))} disabled={!selectedClipId}
            className="flex-1 h-1 appearance-none bg-white/15 rounded-full cursor-pointer disabled:opacity-30 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md"
          />
          <span className="text-xs font-mono bg-white/8 text-foreground rounded-lg px-3 py-1.5 w-16 text-center shrink-0">{currentFadeOut.toFixed(1)}s</span>
        </div>
      </div>
      {!selectedClipId && <span className="text-xs text-muted-foreground/40">Select a clip to adjust audio</span>}
    </div>
  );
}
