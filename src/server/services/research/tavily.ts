import { RESEARCH } from "@/lib/constants";

export interface TavilySearchResult {
  url: string;
  title: string;
  content: string;
  /** ISO date string when Tavily provides it */
  publishedDate?: string | null;
}

export async function tavilySearch(query: string): Promise<TavilySearchResult[]> {
  const apiKey = RESEARCH.tavilyApiKey;
  if (!apiKey) {
    throw new Error(
      "TAVILY_API_KEY is not set. Add it to your environment to use web research, or disable web research for this video."
    );
  }

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: 8,
      include_answer: false,
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Tavily search failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    results?: Array<{
      url?: string;
      title?: string;
      content?: string;
      published_date?: string;
    }>;
  };

  const raw = data.results ?? [];
  return raw
    .filter((r): r is typeof r & { url: string } => typeof r.url === "string" && r.url.length > 0)
    .map((r) => ({
      url: r.url,
      title: typeof r.title === "string" ? r.title : "",
      content: typeof r.content === "string" ? r.content : "",
      publishedDate: r.published_date ?? null,
    }));
}

export function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.pathname = u.pathname.replace(/\/$/, "") || "/";
    return u.href;
  } catch {
    return url;
  }
}
