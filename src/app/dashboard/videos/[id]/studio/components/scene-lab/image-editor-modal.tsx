"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

// ── Types ──

type Tool = "crop" | "select" | "draw" | "none";
type CropAspect = "16:9" | "9:16" | "1:1" | "free";

interface HistoryEntry {
  url: string;
  prompt: string;
  timestamp: number;
}

interface CropRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ImageEditorModalProps {
  imageUrl: string;
  aspectRatio?: string;
  onClose: () => void;
  onSave: (imageUrl: string) => void;
}

const EDIT_MODELS = [
  { id: "nano-banana-2", label: "Nano Banana 2" },
  { id: "nano-banana-pro", label: "Nano Banana Pro" },
] as const;

// ── Helpers ──

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function getAspectRatio(aspect: CropAspect): number | null {
  if (aspect === "16:9") return 16 / 9;
  if (aspect === "9:16") return 9 / 16;
  if (aspect === "1:1") return 1;
  return null;
}

function fitCropToAspect(
  aspect: CropAspect,
  imgW: number,
  imgH: number,
): CropRegion {
  const ratio = getAspectRatio(aspect);
  if (!ratio) return { x: 0, y: 0, w: imgW, h: imgH };

  let w = imgW;
  let h = w / ratio;
  if (h > imgH) {
    h = imgH;
    w = h * ratio;
  }
  return {
    x: (imgW - w) / 2,
    y: (imgH - h) / 2,
    w,
    h,
  };
}

// ── Component ──

export function ImageEditorModal({
  imageUrl,
  aspectRatio: defaultAR,
  onClose,
  onSave,
}: ImageEditorModalProps) {
  // Tool state
  const [activeTool, setActiveTool] = useState<Tool>("none");
  const [showCropMenu, setShowCropMenu] = useState(false);
  const [cropAspect, setCropAspect] = useState<CropAspect>("free");

  // Image state
  const [currentImage, setCurrentImage] = useState(imageUrl);
  const [proxiedUrl, setProxiedUrl] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState<string>("nano-banana-2");
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(true);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([
    { url: imageUrl, prompt: "Original", timestamp: Date.now() },
  ]);

  // Canvas / layout refs
  const containerRef = useRef<HTMLDivElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imgDims, setImgDims] = useState<{
    w: number;
    h: number;
    displayW: number;
    displayH: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  // Draw state
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(20);
  const [hasDrawing, setHasDrawing] = useState(false);

  // Selection (marquee) state
  const [selection, setSelection] = useState<CropRegion | null>(null);
  const [selectionStart, setSelectionStart] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Crop state
  const [cropRegion, setCropRegion] = useState<CropRegion | null>(null);
  const [cropDragStart, setCropDragStart] = useState<{
    x: number;
    y: number;
    region: CropRegion;
  } | null>(null);

  // ── Proxy image through our server to avoid R2 CORS issues ──

  useEffect(() => {
    let revoke: string | null = null;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          `/api/proxy-image?url=${encodeURIComponent(currentImage)}`,
        );
        if (!res.ok || cancelled) return;
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        revoke = url;
        setProxiedUrl(url);
      } catch {
        if (!cancelled) setProxiedUrl(currentImage);
      }
    }

    load();
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [currentImage]);

  // ── Compute image display dimensions ──

  const computeImageDims = useCallback(() => {
    const img = imageRef.current;
    const container = containerRef.current;
    if (!img || !container || !img.naturalWidth) return;

    const cW = container.clientWidth;
    const cH = container.clientHeight;
    const iW = img.naturalWidth;
    const iH = img.naturalHeight;

    const scale = Math.min(cW / iW, cH / iH, 1);
    const displayW = iW * scale;
    const displayH = iH * scale;
    const offsetX = (cW - displayW) / 2;
    const offsetY = (cH - displayH) / 2;

    setImgDims({ w: iW, h: iH, displayW, displayH, offsetX, offsetY });
  }, []);

  useEffect(() => {
    const observer = new ResizeObserver(computeImageDims);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [computeImageDims]);

  // ── Sync draw canvas size ──

  useEffect(() => {
    if (!imgDims || !drawCanvasRef.current) return;
    const canvas = drawCanvasRef.current;
    canvas.width = imgDims.displayW;
    canvas.height = imgDims.displayH;
    setHasDrawing(false);
  }, [imgDims]);

  // ── Drawing handlers ──

  const getCanvasPos = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = drawCanvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    [],
  );

  const handleDrawStart = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (activeTool !== "draw") return;
      setIsDrawing(true);
      const ctx = drawCanvasRef.current?.getContext("2d");
      if (!ctx) return;
      const pos = getCanvasPos(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.strokeStyle = "rgba(168, 85, 247, 0.5)";
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    },
    [activeTool, brushSize, getCanvasPos],
  );

  const handleDrawMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing || activeTool !== "draw") return;
      const ctx = drawCanvasRef.current?.getContext("2d");
      if (!ctx) return;
      const pos = getCanvasPos(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      setHasDrawing(true);
    },
    [isDrawing, activeTool, getCanvasPos],
  );

  const handleDrawEnd = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const clearDrawing = useCallback(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawing(false);
  }, []);

  // ── Selection (marquee) handlers ──

  function getRelativePos(e: React.PointerEvent) {
    const container = containerRef.current;
    if (!container || !imgDims) return null;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left - imgDims.offsetX;
    const y = e.clientY - rect.top - imgDims.offsetY;
    return {
      x: clamp(x, 0, imgDims.displayW),
      y: clamp(y, 0, imgDims.displayH),
    };
  }

  function handleSelectPointerDown(e: React.PointerEvent) {
    if (activeTool !== "select") return;
    const pos = getRelativePos(e);
    if (!pos) return;
    setSelectionStart(pos);
    setSelection(null);
    e.preventDefault();
  }

  function handleSelectPointerMove(e: React.PointerEvent) {
    if (activeTool !== "select" || !selectionStart || !imgDims) return;
    const pos = getRelativePos(e);
    if (!pos) return;

    const x = Math.min(selectionStart.x, pos.x);
    const y = Math.min(selectionStart.y, pos.y);
    const w = Math.abs(pos.x - selectionStart.x);
    const h = Math.abs(pos.y - selectionStart.y);
    setSelection({ x, y, w, h });
  }

  function handleSelectPointerUp() {
    setSelectionStart(null);
  }

  function clearSelection() {
    setSelection(null);
    setSelectionStart(null);
  }

  const hasSelection = selection !== null && selection.w > 4 && selection.h > 4;

  // ── Crop handlers ──

  function initCrop(aspect: CropAspect) {
    setCropAspect(aspect);
    if (!imgDims) return;
    const region = fitCropToAspect(aspect, imgDims.displayW, imgDims.displayH);
    setCropRegion(region);
  }

  function handleCropPointerDown(e: React.PointerEvent) {
    if (!cropRegion || !imgDims) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left - imgDims.offsetX;
    const y = e.clientY - rect.top - imgDims.offsetY;

    if (
      x >= cropRegion.x &&
      x <= cropRegion.x + cropRegion.w &&
      y >= cropRegion.y &&
      y <= cropRegion.y + cropRegion.h
    ) {
      setCropDragStart({ x, y, region: { ...cropRegion } });
      e.preventDefault();
    }
  }

  function handleCropPointerMove(e: React.PointerEvent) {
    if (!cropDragStart || !cropRegion || !imgDims) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left - imgDims.offsetX;
    const y = e.clientY - rect.top - imgDims.offsetY;
    const dx = x - cropDragStart.x;
    const dy = y - cropDragStart.y;

    const newX = clamp(
      cropDragStart.region.x + dx,
      0,
      imgDims.displayW - cropRegion.w,
    );
    const newY = clamp(
      cropDragStart.region.y + dy,
      0,
      imgDims.displayH - cropRegion.h,
    );
    setCropRegion({ ...cropRegion, x: newX, y: newY });
  }

  function handleCropPointerUp() {
    setCropDragStart(null);
  }

  async function applyCrop() {
    if (!cropRegion || !imgDims || !imageRef.current) return;
    setLoading(true);

    try {
      const img = imageRef.current;
      const scaleX = img.naturalWidth / imgDims.displayW;
      const scaleY = img.naturalHeight / imgDims.displayH;

      const canvas = document.createElement("canvas");
      const cropW = Math.round(cropRegion.w * scaleX);
      const cropH = Math.round(cropRegion.h * scaleY);
      canvas.width = cropW;
      canvas.height = cropH;

      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(
        img,
        cropRegion.x * scaleX,
        cropRegion.y * scaleY,
        cropW,
        cropH,
        0,
        0,
        cropW,
        cropH,
      );

      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.92),
      );

      const fd = new FormData();
      fd.append("file", blob, "cropped.jpg");
      const res = await fetch("/api/upload-temp", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();

      setCurrentImage(url);
      setHistory((prev) => [
        ...prev,
        {
          url,
          prompt: `Cropped (${cropAspect})`,
          timestamp: Date.now(),
        },
      ]);
      setCropRegion(null);
      setActiveTool("none");
    } catch (err) {
      console.error("Crop failed:", err);
    } finally {
      setLoading(false);
    }
  }

  // ── AI Edit handler ──

  async function handleSubmitEdit() {
    if (!editPrompt.trim() || loading) return;
    setLoading(true);

    try {
      const hasAnnotations =
        (hasDrawing && drawCanvasRef.current) || (hasSelection && selection);

      let annotatedImageUrl: string | undefined;

      // Build an annotated image showing highlights/selection as a visual guide
      if (hasAnnotations && imageRef.current && imgDims) {
        const composite = document.createElement("canvas");
        composite.width = imageRef.current.naturalWidth;
        composite.height = imageRef.current.naturalHeight;
        const ctx = composite.getContext("2d")!;

        ctx.drawImage(imageRef.current, 0, 0);

        const scaleX = composite.width / imgDims.displayW;
        const scaleY = composite.height / imgDims.displayH;

        if (hasDrawing && drawCanvasRef.current) {
          ctx.save();
          ctx.scale(scaleX, scaleY);
          ctx.drawImage(drawCanvasRef.current, 0, 0);
          ctx.restore();
        }

        if (hasSelection && selection) {
          ctx.save();
          ctx.strokeStyle = "rgba(255, 0, 0, 0.9)";
          ctx.lineWidth = 4 * scaleX;
          ctx.setLineDash([12 * scaleX, 8 * scaleX]);
          ctx.strokeRect(
            selection.x * scaleX,
            selection.y * scaleY,
            selection.w * scaleX,
            selection.h * scaleY,
          );
          // Semi-transparent fill so the region stands out
          ctx.fillStyle = "rgba(255, 0, 0, 0.12)";
          ctx.fillRect(
            selection.x * scaleX,
            selection.y * scaleY,
            selection.w * scaleX,
            selection.h * scaleY,
          );
          ctx.restore();
        }

        const blob = await new Promise<Blob>((resolve) =>
          composite.toBlob((b) => resolve(b!), "image/jpeg", 0.92),
        );
        const fd = new FormData();
        fd.append("file", blob, "annotated.jpg");
        const uploadRes = await fetch("/api/upload-temp", {
          method: "POST",
          body: fd,
        });
        if (uploadRes.ok) {
          const { url } = await uploadRes.json();
          annotatedImageUrl = url;
        }
      }

      const res = await fetch("/api/edit-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceImageUrl: currentImage,
          annotatedImageUrl,
          editPrompt: editPrompt.trim(),
          model: selectedModel,
          aspectRatio: defaultAR || "9:16",
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Edit failed");
      }

      const { url: newUrl } = await res.json();
      setCurrentImage(newUrl);
      setHistory((prev) => [
        ...prev,
        { url: newUrl, prompt: editPrompt.trim(), timestamp: Date.now() },
      ]);
      setEditPrompt("");
      clearDrawing();
      clearSelection();
    } catch (err) {
      console.error("Edit failed:", err);
    } finally {
      setLoading(false);
    }
  }

  // ── Keyboard ──

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (activeTool !== "none") {
          setActiveTool("none");
          setCropRegion(null);
          clearDrawing();
          clearSelection();
        } else {
          onClose();
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeTool, clearDrawing, onClose]);

  // ── Tool selection ──

  function selectTool(tool: Tool) {
    if (tool === activeTool) {
      setActiveTool("none");
      setCropRegion(null);
      setShowCropMenu(false);
      return;
    }

    if (tool === "crop") {
      setShowCropMenu(true);
      clearDrawing();
      clearSelection();
    } else {
      setShowCropMenu(false);
      setCropRegion(null);
    }

    if (tool === "select") {
      setCropRegion(null);
      clearDrawing();
    }

    if (tool === "draw") {
      setCropRegion(null);
      clearSelection();
    }

    setActiveTool(tool);
  }

  // ── Render ──

  const currentModel = EDIT_MODELS.find((m) => m.id === selectedModel);

  return createPortal(
    <div className="fixed inset-0 z-9999 bg-[#111] flex flex-col select-none">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Image Editor
        </button>

        <div className="flex items-center gap-3">
          {currentImage !== imageUrl && (
            <a
              href={currentImage}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-gray-400 hover:text-white border border-white/10 hover:border-white/20 transition-colors"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                />
              </svg>
              Download
            </a>
          )}
          <button
            onClick={() => setShowHistory((h) => !h)}
            className={`px-3 py-1.5 rounded-lg text-[12px] border transition-colors ${
              showHistory
                ? "text-white border-white/20 bg-white/5"
                : "text-gray-500 border-white/10 hover:text-white"
            }`}
          >
            {showHistory ? "Hide history" : "Show history"}
          </button>
          <button
            onClick={() => {
              if (currentImage !== imageUrl) onSave(currentImage);
              onClose();
            }}
            className="px-4 py-1.5 rounded-lg bg-white text-black text-[12px] font-semibold hover:bg-gray-200 transition-colors"
          >
            Done
          </button>
        </div>
      </div>

      {/* ── Main area ── */}
      <div className="flex flex-1 min-h-0">
        {/* ── Left toolbar ── */}
        <div className="w-12 shrink-0 flex flex-col items-center gap-1 pt-4 border-r border-white/5">
          {/* Crop */}
          <div className="relative">
            <ToolButton
              active={activeTool === "crop"}
              onClick={() => selectTool("crop")}
              title="Crop"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5M20.25 16.5V18A2.25 2.25 0 0118 20.25h-1.5M3.75 16.5V18A2.25 2.25 0 006 20.25h1.5"
                />
              </svg>
            </ToolButton>

            {/* Crop aspect ratio menu */}
            {showCropMenu && activeTool === "crop" && (
              <div className="absolute left-full ml-2 top-0 w-52 rounded-xl bg-[#2a2a2a] border border-white/10 shadow-2xl overflow-hidden z-50">
                {(
                  [
                    { id: "16:9", label: "Landscape (16:9)", icon: "▭" },
                    { id: "9:16", label: "Portrait (9:16)", icon: "▯" },
                    { id: "1:1", label: "Square (1:1)", icon: "□" },
                    { id: "free", label: "Freeform", icon: "⛶" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      initCrop(opt.id);
                      setShowCropMenu(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-[13px] text-left transition-colors ${
                      cropAspect === opt.id
                        ? "bg-white/10 text-white"
                        : "text-gray-300 hover:bg-white/5"
                    }`}
                  >
                    <span className="text-lg opacity-60">{opt.icon}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Select / marquee */}
          <ToolButton
            active={activeTool === "select"}
            onClick={() => selectTool("select")}
            title="Select area"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="3 3"
                d="M3 3h18v18H3z"
              />
            </svg>
          </ToolButton>

          {/* Draw */}
          <ToolButton
            active={activeTool === "draw"}
            onClick={() => selectTool("draw")}
            title="Draw mask"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42"
              />
            </svg>
          </ToolButton>

          {/* Clear selection / drawing */}
          {(hasDrawing || hasSelection) && (
            <ToolButton active={false} onClick={() => { clearDrawing(); clearSelection(); }} title="Clear annotations">
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </ToolButton>
          )}

          {/* Brush size (when draw active) */}
          {activeTool === "draw" && (
            <div className="mt-2 flex flex-col items-center gap-1.5">
              <input
                type="range"
                min={4}
                max={60}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-8 h-20 appearance-none cursor-pointer [writing-mode:vertical-lr] [direction:rtl] accent-violet-500"
              />
              <span className="text-[9px] text-gray-500">{brushSize}px</span>
            </div>
          )}
        </div>

        {/* ── Canvas area ── */}
        <div className="flex-1 relative flex items-center justify-center overflow-hidden p-6">
          <div
            ref={containerRef}
            className="relative w-full h-full flex items-center justify-center"
            onPointerDown={
              activeTool === "select" ? handleSelectPointerDown : undefined
            }
            onPointerMove={
              activeTool === "crop"
                ? handleCropPointerMove
                : activeTool === "select"
                  ? handleSelectPointerMove
                  : undefined
            }
            onPointerUp={
              activeTool === "crop"
                ? handleCropPointerUp
                : activeTool === "select"
                  ? handleSelectPointerUp
                  : undefined
            }
            style={{
              cursor: activeTool === "select" ? "crosshair" : undefined,
            }}
          >
            {/* Main image (loaded via proxy blob URL to avoid CORS) */}
            {proxiedUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                ref={imageRef}
                src={proxiedUrl}
                alt=""
                onLoad={computeImageDims}
                className="max-w-full max-h-full object-contain rounded-xl"
                style={{ pointerEvents: "none" }}
              />
            ) : (
              <div className="flex items-center gap-2">
                <div className="animate-spin w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full" />
                <span className="text-sm text-gray-400">Loading image...</span>
              </div>
            )}

            {/* Draw canvas overlay (always mounted to preserve drawings) */}
            {imgDims && (activeTool === "draw" || hasDrawing) && (
              <canvas
                ref={drawCanvasRef}
                className={`absolute rounded-xl ${activeTool !== "draw" ? "pointer-events-none" : ""}`}
                style={{
                  width: imgDims.displayW,
                  height: imgDims.displayH,
                  left: imgDims.offsetX,
                  top: imgDims.offsetY,
                  cursor: activeTool === "draw" ? "crosshair" : "default",
                }}
                onPointerDown={handleDrawStart}
                onPointerMove={handleDrawMove}
                onPointerUp={handleDrawEnd}
                onPointerLeave={handleDrawEnd}
              />
            )}

            {/* Selection (marquee) overlay */}
            {imgDims && selection && (selection.w > 2 || selection.h > 2) && (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: imgDims.offsetX + selection.x,
                  top: imgDims.offsetY + selection.y,
                  width: selection.w,
                  height: selection.h,
                }}
              >
                {/* Animated dashed border */}
                <div
                  className="absolute inset-0 border-2 border-white/80 rounded-sm"
                  style={{
                    borderStyle: "dashed",
                    backgroundImage:
                      "repeating-linear-gradient(45deg, rgba(168,85,247,0.08) 0, rgba(168,85,247,0.08) 10px, transparent 10px, transparent 20px)",
                  }}
                />
                {/* Corner dots */}
                {[
                  { top: -3, left: -3 },
                  { top: -3, right: -3 },
                  { bottom: -3, left: -3 },
                  { bottom: -3, right: -3 },
                ].map((pos, i) => (
                  <div
                    key={i}
                    className="absolute w-1.5 h-1.5 bg-white rounded-full shadow"
                    style={pos as React.CSSProperties}
                  />
                ))}
                {/* Label */}
                <div
                  className="absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-black/70 text-[9px] text-white whitespace-nowrap"
                >
                  {Math.round(selection.w)} × {Math.round(selection.h)}
                </div>
              </div>
            )}

            {/* Crop overlay */}
            {imgDims && cropRegion && activeTool === "crop" && (
              <div
                className="absolute"
                style={{
                  left: imgDims.offsetX,
                  top: imgDims.offsetY,
                  width: imgDims.displayW,
                  height: imgDims.displayH,
                }}
              >
                {/* Darkened overlay */}
                <div className="absolute inset-0 pointer-events-none">
                  {/* Top */}
                  <div
                    className="absolute bg-black/60"
                    style={{
                      top: 0,
                      left: 0,
                      right: 0,
                      height: cropRegion.y,
                    }}
                  />
                  {/* Bottom */}
                  <div
                    className="absolute bg-black/60"
                    style={{
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: imgDims.displayH - cropRegion.y - cropRegion.h,
                    }}
                  />
                  {/* Left */}
                  <div
                    className="absolute bg-black/60"
                    style={{
                      top: cropRegion.y,
                      left: 0,
                      width: cropRegion.x,
                      height: cropRegion.h,
                    }}
                  />
                  {/* Right */}
                  <div
                    className="absolute bg-black/60"
                    style={{
                      top: cropRegion.y,
                      right: 0,
                      width: imgDims.displayW - cropRegion.x - cropRegion.w,
                      height: cropRegion.h,
                    }}
                  />
                </div>

                {/* Crop region handle */}
                <div
                  className="absolute border-2 border-white/80 cursor-move"
                  style={{
                    left: cropRegion.x,
                    top: cropRegion.y,
                    width: cropRegion.w,
                    height: cropRegion.h,
                  }}
                  onPointerDown={handleCropPointerDown}
                >
                  {/* Grid lines */}
                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div key={i} className="border border-white/20" />
                    ))}
                  </div>

                  {/* Corner handles */}
                  {[
                    "top-0 left-0 -translate-x-1/2 -translate-y-1/2",
                    "top-0 right-0 translate-x-1/2 -translate-y-1/2",
                    "bottom-0 left-0 -translate-x-1/2 translate-y-1/2",
                    "bottom-0 right-0 translate-x-1/2 translate-y-1/2",
                  ].map((pos, i) => (
                    <div
                      key={i}
                      className={`absolute ${pos} w-3 h-3 bg-white rounded-full shadow-lg pointer-events-none`}
                    />
                  ))}
                </div>

                {/* Apply crop button */}
                <div
                  className="absolute flex gap-2"
                  style={{
                    left: cropRegion.x + cropRegion.w / 2,
                    top: cropRegion.y + cropRegion.h + 12,
                    transform: "translateX(-50%)",
                  }}
                >
                  <button
                    onClick={() => {
                      setCropRegion(null);
                      setActiveTool("none");
                    }}
                    className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-[11px] font-medium hover:bg-white/20 transition-colors backdrop-blur-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={applyCrop}
                    disabled={loading}
                    className="px-3 py-1.5 rounded-lg bg-white text-black text-[11px] font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50"
                  >
                    {loading ? "Cropping..." : "Apply Crop"}
                  </button>
                </div>
              </div>
            )}

            {/* Loading overlay */}
            {loading && (
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center rounded-xl">
                <div className="flex flex-col items-center gap-3">
                  <div className="animate-spin w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full" />
                  <span className="text-sm text-violet-300 font-medium">
                    Editing...
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── History panel ── */}
        {showHistory && history.length > 1 && (
          <div className="w-56 shrink-0 border-l border-white/5 overflow-y-auto p-3 space-y-3">
            <span className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold">
              History
            </span>
            {[...history].reverse().map((entry, i) => {
              const isActive = entry.url === currentImage;
              return (
                <button
                  key={entry.timestamp}
                  onClick={() => setCurrentImage(entry.url)}
                  className={`w-full rounded-xl overflow-hidden border-2 transition-all ${
                    isActive
                      ? "border-violet-500 ring-1 ring-violet-500/30"
                      : "border-white/10 opacity-60 hover:opacity-90 hover:border-white/20"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/proxy-image?url=${encodeURIComponent(entry.url)}`}
                    alt=""
                    className="w-full aspect-video object-cover"
                  />
                  <div className="px-2.5 py-2 text-left">
                    <p className="text-[11px] text-gray-300 line-clamp-2 leading-relaxed">
                      {entry.prompt}
                    </p>
                    {i < history.length - 1 && (
                      <span className="text-[9px] text-gray-600 mt-0.5 block">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Bottom bar ── */}
      <div className="px-5 py-4 border-t border-white/5 shrink-0">
        <div className="max-w-3xl mx-auto flex items-end gap-3">
          <div className="flex-1 relative bg-[#2a2a2a] rounded-2xl border border-white/10 focus-within:border-white/20 transition-colors">
            <textarea
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmitEdit();
                }
              }}
              rows={1}
              placeholder="What do you want to change?"
              className="w-full bg-transparent text-[14px] text-white placeholder:text-gray-500 resize-none outline-none px-4 pt-3 pb-10"
            />
            <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Model picker */}
                <div className="relative">
                  <button
                    onClick={() => setShowModelMenu((v) => !v)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-[12px] text-gray-300"
                  >
                    <span>🍌</span>
                    <span>{currentModel?.label || selectedModel}</span>
                    <svg
                      className={`w-3 h-3 text-gray-500 transition-transform ${showModelMenu ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m19.5 8.25-7.5 7.5-7.5-7.5"
                      />
                    </svg>
                  </button>

                  {showModelMenu && (
                    <div className="absolute bottom-full mb-2 left-0 w-48 rounded-xl bg-[#2a2a2a] border border-white/10 shadow-2xl overflow-hidden z-50">
                      {EDIT_MODELS.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => {
                            setSelectedModel(m.id);
                            setShowModelMenu(false);
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2.5 text-[12px] text-left transition-colors ${
                            selectedModel === m.id
                              ? "bg-violet-500/20 text-violet-300"
                              : "text-gray-300 hover:bg-white/5"
                          }`}
                        >
                          <span>🍌</span>
                          {m.label}
                          {selectedModel === m.id && (
                            <svg
                              className="w-3.5 h-3.5 ml-auto text-violet-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2.5}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmitEdit}
                disabled={!editPrompt.trim() || loading}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10 flex items-center justify-center transition-colors"
              >
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Sub-components ──

function ToolButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
        active
          ? "bg-white/15 text-white"
          : "text-gray-500 hover:text-white hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}
