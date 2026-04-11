import { generateText as aiGenerateText, Output } from "ai";
import { z } from "zod";
import { LLM, getLanguageName } from "@/lib/constants";
import { openrouter, buildInputTypeInstruction, buildMusicDurationInstruction, type ChatMessage, type StoryAsset } from "./index";

// ── Music Schemas ──
const musicLyricsSectionSchema = z.object({
  sectionName: z.string().describe("Section type, e.g. 'Intro', 'Verse 1', 'Chorus', 'Bridge', 'Outro'"),
  lyrics: z.array(z.string()).describe("Song lyrics for this section, one line per array element"),
  durationMs: z.number().describe("Estimated section duration in milliseconds — will be replaced by actual timestamps after song generation"),
  positiveStyles: z.array(z.string()).describe("Musical elements to include, e.g. 'electric guitar', 'driving drums', 'female vocals'"),
  negativeStyles: z.array(z.string()).describe("Musical elements to avoid, e.g. 'saxophone', 'country twang'"),
});

const musicLyricsSchema = z.object({
  title: z.string().describe("Catchy song title"),
  genre: z.string().describe("Music genre/style for the AI music generator, e.g. 'pop, upbeat, catchy'"),
  sections: z.array(musicLyricsSectionSchema),
});

export type MusicLyrics = z.infer<typeof musicLyricsSchema>;

// ── Music Lyrics Generation ──

export async function generateMusicLyrics(
  niche: string,
  style: string,
  topicIdea?: string,
  targetDuration = 60,
  model?: string,
  previousTopics: string[] = [],
  language = "en",
  durations?: number[]
): Promise<MusicLyrics> {
  const primaryModel = model || LLM.defaultModel;
  const langName = getLanguageName(language);

  const systemPrompt = `You are an elite songwriter. You create songs that go viral on TikTok and YouTube Shorts.

OUTPUT LANGUAGE (CRITICAL):
- ALL lyrics, song title, and sectionName MUST be written in ${langName}.
- genre, positiveStyles, and negativeStyles MUST remain in English for best AI compatibility.

SONGWRITING RULES:
1. Write lyrics that are CATCHY, MEMORABLE, and SINGABLE. Use rhyme, repetition, and strong hooks.
2. The chorus should be the most memorable part — repeat it 2-3 times.
3. Keep lyrics SHORT per line (5-10 words). Each line must be at most 200 characters.
4. Match the genre to the niche: ${niche}
5. Total song duration MUST be approximately ${targetDuration} seconds. This is CRITICAL for cost control.
6. ${buildMusicDurationInstruction(targetDuration, durations)}
7. positiveStyles should describe instruments, tempo, and vocal characteristics that match the genre.
8. negativeStyles should list elements that would clash with the desired sound.
${niche === "kids" ? `
KIDS MUSIC RULES:
- Write fun, educational, catchy songs for ages 4-10.
- Simple words, lots of repetition, energetic and joyful.
- Genre should be upbeat pop or playful children's music.
` : ""}`;

  const seriesContext = previousTopics.length > 0
    ? `\n\nALBUM CONTINUITY — Previous tracks:\n${previousTopics.map((t, i) => `  Track ${previousTopics.length - i}: "${t}"`).join("\n")}\n\nCreate the NEXT track. Same album feel, but fresh topic/lyrics. NEVER repeat.`
    : "";

  const userPrompt = topicIdea
    ? `Create a viral ${niche}-themed song about: ${topicIdea}. The song should be irresistibly catchy.${seriesContext}`
    : `Create a viral ${niche}-themed song. Pick a topic that resonates emotionally.${seriesContext}`;

  const { output } = await aiGenerateText({
    model: openrouter.chat(primaryModel),
    output: Output.object({ schema: musicLyricsSchema }),
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.85,
  });
  if (!output) throw new Error("Failed to generate music lyrics");

  return output;
}

export async function generateStandaloneMusicLyrics(
  prompt: string,
  style: string,
  characters: StoryAsset[] = [],
  targetDuration = 60,
  model?: string,
  language = "en",
  durations?: number[]
): Promise<MusicLyrics> {
  const primaryModel = model || LLM.defaultModel;
  const langName = getLanguageName(language);

  const charBlock = characters.length > 0
    ? `\n\nCHARACTERS / ASSETS:\n${characters.map((c) => `  - ${c.name} (${c.type}): ${c.description}`).join("\n")}\nReference these in the lyrics where appropriate.\n`
    : "";

  const systemPrompt = `You are an elite songwriter. Create songs that go viral on TikTok and YouTube.

OUTPUT LANGUAGE (CRITICAL):
- ALL lyrics, song title, sectionName MUST be in ${langName}.
- genre, positiveStyles, negativeStyles MUST remain in English.

SONGWRITING RULES:
1. CATCHY, MEMORABLE, SINGABLE lyrics. Rhyme, repetition, strong hooks.
2. Chorus = most memorable part, repeat 2-3 times.
3. SHORT lines (5-10 words, max 200 chars each).
4. Total song duration ~${targetDuration} seconds.
5. ${buildMusicDurationInstruction(targetDuration, durations)}
6. positiveStyles: instruments, tempo, vocals.
7. negativeStyles: elements to avoid.
${charBlock}`;

  const userPrompt = buildInputTypeInstruction(prompt) + `\n\nThe song should be irresistibly catchy.`;

  const { output } = await aiGenerateText({
    model: openrouter.chat(primaryModel),
    output: Output.object({ schema: musicLyricsSchema }),
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.85,
  });
  if (!output) throw new Error("Failed to generate standalone music lyrics");

  return output;
}

// ── Music Lyrics Refinement ──

export async function refineMusicLyrics(
  currentLyrics: MusicLyrics,
  userMessage: string,
  chatHistory: ChatMessage[] = [],
  model?: string,
  language = "en"
): Promise<MusicLyrics> {
  const primaryModel = model || LLM.defaultModel;
  const langName = getLanguageName(language);

  const systemPrompt = `You are a collaborative songwriter. The user has song lyrics and wants to improve them through conversation.

CURRENT LYRICS:
${JSON.stringify(currentLyrics, null, 2)}

RULES:
- Apply the user's requested changes and return the COMPLETE modified lyrics
- Only change what the user asks for — preserve everything else exactly as-is
- If the user asks to change a specific section, only modify that section
- If the user asks for tone/style/genre changes, apply them appropriately
- Lyrics must remain singable — short lines, good rhythm
- If the user's request is vague, make your best creative judgment

LANGUAGE RULE (CRITICAL):
- The user may write their instructions in ANY language, but the output (title, lyrics, sectionName) MUST ALWAYS be written in ${langName}.
- genre, positiveStyles, negativeStyles should remain in English for best AI compatibility.
- Never switch the language based on the user's input language. Always output lyrics and titles in ${langName}.`;

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const msg of chatHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  messages.push({ role: "user", content: userMessage });

  const { output } = await aiGenerateText({
    model: openrouter.chat(primaryModel),
    output: Output.object({ schema: musicLyricsSchema }),
    system: systemPrompt,
    messages,
    temperature: 0.7,
  });

  if (!output) throw new Error("Failed to refine music lyrics");
  return output;
}
