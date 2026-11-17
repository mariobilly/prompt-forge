import type Anthropic from "@anthropic-ai/sdk";
import { addHistory, getProfile } from "../db";
import { claudeJson, FAST_MODEL, image, text, WRITER_MODEL } from "../llm/claude";
import { CRITIC_SYSTEM, ENGINEER_SYSTEM, INTAKE_SYSTEM, intentText, profileContext } from "../prompts";
import {
  CritiqueSchema,
  ForgedPromptSchema,
  IntentSchema,
  type Critique,
  type ForgedPrompt,
  type ForgeEvent,
  type ForgeRequest,
  type Intent,
  type Profile,
} from "../types";
import { requireClaude } from "../settings";
import { ensureProfile } from "./research";

const TARGET_SCORE = 90;
const MAX_REVISIONS = 2;

function renderPrompt(r: ForgedPrompt): string {
  const parts = [r.prompt];
  if (r.negativePrompt) parts.push(`Negative prompt: ${r.negativePrompt}`);
  if (r.params.length) parts.push(`Settings: ${r.params.map((p) => `${p.name}=${p.value}`).join(", ")}`);
  return parts.join("\n\n");
}

async function intake(req: ForgeRequest, target: Profile, source: Profile | null) {
  const content: Anthropic.ContentBlockParam[] = (req.images ?? []).map((i) => image(i.mediaType, i.data));
  const task =
    req.mode === "create"
      ? `The user wants a prompt for ${target.name} (${target.category}).\n\n<request>\n${req.input}\n</request>`
      : `The user supplied an existing prompt${source ? ` written for ${source.name}` : ""}. Extract the intent behind it; it will be rewritten for ${target.name}.\n\n<existing_prompt>\n${req.input}\n</existing_prompt>`;
  content.push(
    text(
      [
        task,
        req.style ? `Requested style: ${req.style}` : "",
        req.answers ? `<answers_to_your_questions>\n${req.answers}\n</answers_to_your_questions>` : "",
        req.skipQuestions || req.answers ? "Do not ask questions; default anything missing." : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    ),
  );
  return claudeJson({ model: FAST_MODEL, system: INTAKE_SYSTEM, content, schema: IntentSchema, effort: "low" });
}

async function critique(target: Profile, intent: Intent, prompt: string) {
  return claudeJson({
    model: FAST_MODEL,
    system: CRITIC_SYSTEM,
    context: profileContext(target),
    content: [text(`<intent>\n${intentText(intent)}\n</intent>\n\n<prompt_to_review>\n${prompt}\n</prompt_to_review>`)],
    schema: CritiqueSchema,
    effort: "medium",
  });
}

async function compose(
  target: Profile,
  intent: Intent,
  req: ForgeRequest,
  revision: { draft: ForgedPrompt; critique: Critique } | null,
  onText: (t: string) => void,
) {
  const parts = [`<intent>\n${intentText(intent)}\n</intent>`];
  if (req.mode !== "create") parts.push(`<original_prompt>\n${req.input}\n</original_prompt>`);
  if (req.mode === "improve") parts.push("Rewrite the original prompt for the target model, keeping its intent and fixing every weakness.");
  if (req.mode === "convert") parts.push("Translate the original prompt for the target model: keep the creative intent, but use only this model's documented format and syntax.");
  if (revision) {
    parts.push(
      `<previous_draft>\n${renderPrompt(revision.draft)}\n</previous_draft>`,
      `<review score="${revision.critique.score}">\n${revision.critique.issues.map((i) => `- [${i.severity}] ${i.issue} → ${i.fix}`).join("\n")}\n</review>`,
      "Produce an improved version that fixes every issue in the review without losing what already works.",
    );
  }
  return claudeJson({
    model: WRITER_MODEL,
    system: ENGINEER_SYSTEM,
    context: profileContext(target),
    content: [text(parts.join("\n\n"))],
    schema: ForgedPromptSchema,
    effort: "high",
    onText,
  });
}

export async function runForge(req: ForgeRequest, emit: (e: ForgeEvent) => void): Promise<void> {
  let cost = 0;
  requireClaude();

  emit({ type: "stage", stage: "research", message: "Loading the model's documentation profile…" });
  const researched = await ensureProfile(req.modelId);
  const target = researched.profile;
  cost += researched.costUsd;
  if (researched.researched) emit({ type: "stage", stage: "research", message: `Researched ${target.name} docs live (${target.citations.length} sources)` });
  if (researched.researchOff) emit({ type: "stage", stage: "research", message: `Docs research is off (no Perplexity key): using the saved ${target.name} profile` });
  emit({ type: "profile", profile: target });

  const source = req.mode === "convert" && req.sourceModelId ? getProfile(req.sourceModelId) : null;

  emit({ type: "stage", stage: "intake", message: "Understanding your request…" });
  const intake_ = await intake(req, target, source);
  cost += intake_.costUsd;
  const intent = intake_.data;
  if (intent.questions.length && !req.skipQuestions && !req.answers) {
    emit({ type: "questions", questions: intent.questions.slice(0, 3), intent });
    return;
  }

  if (req.mode === "improve") {
    emit({ type: "stage", stage: "critique", message: "Scoring your original prompt…" });
    const base = await critique(target, intent, req.input);
    cost += base.costUsd;
    emit({ type: "critique", round: 0, critique: base.data });
  }

  let best: { draft: ForgedPrompt; critique: Critique } | null = null;
  let last: { draft: ForgedPrompt; critique: Critique } | null = null;
  for (let round = 1; round <= MAX_REVISIONS + 1; round++) {
    emit({ type: "stage", stage: "compose", message: round === 1 ? `Engineering the prompt for ${target.name}…` : `Revising (round ${round})…` });
    const draft = await compose(target, intent, req, last, (t) => emit({ type: "delta", text: t }));
    cost += draft.costUsd;
    emit({ type: "draft", round, result: draft.data });

    emit({ type: "stage", stage: "critique", message: "Checking it against the documentation…" });
    const review = await critique(target, intent, renderPrompt(draft.data));
    cost += review.costUsd;
    emit({ type: "critique", round, critique: review.data });

    last = { draft: draft.data, critique: review.data };
    if (!best || review.data.score >= best.critique.score) best = last;
    if (review.data.score >= TARGET_SCORE) break;
  }

  const historyId = addHistory({
    mode: req.mode,
    model_id: target.id,
    input: req.input,
    result_json: JSON.stringify({ result: best!.draft, critique: best!.critique }),
    score: Math.round(best!.critique.score),
    cost_usd: cost,
  });
  emit({ type: "stage", stage: "done", message: "Done" });
  emit({ type: "final", result: best!.draft, critique: best!.critique, historyId, costUsd: cost });
}
