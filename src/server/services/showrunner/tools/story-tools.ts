import { tavilyExtract } from "@tavily/ai-sdk";
import { loadReference } from "./load-reference";
import { loadApprovedImage } from "./load-approved-image";
import { generateAssetReferences } from "./generate-asset-references";
import { generateContinuityPack } from "./generate-continuity-pack";
import { generateGenerationGrid } from "./generate-generation-grid";
import { compileShot } from "./compile-shot";
import { askQuestions } from "./ask-questions";
import { recordContinuityPackEntry } from "./record-continuity-pack-entry";
import { recordGenerationGridEntry } from "./record-generation-grid-entry";

export const storyTools = {
  loadReference,
  loadApprovedImage,
  // Official Tavily AI SDK tool — https://ai-sdk.dev/cookbook/node/web-search-agent#tavily
  webExtract: tavilyExtract(),
  generateAssetReferences,
  generateContinuityPack,
  generateGenerationGrid,
  compileShot,
  askQuestions,
  recordContinuityPackEntry,
  recordGenerationGridEntry,
};
