import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { getAuthUser, unauthorized, badRequest } from "@/lib/api-utils";
import { uploadFile } from "@/lib/storage";
import {
  saveStoryAssetLibraryOnly,
} from "@/server/db/story-assets";
import { StoryAsset } from "@/types/llm-common";

const jsonBodySchema = z
  .object({
    url: z.string().min(1),
    name: z.string().default(""),
    description: z.string().default(""),
    type: z.enum(["character", "location", "prop"]).default("character"),
    voiceId: z.string().optional(),
    sheetUrl: z.string().optional(),
  });

/**
 * POST — persist a new story asset and link it to a series or video you own.
 * JSON or multipart (file upload). Response includes full linked list for that scope.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const contentType = req.headers.get("content-type") || "";

  let payload = {}
  if (contentType.includes("application/json")) {
    const body = await req.json();
    const parsed = jsonBodySchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.message);
    payload = parsed.data;
  } else {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const assetType = ((formData.get("type") as string) || "character") as StoryAsset["type"];
    const assetName = (formData.get("name") as string) || "";
    const assetDescription = (formData.get("description") as string) || "";

    if (!file) return badRequest("No file provided");

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) return badRequest("File must be JPEG, PNG, or WebP");
    if (file.size > 10 * 1024 * 1024) return badRequest("File must be under 10MB");

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const key = `story-assets/asset_${Date.now()}.${ext}`;
    await uploadFile(key, buffer, file.type);

    payload = {
      type: assetType,
      name: assetName,
      description: assetDescription,
      url: key,
    };
  }

  const asset = await saveStoryAssetLibraryOnly(user.id, payload as StoryAsset);

  return NextResponse.json({ asset });
}
