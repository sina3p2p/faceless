import { generateText } from "ai";
import { openrouter } from "@/server/services/llm";
import { generateViaOpenRouter, type CharacterRef } from "@/server/services/media";
import { getSignedDownloadUrl, uploadFile } from "@/lib/storage";

const VISION_MODEL = "openai/gpt-4.1";

export const SHEET_PROMPTS: Record<string, string> = {
  character:
    "Generate a clean character reference sheet. Full body, front-facing, neutral standing pose, arms slightly away from body. Plain white background. Clean, well-lit, studio lighting. No props, no environment, no text, no watermarks. Show the complete character clearly from head to toe.",
  location:
    "Generate a wide establishing reference shot of this location. Clean, well-lit, no characters, no people, no text overlays. Show the full environment clearly with consistent lighting.",
  prop:
    "Generate a detailed product-style reference image of this object, centered on a plain white background. Clean studio lighting, no text, no hands, no environment. Show the object clearly from a 3/4 angle.",
};

const DESCRIBE_SYSTEM: Record<"character" | "location" | "prop", string> = {
  character: `You are a character description specialist for AI image/video generation.
Describe the character in the image in detail so AI models can recreate them consistently.
Include: gender, approximate age, ethnicity/skin tone, hair (color, style, length), eye color,
facial features, body build, clothing, accessories, and any distinctive features.
Keep it concise but thorough (2-4 sentences). Write in plain descriptive language, no conversational text.`,

  location: `You are a location / environment description specialist for AI image and video generation.
Describe the place in the image: architecture, scale, materials, lighting, time of day, weather, mood, and distinctive landmarks.
Keep it concise but thorough (2-4 sentences). Plain descriptive language only, no conversational filler.`,

  prop: `You are a prop and object description specialist for AI image generation.
Describe the object in the image: shape, material, color, size impression, texture, and how it might be used in a scene.
Keep it concise but thorough (2-4 sentences). Plain descriptive language only, no conversational filler.`,
};

export async function imageUrlToVisionDataUrl(imageUrl: string): Promise<string> {
  const signedUrl = imageUrl.startsWith("http") ? imageUrl : await getSignedDownloadUrl(imageUrl);
  const imgRes = await fetch(signedUrl);
  if (!imgRes.ok) throw new Error("Could not fetch image");
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const mime = (imgRes.headers.get("content-type") || "image/jpeg").split(";")[0];
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

export async function describeStoryAssetFromVision(params: {
  dataUrl: string;
  assetType: "character" | "location" | "prop";
}): Promise<string> {
  const system = DESCRIBE_SYSTEM[params.assetType];
  const userLine =
    params.assetType === "character"
      ? "Describe this character in detail for AI image generation consistency."
      : params.assetType === "location"
        ? "Describe this location in detail for AI image generation consistency."
        : "Describe this prop or object in detail for AI image generation consistency.";

  const { text } = await generateText({
    model: openrouter.chat(VISION_MODEL),
    system,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", image: new URL(params.dataUrl) },
          { type: "text", text: userLine },
        ],
      },
    ],
    maxOutputTokens: 300,
    temperature: 0.3,
  });

  return text.trim();
}

export async function generateStoryAssetSheetToStorage(params: {
  ref: CharacterRef;
  type: "character" | "location" | "prop";
  storageKey: string;
}): Promise<{ sheetUrl: string; previewUrl: string }> {
  const sheetPrompt = SHEET_PROMPTS[params.type] || SHEET_PROMPTS.character;
  const result = await generateViaOpenRouter(
    sheetPrompt,
    "google/gemini-3.1-flash-image-preview",
    [params.ref],
    "1:1"
  );

  if (!result) {
    throw new Error("Sheet model returned no image");
  }

  const imageResponse = await fetch(result.url);
  if (!imageResponse.ok) throw new Error("Failed to download generated sheet");
  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  await uploadFile(params.storageKey, buffer, "image/jpeg");
  const previewUrl = await getSignedDownloadUrl(params.storageKey);
  return { sheetUrl: params.storageKey, previewUrl };
}
