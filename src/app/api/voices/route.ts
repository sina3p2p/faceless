import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/api-utils";

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  labels: Record<string, string>;
  preview_url: string;
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json([]);
  }

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": apiKey },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return NextResponse.json([]);
    }

    const data = await res.json();
    const voices = (data.voices as ElevenLabsVoice[])
      .filter((v) => v.preview_url)
      .map((v) => ({
        id: v.voice_id,
        name: v.name,
        category: v.category,
        gender: v.labels?.gender || null,
        accent: v.labels?.accent || null,
        age: v.labels?.age || null,
        useCase: v.labels?.use_case || v.labels?.["use case"] || null,
        previewUrl: v.preview_url,
      }));

    return NextResponse.json(voices);
  } catch {
    return NextResponse.json([]);
  }
}
