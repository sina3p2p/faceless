import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, videoScenes, series } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq, and, asc } from "drizzle-orm";
import {
  refineVideoScript,
  refineMusicScript,
  type ChatMessage,
  type VideoScript,
  type MusicScript,
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
    if (isMusic) {
      const currentScript: MusicScript = {
        title: video.title || "Untitled",
        genre: "",
        totalDuration: video.duration || 60,
        sections: video.scenes.map((s) => ({
          sectionName: s.searchQuery || "Section",
          lyrics: s.text.split("\n"),
          durationMs: (s.duration ?? 10) * 1000,
          imagePrompt: s.imagePrompt || "",
          visualDescription: s.visualDescription || "",
          positiveStyles: [],
          negativeStyles: [],
        })),
      };

      const scriptJson = video.script ? JSON.parse(video.script) : null;
      if (scriptJson?.genre) currentScript.genre = scriptJson.genre;

      const refined = await refineMusicScript(
        currentScript,
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
          imagePrompt: s.imagePrompt,
          visualDescription: s.visualDescription,
          searchQuery: s.sectionName,
          duration: s.durationMs / 1000,
        })),
        title: refined.title,
        changes: buildChanges(video.scenes, refined.sections.map((s) => ({
          text: s.lyrics.join("\n"),
          imagePrompt: s.imagePrompt,
          visualDescription: s.visualDescription,
          duration: s.durationMs / 1000,
        }))),
      });
    } else {
      const currentScript: VideoScript = {
        title: video.title || "Untitled",
        hook: "",
        scenes: video.scenes.map((s) => ({
          text: s.text,
          visualDescription: s.visualDescription || "",
          searchQuery: s.searchQuery || "",
          imagePrompt: s.imagePrompt || "",
          assetRefs: (s.assetRefs as string[]) ?? [],
          duration: s.duration ?? 5,
        })),
        cta: "",
        totalDuration: video.duration || 45,
      };

      const scriptJson = video.script ? JSON.parse(video.script) : null;
      if (scriptJson?.hook) currentScript.hook = scriptJson.hook;
      if (scriptJson?.cta) currentScript.cta = scriptJson.cta;

      const refined = await refineVideoScript(
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
          text: s.text,
          imagePrompt: s.imagePrompt,
          visualDescription: s.visualDescription,
          searchQuery: s.searchQuery,
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
