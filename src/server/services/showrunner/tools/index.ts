import { tavilyExtract } from "@tavily/ai-sdk";
import { loadReference } from "./load-reference";
import { generateAssetReferences } from "./generate-asset-references";
import { generateContinuityPack } from "./generate-continuity-pack";
import { generateGenerationGrid } from "./generate-generation-grid";
import { compileShot } from "./compile-shot";
import { askQuestions } from "./ask-questions";
import { recordContinuityPackEntry } from "./record-continuity-pack-entry";
import { recordGenerationGridEntry } from "./record-generation-grid-entry";

export const storyTools = {
  loadReference,
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

export { generateAssetImages } from "./generate-asset-references";
export {
  generateContinuityPackImages,
  validateContinuityPackKeyframes,
} from "./generate-continuity-pack";
export {
  generateGenerationGridImages,
  validatePanelCaptionCount,
  validateGenerationGridContinuity,
} from "./generate-generation-grid";
export { validateContinuityChain } from "./record-generation-grid-entry";
export {
  generateShotWithFallback,
  renderAndUploadShot,
  validateCompileContinuity,
  type CompileShotArgs,
} from "./compile-shot";
