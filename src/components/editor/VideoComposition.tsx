"use client";

import { useMemo } from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Video,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

import type { EditorScene } from "@/types/editor";
import type { WordTimestamp } from "@/types/tts";

interface VideoCompositionProps {
  scenes: EditorScene[];
  fps: number;
}

function SceneMedia({
  scene,
  durationInFrames,
  sceneIndex,
}: {
  scene: EditorScene;
  durationInFrames: number;
  sceneIndex: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = frame / durationInFrames;

  if (scene.assetType === "video") {
    return (
      <Video
        src={scene.assetUrl}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
    );
  }

  const zoomVariants = [
    { from: 1, to: 1.15 },
    { from: 1.15, to: 1 },
    { from: 1, to: 1.1 },
    { from: 1.1, to: 1.02 },
  ];
  const variant = zoomVariants[sceneIndex % zoomVariants.length];
  const scale = interpolate(progress, [0, 1], [variant.from, variant.to]);

  const panX = interpolate(
    progress,
    [0, 1],
    sceneIndex % 2 === 0 ? [0, -3] : [-2, 2]
  );
  const panY = interpolate(
    progress,
    [0, 1],
    sceneIndex % 3 === 0 ? [0, -2] : [-1, 1]
  );

  const opacity = interpolate(frame, [0, fps * 0.3], [0, 1], {
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - fps * 0.4, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp" }
  );

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", opacity: Math.min(opacity, fadeOut) }}>
      <Img
        src={scene.assetUrl}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translate(${panX}%, ${panY}%)`,
        }}
      />
    </div>
  );
}

function WordCaptions({
  scene,
  durationInFrames,
}: {
  scene: EditorScene;
  durationInFrames: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  const timestamps =
    scene.wordTimestamps.length > 0
      ? scene.wordTimestamps
      : estimateTimestamps(scene.text, durationInFrames / fps);

  const wordsPerGroup = 3;
  const groups: { text: string; start: number; end: number }[] = [];
  for (let i = 0; i < timestamps.length; i += wordsPerGroup) {
    const chunk = timestamps.slice(i, i + wordsPerGroup);
    groups.push({
      text: chunk.map((w) => w.word).join(" "),
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end,
    });
  }

  const activeGroup = groups.find(
    (g) => currentTime >= g.start && currentTime < g.end + 0.1
  );

  if (!activeGroup) return null;

  const groupProgress = interpolate(
    currentTime,
    [activeGroup.start, activeGroup.start + 0.08],
    [0, 1],
    { extrapolateRight: "clamp" }
  );

  const scaleAnim = spring({
    frame: Math.max(0, frame - Math.floor(activeGroup.start * fps)),
    fps,
    config: { damping: 15, stiffness: 200 },
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: "22%",
      }}
    >
      <div
        style={{
          opacity: groupProgress,
          transform: `scale(${0.8 + scaleAnim * 0.2})`,
          textAlign: "center",
          padding: "8px 24px",
          maxWidth: "90%",
        }}
      >
        <span
          style={{
            fontSize: 52,
            fontWeight: 800,
            color: "white",
            textTransform: "uppercase",
            textShadow:
              "0 0 8px rgba(0,0,0,0.9), 0 2px 4px rgba(0,0,0,0.8), 0 4px 8px rgba(0,0,0,0.5)",
            letterSpacing: 1,
            lineHeight: 1.2,
          }}
        >
          {activeGroup.text}
        </span>
      </div>
    </AbsoluteFill>
  );
}

function estimateTimestamps(
  text: string,
  duration: number
): WordTimestamp[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const perWord = duration / words.length;
  return words.map((word, i) => ({
    word,
    start: i * perWord,
    end: (i + 1) * perWord,
  }));
}

export function VideoComposition({ scenes, fps }: VideoCompositionProps) {
  const sceneFrameOffsets = useMemo(() => {
    let frameOffset = 0;
    const sceneFrameOffsets = [];
    for (const scene of scenes) {
      const durationInFrames = Math.round(scene.duration * fps);
      sceneFrameOffsets.push({
        ...scene,
        from: frameOffset,
        durationInFrames,
      });
      frameOffset += durationInFrames;

    }
    return sceneFrameOffsets;
  }, [scenes, fps]);

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {sceneFrameOffsets.map((scene, i) => (
        <Sequence
          key={scene.id}
          from={scene.from}
          durationInFrames={scene.durationInFrames}
        >
          <AbsoluteFill>
            <SceneMedia
              scene={scene}
              durationInFrames={scene.durationInFrames}
              sceneIndex={i}
            />
            {scene.audioUrl && <Audio src={scene.audioUrl} />}
            <WordCaptions
              scene={scene}
              durationInFrames={scene.durationInFrames}
            />
          </AbsoluteFill>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
