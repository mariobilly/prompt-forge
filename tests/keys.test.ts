import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { claudeJson, text } from "../src/lib/llm/claude";
import { perplexityResearch } from "../src/lib/llm/perplexity";
import { ensureProfile } from "../src/lib/pipeline/research";
import { apiKey, claudeProvider, maskKey, MissingKeyError, publicSettings, settingsFile, updateSettings } from "../src/lib/settings";

// Every test runs against a fresh, empty data folder, with no keys from the environment, and with fetch
// replaced by a fake: nothing here reaches a real service.
const ENV = ["ANTHROPIC_API_KEY", "PERPLEXITY_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "PF_CLAUDE_PROVIDER", "PROMPTFORGE_DATA_DIR"];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
const root = fs.mkdtempSync(path.join(os.tmpdir(), "promptforge-test-"));

const FAKE_ANTHROPIC = "sk-ant-api03-FAKEFAKEFAKEFAKEFAKE-test-a1b2";
const FAKE_PERPLEXITY = "pplx-FAKEFAKEFAKEFAKEFAKEFAKE-c3d4";

type Seen = { url: URL; headers: Headers; body: string };
let seen: Seen[] = [];

function fakeFetch(respond: (s: Seen) => Response) {
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const req = input instanceof Request ? input : null;
    const s: Seen = {
      url: new URL(req ? req.url : String(input)),
      headers: new Headers(init?.headers ?? req?.headers),
      body: typeof init?.body === "string" ? init.body : req ? await req.text() : "",
    };
    seen.push(s);
    return respond(s);
  });
}

beforeEach(() => {
  for (const k of ENV) delete process.env[k];
  process.env.PROMPTFORGE_DATA_DIR = fs.mkdtempSync(path.join(root, "data-"));
  seen = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("settings", () => {
  it("start with no keys and the API provider", () => {
    expect(apiKey("anthropic")).toBeNull();
    expect(apiKey("perplexity")).toBeNull();
    expect(claudeProvider()).toBe("api");
    expect(publicSettings().ready).toEqual({ claude: false, perplexity: false });
  });

  it("save a key only in the user's data folder and never return it in full", () => {
    updateSettings({ anthropicApiKey: `  ${FAKE_ANTHROPIC}  ` });
    expect(settingsFile().startsWith(process.env.PROMPTFORGE_DATA_DIR!)).toBe(true);
    expect(fs.readFileSync(settingsFile(), "utf8")).toContain(FAKE_ANTHROPIC);
    expect(apiKey("anthropic")).toBe(FAKE_ANTHROPIC);

    const pub = publicSettings();
    expect(JSON.stringify(pub)).not.toContain(FAKE_ANTHROPIC);
    expect(pub.keys.anthropic).toMatchObject({ set: true, source: "settings", masked: "sk-...a1b2" });
    expect(pub.ready.claude).toBe(true);

    updateSettings({ anthropicApiKey: null });
    expect(apiKey("anthropic")).toBeNull();
  });

  it("fall back to environment variables, with a saved key winning", () => {
    process.env.PERPLEXITY_API_KEY = "pplx-from-the-environment-0000";
    expect(publicSettings().keys.perplexity).toMatchObject({ set: true, source: "env", masked: "pplx-...0000" });
    updateSettings({ perplexityApiKey: FAKE_PERPLEXITY });
    expect(apiKey("perplexity")).toBe(FAKE_PERPLEXITY);
  });

  it("reject things that are not keys", () => {
    expect(() => updateSettings({ anthropicApiKey: "not a key" })).toThrow();
    expect(() => updateSettings({ claudeProvider: "other" as never })).toThrow();
  });

  it("use Claude Code only when chosen", () => {
    process.env.PF_CLAUDE_PROVIDER = "subscription";
    expect(claudeProvider()).toBe("claude-code");
    updateSettings({ claudeProvider: "api" });
    expect(claudeProvider()).toBe("api");
  });

  it("mask keys to a prefix and the last 4 characters", () => {
    expect(maskKey(FAKE_PERPLEXITY)).toBe("pplx-...c3d4");
    expect(maskKey("short")).toBe("****");
  });
});

describe("Perplexity", () => {
  it("is off without a key and makes no request", async () => {
    fakeFetch(() => new Response("{}"));
    await expect(perplexityResearch({ system: "s", query: "q" })).rejects.toBeInstanceOf(MissingKeyError);
    expect(seen).toHaveLength(0);
  });

  it("sends the key only to api.perplexity.ai, in the Authorization header", async () => {
    updateSettings({ perplexityApiKey: FAKE_PERPLEXITY });
    fakeFetch(() => Response.json({ choices: [{ message: { content: "notes" } }], search_results: [{ title: "Docs", url: "https://example.com/docs" }] }));
    const r = await perplexityResearch({ system: "s", query: "q", domains: ["example.com"] });
    expect(r.text).toBe("notes");
    expect(seen).toHaveLength(1);
    expect(seen[0].url.host).toBe("api.perplexity.ai");
    expect(seen[0].headers.get("authorization")).toBe(`Bearer ${FAKE_PERPLEXITY}`);
    expect(seen[0].url.href).not.toContain(FAKE_PERPLEXITY);
    expect(seen[0].body).not.toContain(FAKE_PERPLEXITY);
  });

  it("says plainly when the key is rejected", async () => {
    updateSettings({ perplexityApiKey: FAKE_PERPLEXITY });
    fakeFetch(() => Response.json({ error: { message: "Invalid API key" } }, { status: 401 }));
    await expect(perplexityResearch({ system: "s", query: "q" })).rejects.toThrow("Perplexity rejected your API key (401). Check it in Settings.");
  });
});

describe("Claude API", () => {
  const call = { model: "claude-sonnet-5", system: "Answer in JSON.", content: [text("hi")], schema: z.object({ ok: z.boolean() }) };

  it("is off without a key and makes no request, even with other Anthropic credentials around", async () => {
    process.env.ANTHROPIC_AUTH_TOKEN = "some-other-token-that-must-not-be-used";
    fakeFetch(() => new Response("{}"));
    await expect(claudeJson(call)).rejects.toBeInstanceOf(MissingKeyError);
    expect(seen).toHaveLength(0);
  });

  it("sends the key only to api.anthropic.com, in the x-api-key header", async () => {
    updateSettings({ anthropicApiKey: FAKE_ANTHROPIC });
    process.env.ANTHROPIC_BASE_URL = "https://somewhere-else.example";
    process.env.ANTHROPIC_AUTH_TOKEN = "some-other-token-that-must-not-be-used";
    const events = [
      { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: call.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: '{"ok":true}' } },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 5 } },
      { type: "message_stop" },
    ];
    const sse = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
    fakeFetch(() => new Response(sse, { headers: { "content-type": "text/event-stream" } }));

    const r = await claudeJson(call);
    expect(r.data).toEqual({ ok: true });
    expect(seen).toHaveLength(1);
    expect(seen[0].url.host).toBe("api.anthropic.com");
    expect(seen[0].headers.get("x-api-key")).toBe(FAKE_ANTHROPIC);
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].url.href).not.toContain(FAKE_ANTHROPIC);
    expect(seen[0].body).not.toContain(FAKE_ANTHROPIC);
  });

  it("says plainly when the key is rejected", async () => {
    updateSettings({ anthropicApiKey: "sk-ant-api03-ANOTHERFAKEKEY-rejected-0000" });
    fakeFetch(() => Response.json({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, { status: 401 }));
    await expect(claudeJson(call)).rejects.toThrow("Anthropic rejected your API key (401). Check it in Settings.");
    expect(seen).toHaveLength(1);
  });
});

describe("docs research", () => {
  it("is skipped without a Perplexity key: the starter profile is used as it is", async () => {
    fakeFetch(() => new Response("{}"));
    const r = await ensureProfile("seedance-2-0");
    expect(r).toMatchObject({ researched: false, researchOff: true, costUsd: 0 });
    expect(r.profile.blueprint.length).toBeGreaterThan(2);
    expect(seen).toHaveLength(0);
  });
});
