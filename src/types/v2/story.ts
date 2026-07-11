export type SessionStatus = "in_progress" | "completed" | "abandoned";

export type QuestionItem = {
  question: string;
  options: string[];
  recommendedIndex?: number;
};

export type QuestionsCall = {
  toolCallId: string;
  loading: boolean;
  questions?: QuestionItem[];
  answers?: string[];
};

export type AssetRef = {
  toolCallId: string;
  loading: boolean;
  assetHandle?: string;
  assetKind?: "character" | "location" | "object";
  images?: string[];
  approvedUrl?: string;
  error?: string;
};

export type PanelCaption = {
  motionArc: string;
  handoff: string;
};

export type SceneGrid = {
  toolCallId: string;
  loading: boolean;
  sceneId?: string | number;
  images?: string[];
  panelCount?: number;
  panelCaptions?: PanelCaption[];
  aspectRatio?: "16:9" | "9:16" | "1:1";
  approvedUrl?: string;
  error?: string;
};

export type ShotResult = {
  toolCallId: string;
  loading: boolean;
  videoUrl?: string;
  duration?: number;
  error?: string;
  approved?: boolean;
};

export type ShotCompile = {
  toolCallId: string;
  loading: boolean;
  renderPrompt?: string;
  referenceImageUrls?: string[];
  duration?: number;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  continuityMode?: "fresh" | "extend_video";
  sourceVideoUrl?: string;
};

export type ClientMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  reasoning?: string;
  questions?: QuestionsCall;
  assetRef?: AssetRef;
  sceneGrid?: SceneGrid;
  shotResult?: ShotResult;
  shotCompile?: ShotCompile;
};
