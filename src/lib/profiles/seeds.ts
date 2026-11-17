import type { Block, Category, Platform, Profile } from "../types";
import catalog from "./catalog.json";

// Starter profiles. They carry the block structure and the official doc domains, and have
// lastVerified = null, so the first forge for each model researches its live docs through
// Perplexity and replaces these rules with cited ones.

const b = (key: string, title: string, purpose: string, required = true): Block => ({ key, title, purpose, required });

export const CATEGORY_BLUEPRINTS: Record<Category, Block[]> = {
  text: [
    b("role_context", "Role & Context", "Who the model is acting as, for whom, and the situation. Sets every later interpretation."),
    b("task", "Task", "The exact job in direct, imperative language, including what success looks like."),
    b("inputs", "Inputs & Data", "Documents, data or variables, clearly delimited (e.g. XML tags) and separate from instructions.", false),
    b("constraints", "Constraints & Rules", "Hard requirements, scope limits, tone and things to avoid, each with its reason."),
    b("output_format", "Output Format", "Exact shape of the answer: structure, length and format."),
    b("examples", "Examples", "A few diverse examples of the ideal output, when the format or style is subtle.", false),
  ],
  image: [
    b("subject", "Subject & Action", "The main subject and what it is doing, stated first because image models weight the opening most."),
    b("composition", "Composition & Camera", "Framing, shot type, angle, lens and depth of field."),
    b("style", "Style & Medium", "Medium (photo, illustration, 3D…), art direction and references."),
    b("lighting", "Lighting & Color", "Light source, quality, time of day and palette."),
    b("details", "Details & Text", "Materials, textures, background, and any exact text to render in quotes.", false),
    b("references", "References", "How attached images are used (style, character or composition reference).", false),
  ],
  // The Higgsfield studio structure: ordered blocks, so the model never has to guess.
  video: [
    b("scene_context", "Scene Context & Style", "The action, visual style rules and world physics. The first ~20% of the prompt anchors everything."),
    b("active_references", "Active References", "Binds each attached image/video to its role, e.g. 'characters, environments and props 100% match the reference'.", false),
    b("shot_structure", "Shot Structure", "Beat-by-beat action with camera moves and timing, like a storyboard in text."),
    b("locks", "Locks & Constraints", "Hard rules the model must obey, e.g. 'no music, SFX only', no text, no cuts, keep identity."),
    b("motion_principles", "Animation Principles", "Squash & stretch, anticipation, follow-through, weight and timing to guide movement.", false),
    b("audio", "Audio Direction", "Dialogue, SFX and ambience for audio-capable models.", false),
  ],
  audio: [
    b("genre_style", "Genre & Style", "Genre, sub-genre, era and reference style descriptors (no artist names where the docs forbid them)."),
    b("mood_energy", "Mood, Tempo & Energy", "Emotion, BPM or tempo feel, and energy curve."),
    b("instrumentation", "Instrumentation & Vocals", "Lead instruments, production style, vocal type and delivery."),
    b("structure", "Structure", "Section tags and arrangement, e.g. [Intro] [Verse] [Chorus].", false),
    b("lyrics", "Lyrics / Script", "Lyrics or spoken text, formatted the way the model documents.", false),
  ],
  "3d": [
    b("object", "Object & Purpose", "What the asset is and how it will be used (game-ready, 3D print, product viz)."),
    b("form", "Shape & Proportions", "Silhouette, proportions, pose (A-pose/T-pose for characters) and key structural parts."),
    b("materials", "Materials & Texture", "Surface materials, PBR properties, colors and texture detail."),
    b("style", "Style", "Realistic, stylized, low-poly, sculpted, toy-like…"),
    b("technical", "Technical Constraints", "Topology, polycount, symmetry, single object vs scene, no background elements.", false),
  ],
};

const CHECKLISTS: Record<Category, string[]> = {
  text: [
    "The task is stated explicitly and unambiguously",
    "Context and motivation behind constraints are given",
    "Input data is delimited from instructions",
    "Output format is fully specified",
    "No contradictory instructions",
  ],
  image: [
    "Main subject appears in the first sentence",
    "Only parameters/syntax the model documents are used",
    "Negative phrasing is handled the way this model supports",
    "Style, lighting and composition are each specified",
    "Any text to render is in quotes",
  ],
  video: [
    "Blocks appear in blueprint order with scene context first",
    "Each shot beat has one clear action and camera instruction",
    "References are bound to explicit roles",
    "Locks state hard constraints plainly",
    "Duration and number of beats are realistic for the model's clip length",
  ],
  audio: [
    "Genre and mood are in the style field, not buried in lyrics",
    "Only documented tags/syntax are used",
    "Structure tags are consistent",
    "Style prompt respects the documented length limit",
  ],
  "3d": [
    "Describes a single, clearly bounded object unless the model supports scenes",
    "Shape, materials and style are each specified",
    "No camera, lighting or background instructions the model ignores",
    "Only documented parameters (polycount, texture, pose) are used",
  ],
};

type Seed = { id?: string; name: string; vendor: string; category: Category; docs: string[]; summary: string; format: string; negative?: boolean; platforms?: Platform[] };

// Models not offered on ComfyUI, Krea or Higgsfield (so absent from catalog.json) but worth having.
const SEEDS: Seed[] = [
  { id: "midjourney", name: "Midjourney", vendor: "Midjourney", category: "image", docs: ["docs.midjourney.com", "midjourney.com"], summary: "Midjourney's image model, prompted with short descriptive text plus -- parameters.", format: "Concise descriptive phrase, then parameters like --ar, --stylize, --sref, --no.", negative: true },
];

// Hand-written seeds win on conflicts; catalog entries (researched from ComfyUI, Krea, Higgsfield and
// vendor docs) fill in everything else. Platforms are merged across duplicates.
function mergeSeeds(): (Seed & { id: string })[] {
  const byId = new Map<string, Seed & { id: string }>();
  for (const s of [...SEEDS, ...(catalog as Seed[])]) {
    const id = s.id ?? slugify(s.name);
    const prev = byId.get(id);
    if (!prev) byId.set(id, { ...s, id, platforms: [...(s.platforms ?? [])] });
    else prev.platforms = [...new Set([...(prev.platforms ?? []), ...(s.platforms ?? [])])];
  }
  return [...byId.values()];
}

export const SEED_PROFILES: Profile[] = mergeSeeds().map((s) => ({
  id: s.id,
  name: s.name,
  vendor: s.vendor,
  category: s.category,
  summary: s.summary,
  officialDocs: s.docs,
  promptFormat: s.format,
  maxLength: "unknown",
  supportsNegativePrompt: s.negative ?? false,
  params: [],
  blueprint: CATEGORY_BLUEPRINTS[s.category],
  rules: [],
  antiPatterns: [],
  checklist: CHECKLISTS[s.category],
  examples: [],
  citations: [],
  lastVerified: null,
  custom: false,
  platforms: s.platforms ?? [],
}));

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}
