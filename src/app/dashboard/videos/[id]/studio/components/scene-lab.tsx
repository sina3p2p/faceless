"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Media, Scene, SceneFrame, VideoDetail } from "@/types/video-detail";
import type { VideoPhase } from "../../hooks/use-video-phase";
import { useStudioContext } from "../context/StudioContext";
import { BriefNode, VariantNode, SceneImageNode, ImageNode, VideoNode } from "./scene-lab/index";

const nodeTypes: NodeTypes = {
  brief: BriefNode,
  image: ImageNode,
  video: VideoNode,
  variant: VariantNode,
  sceneImage: SceneImageNode,
};

const COLUMN_GAP = 15;
const ROW_GAP = 400;
const NODE_WIDTH = 300;
// const NODE_HEIGHT = 200;
const STROKE_WIDTH = 5;

export type FrameNodeData = {
  frame: SceneFrame;
  media?: Media;
  frameIndex: number;
  phase: VideoPhase;
  defaultImageModel: string;
  generatingImage: boolean;
  onGenerateImage: (frameId: string, prompt?: string, model?: string) => void;
  onRefreshData: () => void;
};

function buildGraph(
  scene: Scene,
  phase: VideoPhase,
  video: VideoDetail | null,
  generatingFrameIds: Set<string>,
  generatingFrameVideoIds: Set<string>,
  generatingFrameMotionIds: Set<string>,
  callbacks: {
    onGenerateFrameImage: (frameId: string, prompt?: string, model?: string) => void;
    onUpdateFramePrompt: (frameId: string, prompt: string) => void;
    onUpdateFrameMotion: (frameId: string, motion: string) => void;
    onRegenerateFrameVideo: (frameId: string, videoModel?: string) => void;
    onRegenerateFrameMotion: (frameId: string) => void;
    onSelectFrameVariant: (frameId: string, variantId: string, type: "image" | "video") => void;
    onRefreshData: () => void;
  },
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const frames = scene.frames ?? [];
  const defaultImageModel = video?.series?.imageModel || "dall-e-3";
  const defaultVideoModel = video?.videoModel || video?.series?.videoModel || "";

  let x = 0;

  // Brief node
  const briefId = `brief-${scene.id}`;
  x += COLUMN_GAP;

  if (frames.length === 0 && scene.assetUrl) {
    const sceneImgId = `scene-img-${scene.id}`;
    nodes.push({
      id: sceneImgId,
      type: "sceneImage",
      position: { x, y: 0 },
      data: { assetUrl: scene.assetUrl, imagePrompt: scene.imagePrompt },
      draggable: false,
      selectable: false,
    });
    edges.push({
      id: `e-${briefId}-${sceneImgId}`,
      source: briefId,
      target: sceneImgId,
      style: { stroke: "rgba(139,92,246,0.3)", strokeWidth: 1 },
    });
    return { nodes, edges };
  }

  let frameX = 0;
  frames.forEach((frame, frameIndex) => {
    const images = frame.media?.filter(m => m.type === "image") ?? [];
    const videos = frame.media?.filter(m => m.type === "video") ?? [];

    nodes.push({
      id: frame.id,
      type: "brief",
      position: { x: frameX, y: 0 },
      data: { scene, frame, frameIndex },
      draggable: false,
      selectable: false,
    });

    if (images.length === 0) {
      nodes.push({
        id: `image-${frame.id}`,
        type: "image",
        position: { x: frameX, y: ROW_GAP },
        data: {
          frame,
          frameIndex,
          video,
          media: {
            prompt: frame.imagePrompt,
          }
        },
      });
    }

    for (const [mediaIndex, media] of images.entries()) {
      const frameMediaX = frameX + (NODE_WIDTH * mediaIndex) + (mediaIndex * COLUMN_GAP) - ((images.length - 1) * COLUMN_GAP);
      nodes.push({
        id: media.id,
        type: media.type,
        position: { x: frameMediaX, y: ROW_GAP },
        data: {
          frame,
          media,
          frameIndex,
          generatingImage: generatingFrameIds.has(frame.id),
          onGenerateImage: callbacks.onGenerateFrameImage,
          onRefreshData: callbacks.onRefreshData,
        },
        draggable: false,
        selectable: true,
      });
      edges.push({
        id: `e-${frame.id}-${media.id}`,
        source: frame.id,
        target: media.id,
        style: {
          stroke: (frame.imageMediaId === media.id)
            ? "rgba(139,92,246,0.6)"
            : "rgba(255,255,255,0.1)",
          ...(frame.imageMediaId !== media.id ? { strokeDasharray: "4 4" } : {}),
          strokeWidth: STROKE_WIDTH,
        },
      });
    }

    if (videos.length === 0) {
      const videoId = `video-${frame.id}`;
      nodes.push({
        id: videoId,
        type: "video",
        position: { x: frameX, y: 2 * ROW_GAP },
        data: {
          frame,
          frameIndex,
          video,
          media: {
            prompt: frame.visualDescription,
          }
        },
      });

      edges.push({
        id: `e-${frame.id}-${videoId}`,
        source: frame.imageMediaId ? frame.imageMediaId : `image-${frame.id}`,
        target: videoId,
        style: {
          stroke: "rgba(139,92,246,0.6)",
          strokeDasharray: "4 4",
          strokeWidth: STROKE_WIDTH,
        },
      });
    }

    for (const [mediaIndex, media] of videos.entries()) {
      const frameMediaX = frameX + (NODE_WIDTH * mediaIndex) + (mediaIndex * COLUMN_GAP) - ((images.length - 1) * COLUMN_GAP);
      nodes.push({
        id: media.id,
        type: media.type,
        position: { x: frameMediaX, y: 2 * ROW_GAP },
        data: {
          frame,
          media,
          frameIndex,
          phase,
          defaultImageModel,
          defaultVideoModel,
          videoSize: video?.series?.videoSize ?? null,
          generatingImage: generatingFrameIds.has(frame.id),
          generatingVideo: generatingFrameVideoIds.has(frame.id),
          generatingMotion: generatingFrameMotionIds.has(frame.id),
          onGenerateImage: callbacks.onGenerateFrameImage,
          onUpdatePrompt: callbacks.onUpdateFramePrompt,
          onUpdateMotion: callbacks.onUpdateFrameMotion,
          onRegenerateVideo: callbacks.onRegenerateFrameVideo,
          onRegenerateMotion: callbacks.onRegenerateFrameMotion,
          onSelectVariant: callbacks.onSelectFrameVariant,
        },
        draggable: false,
        selectable: true,
      });

      edges.push({
        id: `e-${frame.videoMediaId}-${media.id}`,
        source: frame.imageMediaId!,
        target: media.id,
        style: {
          stroke: (frame.videoMediaId === media.id)
            ? "rgba(139,92,246,0.6)"
            : "rgba(255,255,255,0.1)",
          ...(frame.videoMediaId !== media.id ? { strokeDasharray: "4 4" } : {}),
          strokeWidth: STROKE_WIDTH,
        },
      });
    }

    frameX += NODE_WIDTH * Math.max(images.length, videos.length) + COLUMN_GAP;
  });

  return { nodes, edges };
}

export function SceneLab({
  scene,
  sceneIndex,
  video,
  phase,
  generatingFrameIds,
  generatingFrameVideoIds,
  generatingFrameMotionIds,
  onGenerateFrameImage,
  onUpdateFramePrompt,
  onUpdateFrameMotion,
  onRegenerateFrameVideo,
  onRegenerateFrameMotion,
  onSelectFrameVariant,
  onRefreshData,
  onBack,
}: {
  scene: Scene;
  sceneIndex: number;
  video: VideoDetail | null;
  phase: VideoPhase;
  generatingFrameIds: Set<string>;
  generatingFrameVideoIds: Set<string>;
  generatingFrameMotionIds: Set<string>;
  onGenerateFrameImage: (frameId: string, prompt?: string, model?: string) => void;
  onUpdateFramePrompt: (frameId: string, prompt: string) => void;
  onUpdateFrameMotion: (frameId: string, motion: string) => void;
  onRegenerateFrameVideo: (frameId: string, videoModel?: string) => void;
  onRegenerateFrameMotion: (frameId: string) => void;
  onSelectFrameVariant: (frameId: string, variantId: string, type: "image" | "video") => void;
  onRefreshData: () => void;
  onBack: () => void;
}) {
  const { selectedMedia, setSelectedMedia } = useStudioContext();

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (selectedMedia) { setSelectedMedia(null); return; }
        onBack();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onBack, selectedMedia, setSelectedMedia]);

  // Clear selection when leaving lab
  useEffect(() => {
    return () => setSelectedMedia(null);
  }, [setSelectedMedia]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type !== "image" && node.type !== "video") {
      setSelectedMedia(null);
      return;
    }
    const d = node.data as { media: { id: string; type: string; url: string; modelUsed: string | null }; frame: { id: string }; frameIndex: number };
    setSelectedMedia({
      mediaId: d.media.id,
      frameId: d.frame.id,
      frameIndex: d.frameIndex,
      type: d.media.type as "image" | "video",
      url: d.media.url,
      modelUsed: d.media.modelUsed,
    });
  }, [setSelectedMedia]);

  const handlePaneClick = useCallback(() => {
    setSelectedMedia(null);
  }, [setSelectedMedia]);

  const callbacks = useMemo(() => ({
    onGenerateFrameImage,
    onUpdateFramePrompt,
    onUpdateFrameMotion,
    onRegenerateFrameVideo,
    onRegenerateFrameMotion,
    onSelectFrameVariant,
    onRefreshData,
  }), [
    onGenerateFrameImage, onUpdateFramePrompt, onUpdateFrameMotion,
    onRegenerateFrameVideo, onRegenerateFrameMotion, onSelectFrameVariant,
    onRefreshData,
  ]);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildGraph(
      scene, phase, video,
      generatingFrameIds, generatingFrameVideoIds, generatingFrameMotionIds,
      callbacks,
    ),
    [scene, phase, video, generatingFrameIds, generatingFrameVideoIds, generatingFrameMotionIds, callbacks],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onNodeDragStop = useCallback(() => { }, []);

  return (
    <div className="flex-1 relative overflow-hidden flex flex-col">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 px-6 pt-4 pb-2 shrink-0 z-10">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-white transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Storyboard
        </button>
        <span className="text-gray-700">/</span>
        <span className="text-[11px] text-white font-medium">
          Scene {sceneIndex + 1}
          {scene.sceneTitle && <span className="text-gray-400 ml-1.5">· {scene.sceneTitle}</span>}
        </span>
        <span className="ml-auto text-[10px] text-gray-600 font-mono">{scene.duration?.toFixed(1)}s</span>
      </div>

      {/* React Flow canvas */}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
          minZoom={0.15}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          panOnScroll={false}
          selectionOnDrag={false}
          nodesDraggable={true}
          nodesConnectable={false}
          edgesFocusable={true}
          className="bg-transparent!"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={64}
            size={1}
            color="rgba(255,255,255,0.5)"
          />
          <Controls
            showInteractive={false}
            className="bg-black/80! border-white/10! rounded-xl! shadow-lg! [&>button]:bg-transparent! [&>button]:border-white/5! [&>button]:text-gray-500! [&>button:hover]:text-white! [&>button]:w-8! [&>button]:h-8! [&>button>svg]:fill-current!"
            position="bottom-left"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
