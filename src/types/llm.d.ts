type LLMModelId =
    | "anthropic/claude-opus-4.7"
    | "anthropic/claude-opus-4.6"
    | "anthropic/claude-sonnet-4"
    | "openai/gpt-5.5"
    | "openai/gpt-4.1"
    | "openai/gpt-4.1-mini"
    | "google/gemini-2.5-pro"
    | "google/gemini-3.1-pro-preview";

type LLMModel = {
    id: LLMModelId;
    label: string;
    description: string;
}