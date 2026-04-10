import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { series } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq, and } from "drizzle-orm";
import { generateNanoBananaImage, type CharacterRef } from "@/server/services/media";
import { uploadFile, getSignedDownloadUrl } from "@/lib/storage";
import { z } from "zod/v4";

type StoryAsset = {
  id: string;
  type: "character" | "location" | "prop";
  name: string;
  description: string;
  url: string;
  sheetUrl?: string;
};

const bodySchema = z.object({
  assetId: z.string(),
});

const SHEET_PROMPTS: Record<string, string> = {
  character:
    "Generate a clean character reference sheet. Full body, front-facing, neutral standing pose, arms slightly away from body. Plain white background. Clean, well-lit, studio lighting. No props, no environment, no text, no watermarks. Show the complete character clearly from head to toe.",
  location:
    "Generate a wide establishing reference shot of this location. Clean, well-lit, no characters, no people, no text overlays. Show the full environment clearly with consistent lighting.",
  prop:
    "Generate a detailed product-style reference image of this object, centered on a plain white background. Clean studio lighting, no text, no hands, no environment. Show the object clearly from a 3/4 angle.",
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const existing = await db.query.series.findFirst({
    where: and(eq(series.id, id), eq(series.userId, user.id)),
    columns: { id: true, storyAssets: true },
  });
  if (!existing) return notFound("Series not found");

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const assets = (existing.storyAssets ?? []) as StoryAsset[];
  const asset = assets.find((a) => a.id === parsed.data.assetId);
  if (!asset) return badRequest("Asset not found");

  try {
    const originalUrl = asset.url.startsWith("http")
      ? asset.url
      : await getSignedDownloadUrl(asset.url);

    const sheetPrompt = SHEET_PROMPTS[asset.type] || SHEET_PROMPTS.character;

    const ref: CharacterRef = {
      url: originalUrl,
      description: asset.description,
      name: asset.name,
      type: asset.type,
    };

    const result = await generateNanoBananaImage(sheetPrompt, [ref], "1:1");

    if (!result) {
      return NextResponse.json(
        { error: "Failed to generate reference sheet. Try again." },
        { status: 422 }
      );
    }

    // Upload to S3 but don't save to asset yet — user must accept
    const imageResponse = await fetch(result.url);
    if (!imageResponse.ok) throw new Error("Failed to download generated sheet");
    const buffer = Buffer.from(await imageResponse.arrayBuffer());

    const key = `series/${id}/sheet_${asset.id}_${Date.now()}.jpg`;
    await uploadFile(key, buffer, "image/jpeg");

    const previewUrl = await getSignedDownloadUrl(key);

    return NextResponse.json({ sheetUrl: key, previewUrl });
  } catch (err) {
    console.error(`Sheet generation failed for asset ${asset.id}:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sheet generation failed" },
      { status: 500 }
    );
  }
}
