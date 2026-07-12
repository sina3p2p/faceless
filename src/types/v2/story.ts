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

export type ContinuityPackNotes = {
  roomGeography: string;
  characterBlocking: string;
  cameraAxis: string;
  lightingProgression: string;
  screenDirection: string;
  fixedProps: string;
};

export type ContinuityPackKeyframe = {
  role: "establishing" | "blocking" | "eyeline_props" | "other";
  caption: string;
};

export type ContinuityPack = {
  toolCallId: string;
  loading: boolean;
  sceneId?: string | number;
  packHandle?: string;
  notes?: ContinuityPackNotes;
  keyframes?: ContinuityPackKeyframe[];
  images?: string[];
  aspectRatio?: "16:9" | "9:16" | "1:1";
  approvedUrls?: string[];
  error?: string;
};

export type PanelCaption = {
  motionArc: string;
  handoff: string;
};

export type GenerationGrid = {
  toolCallId: string;
  loading: boolean;
  sceneId?: string | number;
  generationId?: string;
  shotIds?: number[];
  estimatedDurationSeconds?: number;
  previousGenerationId?: string | null;
  incomingAnchorHandle?: string | null;
  continuityBreakReason?: string | null;
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
  continuityPack?: ContinuityPack;
  generationGrid?: GenerationGrid;
  shotResult?: ShotResult;
  shotCompile?: ShotCompile;
};
