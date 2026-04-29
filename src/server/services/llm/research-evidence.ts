import type { ResearchPackWithClaims } from "@/types/pipeline";

export function formatResearchEvidence(pack: ResearchPackWithClaims): string {
  const lines = pack.claims.map((c, i) => {
    const pub = c.sourcePublishedAt ? c.sourcePublishedAt.toISOString().slice(0, 10) : "unknown";
    return `${i + 1}. [${c.confidence}] ${c.claimText}
   Source: ${c.sourceTitle} (${c.sourceDomain}) | published: ${pub} | ${c.sourceUrl}
   Evidence: ${c.evidenceSnippet.slice(0, 500)}${c.evidenceSnippet.length > 500 ? "…" : ""}`;
  });
  return `RESEARCH_EVIDENCE (web retrieval; use only these for factual assertions):
${lines.join("\n\n")}

GROUNDING RULE (non-negotiable):
- Do not state specific facts, numbers, proper names, or dates that are not supported by the research evidence above.
- If a desired detail is missing or confidence is low, use uncertainty ("reportedly", "some sources suggest") or omit.
- Creative metaphors and emotional language are allowed; factual claims about the real world must follow this rule.`;
}
