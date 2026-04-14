import { z } from "zod";
import type { FrameSpec, VisualStyleGuide } from "@/lib/types";

/**
 * Structured image prompt from the Prompt Architect (LLM).
 * Upstream locks (subject identity line, shot type, style prefixes) are applied in `serializeFrameImageSpec`.
 */
export const imageSpecSchema = z.object({
  subject: z.object({
    primary: z.string().describe("Subject label from frame — will be replaced by continuity-safe primary when resolved"),
    secondary: z.array(z.string()).optional(),
    focus: z.string().optional(),
  }),
  action: z.string().optional(),
  shot: z
    .object({
      type: z.string().optional(),
      angle: z.string().optional(),
      composition: z.string().optional(),
      depthOfField: z.string().optional(),
    })
    .optional(),
  environment: z
    .object({
      setting: z.string().optional(),
      background: z.string().optional(),
      effects: z.array(z.string()).optional(),
    })
    .optional(),
  lighting: z
    .object({
      key: z.string().optional(),
      accent: z.string().optional(),
      practicals: z.string().optional(),
    })
    .optional(),
  style: z
    .object({
      medium: z.string().optional(),
      material: z.string().optional(),
      palette: z.array(z.string()).optional(),
    })
    .optional(),
  constraints: z.array(z.string()).optional(),
  negativeCues: z.array(z.string()).optional(),
});

export type ImageSpec = z.infer<typeof imageSpecSchema>;

/** Force subject.primary to upstream-normalized identity; keep architect focus/secondary only. */
export function mergeImageSpecWithUpstreamSubject(spec: ImageSpec, upstreamSubjectPrimary: string): ImageSpec {
  const primary = upstreamSubjectPrimary.trim() || spec.subject.primary.trim();
  return {
    ...spec,
    subject: {
      ...spec.subject,
      primary,
    },
  };
}

/**
 * Deterministic canonical prompt string (block order stable). Injects Cinematographer prefixes + storyboard shot type.
 */
export function serializeFrameImageSpec(params: {
  spec: ImageSpec;
  styleGuide: VisualStyleGuide;
  sceneIndex: number;
  frameSpec: FrameSpec;
}): string {
  const { spec, styleGuide, sceneIndex, frameSpec } = params;
  const pr = styleGuide.promptRegions;
  const ps = styleGuide.perScene.find((p) => p.sceneIndex === sceneIndex);

  const globalPalette = styleGuide.global.colorPalette.join(", ");
  const paletteText = spec.style?.palette?.length
    ? spec.style.palette.join(", ")
    : ps?.paletteOverride?.join(", ") ?? globalPalette;

  const lightingDetail =
    [spec.lighting?.key, spec.lighting?.accent, spec.lighting?.practicals].filter(Boolean).join("; ") ||
    ps?.lightingOverride ||
    styleGuide.global.defaultLighting;

  const cameraParts = [frameSpec.shotType, spec.shot?.angle, spec.shot?.composition, spec.shot?.depthOfField].filter(
    Boolean
  );
  const cameraLine = cameraParts.join(", ");

  const envParts = [spec.environment?.background, spec.environment?.setting, spec.environment?.effects?.join(", ")]
    .filter(Boolean)
    .join(", ");

  const secondary = spec.subject.secondary?.length ? ` ${spec.subject.secondary.join(", ")}` : "";
  const focusFrag = spec.subject.focus ? ` (${spec.subject.focus})` : "";
  const actionFrag = spec.action ? ` ${spec.action}` : "";

  const lines: string[] = [];

  lines.push(`${pr.subjectPrefix} ${spec.subject.primary}${secondary}${focusFrag}.${actionFrag}`);
  lines.push(`Camera: ${pr.cameraPrefix} ${cameraLine}.`);
  lines.push(`Lighting: ${pr.lightingPrefix} ${lightingDetail}.`);
  lines.push(`Background: ${pr.backgroundPrefix} ${envParts || "scene-appropriate environment"}.`);
  lines.push(`Color palette: ${paletteText}.`);

  const styleFrag = [spec.style?.medium, spec.style?.material].filter(Boolean).join(" — ");
  if (styleFrag) {
    lines.push(`${styleFrag}.`);
  }
  lines.push(`MEDIUM: ${styleGuide.global.medium}.`);

  if (spec.constraints?.length) {
    lines.push(`Constraints: ${spec.constraints.join("; ")}.`);
  }
  if (spec.negativeCues?.length) {
    lines.push(`Avoid: ${spec.negativeCues.join("; ")}.`);
  }

  return lines.join("\n");
}

/**
 * Boring predictable prompt when architect output fails contract — no LLM embellishment.
 * Includes: continuity-safe subject line, locked prefixes, storyboard shot type, global/scene style.
 */
export function buildUpstreamFallbackImagePrompt(params: {
  styleGuide: VisualStyleGuide;
  sceneIndex: number;
  frameSpec: FrameSpec;
  subjectPrimaryLine: string;
}): string {
  const { styleGuide, sceneIndex, frameSpec, subjectPrimaryLine } = params;
  const pr = styleGuide.promptRegions;
  const ps = styleGuide.perScene.find((p) => p.sceneIndex === sceneIndex);
  const palette = ps?.paletteOverride?.join(", ") ?? styleGuide.global.colorPalette.slice(0, 4).join(", ");
  const subject = subjectPrimaryLine.trim() || "subject";

  const lines = [
    `${pr.subjectPrefix} ${subject}.`,
    `Camera: ${pr.cameraPrefix} ${frameSpec.shotType} composition.`,
    `Lighting: ${pr.lightingPrefix} ${ps?.lightingOverride ?? styleGuide.global.defaultLighting}.`,
    `Background: ${pr.backgroundPrefix}.`,
    `Color palette: ${palette}.`,
    `MEDIUM: ${styleGuide.global.medium}.`,
  ];
  return lines.join("\n");
}
