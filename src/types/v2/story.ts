export type SessionStatus = "in_progress" | "completed" | "abandoned";

export type ForkOption = {
  id: string;
  label: string;
  content: string;
  tradeoffs: string;
};

export type ForkCall = {
  toolCallId: string;
  loading: boolean;
  options?: ForkOption[];
  recommendedId?: string;
  recommendationReason?: string;
  result?: { optionId?: string; value: string };
};

export type AssetRef = {
  toolCallId: string;
  loading: boolean;
  assetHandle?: string;
  assetKind?: "character" | "location";
  images?: string[];
  approvedUrl?: string;
  error?: string;
};

export type SceneGrid = {
  toolCallId: string;
  loading: boolean;
  sceneId?: string | number;
  images?: string[];
  aspectRatio?: "16:9" | "9:16" | "1:1";
  approvedUrl?: string;
  error?: string;
};

export type ShotResult = {
  toolCallId: string;
  loading: boolean;
  videoUrl?: string;
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
};

export type ClientMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  fork?: ForkCall;
  assetRef?: AssetRef;
  sceneGrid?: SceneGrid;
  shotResult?: ShotResult;
  shotCompile?: ShotCompile;
};
