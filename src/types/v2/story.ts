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

export type AssetCandidate = {
  id: string;
  url: string;
};

export type AssetGalleryItem = {
  assetHandle: string;
  assetKind: "character" | "location" | "object" | "voice";
  loading?: boolean;
  candidates?: AssetCandidate[];
  /** Voice sample script (voice kind only). */
  sampleText?: string;
  approvedCandidateId?: string;
  approvedUrl?: string;
  rejected?: boolean;
  objection?: string;
  error?: string;
};

export type AssetRef = {
  toolCallId: string;
  loading: boolean;
  /** Full manifest gallery (Step 9 / 9b). */
  items: AssetGalleryItem[];
  /** True after the user taps Approve remaining. */
  approved?: boolean;
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
  sceneAnchorHandle?: string | null;
  incomingAnchorHandle?: string | null;
  continuityBreakReason?: string | null;
  matchCutSourceGenerationId?: string | null;
  matchCutSourceHandle?: string | null;
  lightingState?: string | null;
  lightingTransitionException?: boolean | null;
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
  /** Signed URL for server-generated horizontal filmstrip JPEG. */
  filmstripUrl?: string;
  /** Frames in the filmstrip sprite (~1 per second). */
  filmstripTiles?: number;
  duration?: number;
  error?: string;
  approved?: boolean;
};

export type ShotCompile = {
  toolCallId: string;
  loading: boolean;
  /** True after user approves — panel stays visible with disabled controls while the shot renders. */
  rendering?: boolean;
  renderPrompt?: string;
  referenceImageUrls?: string[];
  referenceAudioUrls?: string[];
  duration?: number;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  continuityMode?: "fresh" | "extend_video";
  sourceVideoUrl?: string;
  /** Filled when the render job completes — shown in the panel placeholder. */
  videoUrl?: string;
  filmstripUrl?: string;
  filmstripTiles?: number;
  error?: string;
  approved?: boolean;
};

export type ClientMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** ISO timestamp from DB — used as pagination cursor for load-older. */
  createdAt?: string;
  reasoning?: string;
  questions?: QuestionsCall;
  assetRef?: AssetRef;
  generationGrid?: GenerationGrid;
  shotResult?: ShotResult;
  shotCompile?: ShotCompile;
};
