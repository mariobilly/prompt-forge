import type { Citation } from "../types";
import { logSpend } from "../db";
import { apiKey, KEY_HOST, MissingKeyError } from "../settings";

// Perplexity's current endpoint first; the older OpenAI-compatible path as a fallback.
// Your key only ever goes to api.perplexity.ai, in the Authorization header.
const ENDPOINTS = [`https://${KEY_HOST.perplexity}/v1/sonar`, `https://${KEY_HOST.perplexity}/chat/completions`];

export const RESEARCH_MODEL = process.env.PF_RESEARCH_MODEL || "sonar-pro";
export const DEEP_RESEARCH_MODEL = process.env.PF_DEEP_RESEARCH_MODEL || "sonar-deep-research";

type SonarResponse = {
  choices: { message: { content: string } }[];
  citations?: string[];
  search_results?: { title?: string; url: string }[];
  usage?: { cost?: { total_cost?: number } };
};

export async function perplexityResearch(opts: {
  system: string;
  query: string;
  model?: string;
  domains?: string[];
}): Promise<{ text: string; citations: Citation[]; costUsd: number }> {
  const key = apiKey("perplexity");
  if (!key) throw new MissingKeyError("perplexity");
  const model = opts.model ?? RESEARCH_MODEL;

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.query },
    ],
    web_search_options: { search_context_size: "high" },
  };
  // Perplexity caps the domain allowlist; keep the first 20.
  if (opts.domains?.length) body.search_domain_filter = opts.domains.slice(0, 20);

  let lastError = "";
  for (const url of ENDPOINTS) {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(model.includes("deep") ? 600_000 : 120_000),
    });
    if (res.status === 404) {
      lastError = `404 from ${url}`;
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new Error(`Perplexity rejected your API key (${res.status}). Check it in Settings.`);
    if (!res.ok) throw new Error(`Perplexity ${res.status}: ${(await res.text()).slice(0, 300)}`);

    const json = (await res.json()) as SonarResponse;
    const raw = json.choices?.[0]?.message?.content ?? "";
    // Reasoning models prefix their answer with a <think> section; keep only the answer.
    const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const citations: Citation[] = json.search_results?.length
      ? json.search_results.map((r) => ({ title: r.title || r.url, url: r.url }))
      : (json.citations ?? []).map((u) => ({ title: u, url: u }));
    const costUsd = json.usage?.cost?.total_cost ?? 0;
    logSpend("perplexity", model, costUsd);
    return { text, citations, costUsd };
  }
  throw new Error(`Perplexity endpoint not found (${lastError})`);
}
