import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, videoScenes } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq, asc } from "drizzle-orm";
import {
  refineNarrationScript,
  refineStory,
  refineMusicLyrics,
  type ChatMessage,
  type NarrationScript,
  type MusicLyrics,
} from "@/server/services/llm";
import { z } from "zod";

const bodySchema = z.object({
  message: z.string().min(1),
  chatHistory: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .default([]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const video = await db.query.videoProjects.findFirst({
    where: eq(videoProjects.id, id),
    with: {
      series: { columns: { userId: true, llmModel: true, videoType: true, language: true } },
      scenes: { orderBy: asc(videoScenes.sceneOrder) },
    },
  });

  if (!video || video.series.userId !== user.id) return notFound("Video not found");

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const { message, chatHistory } = parsed.data;
  const isMusic = video.series.videoType === "music_video";

  try {
    if (video.status === "REVIEW_STORY") {
      const currentStory = video.script || "";

      const refined = await refineStory(
        currentStory,
        message,
        chatHistory as ChatMessage[],
        video.series.language || "en",
        video.series.llmModel || undefined
      );

      const titleMatch = refined.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : video.title || "Untitled";

      return NextResponse.json({
        script: refined,
        title,
        scenes: [],
        changes: [{ scene: 0, type: "modified" as const, fields: [{ field: "story", old: currentStory.slice(0, 100), new: refined.slice(0, 100) }] }],
      });
    }

    if (isMusic) {
      const currentLyrics: MusicLyrics = {
        title: video.title || "Untitled",
        genre: "",
        sections: video.scenes.map((s) => ({
          sectionName: "Section",
          lyrics: s.text.split("\n"),
          durationMs: (s.duration ?? 10) * 1000,
          positiveStyles: [],
          negativeStyles: [],
        })),
      };

      const scriptJson = video.script ? JSON.parse(video.script) : null;
      if (scriptJson?.genre) currentLyrics.genre = scriptJson.genre;
      if (scriptJson?.sections) {
        for (let i = 0; i < currentLyrics.sections.length && i < scriptJson.sections.length; i++) {
          const src = scriptJson.sections[i];
          if (src.sectionName) currentLyrics.sections[i].sectionName = src.sectionName;
          if (src.positiveStyles) currentLyrics.sections[i].positiveStyles = src.positiveStyles;
          if (src.negativeStyles) currentLyrics.sections[i].negativeStyles = src.negativeStyles;
        }
      }

      const refined = await refineMusicLyrics(
        currentLyrics,
        message,
        chatHistory as ChatMessage[],
        video.series.llmModel || undefined,
        video.series.language || "en"
      );

      return NextResponse.json({
        script: refined,
        scenes: refined.sections.map((s, i) => ({
          sceneOrder: i,
          text: s.lyrics.join("\n"),
          duration: s.durationMs / 1000,
        })),
        title: refined.title,
        changes: buildChanges(video.scenes, refined.sections.map((s) => ({
          text: s.lyrics.join("\n"),
          duration: s.durationMs / 1000,
        }))),
      });
    } else if (video.status === "REVIEW_SCRIPT") {
      const currentScript: NarrationScript = {
        title: video.title || "Untitled",
        hook: "",
        scenes: video.scenes.map((s) => ({
          sceneTitle: (s as Record<string, unknown>).sceneTitle as string || "",
          text: s.text,
          directorNote: (s as Record<string, unknown>).directorNote as string || "",
          duration: s.duration ?? 5,
        })),
        cta: "",
        totalDuration: video.duration || 45,
      };

      const scriptJson = video.script ? JSON.parse(video.script) : null;
      if (scriptJson?.hook) currentScript.hook = scriptJson.hook;
      if (scriptJson?.cta) currentScript.cta = scriptJson.cta;

      const refined = await refineNarrationScript(
        currentScript,
        message,
        chatHistory as ChatMessage[],
        video.series.llmModel || undefined,
        video.series.language || "en"
      );

      return NextResponse.json({
        script: refined,
        scenes: refined.scenes.map((s, i) => ({
          sceneOrder: i,
          sceneTitle: s.sceneTitle,
          directorNote: s.directorNote,
          text: s.text,
          imagePrompt: "",
          visualDescription: "",
          duration: s.duration,
        })),
        title: refined.title,
        changes: buildChanges(video.scenes, refined.scenes),
      });
    } else {
      const currentScript: NarrationScript = {
        title: video.title || "Untitled",
        hook: "",
        scenes: video.scenes.map((s) => ({
          sceneTitle: (s as Record<string, unknown>).sceneTitle as string || "",
          text: s.text,
          directorNote: (s as Record<string, unknown>).directorNote as string || "",
          duration: s.duration ?? 5,
        })),
        cta: "",
        totalDuration: video.duration || 45,
      };

      const scriptJson = video.script ? JSON.parse(video.script) : null;
      if (scriptJson?.hook) currentScript.hook = scriptJson.hook;
      if (scriptJson?.cta) currentScript.cta = scriptJson.cta;

      const refined = await refineNarrationScript(
        currentScript,
        message,
        chatHistory as ChatMessage[],
        video.series.llmModel || undefined,
        video.series.language || "en"
      );

      return NextResponse.json({
        script: refined,
        scenes: refined.scenes.map((s, i) => ({
          sceneOrder: i,
          sceneTitle: s.sceneTitle,
          directorNote: s.directorNote,
          text: s.text,
          imagePrompt: "",
          visualDescription: "",
          duration: s.duration,
        })),
        title: refined.title,
        changes: buildChanges(video.scenes, refined.scenes),
      });
    }
  } catch (err) {
    console.error("Script refinement failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Refinement failed" },
      { status: 500 }
    );
  }
}

interface SceneLike {
  text: string;
  imagePrompt?: string | null;
  visualDescription?: string | null;
  duration?: number | null;
}

interface SceneChange {
  scene: number;
  type: "modified" | "added" | "removed";
  fields: Array<{
    field: string;
    old?: string;
    new?: string;
  }>;
}

function buildChanges(oldScenes: SceneLike[], newScenes: SceneLike[]): SceneChange[] {
  const changes: SceneChange[] = [];
  const maxLen = Math.max(oldScenes.length, newScenes.length);

  for (let i = 0; i < maxLen; i++) {
    const oldS = oldScenes[i];
    const newS = newScenes[i];

    if (!oldS && newS) {
      changes.push({
        scene: i + 1,
        type: "added",
        fields: [{ field: "narration", new: newS.text }],
      });
    } else if (oldS && !newS) {
      changes.push({
        scene: i + 1,
        type: "removed",
        fields: [{ field: "narration", old: oldS.text }],
      });
    } else if (oldS && newS) {
      const fields: SceneChange["fields"] = [];
      if (oldS.text !== newS.text) {
        fields.push({ field: "narration", old: oldS.text, new: newS.text });
      }
      if ((oldS.imagePrompt || "") !== (newS.imagePrompt || "")) {
        fields.push({ field: "image prompt", old: oldS.imagePrompt || "", new: newS.imagePrompt || "" });
      }
      if ((oldS.visualDescription || "") !== (newS.visualDescription || "")) {
        fields.push({ field: "visual description", old: oldS.visualDescription || "", new: newS.visualDescription || "" });
      }
      if ((oldS.duration ?? 0) !== (newS.duration ?? 0)) {
        fields.push({ field: "duration", old: `${oldS.duration ?? 0}s`, new: `${newS.duration ?? 0}s` });
      }
      if (fields.length > 0) {
        changes.push({ scene: i + 1, type: "modified", fields });
      }
    }
  }

  return changes;
}
