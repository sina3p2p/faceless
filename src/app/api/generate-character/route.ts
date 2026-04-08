import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized, badRequest } from "@/lib/api-utils";
import { generateObject } from "ai";
import { openrouter } from "@/server/services/llm";
import {
  generateImage,
  generateKlingImage,
  generateNanoBananaImage,
  type AspectRatio,
} from "@/server/services/media";
import { uploadFile } from "@/lib/storage";
import { z } from "zod";

const REFINE_MODEL = "openai/gpt-4.1";

const refineResultSchema = z.object({
  status: z
    .enum(["clear", "needs_clarification"])
    .describe("Whether the description is clear enough to generate a character image"),
  questions: z
    .array(z.string())
    .describe("Questions to ask the user if the description needs clarification. Empty if status is 'clear'."),
  refinedPrompt: z
    .string()
    .describe(
      "If clear: a rich, detailed image generation prompt (100-200 words) describing the character precisely. " +
      "Cover: gender, age, ethnicity/skin tone, hair (color, style, length), eye color, facial features, " +
      "body build, clothing, accessories, pose, and background. Write as a single descriptive paragraph for an AI image model. " +
      "If needs_clarification: empty string."
    ),
});

const REFINE_SYSTEM = `You are a character design assistant for AI image generation.
Your job is to evaluate a user's character description and either:
1. If it's clear enough: produce a detailed image generation prompt that will create a consistent, high-quality character reference image.
2. If it's unclear or missing critical details: ask 2-4 focused questions to fill in the gaps.

A description is "clear enough" when you can confidently determine at minimum:
- General appearance (gender, approximate age, build)
- At least one distinguishing visual feature (hair, clothing, etc.)

Even vague prompts like "a pirate captain" are fine — you can fill in reasonable creative details.
Only ask questions when the description is truly ambiguous or contradictory.

When refining a prompt, create a vivid character reference image prompt:
- Full body or upper body, facing slightly toward camera
- Neutral pose, clean background (solid color or simple gradient)
- Describe every visual detail explicitly
- No copyrighted characters — if the user references one, describe the archetype instead
- The prompt should produce a single character, clearly visible, suitable as a reference for consistent recreation`;

const refineSchema = z.object({
  prompt: z.string().min(1),
  conversationHistory: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .optional(),
});

const generateSchema = z.object({
  prompt: z.string().min(1),
  imageModel: z.string().default("dall-e-3"),
});

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await req.json();
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (action === "generate") {
    return handleGenerate(body, user.id);
  }

  return handleRefine(body);
}

async function handleRefine(body: unknown) {
  const parsed = refineSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const { prompt, conversationHistory = [] } = parsed.data;

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...conversationHistory,
    { role: "user", content: prompt },
  ];

  try {
    const { object } = await generateObject({
      model: openrouter.chat(REFINE_MODEL),
      system: REFINE_SYSTEM,
      messages,
      schema: refineResultSchema,
      temperature: 0.4,
    });

    return NextResponse.json(object);
  } catch (err) {
    console.error("Character refine failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Refinement failed" },
      { status: 500 }
    );
  }
}

async function handleGenerate(body: unknown, userId: string) {
  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const { prompt, imageModel } = parsed.data;
  const ar: AspectRatio = "1:1";

  try {
    let result;
    if (imageModel === "nano-banana-2") {
      result = await generateNanoBananaImage(prompt, undefined, ar);
    } else if (imageModel === "kling-image-v3") {
      result = await generateKlingImage(prompt, undefined, undefined, ar);
    } else {
      result = await generateImage(prompt, ar);
    }

    if (!result) {
      return NextResponse.json(
        { error: "Image generation failed. Try a different model or adjust your description." },
        { status: 500 }
      );
    }

    const imgResp = await fetch(result.url);
    if (!imgResp.ok) throw new Error("Failed to download generated image");
    const buffer = Buffer.from(await imgResp.arrayBuffer());

    const key = `characters/${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    await uploadFile(key, buffer, "image/jpeg");

    return NextResponse.json({
      url: key,
      previewUrl: result.url,
      width: result.width,
      height: result.height,
    });
  } catch (err) {
    console.error("Character generation failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
