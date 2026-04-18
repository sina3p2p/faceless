import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { LLM } from "@/lib/constants";

export const openrouter = createOpenRouter({
  apiKey: LLM.apiKey,
});
