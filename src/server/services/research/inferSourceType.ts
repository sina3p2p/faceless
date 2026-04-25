import type { ResearchSourceType } from "@/types/pipeline";

/** Coarse source classification from URL + optional title (no LLM). */
export function inferSourceType(url: string, title: string): ResearchSourceType {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "other";
  }
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();
  const t = title.toLowerCase();

  if (host.endsWith(".gov") || host.endsWith(".mil") || host.includes("gov.")) return "gov";
  if (host.includes("wikipedia.org") || host.includes("wikimedia.org")) return "wiki";
  if (
    host.endsWith(".edu") ||
    host.includes("scholar.google") ||
    host.includes("arxiv.org") ||
    host.includes("doi.org")
  )
    return "academic";
  if (
    host.includes("twitter.com") ||
    host.includes("x.com") ||
    host.includes("reddit.com") ||
    host.includes("facebook.com") ||
    host.includes("instagram.com") ||
    host.includes("tiktok.com") ||
    host.includes("linkedin.com")
  )
    return "social";
  if (
    host.includes("nytimes.com") ||
    host.includes("bbc.") ||
    host.includes("reuters.com") ||
    host.includes("apnews.com") ||
    host.includes("theguardian.com") ||
    host.includes("cnn.com") ||
    host.includes("wsj.com") ||
    host.includes("ft.com") ||
    host.includes("bloomberg.com") ||
    path.includes("/news/") ||
    t.includes("breaking news")
  )
    return "news";
  if (
    host.includes("medium.com") ||
    host.includes("substack.com") ||
    host.includes("wordpress.com") ||
    host.includes("blog.")
  )
    return "blog";
  if (
    host.includes("corp.") ||
    host.endsWith(".io") ||
    host.includes("company") ||
    path.includes("/press") ||
    path.includes("/newsroom")
  )
    return "corporate";

  return "other";
}
