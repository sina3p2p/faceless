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
    console.warn("[voices] ELEVENLABS_API_KEY is not set");
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": apiKey },
      cache: "no-store",
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[voices] ElevenLabs API error: ${res.status} ${errText}`);
      return NextResponse.json({ error: `ElevenLabs API error: ${res.status}` }, { status: 502 });
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
  } catch (err) {
    console.error("[voices] Failed to fetch voices:", err);
    return NextResponse.json({ error: "Failed to fetch voices" }, { status: 500 });
  }
}
