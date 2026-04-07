import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized, badRequest } from "@/lib/api-utils";
import { generateText } from "ai";
import { openrouter } from "@/server/services/llm";

const VISION_MODEL = "openai/gpt-4.1";
const SYSTEM_PROMPT = `You are a character description specialist for AI image/video generation. 
Describe the character in the image in detail so AI models can recreate them consistently.
Include: gender, approximate age, ethnicity/skin tone, hair (color, style, length), eye color, 
facial features, body build, clothing, accessories, and any distinctive features.
Keep it concise but thorough (2-4 sentences). Write in plain descriptive language, no conversational text.
Example: "A young East Asian woman in her late 20s with long straight black hair and dark brown eyes. She has a slender build, light skin, and delicate facial features with high cheekbones. She wears a burgundy leather jacket over a white t-shirt."`;

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) return badRequest("No file provided");

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return badRequest("File must be JPEG, PNG, or WebP");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const dataUrl = `data:${file.type};base64,${base64}`;

  try {
    const { text } = await generateText({
      model: openrouter.chat(VISION_MODEL),
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", image: new URL(dataUrl) },
            { type: "text", text: "Describe this character in detail for AI image generation consistency." },
          ],
        },
      ],
      maxOutputTokens: 300,
      temperature: 0.3,
    });

    return NextResponse.json({ description: text.trim() });
  } catch (err) {
    console.error("AI describe failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI description failed" },
      { status: 500 }
    );
  }
}
