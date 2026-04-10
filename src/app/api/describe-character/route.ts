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

  const contentType = req.headers.get("content-type") || "";
  let dataUrl: string;

  if (contentType.includes("application/json")) {
    const body = await req.json();
    const imageUrl = body.imageUrl as string;
    if (!imageUrl) return badRequest("No imageUrl provided");

    const { getSignedDownloadUrl } = await import("@/lib/storage");
    const signedUrl = imageUrl.startsWith("http")
      ? imageUrl
      : await getSignedDownloadUrl(imageUrl);

    const imgRes = await fetch(signedUrl);
    if (!imgRes.ok) return badRequest("Could not fetch image");
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const mime = imgRes.headers.get("content-type") || "image/jpeg";
    dataUrl = `data:${mime.split(";")[0]};base64,${buffer.toString("base64")}`;
  } else {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return badRequest("No file provided");

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return badRequest("File must be JPEG, PNG, or WebP");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    dataUrl = `data:${file.type};base64,${buffer.toString("base64")}`;
  }

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
