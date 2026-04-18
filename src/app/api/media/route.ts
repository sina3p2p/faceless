import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { series, videoProjects, videoScenes } from "@/server/db/schema";
import { getAuthUser, unauthorized } from "@/lib/api-utils";
import { eq, asc, desc, or } from "drizzle-orm";
import { getSignedDownloadUrl } from "@/lib/storage";

const PAGE_SIZE = 20;

interface MediaItem {
  id: string;
  type: "video" | "image" | "audio";
  url: string;
  videoTitle: string | null;
  seriesName: string;
  sceneIndex: number;
  prompt: string | null;
  model: string | null;
  createdAt: string;
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const tab = (searchParams.get("tab") || "images") as "videos" | "images" | "audio";
  const cursor = searchParams.get("cursor");
  const limit = Math.min(Number(searchParams.get("limit")) || PAGE_SIZE, 50);

  const userSeries = await db.query.series.findMany({
    where: eq(series.userId, user.id),
    columns: { id: true, name: true },
  });

  if (userSeries.length === 0) {
    return NextResponse.json({ items: [], nextCursor: null, total: 0 });
  }

  const seriesIds = userSeries.map((s) => s.id);
  const seriesMap = new Map(userSeries.map((s) => [s.id, s.name]));

  const projectWhere = or(...seriesIds.map((sid) => eq(videoProjects.seriesId, sid)));

  const projectQuery = cursor
    ? db.query.videoProjects.findMany({
      where: projectWhere,
      columns: { id: true, seriesId: true, title: true, outputUrl: true, createdAt: true },
      orderBy: desc(videoProjects.createdAt),
      with: {
        scenes: {
          orderBy: asc(videoScenes.sceneOrder),
          columns: {
            id: true,
            sceneOrder: true,
            imageUrl: true,
            videoUrl: true,
            audioUrl: true,
            imagePrompt: true,
            visualDescription: true,
            modelUsed: true,
            createdAt: true,
          },
        },
      },
    })
    : db.query.videoProjects.findMany({
      where: projectWhere,
      columns: { id: true, seriesId: true, title: true, outputUrl: true, createdAt: true },
      orderBy: desc(videoProjects.createdAt),
      with: {
        scenes: {
          orderBy: asc(videoScenes.sceneOrder),
          columns: {
            id: true,
            sceneOrder: true,
            videoProjectId: true,
            imageUrl: true,
            videoUrl: true,
            audioUrl: true,
            imagePrompt: true,
            visualDescription: true,
            modelUsed: true,
            createdAt: true,
          },
        },
      },
    });

  const projects = await projectQuery;

  const resolveUrl = async (key: string | null) => {
    if (!key) return null;
    if (key.startsWith("http")) return key;
    return getSignedDownloadUrl(key);
  };

  const allItems: MediaItem[] = [];

  for (const project of projects) {
    let sName = project.seriesId ? seriesMap.get(project.seriesId) : "";
    sName = sName ?? "Unknown";

    if (tab === "videos" && project.outputUrl) {
      const url = await resolveUrl(project.outputUrl);
      if (url) {
        allItems.push({
          id: `final-${project.id}`,
          type: "video",
          url,
          videoTitle: project.title,
          seriesName: sName,
          sceneIndex: -1,
          prompt: null,
          model: null,
          createdAt: project.createdAt.toISOString(),
        });
      }
    }

    for (const scene of project.scenes) {
      if (tab === "images") {
        const imgKey = scene.imageUrl;
        if (imgKey) {
          const url = await resolveUrl(imgKey);
          if (url) {
            allItems.push({
              id: `img-${scene.id}`,
              type: "image",
              url,
              videoTitle: project.title,
              seriesName: sName,
              sceneIndex: scene.sceneOrder,
              prompt: scene.imagePrompt || scene.visualDescription,
              model: scene.modelUsed,
              createdAt: scene.createdAt.toISOString(),
            });
          }
        }
      }

      if (tab === "videos" && scene.videoUrl) {
        const url = await resolveUrl(scene.videoUrl);
        if (url) {
          allItems.push({
            id: `vid-${scene.id}`,
            type: "video",
            url,
            videoTitle: project.title,
            seriesName: sName,
            sceneIndex: scene.sceneOrder,
            prompt: scene.visualDescription,
            model: scene.modelUsed,
            createdAt: scene.createdAt.toISOString(),
          });
        }
      }

      if (tab === "audio" && scene.audioUrl) {
        const url = await resolveUrl(scene.audioUrl);
        if (url) {
          allItems.push({
            id: `aud-${scene.id}`,
            type: "audio",
            url,
            videoTitle: project.title,
            seriesName: sName,
            sceneIndex: scene.sceneOrder,
            prompt: null,
            model: null,
            createdAt: scene.createdAt.toISOString(),
          });
        }
      }
    }
  }

  allItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = allItems.length;

  let startIdx = 0;
  if (cursor) {
    const cursorIdx = allItems.findIndex((item) => item.id === cursor);
    startIdx = cursorIdx >= 0 ? cursorIdx + 1 : 0;
  }

  const page = allItems.slice(startIdx, startIdx + limit);
  const nextCursor = startIdx + limit < total ? page[page.length - 1]?.id ?? null : null;

  return NextResponse.json({ items: page, nextCursor, total });
}
