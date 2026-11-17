import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { logSpend } from "../db";
import { apiKey, claudeProvider, KEY_HOST, MissingKeyError } from "../settings";
import { claudeCodeJson } from "./claude-code";

// Opus writes prompts; Sonnet handles the cheaper, high-volume passes (intake, critique).
export const WRITER_MODEL = process.env.PF_WRITER_MODEL || "claude-opus-5-5";
export const FAST_MODEL = process.env.PF_FAST_MODEL || "claude-sonnet-5";

// USD per million tokens: [input, output]. Cache reads bill at 10%, cache writes at 125% of input.
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-opus-5": [5, 25],
  "claude-sonnet-5": [2, 10],
  "claude-haiku-4-5": [1, 5],
};

// The client gets your key explicitly and a fixed host, so it never falls back to other credentials on the
// computer (ANTHROPIC_AUTH_TOKEN, a saved CLI login) and never sends the key anywhere but api.anthropic.com.
let client: { key: string; sdk: Anthropic } | null = null;
function anthropic(): Anthropic {
  const key = apiKey("anthropic");
  if (!key) throw new MissingKeyError("anthropic");
  if (client?.key !== key) client = { key, sdk: new Anthropic({ apiKey: key, authToken: null, baseURL: `https://${KEY_HOST.anthropic}` }) };
  return client.sdk;
}

function costOf(model: string, u: Anthropic.Usage): number {
  const [inP, outP] = PRICES[model] ?? PRICES["claude-opus-5"];
  const read = u.cache_read_input_tokens ?? 0;
  const write = u.cache_creation_input_tokens ?? 0;
  return (u.input_tokens * inP + read * inP * 0.1 + write * inP * 1.25 + u.output_tokens * outP) / 1_000_000;
}

export type JsonCall<S extends z.ZodType> = {
  model: string;
  system: string; // stable instructions - cached
  context?: string; // large but reusable per model (e.g. the profile) - cached
  content: Anthropic.ContentBlockParam[]; // per-request input
  schema: S;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens?: number;
  onText?: (delta: string) => void;
};

export async function claudeJson<S extends z.ZodType>(call: JsonCall<S>): Promise<{ data: z.infer<S>; costUsd: number }> {
  if (claudeProvider() === "claude-code") return claudeCodeJson(call);

  const system: Anthropic.TextBlockParam[] = [{ type: "text", text: call.system }];
  if (call.context) system.push({ type: "text", text: call.context });
  system[system.length - 1].cache_control = { type: "ephemeral" };

  const stream = anthropic().messages.stream({
    model: call.model,
    max_tokens: call.maxTokens ?? 32000,
    system,
    output_config: { effort: call.effort ?? "medium", format: zodOutputFormat(call.schema) },
    messages: [{ role: "user", content: call.content }],
  });
  if (call.onText) stream.on("text", (delta) => call.onText!(delta));

  let msg: Awaited<ReturnType<typeof stream.finalMessage>>;
  try {
    msg = await stream.finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      throw new Error(`Anthropic rejected your API key (${e.status}). Check it in Settings.`);
    }
    throw e;
  }
  const costUsd = costOf(call.model, msg.usage);
  logSpend("anthropic", call.model, costUsd);

  if (msg.stop_reason === "refusal") {
    throw new Error(`Claude declined this request${msg.stop_details?.explanation ? `: ${msg.stop_details.explanation}` : "."}`);
  }
  if (msg.stop_reason === "max_tokens") throw new Error("Claude ran out of output tokens - try a shorter request.");
  if (msg.parsed_output == null) throw new Error("Claude returned output that did not match the expected format.");
  return { data: msg.parsed_output as z.infer<S>, costUsd };
}

export function text(t: string): Anthropic.TextBlockParam {
  return { type: "text", text: t };
}

export function image(mediaType: string, data: string): Anthropic.ImageBlockParam {
  return {
    type: "image",
    source: { type: "base64", media_type: mediaType as Anthropic.Base64ImageSource["media_type"], data },
  };
}
