import OpenAI from "openai";
import { MEDIA } from "@/lib/constants";

const PEXELS_API_KEY = MEDIA.pexelsApiKey;
const openai = new OpenAI({ apiKey: MEDIA.openaiApiKey });

export interface MediaAsset {
  url: string;
  type: "video" | "image";
  source: "pexels" | "openai";
  width: number;
  height: number;
}

const usedPexelsIds = new Set<number>();

export function resetUsedMedia(): void {
  usedPexelsIds.clear();
}

export async function searchStockVideo(
  query: string,
  orientation: "portrait" | "landscape" = "portrait"
): Promise<MediaAsset | null> {
  try {
    const response = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(
        query
      )}&orientation=${orientation}&size=medium&per_page=15`,
      { headers: { Authorization: PEXELS_API_KEY } }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const videos = data.videos ?? [];

    for (const video of videos) {
      if (usedPexelsIds.has(video.id)) continue;

      const file =
        video.video_files?.find(
          (f: { quality: string; width: number }) =>
            f.quality === "hd" && f.width >= 720
        ) ?? video.video_files?.[0];

      if (!file) continue;

      usedPexelsIds.add(video.id);
      return {
        url: file.link,
        type: "video",
        source: "pexels",
        width: file.width,
        height: file.height,
      };
    }

    return null;
  } catch {
    return null;
  }
}

export async function searchStockImage(
  query: string,
  orientation: "portrait" | "landscape" = "portrait"
): Promise<MediaAsset | null> {
  try {
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(
        query
      )}&orientation=${orientation}&size=large&per_page=15`,
      { headers: { Authorization: PEXELS_API_KEY } }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const photos = data.photos ?? [];

    for (const photo of photos) {
      if (usedPexelsIds.has(photo.id)) continue;

      usedPexelsIds.add(photo.id);
      return {
        url: photo.src.large2x || photo.src.large,
        type: "image",
        source: "pexels",
        width: photo.width,
        height: photo.height,
      };
    }

    return null;
  } catch {
    return null;
  }
}

export async function generateImage(
  prompt: string
): Promise<MediaAsset | null> {
  try {
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: `${prompt}. Vertical 9:16 aspect ratio, cinematic lighting, photorealistic, no text or watermarks.`,
      n: 1,
      size: "1024x1792",
    });

    const url = response.data?.[0]?.url;
    if (!url) return null;

    return {
      url,
      type: "image",
      source: "openai",
      width: 1024,
      height: 1792,
    };
  } catch {
    return null;
  }
}

export async function getMediaForScene(
  searchQuery: string,
  imagePrompt: string,
  preferAiImage = false
): Promise<MediaAsset> {
  if (preferAiImage) {
    const generatedImage = await generateImage(imagePrompt);
    if (generatedImage) return generatedImage;
  }

  const stockVideo = await searchStockVideo(searchQuery);
  if (stockVideo) return stockVideo;

  const stockImage = await searchStockImage(searchQuery);
  if (stockImage) return stockImage;

  const simplifiedQuery = searchQuery.split(" ").slice(0, 2).join(" ");
  if (simplifiedQuery !== searchQuery) {
    const fallbackVideo = await searchStockVideo(simplifiedQuery);
    if (fallbackVideo) return fallbackVideo;

    const fallbackImage = await searchStockImage(simplifiedQuery);
    if (fallbackImage) return fallbackImage;
  }

  const generatedImage = await generateImage(imagePrompt);
  if (generatedImage) return generatedImage;

  throw new Error(
    `Could not find or generate media for query: "${searchQuery}"`
  );
}
