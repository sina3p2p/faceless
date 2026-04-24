import type { MotionSkillHints, HookPatternId } from "@/types/motion-skill-hints";
import { getSkillContentFile } from "./load-markdown";
import {
  hookInjection,
  cameraPhraseInjection,
  verticalPackInjection,
  musicSectionInjection,
} from "./injections";
import { trimJoin } from "./util";

export type BuildMotionContextOpts = {
  /** Story assets tagged on the frame; drives reference block. */
  assetRefCount: number;
  /** If true, apply hook pattern (when not "none" and isHookFrame allows). */
  isHookEligible: boolean;
  /** If false, do not add first-seconds + hook block (still allow vertical + camera + music + reference + energy from MD as global tone). */
  useHookLayer?: boolean;
};

/**
 * Prose appended to the motion system prompt. Hybrid: MD for stable craft rules; TS for selected ids.
 */
export function buildMotionSkillContext(
  hints: Partial<MotionSkillHints> | null | undefined,
  opts: BuildMotionContextOpts
): string {
  if (!hints || Object.keys(hints).length === 0) {
    return buildBaselineBlocks(opts);
  }

  const vert = hints.verticalPackId ?? "default";
  const vLine = verticalPackInjection(vert);
  const cLine = hints.cameraPhraseId
    ? cameraPhraseInjection(hints.cameraPhraseId)
    : "";
  const mLine = hints.musicSectionId
    ? musicSectionInjection(hints.musicSectionId)
    : "";
  const hookId = (hints.hookPatternId ?? "none") as HookPatternId;
  const useHook =
    opts.useHookLayer !== false &&
    opts.isHookEligible &&
    hookId !== "none" &&
    (hints.isHookFrame !== false);
  const hookLine = useHook ? hookInjection(hookId) : "";

  const blocks: string[] = [buildReferenceBlock(opts.assetRefCount)];

  if (vLine) {
    blocks.push(`VERTICAL TONE (follow)\n${vLine}`);
  } else {
    const verticalMd = getSkillContentFile("vertical-packs");
    if (verticalMd) blocks.push(`VERTICAL TONE (defaults)\n${verticalMd}`);
  }

  if (cLine) {
    blocks.push(
      `CAMERA PHRASING PREFERENCE — fold into the single "cameraMove" string:\n${cLine}\n(Also align primaryAction and subjectDynamics with that choice.)`
    );
  } else {
    const camBank = getSkillContentFile("camera-phrase-bank");
    if (camBank) blocks.push(`CAMERA PHRASING (bank)\n${camBank}`);
  }

  if (mLine) {
    blocks.push(mLine);
  } else {
    const mus = getSkillContentFile("music-sections");
    if (mus) blocks.push(mus);
  }

  if (useHook) {
    const fsh = getSkillContentFile("first-seconds-hooks");
    const hookBlocks = [fsh, hookLine && `PATTERN: ${hookLine}`].filter(Boolean) as string[];
    blocks.push(trimJoin(hookBlocks, "\n\n"));
  } else {
    const fsh = getSkillContentFile("first-seconds-hooks");
    if (fsh) blocks.push(fsh);
  }

  const sm = getSkillContentFile("style-modes-01-15");
  if (sm) blocks.push(`STYLE MODES (01–15 — pick closest)\n${sm}`);
  const lsp = getSkillContentFile("lighting-sound-pacing");
  if (lsp) blocks.push(lsp);

  const energy = getSkillContentFile("energy-ladder");
  if (energy) blocks.push(energy);

  return trimJoin(blocks.filter(Boolean), "\n\n---\n\n");
}

function buildReferenceBlock(assetRefCount: number): string {
  if (assetRefCount <= 0) return "";
  return trimJoin(
    [getSkillContentFile("reference-discipline"), "This frame has linked story-asset reference(s) — name them in negativeMotion if a wrong face/prop would break continuity."],
    "\n"
  );
}

function buildBaselineBlocks(opts: BuildMotionContextOpts): string {
  const parts: string[] = [];
  const ref = buildReferenceBlock(opts.assetRefCount);
  if (ref) parts.push(ref);
  for (const key of [
    "first-seconds-hooks",
    "camera-phrase-bank",
    "music-sections",
    "style-modes-01-15",
    "lighting-sound-pacing",
    "vertical-packs",
    "energy-ladder",
  ] as const) {
    const t = getSkillContentFile(key);
    if (t) parts.push(t);
  }
  if (opts.isHookEligible) {
    parts.push(
      "SCENE-OPENER SLOT: this frame is the first in its scene—maximize scroll-stopping clarity in the first 1–2s of the clip (see hook table above)."
    );
  }
  return trimJoin(parts, "\n\n---\n\n");
}
