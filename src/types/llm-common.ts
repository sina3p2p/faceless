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
