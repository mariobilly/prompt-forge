import { z } from "zod";

export const CATEGORIES = ["text", "image", "video", "audio", "3d"] as const;

// Where a model can be used. Shown as tags and used to filter the model picker.
export const PLATFORMS = {
  "comfyui-open": "ComfyUI (open weights)",
  "comfyui-api": "ComfyUI Partner API",
  krea: "Krea",
  higgsfield: "Higgsfield",
} as const;
export type Platform = keyof typeof PLATFORMS;
export type Category = (typeof CATEGORIES)[number];

// One ordered section of a prompt. Order matters: models weight the opening of a prompt most.
export const BlockSchema = z.object({
  key: z.string().describe("snake_case identifier, e.g. scene_context"),
  title: z.string().describe("Human label, e.g. 'Scene Context & Style'"),
  purpose: z.string().describe("What this block must establish and why it sits at this position"),
  required: z.boolean(),
});
export type Block = z.infer<typeof BlockSchema>;

export const ParamSchema = z.object({
  name: z.string().describe("Exact parameter name/flag as the docs spell it, e.g. --ar or duration"),
  values: z.string().describe("Allowed values or range as documented"),
  notes: z.string(),
});

export const CitationSchema = z.object({ title: z.string(), url: z.string() });
export type Citation = z.infer<typeof CitationSchema>;

// Everything the app knows about how to prompt one target model.
export const ProfileBodySchema = z.object({
  name: z.string(),
  vendor: z.string(),
  category: z.enum(CATEGORIES),
  summary: z.string().describe("2-3 sentences: what the model is and how it wants to be prompted"),
  officialDocs: z.array(z.string()).describe("Official documentation URLs"),
  promptFormat: z.string().describe("Natural language vs tags vs structured; ideal length; language"),
  maxLength: z.string().describe("Documented prompt length limit, or 'unknown'"),
  supportsNegativePrompt: z.boolean(),
  params: z.array(ParamSchema),
  blueprint: z.array(BlockSchema).describe("Ordered prompt blocks, most important first"),
  rules: z.array(z.string()).describe("Do-this rules taken from official docs"),
  antiPatterns: z.array(z.string()).describe("Things the docs say to avoid or that the model does not support"),
  checklist: z.array(z.string()).describe("Yes/no checks a critic can apply to a finished prompt"),
  examples: z.array(z.string()).describe("Short official or doc-faithful example prompts"),
});
export type ProfileBody = z.infer<typeof ProfileBodySchema>;

export type Profile = ProfileBody & {
  id: string;
  citations: Citation[];
  lastVerified: string | null; // ISO date of the last Perplexity research; null = seed only
  custom: boolean; // added through "Any model"
  platforms: Platform[];
};

export const IntentSchema = z.object({
  goal: z.string().describe("One sentence: what the final output should be"),
  subject: z.string(),
  style: z.string(),
  constraints: z.array(z.string()),
  references: z.string().describe("What the attached references show and how they must be used, or 'none'"),
  language: z.string().describe("Language the user wrote in"),
  questions: z
    .array(z.string())
    .describe("Up to 3 questions ONLY for info that is critical and cannot be reasonably defaulted; empty if none"),
});
export type Intent = z.infer<typeof IntentSchema>;

export const ForgedBlockSchema = z.object({
  key: z.string(),
  title: z.string(),
  content: z.string(),
  why: z.string().describe("One sentence tying this block to a documented rule"),
});

export const ForgedPromptSchema = z.object({
  prompt: z.string().describe("The complete, paste-ready prompt exactly as the target model should receive it"),
  negativePrompt: z.string().describe("Negative prompt if the model supports one, else empty string"),
  params: z.array(z.object({ name: z.string(), value: z.string() })).describe("Settings entered outside the prompt text"),
  blocks: z.array(ForgedBlockSchema),
  notes: z.array(z.string()).describe("Usage tips and assumptions made"),
});
export type ForgedPrompt = z.infer<typeof ForgedPromptSchema>;

export const CritiqueSchema = z.object({
  score: z.number().describe("0-100 against the checklist"),
  issues: z.array(
    z.object({
      severity: z.enum(["critical", "major", "minor"]),
      issue: z.string(),
      fix: z.string(),
    }),
  ),
  passed: z.array(z.string()).describe("Checklist items the prompt satisfies"),
});
export type Critique = z.infer<typeof CritiqueSchema>;

export const MODES = ["create", "improve", "convert"] as const;
export type Mode = (typeof MODES)[number];

export type ForgeRequest = {
  mode: Mode;
  modelId: string;
  input: string; // the idea (create) or an existing prompt (improve / convert)
  sourceModelId?: string; // convert: the model the input prompt was written for
  style?: string;
  answers?: string; // replies to intake questions
  skipQuestions?: boolean;
  images?: { mediaType: string; data: string }[]; // base64 reference images
};

// NDJSON events streamed from /api/forge to the UI.
export type ForgeEvent =
  | { type: "stage"; stage: "intake" | "research" | "compose" | "critique" | "done"; message: string }
  | { type: "questions"; questions: string[]; intent: Intent }
  | { type: "profile"; profile: Profile }
  | { type: "delta"; text: string }
  | { type: "draft"; round: number; result: ForgedPrompt }
  | { type: "critique"; round: number; critique: Critique }
  | { type: "final"; result: ForgedPrompt; critique: Critique; historyId: number; costUsd: number }
  | { type: "error"; message: string };

// ---- Model recommendations ----

export const RequestAnalysisSchema = z.object({
  category: z.enum(CATEGORIES).describe("Which kind of model the request needs"),
  requirements: z
    .array(z.string())
    .describe("3-6 concrete capabilities the output depends on, e.g. 'fast, readable fight choreography without limb morphing'"),
  searchQuery: z.string().describe("A web search question to find current comparisons of models for exactly this kind of generation"),
});
export type RequestAnalysis = z.infer<typeof RequestAnalysisSchema>;

export const PickSchema = z.object({
  modelId: z.string().describe("Exact id from the candidate list"),
  verdict: z.string().describe("One sentence: why this model ranks here for this request"),
  strengths: z.array(z.string()).describe("2-4 strengths that matter for this request, grounded in the research"),
  watchOuts: z.array(z.string()).describe("1-3 limitations or risks for this request"),
  tip: z.string().describe("One practical tip for getting the best result from this model for this request"),
  confidence: z.enum(["high", "medium", "low"]),
});
export type Pick = z.infer<typeof PickSchema>;

export type RankedPick = Pick & { rank: number; profile: Profile };

export type Recommendation = {
  analysis: RequestAnalysis;
  summary: string;
  picks: RankedPick[];
  citations: Citation[];
  costUsd: number;
};

export type RecommendRequest = { input: string; platform?: Platform; category?: Category };

export type RecommendEvent =
  | { type: "stage"; message: string }
  | { type: "result"; recommendation: Recommendation }
  | { type: "error"; message: string };
