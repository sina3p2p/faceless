import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized, badRequest } from "@/lib/api-utils";
import { generateNanoBananaImage, type CharacterRef } from "@/server/services/media";
import { uploadFile, getSignedDownloadUrl } from "@/lib/storage";
import { z } from "zod/v4";

const bodySchema = z.object({
  imageUrl: z.string().min(1),
  description: z.string().default(""),
  name: z.string().default(""),
  type: z.enum(["character", "location", "prop"]).default("character"),
});

const SHEET_PROMPTS: Record<string, string> = {
  character:
    "Generate a clean character reference sheet. Full body, front-facing, neutral standing pose, arms slightly away from body. Plain white background. Clean, well-lit, studio lighting. No props, no environment, no text, no watermarks. Show the complete character clearly from head to toe.",
  location:
    "Generate a wide establishing reference shot of this location. Clean, well-lit, no characters, no people, no text overlays. Show the full environment clearly with consistent lighting.",
  prop:
    "Generate a detailed product-style reference image of this object, centered on a plain white background. Clean studio lighting, no text, no hands, no environment. Show the object clearly from a 3/4 angle.",
};

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const { imageUrl, description, name, type } = parsed.data;

  try {
    const signedUrl = imageUrl.startsWith("http")
      ? imageUrl
      : await getSignedDownloadUrl(imageUrl);

    const ref: CharacterRef = {
      url: signedUrl,
      description,
      name,
      type,
    };

    const result = await generateNanoBananaImage(
      SHEET_PROMPTS[type] || SHEET_PROMPTS.character,
      [ref],
      "1:1"
    );

    if (!result) {
      return NextResponse.json(
        { error: "Failed to generate reference sheet. Try again." },
        { status: 422 }
      );
    }

    const imageResponse = await fetch(result.url);
    if (!imageResponse.ok) throw new Error("Failed to download generated sheet");
    const buffer = Buffer.from(await imageResponse.arrayBuffer());

    const key = `sheets/temp_${user.id}_${Date.now()}.jpg`;
    await uploadFile(key, buffer, "image/jpeg");

    const previewUrl = await getSignedDownloadUrl(key);

    return NextResponse.json({ sheetUrl: key, previewUrl });
  } catch (err) {
    console.error("Sheet generation failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sheet generation failed" },
      { status: 500 }
    );
  }
}
