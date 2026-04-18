import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { getAuthUser, unauthorized, badRequest } from "@/lib/api-utils";
import { describeStoryAssetFromVision, imageUrlToVisionDataUrl } from "@/server/services/story-asset-tools";

const jsonSchema = z.object({
  imageUrl: z.string().min(1),
  type: z.enum(["character", "location", "prop"]).default("character"),
});

/**
 * POST — vision description for an image before or after save (no DB write).
 * JSON: { imageUrl, type } or multipart: file + type.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const contentType = req.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const parsed = jsonSchema.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.message);
      const dataUrl = await imageUrlToVisionDataUrl(parsed.data.imageUrl);
      const description = await describeStoryAssetFromVision({
        dataUrl,
        assetType: parsed.data.type,
      });
      return NextResponse.json({ description });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const assetType = ((formData.get("type") as string) || "character") as "character" | "location" | "prop";
    if (!file) return badRequest("No file provided");
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) return badRequest("File must be JPEG, PNG, or WebP");

    const buffer = Buffer.from(await file.arrayBuffer());
    const dataUrl = `data:${file.type};base64,${buffer.toString("base64")}`;
    const description = await describeStoryAssetFromVision({ dataUrl, assetType });
    return NextResponse.json({ description });
  } catch (err) {
    console.error("story-assets/describe failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Describe failed" },
      { status: 500 }
    );
  }
}
