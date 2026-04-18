import { generateText as aiGenerateText, Output } from "ai";
import { LLM, getLanguageName } from "@/lib/constants";
import type { ChatMessage } from "@/types/llm-common";
import { narrationScriptSchema, type NarrationScript } from "@/types/narration-schemas";
import { openrouter } from "./openrouter-client";

export async function refineNarrationScript(
  currentScript: NarrationScript,
  userMessage: string,
  chatHistory: ChatMessage[] = [],
  model?: string,
  language = "en"
): Promise<NarrationScript> {
  const primaryModel = model || LLM.defaultModel;
  const langName = getLanguageName(language);

  const systemPrompt = `You are a collaborative video script editor. The user has a narration script with director's notes and wants to improve it through conversation.

CURRENT SCRIPT:
${JSON.stringify(currentScript, null, 2)}

RULES:
- Apply the user's requested changes to the script and return the COMPLETE modified script
- Only change what the user asks for — preserve everything else exactly as-is
- If the user asks to change a specific scene, only modify that scene
- If the user asks for tone/style changes, apply them across all scenes (including directorNotes)
- Maintain the same JSON structure
- If the user's request is vague, make your best creative judgment
- You can add, remove, reorder, or merge scenes if the user asks
- ONE ACTION PER SCENE: Each scene must show exactly ONE clear action.
- When adding new scenes, always include sceneTitle and a detailed directorNote
- When modifying a scene's narration, update the directorNote to match if the visual intent changed
- directorNote should always be in English. sceneTitle and text follow the language rule below.

LANGUAGE RULE (CRITICAL):
- The user may write their instructions in ANY language, but the script output (title, hook, narration text, CTA, sceneTitle) MUST ALWAYS be written in ${langName}.
- directorNote MUST be in English (for AI model compatibility).
- Never switch the script language based on the user's input language.`;

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const msg of chatHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }
  messages.push({ role: "user", content: userMessage });

  const { output } = await aiGenerateText({
    model: openrouter.chat(primaryModel),
    output: Output.object({ schema: narrationScriptSchema }),
    system: systemPrompt,
    messages,
    temperature: 0.7,
  });
  if (!output) throw new Error("Failed to refine narration script");

  return output;
}
