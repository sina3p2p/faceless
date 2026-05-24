"use client";

import { useCallback, useRef, useState } from "react";
import type { Modifier } from "@dnd-kit/core";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;
const ZOOM_SENSITIVITY = 0.002;

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

export function useCanvasTransform() {
  const [zoom, setZoomRaw] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const setZoom = useCallback((z: number) => setZoomRaw(clampZoom(z)), []);

  // ── Wheel: Ctrl/Cmd + wheel = zoom toward cursor ──
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // let plain scroll pass through
      e.preventDefault();

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Cursor position relative to container
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      setZoomRaw((prevZoom) => {
        const delta = -e.deltaY * ZOOM_SENSITIVITY;
        const newZoom = clampZoom(prevZoom + delta);
        const ratio = newZoom / prevZoom;

        // Adjust pan so cursor position stays fixed
        setPanX((prev) => cx - ratio * (cx - prev));
        setPanY((prev) => cy - ratio * (cy - prev));

        return newZoom;
      });
    },
    []
  );

  // ── Pointer: middle button = pan ──
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 1) return; // middle button only
      e.preventDefault();
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX, panY };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [panX, panY]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!panStart.current) return;
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPanX(panStart.current.panX + dx);
      setPanY(panStart.current.panY + dy);
    },
    []
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 1) return;
      panStart.current = null;
      setIsPanning(false);
    },
    []
  );

  // ── Button controls ──
  const zoomIn = useCallback(() => {
    setZoomRaw((z) => {
      const newZoom = clampZoom(z + ZOOM_STEP);
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const ratio = newZoom / z;
        setPanX((prev) => cx - ratio * (cx - prev));
        setPanY((prev) => cy - ratio * (cy - prev));
      }
      return newZoom;
    });
  }, []);

  const zoomOut = useCallback(() => {
    setZoomRaw((z) => {
      const newZoom = clampZoom(z - ZOOM_STEP);
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const ratio = newZoom / z;
        setPanX((prev) => cx - ratio * (cx - prev));
        setPanY((prev) => cy - ratio * (cy - prev));
      }
      return newZoom;
    });
  }, []);

  const resetView = useCallback(() => {
    setZoomRaw(1);
    setPanX(0);
    setPanY(0);
  }, []);

  const fitView = useCallback((contentWidth: number, contentHeight: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || contentWidth === 0 || contentHeight === 0) return;

    const padding = 80; // px margin on each side
    const availW = rect.width - padding * 2;
    const availH = rect.height - padding * 2;

    const fitZoom = clampZoom(Math.min(availW / contentWidth, availH / contentHeight));

    const scaledW = contentWidth * fitZoom;
    const scaledH = contentHeight * fitZoom;

    setPanX((rect.width - scaledW) / 2);
    setPanY((rect.height - scaledH) / 2);
    setZoomRaw(fitZoom);
  }, []);

  // ── CSS transform for content div ──
  const contentStyle: React.CSSProperties = {
    transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
    transformOrigin: "0 0",
    willChange: "transform",
  };

  // ── dnd-kit modifier: compensate for zoom ──
  const zoomModifier: Modifier = useCallback(
    ({ transform }) => ({
      ...transform,
      x: transform.x / zoom,
      y: transform.y / zoom,
    }),
    [zoom]
  );

  return {
    zoom,
    panX,
    panY,
    isPanning,
    containerRef,
    contentStyle,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    zoomIn,
    zoomOut,
    fitView,
    resetView,
    setZoom,
    zoomModifier,
  };
}
