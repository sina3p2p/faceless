"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IMAGE_MODELS } from "@/lib/constants";

interface Scene {
  id: string;
  sceneOrder: number;
  text: string;
  imagePrompt: string | null;
  visualDescription: string | null;
  searchQuery: string | null;
  duration: number;
  assetUrl: string | null;
  assetType: string | null;
  audioUrl: string | null;
}

interface VideoDetail {
  id: string;
  seriesId: string;
  title: string | null;
  status: string;
  duration: number | null;
  series: { name: string; niche: string; imageModel: string | null; videoType: string };
}

function SortableSceneCard({
  scene,
  index,
  isSelected,
  onSelect,
  onDelete,
  onUpdate,
  onEditPrompt,
  generatingImage,
  isMusicVideo,
}: {
  scene: Scene;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onUpdate: (updates: { text?: string; duration?: number }) => void;
  onEditPrompt: () => void;
  generatingImage: boolean;
  isMusicVideo?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: scene.id });

  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(scene.text);
  const [duration, setDuration] = useState(scene.duration);

  useEffect(() => {
    setText(scene.text);
    setDuration(scene.duration);
  }, [scene.text, scene.duration]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  function handleTextSave() {
    setEditing(false);
    if (text !== scene.text) {
      onUpdate({ text });
    }
  }

  function handleDurationChange(val: number) {
    const clamped = Math.max(1, Math.min(30, val));
    setDuration(clamped);
    onUpdate({ duration: clamped });
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`rounded-xl border transition-all ${
        isSelected
          ? "border-violet-500 bg-violet-500/5 ring-1 ring-violet-500/20"
          : "border-white/5 bg-white/2 hover:border-white/10"
      }`}
    >
      <div className="flex gap-3 p-4">
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className="flex flex-col items-center justify-center px-1 cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <circle cx="3" cy="2" r="1.5" />
            <circle cx="9" cy="2" r="1.5" />
            <circle cx="3" cy="6" r="1.5" />
            <circle cx="9" cy="6" r="1.5" />
            <circle cx="3" cy="10" r="1.5" />
            <circle cx="9" cy="10" r="1.5" />
          </svg>
        </div>

        {/* Scene number */}
        <div className="w-8 h-8 rounded-full bg-violet-600/20 flex items-center justify-center text-sm font-bold text-violet-400 shrink-0 mt-0.5">
          {index + 1}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Narration / Lyrics text */}
          <div className="mb-2">
            <span className="text-[10px] uppercase tracking-wider text-gray-600 font-medium">
              {isMusicVideo ? scene.searchQuery || "Lyrics" : "Narration"}
            </span>
            {editing ? (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={handleTextSave}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { setText(scene.text); setEditing(false); }
                }}
                autoFocus
                rows={2}
                className="w-full mt-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white resize-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
              />
            ) : (
              <p
                className="text-sm text-gray-300 cursor-text hover:text-white transition-colors leading-relaxed mt-0.5"
                onClick={(e) => { e.stopPropagation(); setEditing(true); }}
              >
                {scene.text}
              </p>
            )}
          </div>

          {/* Image prompt preview */}
          {scene.imagePrompt && (
            <div className="mb-2">
              <span className="text-[10px] uppercase tracking-wider text-gray-600 font-medium">Image Prompt</span>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
                {scene.imagePrompt}
              </p>
            </div>
          )}

          {/* Preview image */}
          {scene.assetUrl && (
            <div className="mt-2 relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={scene.assetUrl}
                alt={`Scene ${index + 1}`}
                className="w-full max-w-[200px] rounded-lg border border-white/10"
              />
              <button
                onClick={(e) => { e.stopPropagation(); onEditPrompt(); }}
                className="absolute top-2 right-2 px-2 py-1 rounded-md bg-black/70 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-violet-600"
              >
                Edit & Regenerate
              </button>
            </div>
          )}

          {generatingImage && !scene.assetUrl && (
            <div className="mt-2 flex items-center gap-2 text-xs text-violet-400">
              <div className="animate-spin w-3 h-3 border border-violet-400 border-t-transparent rounded-full" />
              Generating image...
            </div>
          )}

          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            <span className="font-mono">{duration.toFixed(1)}s</span>
            {!scene.assetUrl && !generatingImage && (
              <button
                onClick={(e) => { e.stopPropagation(); onEditPrompt(); }}
                className="text-violet-400 hover:text-violet-300 transition-colors"
              >
                Edit prompt
              </button>
            )}
            {scene.assetUrl && (
              <a
                href={scene.assetUrl}
                download={`scene_${index + 1}.${scene.assetType === "video" ? "mp4" : "jpg"}`}
                onClick={(e) => e.stopPropagation()}
                className="text-violet-400 hover:text-violet-300 transition-colors inline-flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                {scene.assetType === "video" ? "Video" : "Image"}
              </a>
            )}
            {scene.audioUrl && (
              <a
                href={scene.audioUrl}
                download={`scene_${index + 1}_audio.mp3`}
                onClick={(e) => e.stopPropagation()}
                className="text-violet-400 hover:text-violet-300 transition-colors inline-flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Audio
              </a>
            )}
          </div>
        </div>

        {/* Delete */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="w-8 h-8 rounded-lg bg-white/5 text-gray-500 hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center transition-colors shrink-0"
          title="Delete scene"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
          </svg>
        </button>
      </div>

      {/* Duration slider (shown when selected) */}
      {isSelected && (
        <div className="px-4 pb-4 pt-1 border-t border-white/5 ml-14">
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500 whitespace-nowrap">Duration</label>
            <input
              type="range"
              min={1}
              max={30}
              step={0.5}
              value={duration}
              onChange={(e) => handleDurationChange(parseFloat(e.target.value))}
              className="flex-1 accent-violet-500 h-1"
            />
            <span className="text-xs font-mono text-gray-400 w-10 text-right">
              {duration.toFixed(1)}s
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function SceneRefTextarea({
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
        <div
          className="absolute z-100 w-full bg-gray-800 border border-white/10 rounded-xl shadow-2xl overflow-hidden bottom-full mb-1"
        >
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

function MaskCanvas({
  imageUrl,
  onMaskReady,
}: {
  imageUrl: string;
  onMaskReady: (dataUrl: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(30);
  const [strokes, setStrokes] = useState<ImageData[]>([]);
  const [imgDimensions, setImgDimensions] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const container = containerRef.current;
      const displayW = container?.clientWidth || 400;
      const scale = displayW / img.naturalWidth;
      const displayH = img.naturalHeight * scale;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.style.width = `${displayW}px`;
      canvas.style.height = `${displayH}px`;
      setImgDimensions({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = imageUrl;
  }, [imageUrl]);

  function getPos(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  function saveSnapshot() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setStrokes((prev) => [...prev, ctx.getImageData(0, 0, canvas.width, canvas.height)]);
  }

  function drawAt(x: number, y: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(168, 85, 247, 0.5)";
    ctx.beginPath();
    const scaledBrush = brushSize * (canvas.width / (containerRef.current?.clientWidth || canvas.width));
    ctx.arc(x, y, scaledBrush / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function startDraw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    saveSnapshot();
    setDrawing(true);
    const { x, y } = getPos(e);
    drawAt(x, y);
  }

  function moveDraw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    e.preventDefault();
    const { x, y } = getPos(e);
    drawAt(x, y);
  }

  function endDraw() {
    if (!drawing) return;
    setDrawing(false);
    exportMask();
  }

  function undoStroke() {
    const canvas = canvasRef.current;
    if (!canvas || strokes.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const last = strokes[strokes.length - 1];
    ctx.putImageData(last, 0, 0);
    setStrokes((prev) => prev.slice(0, -1));
    exportMask();
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setStrokes([]);
    onMaskReady(null);
  }

  function exportMask() {
    const canvas = canvasRef.current;
    if (!canvas || imgDimensions.w === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = canvas.width;
    maskCanvas.height = canvas.height;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return;

    maskCtx.fillStyle = "#000000";
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

    const sourceData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);

    for (let i = 3; i < sourceData.data.length; i += 4) {
      if (sourceData.data[i] > 0) {
        maskData.data[i - 3] = 255;
        maskData.data[i - 2] = 255;
        maskData.data[i - 1] = 255;
      }
    }
    maskCtx.putImageData(maskData, 0, 0);
    onMaskReady(maskCanvas.toDataURL("image/png"));
  }

  return (
    <div>
      <div ref={containerRef} className="relative rounded-lg overflow-hidden border border-white/10 mb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Scene to inpaint"
          className="w-full block"
          draggable={false}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 cursor-crosshair touch-none"
          onMouseDown={startDraw}
          onMouseMove={moveDraw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={moveDraw}
          onTouchEnd={endDraw}
        />
      </div>
      <div className="flex items-center gap-3 mb-3">
        <label className="text-xs text-gray-400 shrink-0">Brush</label>
        <input
          type="range"
          min={5}
          max={80}
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
          className="flex-1 accent-violet-500 h-1"
        />
        <span className="text-xs text-gray-500 w-6 text-right">{brushSize}</span>
        <button
          type="button"
          onClick={undoStroke}
          disabled={strokes.length === 0}
          className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-300 hover:bg-white/10 disabled:opacity-30 transition-colors"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={clearCanvas}
          className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-300 hover:bg-white/10 transition-colors"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function PromptEditModal({
  scene,
  scenes,
  imageModel,
  onClose,
  onSubmit,
  onUndo,
  regenerating,
  undoing,
}: {
  scene: Scene;
  scenes: Scene[];
  imageModel: string;
  onClose: () => void;
  onSubmit: (prompt: string, mode: "regenerate" | "edit" | "inpaint", referenceSceneIds: string[], maskDataUrl?: string, modelOverride?: string) => void;
  onUndo: (() => void) | null;
  regenerating: boolean;
  undoing: boolean;
}) {
  const [selectedModel, setSelectedModel] = useState(imageModel);
  const canEdit = scene.assetUrl && selectedModel === "nano-banana-2";
  const canInpaint = !!scene.assetUrl;
  const [mode, setMode] = useState<"regenerate" | "edit" | "inpaint">("regenerate");
  const [regenPrompt, setRegenPrompt] = useState(scene.imagePrompt || scene.text);
  const [editInstruction, setEditInstruction] = useState("");
  const [inpaintPrompt, setInpaintPrompt] = useState("");
  const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);

  function parseSceneRefs(text: string): string[] {
    const matches = text.matchAll(/@scene(\d+)/gi);
    const ids: string[] = [];
    for (const m of matches) {
      const idx = parseInt(m[1], 10) - 1;
      if (idx >= 0 && idx < scenes.length && scenes[idx].assetUrl) {
        ids.push(scenes[idx].id);
      }
    }
    return [...new Set(ids)];
  }

  function handleSubmit() {
    const modelOverride = selectedModel !== imageModel ? selectedModel : undefined;
    if (mode === "inpaint") {
      onSubmit(inpaintPrompt, "inpaint", [], maskDataUrl || undefined, modelOverride);
      return;
    }
    const prompt = mode === "edit" ? editInstruction : regenPrompt;
    const refs = parseSceneRefs(prompt);
    onSubmit(prompt, mode, refs, undefined, modelOverride);
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            {mode === "inpaint" ? "Inpaint Area" : mode === "edit" ? "Edit Image" : (scene.assetUrl ? "Regenerate Image" : "Generate Image")}
          </h3>

          {scene.assetUrl && mode !== "inpaint" && (
            <div className="mb-4 relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={scene.assetUrl}
                alt="Current preview"
                className="w-full rounded-lg border border-white/10"
              />
              {onUndo && (
                <button
                  onClick={onUndo}
                  disabled={undoing}
                  className="absolute top-2 left-2 px-2.5 py-1.5 rounded-lg bg-black/70 backdrop-blur text-white text-xs font-medium hover:bg-violet-600 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                  </svg>
                  {undoing ? "Undoing..." : "Undo"}
                </button>
              )}
            </div>
          )}

          {mode === "inpaint" && scene.assetUrl && (
            <MaskCanvas imageUrl={scene.assetUrl} onMaskReady={setMaskDataUrl} />
          )}

          {/* Tabs */}
          {(canEdit || canInpaint) && (
            <div className="flex gap-1 mb-4 p-1 bg-white/5 rounded-lg">
              <button
                onClick={() => setMode("regenerate")}
                className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  mode === "regenerate"
                    ? "bg-violet-600 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Regenerate
              </button>
              {canEdit && (
                <button
                  onClick={() => setMode("edit")}
                  className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    mode === "edit"
                      ? "bg-violet-600 text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  Edit
                </button>
              )}
              {canInpaint && (
                <button
                  onClick={() => setMode("inpaint")}
                  className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    mode === "inpaint"
                      ? "bg-violet-600 text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  Inpaint
                </button>
              )}
            </div>
          )}

          {/* Model selector */}
          {mode !== "inpaint" && (
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Image Model</label>
              <div className="flex gap-1.5 flex-wrap">
                {IMAGE_MODELS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setSelectedModel(m.id);
                      if (mode === "edit" && m.id !== "nano-banana-2") setMode("regenerate");
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      selectedModel === m.id
                        ? "bg-violet-600 text-white"
                        : "bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:border-white/20"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {selectedModel !== imageModel && (
                <p className="text-[10px] text-amber-400/80 mt-1">
                  Overriding series default ({IMAGE_MODELS.find((m) => m.id === imageModel)?.label || imageModel})
                </p>
              )}
            </div>
          )}

          {mode === "regenerate" && (
            <>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Image Prompt</label>
              <SceneRefTextarea
                value={regenPrompt}
                onChange={setRegenPrompt}
                scenes={scenes}
                currentSceneId={scene.id}
                rows={6}
                placeholder="Describe the image you want to generate..."
              />
              <div className="flex items-center justify-between mt-2 mb-4">
                <span className="text-xs text-gray-600">{regenPrompt.length} chars</span>
                {imageModel === "nano-banana-2" && (
                  <span className="text-xs text-gray-600">Type @ to reference another scene</span>
                )}
              </div>
            </>
          )}

          {mode === "edit" && (
            <>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Edit Instruction</label>
              <SceneRefTextarea
                value={editInstruction}
                onChange={setEditInstruction}
                scenes={scenes}
                currentSceneId={scene.id}
                rows={3}
                placeholder='e.g. "change the hair color to look like @scene1" or "add dramatic fog"'
              />
              <div className="flex items-center justify-between mt-2 mb-4">
                <span className="text-xs text-gray-600">{editInstruction.length} chars</span>
                <span className="text-xs text-gray-600">Type @ to reference another scene</span>
              </div>
            </>
          )}

          {mode === "inpaint" && (
            <>
              <p className="text-xs text-gray-400 mb-2">
                Paint over the area you want to change, then describe what should replace it.
              </p>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">What to fill in</label>
              <textarea
                value={inpaintPrompt}
                onChange={(e) => setInpaintPrompt(e.target.value)}
                rows={2}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white resize-y focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
                placeholder='e.g. "a golden crown" or "blue sky with clouds"'
              />
              <div className="mt-2 mb-4">
                <span className="text-xs text-gray-600">{inpaintPrompt.length} chars</span>
              </div>
            </>
          )}

          <div className="flex gap-3">
            <Button variant="ghost" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={regenerating}
              onClick={handleSubmit}
              disabled={
                (mode === "edit" && !editInstruction.trim()) ||
                (mode === "inpaint" && (!maskDataUrl || !inpaintPrompt.trim()))
              }
              className="flex-1"
            >
              {mode === "inpaint"
                ? "Inpaint"
                : mode === "edit"
                  ? "Edit Image"
                  : (scene.assetUrl ? "Regenerate Image" : "Generate Image")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

interface RefinedScene {
  sceneOrder: number;
  text: string;
  imagePrompt: string;
  visualDescription: string;
  searchQuery: string;
  duration: number;
}

interface FieldChange {
  field: string;
  old?: string;
  new?: string;
}

interface SceneChange {
  scene: number;
  type: "modified" | "added" | "removed";
  fields: FieldChange[];
}

function DiffBlock({ change }: { change: SceneChange }) {
  const [expanded, setExpanded] = useState(true);
  const label =
    change.type === "added" ? "Added" :
    change.type === "removed" ? "Removed" : `${change.fields.length} change${change.fields.length > 1 ? "s" : ""}`;
  const color =
    change.type === "added" ? "text-green-400" :
    change.type === "removed" ? "text-red-400" : "text-violet-300";

  return (
    <div className="rounded-lg border border-white/10 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-1.5 bg-white/5 hover:bg-white/10 transition-colors"
      >
        <span className="text-xs font-medium text-white">Scene {change.scene}</span>
        <span className={`text-[10px] font-medium ${color}`}>{label}</span>
      </button>
      {expanded && (
        <div className="px-3 py-2 space-y-2">
          {change.fields.map((f, i) => (
            <div key={i}>
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{f.field}</span>
              {f.old && (
                <div className="mt-0.5 rounded bg-red-500/10 border border-red-500/20 px-2 py-1">
                  <p className="text-xs text-red-300/80 line-through break-words">{f.old.length > 150 ? f.old.slice(0, 150) + "…" : f.old}</p>
                </div>
              )}
              {f.new && (
                <div className="mt-0.5 rounded bg-green-500/10 border border-green-500/20 px-2 py-1">
                  <p className="text-xs text-green-300 break-words">{f.new.length > 150 ? f.new.slice(0, 150) + "…" : f.new}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScriptChatPanel({
  videoId,
  scenes,
  onApply,
  onClose,
}: {
  videoId: string;
  scenes: Scene[];
  onApply: (refined: RefinedScene[], title: string) => void;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingResult, setPendingResult] = useState<{
    scenes: RefinedScene[];
    title: string;
    changes: SceneChange[];
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingResult]);

  async function handleSend() {
    const msg = input.trim();
    if (!msg || loading) return;

    const userMsg: ChatMsg = { role: "user", content: msg };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setPendingResult(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/videos/${videoId}/refine-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          chatHistory: messages,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessages([...newMessages, { role: "assistant", content: `Error: ${err.error || "Something went wrong"}` }]);
        return;
      }

      const data = await res.json();
      const changes: SceneChange[] = data.changes || [];
      const changedCount = changes.length;
      const briefSummary = changedCount === 0
        ? "No changes detected."
        : `${changedCount} scene${changedCount > 1 ? "s" : ""} modified:`;

      setPendingResult({
        scenes: data.scenes,
        title: data.title,
        changes,
      });
      setMessages([...newMessages, { role: "assistant", content: briefSummary }]);
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Error: Network request failed" }]);
    } finally {
      setLoading(false);
    }
  }

  function handleApply() {
    if (!pendingResult) return;
    onApply(pendingResult.scenes, pendingResult.title);
    setPendingResult(null);
    setMessages((prev) => [...prev, { role: "assistant", content: "Changes applied to the script." }]);
  }

  return (
    <div className="fixed bottom-4 right-4 w-[440px] max-h-[75vh] bg-gray-900 border border-white/10 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
          <h3 className="text-sm font-semibold text-white">Refine Script with AI</h3>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400 mb-3">Tell the AI how you&apos;d like to improve the script</p>
            <div className="space-y-1.5">
              {["Make the hook more dramatic", "Scene 3 is weak, make it more intense", "Change the tone to be funnier", "Add a plot twist at the end"].map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="block w-full text-left text-xs text-gray-500 hover:text-violet-400 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                >
                  &quot;{s}&quot;
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
              msg.role === "user"
                ? "bg-violet-600 text-white"
                : "bg-white/5 border border-white/10 text-gray-300"
            }`}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        {pendingResult && pendingResult.changes.length > 0 && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              {pendingResult.changes.map((ch, i) => (
                <DiffBlock key={i} change={ch} />
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleApply}
                className="flex-1 px-3 py-2 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-500 transition-colors"
              >
                Apply {pendingResult.changes.length} Change{pendingResult.changes.length > 1 ? "s" : ""}
              </button>
              <button
                onClick={() => setPendingResult(null)}
                className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 text-xs font-medium hover:text-white transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-white/10 p-3 shrink-0">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={1}
            placeholder="e.g. &quot;Make scene 2 more dramatic&quot;"
            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white resize-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="px-3 py-2 rounded-xl bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [previousAssetUrl, setPreviousAssetUrl] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingSceneIds, setGeneratingSceneIds] = useState<Set<string>>(new Set());
  const [chatOpen, setChatOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const loadData = useCallback(async () => {
    try {
      const [scenesRes, videoRes] = await Promise.all([
        fetch(`/api/videos/${id}/scenes`),
        fetch(`/api/videos/${id}`),
      ]);

      if (scenesRes.ok) {
        const data = await scenesRes.json();
        setScenes(
          data.scenes.map((s: Scene) => ({
            ...s,
            duration: s.duration ?? 5,
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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = scenes.findIndex((s) => s.id === active.id);
    const newIndex = scenes.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(scenes, oldIndex, newIndex).map((s, i) => ({
      ...s,
      sceneOrder: i,
    }));
    setScenes(reordered);

    fetch(`/api/videos/${id}/scenes/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sceneIds: reordered.map((s) => s.id) }),
    });
  }

  function handleUpdateScene(
    sceneId: string,
    updates: { text?: string; duration?: number }
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

  function handleDeleteScene(sceneId: string) {
    setScenes((prev) => prev.filter((s) => s.id !== sceneId));
    if (selectedSceneId === sceneId) setSelectedSceneId(null);
    fetch(`/api/videos/${id}/scenes/${sceneId}`, { method: "DELETE" });
  }

  async function generateImageForScene(
    sceneId: string,
    promptOverride?: string,
    mode: "regenerate" | "edit" | "inpaint" = "regenerate",
    referenceSceneIds?: string[],
    maskDataUrl?: string,
    modelOverride?: string
  ) {
    setGeneratingSceneIds((prev) => new Set(prev).add(sceneId));
    try {
      const body: Record<string, unknown> = { mode };
      if (promptOverride) body.imagePrompt = promptOverride;
      if (referenceSceneIds && referenceSceneIds.length > 0) body.referenceSceneIds = referenceSceneIds;
      if (maskDataUrl) body.maskDataUrl = maskDataUrl;
      if (modelOverride) body.imageModel = modelOverride;

      const res = await fetch(`/api/videos/${id}/scenes/${sceneId}/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        await loadData();
      }
    } finally {
      setGeneratingSceneIds((prev) => {
        const next = new Set(prev);
        next.delete(sceneId);
        return next;
      });
    }
  }

  async function handleGenerateAllImages() {
    setGeneratingAll(true);
    const scenesWithoutImages = scenes.filter((s) => !s.assetUrl);

    await Promise.all(
      scenesWithoutImages.map((s) => generateImageForScene(s.id))
    );

    setGeneratingAll(false);
  }

  useEffect(() => {
    if (editingScene) {
      const fresh = scenes.find((s) => s.id === editingScene.id);
      if (fresh && fresh.assetUrl !== editingScene.assetUrl) {
        setEditingScene({ ...fresh });
      }
    }
  }, [scenes, editingScene]);

  async function handleGenerateImage(prompt: string, mode: "regenerate" | "edit" | "inpaint", referenceSceneIds: string[], maskDataUrl?: string, modelOverride?: string) {
    if (!editingScene) return;
    setPreviousAssetUrl(editingScene.assetUrl);
    setRegenerating(true);
    await generateImageForScene(editingScene.id, prompt, mode, referenceSceneIds, maskDataUrl, modelOverride);
    setRegenerating(false);
  }

  async function handleUndo() {
    if (!editingScene || !previousAssetUrl) return;
    setUndoing(true);
    try {
      await fetch(`/api/videos/${id}/scenes/${editingScene.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetUrl: previousAssetUrl }),
      });
      await loadData();
      const reverted = scenes.find((s) => s.id === editingScene.id);
      setEditingScene(reverted ? { ...reverted, assetUrl: previousAssetUrl } : null);
      setPreviousAssetUrl(null);
    } finally {
      setUndoing(false);
    }
  }

  async function handleStartRendering() {
    setRendering(true);
    try {
      const res = await fetch(`/api/videos/${id}/render`, { method: "POST" });
      if (res.ok) {
        router.push(`/dashboard/videos/${id}`);
      }
    } catch {}
    setRendering(false);
  }

  async function handleApplyRefinedScript(refined: RefinedScene[], title: string) {
    const updatedScenes = [...scenes];

    for (let i = 0; i < refined.length; i++) {
      const r = refined[i];
      const existing = updatedScenes[i];

      if (existing) {
        const updates: Record<string, unknown> = {};
        if (r.text !== existing.text) updates.text = r.text;
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

  const totalDuration = scenes.reduce((s, sc) => s + sc.duration, 0);
  const allImagesGenerated = scenes.length > 0 && scenes.every((s) => s.assetUrl);
  const someImagesGenerated = scenes.some((s) => s.assetUrl);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(video?.seriesId ? `/dashboard/series/${video.seriesId}` : "/dashboard/series")}
          className="mb-4"
        >
          &larr; Back to Series
        </Button>

        <h1 className="text-2xl font-bold mb-2">
          {video?.title ?? (video?.series?.videoType === "music_video" ? "Review Song" : "Review Script")}
        </h1>
        <p className="text-gray-400 text-sm">
          {video?.series?.videoType === "music_video"
            ? "Review your song lyrics and sections, then generate preview images before creating the music video."
            : "Review your script, then generate preview images to approve before creating the video."}
        </p>
      </div>

      {/* Stats bar */}
      <Card className="mb-6">
        <CardContent className="py-3 flex items-center justify-between">
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-gray-500">Scenes:</span>{" "}
              <span className="text-white font-medium">{scenes.length}</span>
            </div>
            <div>
              <span className="text-gray-500">Duration:</span>{" "}
              <span className="text-white font-medium font-mono">{totalDuration.toFixed(1)}s</span>
            </div>
            {someImagesGenerated && (
              <div>
                <span className="text-gray-500">Images:</span>{" "}
                <span className="text-white font-medium">
                  {scenes.filter((s) => s.assetUrl).length}/{scenes.length}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!allImagesGenerated && (
              <Button
                variant="outline"
                size="sm"
                loading={generatingAll}
                onClick={handleGenerateAllImages}
                disabled={scenes.length === 0}
              >
                {someImagesGenerated ? "Generate Remaining" : "Generate Preview Images"}
              </Button>
            )}
            <Button
              variant="primary"
              loading={rendering}
              onClick={handleStartRendering}
              disabled={scenes.length === 0}
            >
              Generate Video
            </Button>
          </div>
        </CardContent>
      </Card>

      {!allImagesGenerated && scenes.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-sm text-amber-300">
            Generate preview images to see what each scene will look like before creating the video.
            You can edit prompts and regenerate until you&apos;re happy.
          </p>
        </div>
      )}

      {/* Scene list */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={scenes.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {scenes.map((scene, i) => (
              <SortableSceneCard
                key={scene.id}
                scene={scene}
                index={i}
                isSelected={scene.id === selectedSceneId}
                onSelect={() =>
                  setSelectedSceneId(scene.id === selectedSceneId ? null : scene.id)
                }
                onDelete={() => handleDeleteScene(scene.id)}
                onUpdate={(updates) => handleUpdateScene(scene.id, updates)}
                onEditPrompt={() => setEditingScene(scene)}
                generatingImage={generatingSceneIds.has(scene.id)}
                isMusicVideo={video?.series?.videoType === "music_video"}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {scenes.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          <p>No scenes to review</p>
        </div>
      )}

      {/* Bottom action */}
      {scenes.length > 0 && (
        <div className="mt-8 flex justify-center gap-3">
          {!allImagesGenerated && (
            <Button
              variant="outline"
              size="lg"
              loading={generatingAll}
              onClick={handleGenerateAllImages}
            >
              Generate Preview Images
            </Button>
          )}
          <Button
            variant="primary"
            size="lg"
            loading={rendering}
            onClick={handleStartRendering}
          >
            Generate Video ({scenes.length} scenes, {totalDuration.toFixed(0)}s)
          </Button>
        </div>
      )}

      {/* Prompt edit modal */}
      {editingScene && (
        <PromptEditModal
          scene={editingScene}
          scenes={scenes}
          imageModel={video?.series?.imageModel || "dall-e-3"}
          onClose={() => { setEditingScene(null); setPreviousAssetUrl(null); }}
          onSubmit={handleGenerateImage}
          onUndo={previousAssetUrl ? handleUndo : null}
          regenerating={regenerating}
          undoing={undoing}
        />
      )}

      {/* Floating chat button */}
      {!chatOpen && scenes.length > 0 && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-violet-600 text-white shadow-lg hover:bg-violet-500 transition-all hover:scale-105 z-40 flex items-center justify-center"
          title="Refine script with AI"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
        </button>
      )}

      {/* Script refinement chat panel */}
      {chatOpen && (
        <ScriptChatPanel
          videoId={id}
          scenes={scenes}
          onApply={handleApplyRefinedScript}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  );
}
