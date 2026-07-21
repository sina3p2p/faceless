import {
  generateVoiceGallery,
  generateVoiceSample,
  type VoiceSpecInput,
} from "@/server/services/showrunner/tools/generate-voice-anchors";
import type { GeneratedAssetItem } from "@/server/services/showrunner/tools/generate-asset-references";
import { patchMessageToolCall, setJobStatus } from "../job-helpers";
import type { JobRunContext, PayloadBase, WorkerJob } from "./types";

type VoicePayload = {
  userId: string;
  voices?: VoiceSpecInput[];
  /** Single-voice regen (reuses assetHandle field from retry-tool). */
  handle?: string;
  sampleText?: string;
  voiceId?: string;
  characterHandle?: string;
  existingGeneratedAssets?: GeneratedAssetItem[];
};

export const generateVoiceAnchorsJob: WorkerJob = {
  async run({ jobId, sessionId, toolCallId, assistantMessageRowId, payload }: JobRunContext) {
    const p = payload as PayloadBase & VoicePayload;

    let generatedAssets: GeneratedAssetItem[];

    if (p.handle && p.sampleText) {
      const item = await generateVoiceSample(
        {
          handle: p.handle,
          sampleText: p.sampleText,
          voiceId: p.voiceId,
          characterHandle: p.characterHandle,
        },
        p.userId,
        sessionId,
      );
      const existing = p.existingGeneratedAssets ?? [];
      generatedAssets = existing.some((v) => v.assetHandle === p.handle)
        ? existing.map((v) => (v.assetHandle === p.handle ? item : v))
        : [...existing, item];
    } else {
      generatedAssets = await generateVoiceGallery(p.voices ?? [], p.userId, sessionId);
    }

    await setJobStatus(jobId, "succeeded", {
      generatedAssets,
      images: generatedAssets.flatMap((a) => a.candidates.map((c) => c.id)),
    });
    await patchMessageToolCall(assistantMessageRowId, toolCallId, {
      generatedAssets,
      pending: false,
      error: undefined,
    });
  },

  failPatch: (errorMsg) => ({ pending: false, error: errorMsg }),
};
