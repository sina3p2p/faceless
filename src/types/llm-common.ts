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
  producerModel: string;
  storyModel: string;
  directorModel: string;
  supervisorModel: string;
  cinematographerModel: string;
  researchModel: string;
  storyboardModel: string;
  promptModel: string;
  motionModel: string;
  imageModel: string;
  videoModel: TVideoModelId;
}