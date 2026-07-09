import { loadReference } from "./load-reference";
import { generateAssetReferences } from "./generate-asset-references";
import { generateSceneGrid } from "./generate-scene-grid";
import { compileShot } from "./compile-shot";
import { presentFork } from "./present-fork";
import { recordSceneGridEntry } from "./record-scene-grid-entry";

export const storyTools = {
  loadReference,
  generateAssetReferences,
  generateSceneGrid,
  compileShot,
  presentFork,
  recordSceneGridEntry,
};

export { generateAssetImages } from "./generate-asset-references";
export { generateSceneGridImages } from "./generate-scene-grid";
export { generateShotWithFallback, renderAndUploadShot } from "./compile-shot";
