import { getProfile, saveProfile } from "../db";
import { claudeJson, FAST_MODEL, text } from "../llm/claude";
import { DEEP_RESEARCH_MODEL, perplexityResearch } from "../llm/perplexity";
import { PROFILER_SYSTEM, RESEARCHER_SYSTEM, researcherQuery } from "../prompts";
import { CATEGORY_BLUEPRINTS, slugify } from "../profiles/seeds";
import { perplexityReady, requireClaude, requirePerplexity } from "../settings";
import { ProfileBodySchema, type Category, type Profile } from "../types";

export const PROFILE_TTL_DAYS = 14;

export function isStale(p: Profile): boolean {
  if (!p.lastVerified) return true;
  return Date.now() - new Date(p.lastVerified).getTime() > PROFILE_TTL_DAYS * 86_400_000;
}

// officialDocs may hold bare domains (seeds) or full URLs (researched); Perplexity wants hostnames.
export function docDomains(p: Profile): string[] {
  const hosts = p.officialDocs.map((d) => {
    try {
      return new URL(d.includes("://") ? d : `https://${d}`).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  });
  return [...new Set(hosts.filter(Boolean))];
}

// Research the model's docs with Perplexity, then have Claude turn the notes into a profile.
export async function refreshProfile(base: Profile, opts: { deep?: boolean } = {}): Promise<{ profile: Profile; costUsd: number }> {
  // Both services are needed; check before spending anything on the first one.
  requireClaude();
  requirePerplexity();
  const domains = docDomains(base);
  let research = await perplexityResearch({
    system: RESEARCHER_SYSTEM,
    query: researcherQuery(base),
    model: opts.deep ? DEEP_RESEARCH_MODEL : undefined,
    domains,
  });
  // Official domains sometimes return nothing useful (new model, moved docs): retry on the open web.
  if (research.text.length < 400 && domains.length) {
    const open = await perplexityResearch({ system: RESEARCHER_SYSTEM, query: researcherQuery(base) });
    research = { ...open, costUsd: research.costUsd + open.costUsd };
  }

  const sources = research.citations.map((c, i) => `[${i + 1}] ${c.title} - ${c.url}`).join("\n");
  const { data, costUsd } = await claudeJson({
    model: FAST_MODEL,
    system: PROFILER_SYSTEM,
    effort: "medium",
    content: [
      text(
        `Model: ${base.name} by ${base.vendor} (category: ${base.category})\n\n` +
          `Starter blueprint:\n${JSON.stringify(base.blueprint.length ? base.blueprint : CATEGORY_BLUEPRINTS[base.category], null, 2)}\n\n` +
          `Starter checklist:\n${base.checklist.map((c) => `- ${c}`).join("\n")}\n\n` +
          `<research>\n${research.text}\n</research>\n\n<sources>\n${sources}\n</sources>`,
      ),
    ],
    schema: ProfileBodySchema,
  });

  const profile: Profile = {
    ...data,
    id: base.id,
    category: base.category,
    citations: research.citations,
    lastVerified: new Date().toISOString(),
    custom: base.custom,
    platforms: base.platforms ?? [],
  };
  saveProfile(profile);
  return { profile, costUsd: research.costUsd + costUsd };
}

export async function ensureProfile(id: string): Promise<{ profile: Profile; researched: boolean; costUsd: number; researchOff?: boolean }> {
  const p = getProfile(id);
  if (!p) throw new Error(`Unknown model profile: ${id}`);
  if (!isStale(p)) return { profile: p, researched: false, costUsd: 0 };
  // Docs research is optional: without a Perplexity key, forge from the profile as it is.
  if (!perplexityReady()) return { profile: p, researched: false, costUsd: 0, researchOff: true };
  try {
    const r = await refreshProfile(p);
    return { profile: r.profile, researched: true, costUsd: r.costUsd };
  } catch (e) {
    // A stale profile still beats no prompt; the UI shows its last-verified date.
    if (p.rules.length) return { profile: p, researched: false, costUsd: 0 };
    throw e;
  }
}

// "Any model" mode: create a profile for a model the app has never seen.
export async function createCustomProfile(input: { name: string; vendor?: string; category: Category; docsUrl?: string }) {
  const id = slugify(input.name);
  if (getProfile(id)) throw new Error(`A profile for "${input.name}" already exists`);
  const base: Profile = {
    id,
    name: input.name,
    vendor: input.vendor || "Unknown",
    category: input.category,
    summary: "",
    officialDocs: input.docsUrl ? [input.docsUrl] : [],
    promptFormat: "",
    maxLength: "unknown",
    supportsNegativePrompt: false,
    params: [],
    blueprint: CATEGORY_BLUEPRINTS[input.category],
    rules: [],
    antiPatterns: [],
    checklist: [],
    examples: [],
    citations: [],
    lastVerified: null,
    custom: true,
    platforms: [],
  };
  return refreshProfile(base);
}
