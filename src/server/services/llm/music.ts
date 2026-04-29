import { generateText as aiGenerateText, Output } from "ai";
import { z } from "zod";
import { LLM, getLanguageName } from "@/lib/constants";
import { openrouter, buildMusicDurationInstruction, type ChatMessage } from "./index";
import type { ResearchPackWithClaims } from "@/types/pipeline";
import { formatResearchEvidence } from "./research-evidence";

const musicLyricsScriptSchema = z.object({
  title: z.string().describe("Catchy song title"),
  lyrics: z.string().describe(
    "Full lyrics body only: use ## Section Name (Intro, Verse 1, Chorus, …) then lines under each section. No # title and no Genre line here."
  ),
});

export type MusicLyricsScript = z.infer<typeof musicLyricsScriptSchema>;

export interface GenerateMusicLyricsParams {
  style: string;
  topicIdea: string;
  language?: string;
  model?: string;
  musicGenreStyle?: string;
  researchPack?: ResearchPackWithClaims | null;
  targetDurationSec?: number;
  durations?: number[];
}

/**
 * Stored in `video_projects.script` as JSON.stringify({ title, lyrics }).
 * Genre comes from user config (`musicGenre`), not from the model.
 */
export async function generateMusicLyrics(params: GenerateMusicLyricsParams): Promise<MusicLyricsScript> {
  const {
    style,
    topicIdea,
    language = "en",
    model,
    musicGenreStyle,
    researchPack,
    targetDurationSec = 60,
    durations,
  } = params;

  const primaryModel = model || LLM.storyModel;
  const langName = getLanguageName(language);
  const researchBlock = researchPack?.claims?.length ? `\n\n${formatResearchEvidence(researchPack)}` : "";

  const systemPrompt = `You are an elite songwriter. Output structured song data only (title + lyrics body).

STRUCTURE:
- title: the song title only (catchy, memorable).
- lyrics: the FULL lyric text as markdown WITH section headings only inside this field:
  - Use ## Intro, ## Verse 1, ## Chorus, ## Verse 2, ## Bridge, ## Outro (or similar).
  - Under each heading, write singable lines (short lines, natural rhythm, rhyme where natural).
  - Do NOT repeat the song title inside lyrics as an H1. Do NOT include any "Genre:" line — production style is chosen separately by the user.

OUTPUT LANGUAGE (CRITICAL):
- title and ALL lyric lines MUST be in ${langName}.

SONGWRITING:
- Chorus catchy and repeatable; verses build the story.
- Total song length should fit roughly ${targetDurationSec} seconds (${buildMusicDurationInstruction(targetDurationSec, durations)})
- Vivid imagery and emotion.${researchBlock}
GENRE CONSTRAINT:
- The user chose this production style for the music generator: ${musicGenreStyle}`

  const userPrompt = `Write a catchy song about: ${topicIdea}. The music video visual style is ${style}. Target sound: ${musicGenreStyle}.`;

  const { output } = await aiGenerateText({
    model: openrouter.chat(primaryModel),
    output: Output.object({ schema: musicLyricsScriptSchema }),
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.85,
  });

  if (!output) throw new Error("Failed to generate music lyrics");
  return output;
}

/** Safe parse for refine / workers. */
export function safeParseMusicLyricsScript(raw: string | null | undefined): MusicLyricsScript | null {
  if (!raw?.trim()) return null;
  try {
    const j = JSON.parse(raw) as unknown;
    const r = musicLyricsScriptSchema.safeParse(j);
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** Map `lyrics` body (with ## sections) to scene-sized chunks for refine-script responses. */
export function parseLyricsBodyIntoSections(lyrics: string): { sectionName: string; body: string }[] {
  const trimmed = lyrics.trim();
  if (!trimmed) return [];

  const parts = trimmed.split(/^##\s+/gm);
  if (parts.length < 2) {
    return [{ sectionName: "Lyrics", body: trimmed }];
  }

  const sections: { sectionName: string; body: string }[] = [];
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];
    const nl = block.indexOf("\n");
    const sectionName = (nl === -1 ? block : block.slice(0, nl)).trim();
    const body = nl === -1 ? "" : block.slice(nl + 1).trim();
    if (sectionName) sections.push({ sectionName, body });
  }
  return sections;
}

export async function refineMusicLyrics(
  current: MusicLyricsScript,
  userMessage: string,
  chatHistory: ChatMessage[] = [],
  model?: string,
  language = "en"
): Promise<MusicLyricsScript> {
  const primaryModel = model || LLM.storyModel;
  const langName = getLanguageName(language);

  const systemPrompt = `You are a collaborative songwriter. The user wants to improve song lyrics through conversation.

CURRENT (JSON shape — title + lyrics body with ## sections inside lyrics):
${JSON.stringify(current, null, 2)}

RULES:
- Return the COMPLETE updated object with the same shape: title + lyrics only.
- lyrics must remain markdown with ## section headings unless the user asks to merge/split sections.
- Only change what the user asks for.
- title and all lyric lines MUST stay in ${langName}.
- Never add a genre field; never put a Genre: line in lyrics.`;

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const msg of chatHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }
  messages.push({ role: "user", content: userMessage });

  const { output } = await aiGenerateText({
    model: openrouter.chat(primaryModel),
    output: Output.object({ schema: musicLyricsScriptSchema }),
    system: systemPrompt,
    messages,
    temperature: 0.7,
  });

  if (!output) throw new Error("Failed to refine music lyrics");
  return output;
}
