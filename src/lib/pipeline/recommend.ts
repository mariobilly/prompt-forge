import { z } from "zod";
import { listProfiles } from "../db";
import { claudeJson, FAST_MODEL, text, WRITER_MODEL } from "../llm/claude";
import { perplexityResearch } from "../llm/perplexity";
import { ANALYZE_REQUEST_SYSTEM, MODEL_SCOUT_SYSTEM, RANK_MODELS_SYSTEM } from "../prompts";
import { requireClaude, requirePerplexity } from "../settings";
import { PickSchema, RequestAnalysisSchema, type RecommendEvent, type RecommendRequest } from "../types";

// Suggests the 3 best catalog models for a request: analyze needs → research current evidence → rank.
export async function runRecommend(req: RecommendRequest, emit: (e: RecommendEvent) => void): Promise<void> {
  let cost = 0;
  // Suggestions rest on live web research, so they need both services.
  requireClaude();
  requirePerplexity();

  emit({ type: "stage", message: "Analyzing what your request needs…" });
  const analyzed = await claudeJson({
    model: FAST_MODEL,
    system: ANALYZE_REQUEST_SYSTEM,
    content: [text(`<request>\n${req.input}\n</request>${req.category ? `\n\nThe user wants a ${req.category} model.` : ""}`)],
    schema: RequestAnalysisSchema,
    effort: "low",
  });
  cost += analyzed.costUsd;
  const analysis = { ...analyzed.data, category: req.category ?? analyzed.data.category };

  const candidates = listProfiles().filter(
    (p) => p.category === analysis.category && (!req.platform || p.platforms.includes(req.platform)),
  );
  if (candidates.length === 0) throw new Error(`No ${analysis.category} models in the catalog match that platform.`);

  emit({ type: "stage", message: `Researching the best ${analysis.category} models for this (${candidates.length} candidates)…` });
  const research = await perplexityResearch({
    system: MODEL_SCOUT_SYSTEM,
    query:
      `${analysis.searchQuery}\n\nUse case: ${req.input}\nWhat matters most: ${analysis.requirements.join("; ")}.\n` +
      `Compare these candidate models where evidence exists: ${candidates.map((c) => c.name).join(", ")}.`,
  });
  cost += research.costUsd;

  emit({ type: "stage", message: "Ranking the top 3…" });
  const ids = candidates.map((c) => c.id) as [string, ...string[]];
  const RankSchema = z.object({
    summary: z.string().describe("2 sentences: the overall recommendation and the key trade-off between the picks"),
    picks: z.array(PickSchema.extend({ modelId: z.enum(ids) })).describe("Up to 3 picks, best first"),
  });
  const candidateList = candidates
    .map((c) => `- ${c.id}: ${c.name} (${c.vendor}; on ${c.platforms.join(", ") || "vendor platform"}) - ${c.summary}`)
    .join("\n");
  const ranked = await claudeJson({
    model: WRITER_MODEL,
    system: RANK_MODELS_SYSTEM,
    content: [
      text(
        `<request>\n${req.input}\n</request>\n\n` +
          `<requirements>\n${analysis.requirements.map((r) => `- ${r}`).join("\n")}\n</requirements>\n\n` +
          `<research>\n${research.text}\n</research>\n\n<candidates>\n${candidateList}\n</candidates>`,
      ),
    ],
    schema: RankSchema,
    effort: "high",
  });
  cost += ranked.costUsd;

  const seen = new Set<string>();
  const picks = ranked.data.picks
    .filter((p) => (seen.has(p.modelId) ? false : (seen.add(p.modelId), true)))
    .slice(0, 3)
    .map((p, i) => ({ ...p, rank: i + 1, profile: candidates.find((c) => c.id === p.modelId)! }));

  emit({ type: "result", recommendation: { analysis, summary: ranked.data.summary, picks, citations: research.citations, costUsd: cost } });
}
