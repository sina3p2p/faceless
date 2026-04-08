import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized, badRequest } from "@/lib/api-utils";
import { generateText, tool, stepCountIs } from "ai";
import { openrouter } from "@/server/services/llm";
import { generateNanoBananaImage } from "@/server/services/media";
import { uploadFile } from "@/lib/storage";
import { fal } from "@fal-ai/client";
import { AI_VIDEO } from "@/lib/constants";
import { z } from "zod";

const MODEL = "openai/gpt-4.1";

const SYSTEM = `You are a character design assistant for AI image generation. You help users create character reference images through natural conversation.

YOUR WORKFLOW:
1. When a user describes a character, evaluate if the description is clear enough to generate an image.
2. If the description is too vague or ambiguous (e.g. just "a person"), ask 2-3 focused questions about the most important missing details (appearance, clothing, distinguishing features).
3. Even rough descriptions like "a pirate captain" or "an elf warrior" are fine — fill in creative details yourself. Only ask questions when truly needed.
4. When you have enough detail, call the generate_image tool with a detailed prompt (100-200 words).
5. After generating, ask the user if they're happy or want changes.

WHEN THE USER REQUESTS CHANGES:
- For SMALL tweaks (hair color, add glasses, change outfit, adjust expression): use the edit_image tool with the previous image URL as reference. You can find the previous image URL in the conversation context.
- For MAJOR changes (completely different character, different species, start over): use the generate_image tool from scratch.
- If unsure, prefer edit_image for modifications and generate_image for replacements.

IMAGE PROMPT RULES:
- Write prompts as a vivid single paragraph for an AI image model.
- Full body or upper body, facing slightly toward camera, neutral pose.
- Clean background (solid color or simple gradient).
- Describe: gender, age, ethnicity/skin tone, hair (color/style/length), eye color, facial features, body build, clothing, accessories, pose.
- NO copyrighted characters — if the user references one (e.g. "Elsa", "Spider-Man"), describe the archetype with original details instead. Tell the user you're reimagining it.
- The image should produce a single character, clearly visible, suitable as a reference.

Keep your text responses SHORT and conversational (1-3 sentences). Don't repeat the whole prompt back to the user.`;

interface ToolCallData {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: Record<string, unknown>;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallData[];
}

const requestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      toolCalls: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            args: z.record(z.string(), z.unknown()),
            result: z.record(z.string(), z.unknown()).optional(),
          })
        )
        .optional(),
    })
  ),
});

async function generateAndUpload(
  prompt: string,
  userId: string
): Promise<{ r2Key: string; previewUrl: string } | null> {
  const result = await generateNanoBananaImage(prompt, undefined, "1:1");
  if (!result) return null;

  const imgResp = await fetch(result.url);
  if (!imgResp.ok) throw new Error("Failed to download generated image");
  const buffer = Buffer.from(await imgResp.arrayBuffer());

  const key = `characters/${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  await uploadFile(key, buffer, "image/jpeg");

  return { r2Key: key, previewUrl: result.url };
}

async function editAndUpload(
  editPrompt: string,
  sourceImageUrl: string,
  userId: string
): Promise<{ r2Key: string; previewUrl: string } | null> {
  try {
    const result = await fal.subscribe(`${AI_VIDEO.nanoBananaModel}/edit`, {
      input: {
        prompt: `${editPrompt}. Square 1:1 composition, highly detailed, cinematic lighting, no text or watermarks.`,
        image_urls: [sourceImageUrl],
        aspect_ratio: "1:1",
        output_format: "jpeg",
        resolution: "1K",
        num_images: 1,
        safety_tolerance: "6",
      },
      logs: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const data = result.data as {
      images?: Array<{ url: string; width?: number; height?: number }>;
    };
    const image = data?.images?.[0];
    if (!image?.url) return null;

    const imgResp = await fetch(image.url);
    if (!imgResp.ok) throw new Error("Failed to download edited image");
    const buffer = Buffer.from(await imgResp.arrayBuffer());

    const key = `characters/${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    await uploadFile(key, buffer, "image/jpeg");

    return { r2Key: key, previewUrl: image.url };
  } catch (err) {
    console.error("Image edit failed:", err);
    return null;
  }
}

function buildPlainMessages(messages: ChatMessage[]) {
  const plain: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const m of messages) {
    if (m.role === "user") {
      plain.push({ role: "user", content: m.content });
      continue;
    }

    let text = m.content || "";
    if (m.toolCalls) {
      for (const tc of m.toolCalls) {
        if (tc.result) {
          const r = tc.result;
          if (r.success && r.previewUrl) {
            text += `\n[Image generated successfully. Preview URL: ${r.previewUrl}]`;
          } else if (r.error) {
            text += `\n[Image generation failed: ${r.error}]`;
          }
        }
      }
    }

    if (text.trim()) {
      plain.push({ role: "assistant", content: text.trim() });
    }
  }

  return plain;
}

const generateImageSchema = z.object({
  prompt: z.string().describe(
    "Detailed image generation prompt (100-200 words). Describe the character's full appearance."
  ),
});

const editImageSchema = z.object({
  editPrompt: z.string().describe(
    "Description of the full character with the desired changes applied. Must be a complete prompt, not just the diff."
  ),
  sourceImageUrl: z.string().describe(
    "The preview URL of the most recently generated image to use as reference."
  ),
});

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await req.json();
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const plainMessages = buildPlainMessages(parsed.data.messages as ChatMessage[]);

  try {
    const userId = user.id;

    const result = await generateText({
      model: openrouter.chat(MODEL),
      system: SYSTEM,
      messages: plainMessages,
      tools: {
        generate_image: tool({
          description:
            "Generate a character image from scratch. Use for initial generation or when the user wants a completely different character.",
          inputSchema: generateImageSchema,
          execute: async ({ prompt }) => {
            const uploaded = await generateAndUpload(prompt, userId);
            if (!uploaded) {
              return {
                success: false as const,
                error: "Image generation failed. Try adjusting the description.",
              };
            }
            return {
              success: true as const,
              r2Key: uploaded.r2Key,
              previewUrl: uploaded.previewUrl,
              prompt,
            };
          },
        }),
        edit_image: tool({
          description:
            "Edit an existing character image. Use for small tweaks like changing hair color, adding accessories, adjusting outfit, etc.",
          inputSchema: editImageSchema,
          execute: async ({ editPrompt, sourceImageUrl }) => {
            const uploaded = await editAndUpload(
              editPrompt,
              sourceImageUrl,
              userId
            );
            if (!uploaded) {
              return {
                success: false as const,
                error: "Image edit failed. Try using generate_image instead.",
              };
            }
            return {
              success: true as const,
              r2Key: uploaded.r2Key,
              previewUrl: uploaded.previewUrl,
              prompt: editPrompt,
            };
          },
        }),
      },
      stopWhen: stepCountIs(2),
      temperature: 0.5,
    });

    const toolCalls: ToolCallData[] = [];
    for (const step of result.steps) {
      for (const tc of step.toolCalls) {
        const tr = step.toolResults.find(
          (r) => r.toolCallId === tc.toolCallId
        );
        toolCalls.push({
          id: tc.toolCallId,
          name: tc.toolName,
          args: tc.input as Record<string, unknown>,
          result: tr?.output as Record<string, unknown> | undefined,
        });
      }
    }

    return NextResponse.json({
      content: result.text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    });
  } catch (err) {
    console.error("Character chat failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Something went wrong" },
      { status: 500 }
    );
  }
}
