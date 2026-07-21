import {
  generateAssetGallery,
  generateAssetImages,
} from "@/server/services/showrunner/tools/generate-asset-references";
import { patchMessageToolCall, setJobStatus } from "../job-helpers";
import type { JobRunContext, PayloadBase, WorkerJob } from "./types";

type AssetPayload = {
  userId: string;
  assets?: Array<{
    assetHandle: string;
    assetKind: "character" | "location" | "object";
    imagePrompt: string;
  }>;
  assetHandle?: string;
  assetKind?: "character" | "location" | "object";
  imagePrompt?: string;
  existingGeneratedAssets?: Array<{
    assetHandle: string;
    assetKind: "character" | "location" | "object";
    candidates: Array<{ id: string; url: string }>;
  }>;
};

export const generateAssetImagesJob: WorkerJob = {
  async run({ jobId, sessionId, toolCallId, assistantMessageRowId, payload }: JobRunContext) {
    const p = payload as PayloadBase & AssetPayload;

    let result: {
      images: string[];
      generatedAssets: unknown;
      patch: Record<string, unknown>;
    };

    if (p.assets?.length) {
      const generatedAssets = await generateAssetGallery(p.assets, p.userId, sessionId);
      result = {
        images: generatedAssets.flatMap((a) => a.candidates.map((c) => c.id)),
        generatedAssets,
        patch: { generatedAssets, generatedImages: undefined },
      };
    } else {
      const handle = p.assetHandle!;
      const kind = p.assetKind!;
      const prompt = p.imagePrompt!;
      const candidates = await generateAssetImages(prompt, kind, p.userId, sessionId, handle);
      const existing = p.existingGeneratedAssets ?? [];
      const generatedAssets = existing.some((a) => a.assetHandle === handle)
        ? existing.map((a) =>
            a.assetHandle === handle ? { assetHandle: handle, assetKind: kind, candidates } : a,
          )
        : [...existing, { assetHandle: handle, assetKind: kind, candidates }];

      result = {
        images: candidates.map((c) => c.id),
        generatedAssets,
        patch: { generatedAssets },
      };
    }

    await setJobStatus(jobId, "succeeded", result);
    await patchMessageToolCall(assistantMessageRowId, toolCallId, {
      ...result.patch,
      pending: false,
      error: undefined,
    });
  },

  failPatch: (errorMsg) => ({ pending: false, error: errorMsg }),
};
