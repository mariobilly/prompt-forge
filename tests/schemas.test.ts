import { describe, expect, it } from "vitest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { SEED_PROFILES } from "../src/lib/profiles/seeds";
import { CritiqueSchema, ForgedPromptSchema, IntentSchema, ProfileBodySchema } from "../src/lib/types";
import { profileContext } from "../src/lib/prompts";
import { docDomains } from "../src/lib/pipeline/research";

describe("seed profiles", () => {
  it("all validate against the profile schema", () => {
    for (const p of SEED_PROFILES) expect(ProfileBodySchema.safeParse(p).success, p.id).toBe(true);
  });

  it("cover the full catalog across every category and platform", () => {
    expect(SEED_PROFILES.length).toBeGreaterThan(300);
    for (const c of ["text", "image", "video", "audio", "3d"]) expect(SEED_PROFILES.some((p) => p.category === c), c).toBe(true);
    for (const pl of ["comfyui-open", "comfyui-api", "krea", "higgsfield"]) expect(SEED_PROFILES.some((p) => p.platforms.includes(pl as never)), pl).toBe(true);
  });

  it("have unique ids and non-empty blueprints", () => {
    expect(new Set(SEED_PROFILES.map((p) => p.id)).size).toBe(SEED_PROFILES.length);
    for (const p of SEED_PROFILES) expect(p.blueprint.length).toBeGreaterThan(2);
  });

  it("video blueprints follow the studio block order", () => {
    const keys = SEED_PROFILES.find((p) => p.id === "seedance-2-0")!.blueprint.map((b) => b.key);
    expect(keys.slice(0, 5)).toEqual(["scene_context", "active_references", "shot_structure", "locks", "motion_principles"]);
  });
});

describe("structured output schemas", () => {
  it("convert to JSON-schema output formats", () => {
    for (const s of [ProfileBodySchema, IntentSchema, ForgedPromptSchema, CritiqueSchema]) {
      expect(() => zodOutputFormat(s)).not.toThrow();
    }
  });

  it("parse a well-formed critique", () => {
    const r = CritiqueSchema.safeParse({ score: 92, issues: [{ severity: "minor", issue: "x", fix: "y" }], passed: ["a"] });
    expect(r.success).toBe(true);
  });

  it("reject a critique with an unknown severity", () => {
    expect(CritiqueSchema.safeParse({ score: 50, issues: [{ severity: "huge", issue: "x", fix: "y" }], passed: [] }).success).toBe(false);
  });
});

describe("helpers", () => {
  it("profile context is deterministic (cache-stable)", () => {
    const p = SEED_PROFILES[0];
    expect(profileContext(p)).toBe(profileContext(structuredClone(p)));
  });

  it("docDomains normalizes URLs and bare domains", () => {
    const p = { ...SEED_PROFILES[0], officialDocs: ["https://www.docs.claude.com/en/prompting", "docs.claude.com", "bad url::"] };
    expect(docDomains(p)).toEqual(["docs.claude.com"]);
  });
});
