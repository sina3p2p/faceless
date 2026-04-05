import OpenAI from "openai";

const PEXELS_API_KEY = process.env.PEXELS_API_KEY || "";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

export interface MediaAsset {
  url: string;
  type: "video" | "image";
  source: "pexels" | "openai";
  width: number;
  height: number;
}

export async function searchStockVideo(
  query: string,
  orientation: "portrait" | "landscape" = "portrait"
): Promise<MediaAsset | null> {
  try {
    const response = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(
        query
      )}&orientation=${orientation}&size=medium&per_page=5`,
      { headers: { Authorization: PEXELS_API_KEY } }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const video = data.videos?.[0];
    if (!video) return null;

    const file =
      video.video_files?.find(
        (f: { quality: string }) => f.quality === "hd"
      ) ?? video.video_files?.[0];

    if (!file) return null;

    return {
      url: file.link,
      type: "video",
      source: "pexels",
      width: file.width,
      height: file.height,
    };
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
      )}&orientation=${orientation}&size=medium&per_page=5`,
      { headers: { Authorization: PEXELS_API_KEY } }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const photo = data.photos?.[0];
    if (!photo) return null;

    return {
      url: photo.src.large2x || photo.src.large,
      type: "image",
      source: "pexels",
      width: photo.width,
      height: photo.height,
    };
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
      prompt: `${prompt}. Vertical 9:16 aspect ratio, cinematic style, no text.`,
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
  visualDescription: string
): Promise<MediaAsset> {
  const stockVideo = await searchStockVideo(visualDescription);
  if (stockVideo) return stockVideo;

  const stockImage = await searchStockImage(visualDescription);
  if (stockImage) return stockImage;

  const generatedImage = await generateImage(visualDescription);
  if (generatedImage) return generatedImage;

  throw new Error(
    `Could not find or generate media for: ${visualDescription}`
  );
}
