import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { LLM } from "@/lib/constants";

export const openrouter = createOpenRouter({
  apiKey: LLM.apiKey,
  // Some models route through an Amazon Bedrock upstream, which rejects the
  // structured-output field the AI SDK sends for `Output.object` calls
  // ("output_config.format: Extra inputs are not permitted"). Provider
  // routing `require_parameters` makes OpenRouter only pick upstreams that
  // support every parameter in the request, so structured calls fall back to
  // a compatible provider while plain-text calls are unaffected.
  extraBody: {
    provider: {
      ignore: ['amazon-bedrock/eu-west-1']
    },
  },
});
