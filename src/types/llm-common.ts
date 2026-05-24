export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface StoryAsset {
  name: string;
  description: string;
  type: "character" | "location" | "prop";
  url: string;
  sheetUrl?: string;
  voiceId?: string;
}

export interface ModelSettings {
  producerModel: LLMModelId;
  storyModel: LLMModelId;
  directorModel: LLMModelId;
  supervisorModel: LLMModelId;
  cinematographerModel: LLMModelId;
  researchModel: LLMModelId;
  storyboardModel: LLMModelId;
  promptModel: LLMModelId;
  motionModel: LLMModelId;
  imageModel: TImageModelId;
  videoModel: TVideoModelId;
  reviewerModel: LLMModelId;
}