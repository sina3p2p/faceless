import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, videoScenes } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq, asc } from "drizzle-orm";
import {
  refineNarrationScript,
  refineStory,
  refineMusicLyrics,
  safeParseMusicLyricsScript,
  parseLyricsBodyIntoSections,
  type ChatMessage,
  type NarrationScript,
  type MusicLyricsScript,
} from "@/server/services/llm";
import { z } from "zod";

function buildMusicLyricsFromVideo(video: {
  script: string | null;
  title: string | null;
  scenes: Array<{ sceneTitle?: string | null; text: string; duration?: number | null }>;
}): MusicLyricsScript {
  const parsed = safeParseMusicLyricsScript(video.script ?? "");
  if (parsed) return parsed;
  const lines: string[] = [];
  for (const s of video.scenes) {
    lines.push(`## ${s.sceneTitle?.trim() || "Section"}`, s.text, "");
  }
  return {
    title: video.title ?? "Untitled",
    lyrics: lines.join("\n").trim(),
  };
}

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

  if (!video || video.userId !== user.id) return notFound("Video not found");

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const { message, chatHistory } = parsed.data;
  const isMusic = video.videoType === "music_video";

  try {
    if (video.status === "REVIEW_STORY") {
      const currentStory = video.script || "";

      if (isMusic) {
        const parsed = safeParseMusicLyricsScript(currentStory);
        if (parsed) {
          const refined = await refineMusicLyrics(
            parsed,
            message,
            chatHistory as ChatMessage[],
            video.llmModel || undefined,
            video.language || "en"
          );
          const next = JSON.stringify(refined);
          return NextResponse.json({
            script: next,
            title: refined.title,
            scenes: [],
            changes: [
              {
                scene: 0,
                type: "modified" as const,
                fields: [{ field: "story", old: currentStory.slice(0, 100), new: next.slice(0, 100) }],
              },
            ],
          });
        }
      }

      const refined = await refineStory(
        currentStory,
        message,
        chatHistory as ChatMessage[],
        video.language || "en",
        video.llmModel || undefined
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
      const current = buildMusicLyricsFromVideo({
        script: video.script,
        title: video.title,
        scenes: video.scenes,
      });

      const refined = await refineMusicLyrics(
        current,
        message,
        chatHistory as ChatMessage[],
        video.llmModel || undefined,
        video.language || "en"
      );

      const sections = parseLyricsBodyIntoSections(refined.lyrics);
      const newScenePayload = sections.map((sec, i) => ({
        text: sec.body,
        duration: video.scenes[i]?.duration ?? 10,
      }));

      const scriptJson = JSON.stringify(refined);

      return NextResponse.json({
        script: scriptJson,
        scenes: sections.map((sec, i) => ({
          sceneOrder: i,
          text: sec.body,
          duration: video.scenes[i]?.duration ?? 10,
        })),
        title: refined.title,
        changes: buildChanges(video.scenes, newScenePayload),
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
        video.llmModel || undefined,
        video.language || "en"
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
        video.llmModel || undefined,
        video.language || "en"
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
