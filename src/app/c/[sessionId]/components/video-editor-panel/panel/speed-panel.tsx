import { useRef, type Dispatch, type SetStateAction } from "react";
import { usePointerDrag } from "../use-pointer-drag";

export type SpeedMode = "normal" | "curve";
export type CurvePoint = { x: number; y: number }; // both 0–1; y=0→0.1×, y=0.5→1×, y=1→10×

// ─── Curve helpers ──────────────────────────────────────────────────────────

function speedFromY(y: number): number { return Math.pow(10, y * 2 - 1); }

function getCurveSpeedAt(pts: CurvePoint[], t: number): number {
  if (pts.length === 0) return 1;
  if (t <= pts[0].x) return speedFromY(pts[0].y);
  if (t >= pts[pts.length - 1].x) return speedFromY(pts[pts.length - 1].y);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (t >= a.x && t <= b.x) {
      const u = (t - a.x) / (b.x - a.x);
      const p0 = i > 0 ? pts[i - 1] : a;
      const p3 = i + 2 < pts.length ? pts[i + 2] : b;
      const y = 0.5 * ((2 * a.y) + (-p0.y + b.y) * u + (2 * p0.y - 5 * a.y + 4 * b.y - p3.y) * u * u + (-p0.y + 3 * a.y - 3 * b.y + p3.y) * u * u * u);
      return speedFromY(Math.max(0.001, Math.min(1, y)));
    }
  }
  return 1;
}

function computeCurveDuration(pts: CurvePoint[], raw: number): number {
  const N = 200;
  let sum = 0;
  for (let i = 0; i < N; i++) sum += 1 / getCurveSpeedAt(pts, i / N);
  return raw * sum / N;
}

function buildCurveSvgPath(pts: CurvePoint[], W: number, H: number, pL: number, pR: number, pT: number, pB: number): string {
  if (pts.length < 2) return "";
  const mx = (x: number) => pL + x * (W - pL - pR);
  const my = (y: number) => H - pB - y * (H - pT - pB);
  const ext = [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M ${mx(ext[1].x)} ${my(ext[1].y)}`;
  for (let i = 1; i < ext.length - 2; i++) {
    const p0 = ext[i - 1], p1 = ext[i], p2 = ext[i + 1], p3 = ext[i + 2];
    d += ` C ${mx(p1.x + (p2.x - p0.x) / 6)} ${my(p1.y + (p2.y - p0.y) / 6)}, ${mx(p2.x - (p3.x - p1.x) / 6)} ${my(p2.y - (p3.y - p1.y) / 6)}, ${mx(p2.x)} ${my(p2.y)}`;
  }
  return d;
}

const CURVE_PRESETS: { id: string; label: string; points: CurvePoint[]; icon: string }[] = [
  { id: "none", label: "None", points: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }], icon: "M 5 20 L 55 20" },
  { id: "montage", label: "Montage", points: [{ x: 0, y: 0.5 }, { x: 0.15, y: 0.5 }, { x: 0.32, y: 0.76 }, { x: 0.55, y: 0.24 }, { x: 0.72, y: 0.5 }, { x: 1, y: 0.5 }], icon: "M 5 20 C 11 20 15 8 25 8 C 36 8 39 32 46 32 C 51 32 52 20 55 20" },
  { id: "hero", label: "Hero", points: [{ x: 0, y: 0.5 }, { x: 0.2, y: 0.5 }, { x: 0.36, y: 0.82 }, { x: 0.62, y: 0.18 }, { x: 0.78, y: 0.5 }, { x: 1, y: 0.5 }], icon: "M 5 20 C 13 20 19 5 29 5 C 40 5 43 35 49 35 C 53 35 54 20 55 20" },
  { id: "bullet", label: "Bullet", points: [{ x: 0, y: 0.5 }, { x: 0.25, y: 0.5 }, { x: 0.5, y: 0.1 }, { x: 0.75, y: 0.5 }, { x: 1, y: 0.5 }], icon: "M 5 20 C 13 20 20 37 30 37 C 40 37 46 20 55 20" },
  { id: "jump-cut", label: "Jump Cut", points: [{ x: 0, y: 0.5 }, { x: 0.3, y: 0.5 }, { x: 0.38, y: 0.8 }, { x: 0.46, y: 0.5 }, { x: 1, y: 0.5 }], icon: "M 5 20 L 22 20 C 26 20 28 7 30 7 C 32 7 34 20 38 20 L 55 20" },
  { id: "flash-in", label: "Flash In", points: [{ x: 0, y: 0.5 }, { x: 0.58, y: 0.5 }, { x: 0.74, y: 0.76 }, { x: 1, y: 0.76 }], icon: "M 5 20 L 34 20 C 43 20 48 8 55 8" },
  { id: "flash-out", label: "Flash Out", points: [{ x: 0, y: 0.76 }, { x: 0.26, y: 0.76 }, { x: 0.42, y: 0.5 }, { x: 1, y: 0.5 }], icon: "M 5 8 C 12 8 17 20 26 20 L 55 20" },
  { id: "custom", label: "Custom", points: [], icon: "" },
];

const GRAPH_VW = 500, GRAPH_VH = 160;
const GP_L = 38, GP_R = 8, GP_T = 12, GP_B = 24;

export interface SpeedPanelProps {
  selectedClipId: string | null;
  getRawDuration: (id: string) => number;
  clipSpeeds: Map<string, number>;
  setClipSpeeds: Dispatch<SetStateAction<Map<string, number>>>;
  clipSpeedModes: Map<string, SpeedMode>;
  setClipSpeedModes: Dispatch<SetStateAction<Map<string, SpeedMode>>>;
  clipCurvePoints: Map<string, CurvePoint[]>;
  setClipCurvePoints: Dispatch<SetStateAction<Map<string, CurvePoint[]>>>;
  clipCurvePresets: Map<string, string>;
  setClipCurvePresets: Dispatch<SetStateAction<Map<string, string>>>;
}

export function SpeedPanel({
  selectedClipId,
  getRawDuration,
  clipSpeeds,
  setClipSpeeds,
  clipSpeedModes,
  setClipSpeedModes,
  clipCurvePoints,
  setClipCurvePoints,
  clipCurvePresets,
  setClipCurvePresets,
}: SpeedPanelProps) {
  const curveGraphRef = useRef<SVGSVGElement>(null);

  function setSpeed(rate: number) {
    if (!selectedClipId) return;
    setClipSpeeds((prev) => new Map(prev).set(selectedClipId, rate));
  }

  function setSpeedMode(mode: SpeedMode) {
    if (!selectedClipId) return;
    setClipSpeedModes((prev) => new Map(prev).set(selectedClipId, mode));
  }

  function selectCurvePreset(id: string) {
    if (!selectedClipId) return;
    const preset = CURVE_PRESETS.find((p) => p.id === id);
    if (preset && preset.id !== "custom" && preset.points.length > 0) {
      setClipCurvePoints((prev) => new Map(prev).set(selectedClipId, [...preset.points]));
    }
    setClipCurvePresets((prev) => new Map(prev).set(selectedClipId, id));
  }

  type CurvePtDrag = { idx: number; svgRect: DOMRect; clipId: string };

  const startCurvePtDrag = usePointerDrag<CurvePtDrag>(
    (state, { clientX, clientY }) => {
      const { idx, svgRect, clipId } = state;
      const svgX = (clientX - svgRect.left) * (GRAPH_VW / svgRect.width);
      const svgY = (clientY - svgRect.top) * (GRAPH_VH / svgRect.height);
      const nx = Math.max(0, Math.min(1, (svgX - GP_L) / (GRAPH_VW - GP_L - GP_R)));
      const ny = Math.max(0, Math.min(1, 1 - (svgY - GP_T) / (GRAPH_VH - GP_T - GP_B)));
      setClipCurvePoints((prev) => {
        const current = [...(prev.get(clipId) ?? [])];
        if (!current[idx]) return prev;
        const minX = idx > 0 ? current[idx - 1].x + 0.02 : 0;
        const maxX = idx < current.length - 1 ? current[idx + 1].x - 0.02 : 1;
        current[idx] = { x: Math.max(minX, Math.min(maxX, nx)), y: ny };
        return new Map(prev).set(clipId, current);
      });
      setClipCurvePresets((prev) => new Map(prev).set(clipId, "custom"));
    },
  );

  const currentSpeed = selectedClipId ? (clipSpeeds.get(selectedClipId) ?? 1) : 1;
  const rawDuration = selectedClipId ? getRawDuration(selectedClipId) : 0;
  const selectedSpeedMode: SpeedMode = selectedClipId ? (clipSpeedModes.get(selectedClipId) ?? "normal") : "normal";
  const activeCurvePreset = selectedClipId ? (clipCurvePresets.get(selectedClipId) ?? "none") : "none";
  const activeCurvePoints: CurvePoint[] = selectedClipId
    ? (clipCurvePoints.get(selectedClipId) ?? CURVE_PRESETS[0].points)
    : CURVE_PRESETS[0].points;
  const curveDuration = selectedSpeedMode === "curve" ? computeCurveDuration(activeCurvePoints, rawDuration) : rawDuration / currentSpeed;
  const curveSvgPath = buildCurveSvgPath(activeCurvePoints, GRAPH_VW, GRAPH_VH, GP_L, GP_R, GP_T, GP_B);

  return (
    <div className="flex flex-col px-4 pt-3 pb-3 gap-3 select-none">
      <div className="flex gap-0 bg-white/6 rounded-lg p-0.5 w-48 shrink-0">
        {(["normal", "curve"] as SpeedMode[]).map((m) => (
          <button key={m} onClick={() => setSpeedMode(m)} disabled={!selectedClipId}
            className={`flex-1 py-1.5 rounded-md text-xs font-semibold capitalize transition-all disabled:opacity-40 ${selectedSpeedMode === m ? "bg-white/90 text-black shadow" : "text-muted-foreground/60 hover:text-muted-foreground"}`}
          >{m}</button>
        ))}
      </div>

      {selectedSpeedMode === "normal" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/80">Basic</span>
            <button onClick={() => setSpeed(1)} disabled={!selectedClipId} title="Reset speed" className="text-muted-foreground/40 hover:text-muted-foreground transition-colors disabled:opacity-30">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
            </button>
          </div>
          <div>
            <span className="text-[11px] text-muted-foreground/60 mb-2 block">Speed</span>
            <div className="flex items-center gap-3">
              <input type="range" min={0.1} max={8} step={0.05} value={currentSpeed} onChange={(e) => setSpeed(Number(e.target.value))} disabled={!selectedClipId}
                className="flex-1 h-1 appearance-none bg-white/15 rounded-full cursor-pointer disabled:opacity-30 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md"
              />
              <span className="text-xs font-mono bg-white/8 text-foreground rounded-lg px-3 py-1.5 w-14 text-center shrink-0">
                {currentSpeed % 1 === 0 ? `${currentSpeed}x` : `${currentSpeed.toFixed(1)}x`}
              </span>
            </div>
          </div>
          {rawDuration > 0 && (
            <div>
              <span className="text-[11px] text-muted-foreground/60 mb-1.5 block">Duration</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-mono">{rawDuration.toFixed(1)}s</span>
                <div className="flex-1 flex items-center gap-px">
                  {Array.from({ length: 20 }, (_, i) => (
                    <div key={i} className={`flex-1 rounded-full ${i < Math.round(20 * Math.min(currentSpeed, 1)) ? "bg-white/25 h-[5px]" : "bg-white/10 h-[3px]"}`} />
                  ))}
                  <div className="w-0 h-0 border-t-4 border-b-4 border-l-[5px] border-t-transparent border-b-transparent border-l-white/30 ml-0.5" />
                </div>
                <span className="text-xs font-mono bg-white/8 text-foreground rounded-lg px-3 py-1.5 w-14 text-center shrink-0">{curveDuration.toFixed(1)}s</span>
              </div>
            </div>
          )}
          {!selectedClipId && <span className="text-xs text-muted-foreground/40">Select a clip to adjust speed</span>}
        </div>
      )}

      {selectedSpeedMode === "curve" && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-4 gap-1.5">
            {CURVE_PRESETS.map((preset) => (
              <button key={preset.id} onClick={() => selectCurvePreset(preset.id)} disabled={!selectedClipId}
                className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg border transition-all disabled:opacity-30 ${activeCurvePreset === preset.id ? "border-sky-400 bg-sky-400/10" : "border-white/8 bg-white/4 hover:bg-white/8 hover:border-white/20"}`}
              >
                {preset.id === "custom" ? (
                  <svg className="w-8 h-5" fill="none" viewBox="0 0 60 40" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" d="M 10 14 H 50 M 10 20 H 50 M 10 26 H 50" />
                    <circle cx="22" cy="14" r="4" fill="currentColor" stroke="none" />
                    <circle cx="38" cy="26" r="4" fill="currentColor" stroke="none" />
                  </svg>
                ) : (
                  <svg className="w-8 h-5" viewBox="0 0 60 40" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="30" x2="55" y2="30" stroke="currentColor" strokeWidth={0.5} strokeOpacity={0.3} />
                    <line x1="5" y1="20" x2="55" y2="20" stroke="currentColor" strokeWidth={0.5} strokeOpacity={0.15} />
                    <path d={preset.icon} />
                  </svg>
                )}
                <span className="text-[9px] text-muted-foreground font-medium leading-tight text-center">{preset.label}</span>
              </button>
            ))}
          </div>
          {rawDuration > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
              <span>Duration:</span><span className="font-mono">{rawDuration.toFixed(1)}s</span>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>
              <span className="font-mono font-semibold text-foreground">{curveDuration.toFixed(1)}s</span>
            </div>
          )}
          <div className="relative rounded-lg overflow-hidden bg-white/3 border border-white/8">
            <svg ref={curveGraphRef} viewBox={`0 0 ${GRAPH_VW} ${GRAPH_VH}`} className="w-full" style={{ height: 140 }} onPointerDown={(e) => e.preventDefault()}>
              {[0, 0.5, 1].map((y) => {
                const svgY = GRAPH_VH - GP_B - y * (GRAPH_VH - GP_T - GP_B);
                return (
                  <g key={y}>
                    <line x1={GP_L} y1={svgY} x2={GRAPH_VW - GP_R} y2={svgY} stroke="white" strokeOpacity={y === 0.5 ? 0.12 : 0.06} strokeWidth={1} strokeDasharray={y === 0.5 ? "none" : "3 4"} />
                    <text x={GP_L - 5} y={svgY + 4} textAnchor="end" fontSize={9} fill="rgba(255,255,255,0.35)" fontFamily="monospace">{y === 0 ? "0.1x" : y === 0.5 ? "1x" : "10x"}</text>
                  </g>
                );
              })}
              {activeCurvePoints.length >= 2 && <path d={curveSvgPath} fill="none" stroke="currentColor" className="text-primary" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
              {activeCurvePoints.map((pt, idx) => {
                const cx = GP_L + pt.x * (GRAPH_VW - GP_L - GP_R);
                const cy = GRAPH_VH - GP_B - pt.y * (GRAPH_VH - GP_T - GP_B);
                return (
                  <circle key={idx} cx={cx} cy={cy} r={6} fill="currentColor" stroke="currentColor" strokeWidth={2} className="text-primary cursor-grab active:cursor-grabbing" style={{ touchAction: "none" }}
                    onPointerDown={(e) => { if (!selectedClipId || !curveGraphRef.current) return; startCurvePtDrag({ idx, svgRect: curveGraphRef.current.getBoundingClientRect(), clipId: selectedClipId }, e); }}
                  />
                );
              })}
            </svg>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => { if (selectedClipId) selectCurvePreset("none"); }} disabled={!selectedClipId} title="Reset curve" className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/6 text-muted-foreground/60 hover:text-foreground hover:bg-white/10 transition-all disabled:opacity-30">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
            </button>
            <button onClick={() => { if (!selectedClipId) return; const flat = activeCurvePoints.map((p) => ({ ...p, y: 0.5 })); setClipCurvePoints((prev) => new Map(prev).set(selectedClipId, flat)); setClipCurvePresets((prev) => new Map(prev).set(selectedClipId, "custom")); }} disabled={!selectedClipId} title="Flatten curve" className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/6 text-muted-foreground/60 hover:text-foreground hover:bg-white/10 transition-all disabled:opacity-30">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" /></svg>
            </button>
          </div>
          {!selectedClipId && <span className="text-xs text-muted-foreground/40">Select a clip to edit the speed curve</span>}
        </div>
      )}
    </div>
  );
}
