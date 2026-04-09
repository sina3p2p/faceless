import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { series, videoProjects, videoScenes } from "@/server/db/schema";
import { getAuthUser, unauthorized } from "@/lib/api-utils";
import { eq, asc, desc, and, isNotNull, or } from "drizzle-orm";
import { getSignedDownloadUrl } from "@/lib/storage";

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

export async function GET() {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const userSeries = await db.query.series.findMany({
    where: eq(series.userId, user.id),
    columns: { id: true, name: true },
  });

  if (userSeries.length === 0) {
    return NextResponse.json({ videos: [], images: [], audio: [] });
  }

  const seriesIds = userSeries.map((s) => s.id);
  const seriesMap = new Map(userSeries.map((s) => [s.id, s.name]));

  const projects = await db.query.videoProjects.findMany({
    where: or(...seriesIds.map((sid) => eq(videoProjects.seriesId, sid))),
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
          assetUrl: true,
          assetType: true,
          imagePrompt: true,
          visualDescription: true,
          modelUsed: true,
          createdAt: true,
        },
      },
    },
  });

  const images: MediaItem[] = [];
  const videoClips: MediaItem[] = [];
  const audioItems: MediaItem[] = [];
  const finalVideos: MediaItem[] = [];

  const resolveUrl = async (key: string | null) => {
    if (!key) return null;
    if (key.startsWith("http")) return key;
    return getSignedDownloadUrl(key);
  };

  for (const project of projects) {
    const sName = seriesMap.get(project.seriesId) || "Unknown";

    if (project.outputUrl) {
      const url = await resolveUrl(project.outputUrl);
      if (url) {
        finalVideos.push({
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
      const imgKey = scene.imageUrl || (scene.assetType === "image" ? scene.assetUrl : null);
      if (imgKey) {
        const url = await resolveUrl(imgKey);
        if (url) {
          images.push({
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

      if (scene.videoUrl) {
        const url = await resolveUrl(scene.videoUrl);
        if (url) {
          videoClips.push({
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

      if (scene.audioUrl) {
        const url = await resolveUrl(scene.audioUrl);
        if (url) {
          audioItems.push({
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

  return NextResponse.json({
    videos: [...finalVideos, ...videoClips],
    images,
    audio: audioItems,
  });
}
