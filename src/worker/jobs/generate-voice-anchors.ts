import {
  generateVoiceGallery,
  generateVoiceSample,
  type VoiceSpecInput,
  type GeneratedVoiceItem,
} from "@/server/services/showrunner/tools/generate-voice-anchors";
import { patchMessageToolCall, setJobStatus } from "../job-helpers";
import type { JobRunContext, PayloadBase, WorkerJob } from "./types";

type VoicePayload = {
  userId: string;
  voices?: VoiceSpecInput[];
  /** Single-voice regen */
  handle?: string;
  sampleText?: string;
  voiceId?: string;
  characterHandle?: string;
  existingGeneratedVoices?: GeneratedVoiceItem[];
};

export const generateVoiceAnchorsJob: WorkerJob = {
  async run({ jobId, sessionId, toolCallId, assistantMessageRowId, payload }: JobRunContext) {
    const p = payload as PayloadBase & VoicePayload;

    let generatedVoices: GeneratedVoiceItem[];

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
      const existing = p.existingGeneratedVoices ?? [];
      generatedVoices = existing.some((v) => v.handle === p.handle)
        ? existing.map((v) => (v.handle === p.handle ? item : v))
        : [...existing, item];
    } else {
      generatedVoices = await generateVoiceGallery(p.voices ?? [], p.userId, sessionId);
    }

    await setJobStatus(jobId, "succeeded", { generatedVoices });
    await patchMessageToolCall(assistantMessageRowId, toolCallId, {
      generatedVoices,
      pending: false,
      error: undefined,
    });
  },

  failPatch: (errorMsg) => ({ pending: false, error: errorMsg }),
};
