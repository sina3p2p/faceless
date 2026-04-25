import { generateText as aiGenerateText, Output } from "ai";
import { z } from "zod";
import { RESEARCH, getLanguageName } from "@/lib/constants";
import { openrouter } from "@/server/services/llm/openrouter-client";
import type { CreativeBrief } from "@/types/pipeline";
import type { ResearchClaimConfidence, ResearchSourceType } from "@/types/pipeline";
import { inferSourceType } from "./inferSourceType";
import { hostnameFromUrl, normalizeUrl, tavilySearch, type TavilySearchResult } from "./tavily";

const researchQueriesSchema = z.object({
  queries: z.array(z.string().min(2)).min(3).max(6),
});

const extractedClaimSchema = z.object({
  claimText: z.string().min(1),
  sourceUrl: z.string().url(),
  evidenceSnippet: z.string().min(1).max(2000),
  confidence: z.enum(["high", "medium", "low"]),
});

const researchExtractionSchema = z.object({
  claims: z.array(extractedClaimSchema).min(1).max(35),
});

export interface BuiltResearchClaim {
  claimOrder: number;
  claimText: string;
  sourceUrl: string;
  evidenceSnippet: string;
  retrievedAt: Date;
  asOfDate: Date | null;
  confidence: ResearchClaimConfidence;
  sourceTitle: string;
  sourceDomain: string;
  sourcePublishedAt: Date | null;
  sourceType: ResearchSourceType | null;
}

export interface BuiltResearchPack {
  queries: string[];
  searchProvider: "tavily";
  claims: BuiltResearchClaim[];
}

function mergeDedupedResults(perQuery: TavilySearchResult[][]): TavilySearchResult[] {
  const byNorm = new Map<string, TavilySearchResult>();
  for (const group of perQuery) {
    for (const r of group) {
      const key = normalizeUrl(r.url);
      if (!byNorm.has(key)) byNorm.set(key, r);
    }
  }
  return [...byNorm.values()];
}

function findSourceRow(rows: TavilySearchResult[], sourceUrl: string): TavilySearchResult | undefined {
  const target = normalizeUrl(sourceUrl);
  return rows.find((r) => normalizeUrl(r.url) === target);
}

function parseOptionalIsoDate(s: string | null | undefined): Date | null {
  if (!s || typeof s !== "string") return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function buildResearchPack(input: {
  topicIdea: string;
  language: string;
  videoType: string;
  brief: CreativeBrief;
  model?: string;
}): Promise<BuiltResearchPack> {
  const { topicIdea, language, videoType, brief } = input;
  const primaryModel = input.model || RESEARCH.researchModel;
  const langName = getLanguageName(language);

  const querySystem = `You plan web search queries for factual research before writing a script or song.
Output 3–6 diverse search queries (English is fine for search engines) that will find reputable sources about the topic.
Video type: ${videoType}. Creative concept from brief: ${brief.concept}
Topic / user idea: ${topicIdea}
Language for the final video: ${langName} (queries may still be in English for better search results).`;

  const { output: queryOut } = await aiGenerateText({
    model: openrouter.chat(primaryModel),
    output: Output.object({ schema: researchQueriesSchema }),
    system: querySystem,
    prompt: "Return only the queries array.",
    temperature: 0.4,
  });
  if (!queryOut?.queries?.length) throw new Error("Research query planning produced no queries");

  const perQuery: TavilySearchResult[][] = [];
  for (const q of queryOut.queries) {
    perQuery.push(await tavilySearch(q));
  }
  const corpus = mergeDedupedResults(perQuery);
  if (corpus.length === 0) {
    throw new Error("Web search returned no results; try a broader topic or check Tavily quota.");
  }

  const corpusBlock = corpus
    .slice(0, 40)
    .map(
      (r, i) =>
        `[${i}] url=${r.url}\ntitle=${r.title}\nsnippet=${r.content.slice(0, 1200)}${r.publishedDate ? `\npublished_date=${r.publishedDate}` : ""}`
    )
    .join("\n\n---\n\n");

  const extractSystem = `You extract ATOMIC factual claims for a writer. Each claim must be directly supported by ONE source from the corpus.
Rules:
- sourceUrl MUST be copied EXACTLY from one of the bracketed corpus entries (the url= value).
- evidenceSnippet MUST be a short verbatim or near-verbatim excerpt from that source's snippet (or title if needed), max ~400 chars.
- confidence: high = directly stated; medium = clear paraphrase of one fact; low = thin or partially supported.
- Do not invent URLs, titles, or facts not present in the corpus.
- Prefer 8–25 claims when the corpus is rich; fewer if sources are thin.`;

  const { output: extractOut } = await aiGenerateText({
    model: openrouter.chat(primaryModel),
    output: Output.object({ schema: researchExtractionSchema }),
    system: extractSystem,
    prompt: `CORPUS (use only these sources):\n\n${corpusBlock}\n\nExtract claims grounded in the corpus for this production brief:\n- Tone: ${brief.tone}\n- Narrative arc: ${brief.narrativeArc}`,
    temperature: 0.2,
  });
  if (!extractOut?.claims?.length) throw new Error("Claim extraction produced no claims");

  const retrievedAt = new Date();
  const allowed = new Set(corpus.map((r) => normalizeUrl(r.url)));

  const claims: BuiltResearchClaim[] = [];
  let order = 0;
  for (const c of extractOut.claims) {
    const norm = normalizeUrl(c.sourceUrl);
    if (!allowed.has(norm)) continue;
    const row = findSourceRow(corpus, c.sourceUrl);
    if (!row) continue;
    const sourceDomain = hostnameFromUrl(row.url);
    const sourceType = inferSourceType(row.url, row.title);
    const sourcePublishedAt = parseOptionalIsoDate(row.publishedDate);
    claims.push({
      claimOrder: order++,
      claimText: c.claimText.trim(),
      sourceUrl: row.url,
      evidenceSnippet: c.evidenceSnippet.trim().slice(0, 2000),
      retrievedAt,
      asOfDate: null,
      confidence: c.confidence,
      sourceTitle: row.title || sourceDomain,
      sourceDomain: sourceDomain || "unknown",
      sourcePublishedAt,
      sourceType,
    });
  }

  if (claims.length === 0) {
    throw new Error("No valid claims after validating source URLs against the search corpus.");
  }

  return {
    queries: queryOut.queries,
    searchProvider: "tavily",
    claims,
  };
}
