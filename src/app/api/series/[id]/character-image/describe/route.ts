import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { series } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq, and } from "drizzle-orm";
import { getSignedDownloadUrl } from "@/lib/storage";
import { generateText } from "ai";
import { openrouter } from "@/server/services/llm";
import { z } from "zod/v4";

const VISION_MODEL = "openai/gpt-4.1";
const SYSTEM_PROMPT = `You are a character description specialist for AI image/video generation. 
Describe the character in the image in detail so AI models can recreate them consistently.
Include: gender, approximate age, ethnicity/skin tone, hair (color, style, length), eye color, 
facial features, body build, clothing, accessories, and any distinctive features.
Keep it concise but thorough (2-4 sentences). Write in plain descriptive language, no conversational text.
Example: "A young East Asian woman in her late 20s with long straight black hair and dark brown eyes. She has a slender build, light skin, and delicate facial features with high cheekbones. She wears a burgundy leather jacket over a white t-shirt."`;

const bodySchema = z.object({
  index: z.number().int().min(0),
});

type CharacterImage = { url: string; description: string };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const existing = await db.query.series.findFirst({
    where: and(eq(series.id, id), eq(series.userId, user.id)),
    columns: { id: true, characterImages: true },
  });
  if (!existing) return notFound("Series not found");

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const images = (existing.characterImages ?? []) as CharacterImage[];
  if (parsed.data.index >= images.length) return badRequest("Invalid index");

  const charImage = images[parsed.data.index];
  const imageUrl = charImage.url.startsWith("http")
    ? charImage.url
    : await getSignedDownloadUrl(charImage.url);

  try {
    const { text } = await generateText({
      model: openrouter.chat(VISION_MODEL),
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", image: new URL(imageUrl) },
            { type: "text", text: "Describe this character in detail for AI image generation consistency." },
          ],
        },
      ],
      maxOutputTokens: 300,
      temperature: 0.3,
    });

    const description = text.trim();

    const updatedImages = [...images];
    updatedImages[parsed.data.index] = { ...updatedImages[parsed.data.index], description };

    await db
      .update(series)
      .set({ characterImages: updatedImages, updatedAt: new Date() })
      .where(eq(series.id, id));

    return NextResponse.json({ description, characterImages: updatedImages });
  } catch (err) {
    console.error("AI describe failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI description failed" },
      { status: 500 }
    );
  }
}
