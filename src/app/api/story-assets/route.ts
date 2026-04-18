import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { uploadFile } from "@/lib/storage";
import {
  assertUserOwnsSeries,
  assertUserOwnsVideo,
  listStoryAssetsForSeries,
  listStoryAssetsForVideo,
  saveNewStoryAssetWithLink,
  storyAssetToClient,
} from "@/server/db/story-assets";

const jsonBodySchema = z
  .object({
    seriesId: z.string().optional(),
    videoProjectId: z.string().optional(),
    url: z.string().min(1),
    name: z.string().default(""),
    description: z.string().default(""),
    type: z.enum(["character", "location", "prop"]).default("character"),
    voiceId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const hasSeries = !!data.seriesId;
    const hasVideo = !!data.videoProjectId;
    if (hasSeries === hasVideo) {
      ctx.addIssue({
        code: "custom",
        message: "Provide exactly one of seriesId or videoProjectId",
        path: ["seriesId"],
      });
    }
  });

/**
 * POST — persist a new story asset and link it to a series or video you own.
 * JSON or multipart (file upload). Response includes full linked list for that scope.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await req.json();
    const parsed = jsonBodySchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.message);

    const { seriesId, videoProjectId, ...rest } = parsed.data;
    if (seriesId) {
      if (!(await assertUserOwnsSeries(user.id, seriesId))) return notFound("Series not found");
    } else if (videoProjectId) {
      if (!(await assertUserOwnsVideo(user.id, videoProjectId))) return notFound("Video not found");
    } else {
      return badRequest("Provide seriesId or videoProjectId");
    }

    const link = seriesId ? { seriesId } : { videoProjectId: videoProjectId! };
    const row = await saveNewStoryAssetWithLink(user.id, link, {
      type: rest.type,
      name: rest.name,
      description: rest.description,
      url: rest.url,
      voiceId: rest.voiceId ?? null,
    });

    const storyAssets = seriesId
      ? (await listStoryAssetsForSeries(seriesId)).map(storyAssetToClient)
      : (await listStoryAssetsForVideo(videoProjectId!)).map(storyAssetToClient);

    return NextResponse.json({ asset: storyAssetToClient(row), storyAssets });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const seriesId = (formData.get("seriesId") as string) || undefined;
  const videoProjectId = (formData.get("videoProjectId") as string) || undefined;
  const assetType = ((formData.get("type") as string) || "character") as "character" | "location" | "prop";
  const assetName = (formData.get("name") as string) || "";

  if (!file) return badRequest("No file provided");
  if (!!seriesId === !!videoProjectId) {
    return badRequest("Provide exactly one of seriesId or videoProjectId");
  }

  if (seriesId) {
    if (!(await assertUserOwnsSeries(user.id, seriesId))) return notFound("Series not found");
  } else if (videoProjectId) {
    if (!(await assertUserOwnsVideo(user.id, videoProjectId))) return notFound("Video not found");
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) return badRequest("File must be JPEG, PNG, or WebP");
  if (file.size > 10 * 1024 * 1024) return badRequest("File must be under 10MB");

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const scope = seriesId ? `series/${seriesId}` : `videos/${videoProjectId}`;
  const key = `${scope}/asset_${Date.now()}.${ext}`;
  await uploadFile(key, buffer, file.type);

  const link = seriesId ? { seriesId } : { videoProjectId: videoProjectId! };
  const row = await saveNewStoryAssetWithLink(user.id, link, {
    type: assetType,
    name: assetName,
    description: "",
    url: key,
  });

  const storyAssets = seriesId
    ? (await listStoryAssetsForSeries(seriesId)).map(storyAssetToClient)
    : (await listStoryAssetsForVideo(videoProjectId!)).map(storyAssetToClient);

  return NextResponse.json({ asset: storyAssetToClient(row), storyAssets });
}
