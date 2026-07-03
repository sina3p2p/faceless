import { loadReference } from "./load-reference";
import { generateAssetReferences } from "./generate-asset-references";
import { compileShot } from "./compile-shot";
import { presentFork } from "./present-fork";

export const storyTools = {
  loadReference,
  generateAssetReferences,
  compileShot,
  presentFork,
};

export { generateAssetImages } from "./generate-asset-references";
export { generateShotWithFallback, renderAndUploadShot, SEEDANCE_MODEL } from "./compile-shot";
