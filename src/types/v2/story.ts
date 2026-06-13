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
};

export type ClientMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  fork?: ForkCall;
  assetRef?: AssetRef;
};
