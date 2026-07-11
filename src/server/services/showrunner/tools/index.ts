import { tavilyExtract } from "@tavily/ai-sdk";
import { loadReference } from "./load-reference";
import { generateAssetReferences } from "./generate-asset-references";
import { generateSceneGrid } from "./generate-scene-grid";
import { compileShot } from "./compile-shot";
import { presentFork } from "./present-fork";
import { recordSceneGridEntry } from "./record-scene-grid-entry";

export const storyTools = {
  loadReference,
  // Official Tavily AI SDK tool — https://ai-sdk.dev/cookbook/node/web-search-agent#tavily
  webExtract: tavilyExtract(),
  generateAssetReferences,
  generateSceneGrid,
  compileShot,
  presentFork,
  recordSceneGridEntry,
};

export { generateAssetImages } from "./generate-asset-references";
export {
  generateSceneGridImages,
  validatePanelCaptionCount,
} from "./generate-scene-grid";
export {
  generateShotWithFallback,
  renderAndUploadShot,
  validateCompileContinuity,
  type CompileShotArgs,
  type ContinuityMode,
} from "./compile-shot";
