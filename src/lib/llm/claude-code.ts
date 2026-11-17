import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { logSpend } from "../db";
import type { JsonCall } from "./claude";

// Runs Claude through the locally installed Claude Code CLI in headless mode, so calls use the
// user's own Claude subscription login instead of an API key. Tools, MCP servers, skills, hooks
// and settings are all disabled: the CLI acts purely as a model call. It is only used when you choose
// Claude Code in Settings (or set PF_CLAUDE_PROVIDER=claude-code).

function claudeBin(): string {
  if (process.env.PF_CLAUDE_BIN) return process.env.PF_CLAUDE_BIN;
  const local = path.join(os.homedir(), ".local", "bin", process.platform === "win32" ? "claude.exe" : "claude");
  return fs.existsSync(local) ? local : "claude";
}

// A neutral, empty working directory so no project CLAUDE.md is picked up.
const WORK_DIR = path.join(os.tmpdir(), "promptforge-claude");

type ResultLine = {
  type: "result";
  subtype: string;
  is_error: boolean;
  result?: string;
  structured_output?: unknown;
  total_cost_usd?: number;
  api_error_status?: string | null;
};

export async function claudeCodeJson<S extends z.ZodType>(call: JsonCall<S>): Promise<{ data: z.infer<S>; costUsd: number }> {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  const sysFile = path.join(WORK_DIR, `system-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  fs.writeFileSync(sysFile, [call.system, call.context].filter(Boolean).join("\n\n"));

  const schema = zodOutputFormat(call.schema).schema;
  const args = [
    "-p",
    "--input-format", "stream-json",
    "--output-format", "stream-json",
    "--verbose",
    "--model", call.model,
    "--effort", call.effort ?? "medium",
    "--system-prompt-file", sysFile,
    "--json-schema", JSON.stringify(schema),
    "--tools", "",
    "--setting-sources", "",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--no-session-persistence",
  ];
  if (call.onText) args.push("--include-partial-messages");

  const input = JSON.stringify({ type: "user", message: { role: "user", content: call.content } }) + "\n";

  try {
    const result = await new Promise<ResultLine>((resolve, reject) => {
      // Drop an API key from the environment so the CLI uses the subscription login.
      const env = { ...process.env };
      delete env.ANTHROPIC_API_KEY;
      const child = spawn(claudeBin(), args, { cwd: WORK_DIR, env, windowsHide: true });
      let buf = "";
      let stderr = "";
      let final: ResultLine | null = null;

      child.stdout.on("data", (chunk: Buffer) => {
        buf += chunk.toString("utf8");
        const lines = buf.split("\n");
        buf = lines.pop()!;
        for (const line of lines) {
          if (!line.trim()) continue;
          let msg: { type: string; event?: { type: string; delta?: { type: string; text?: string; partial_json?: string } } };
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }
          if (msg.type === "stream_event" && msg.event?.type === "content_block_delta" && call.onText) {
            const d = msg.event.delta;
            // Structured output arrives as tool-input JSON; forward it like streamed text.
            if (d?.type === "input_json_delta" && d.partial_json) call.onText(d.partial_json);
            else if (d?.type === "text_delta" && d.text) call.onText(d.text);
          }
          if (msg.type === "result") final = msg as unknown as ResultLine;
        }
      });
      child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
      child.on("error", (e) =>
        reject(new Error(`Could not start Claude Code (${e.message}). Install it and run "claude" once to log in, or switch to an Anthropic API key in Settings.`)),
      );
      child.on("close", (code) => {
        if (final) resolve(final);
        else reject(new Error(`Claude Code exited with code ${code}: ${stderr.slice(-500) || "no output"}`));
      });
      child.stdin.end(input);
    });

    if (result.is_error || result.subtype !== "success") {
      const detail = result.result || result.api_error_status || result.subtype;
      throw new Error(/login|auth|401/i.test(String(detail))
        ? `Claude Code is not logged in. Run "claude" in a terminal and log in with your Claude plan. (${detail})`
        : `Claude Code error: ${detail}`);
    }

    // Usage counts against the plan's limits, not money; record it as $0.
    logSpend("claude-plan", call.model, 0);

    const parsed = call.schema.safeParse(result.structured_output ?? JSON.parse(result.result ?? "null"));
    if (!parsed.success) throw new Error("Claude returned output that did not match the expected format.");
    return { data: parsed.data, costUsd: 0 };
  } finally {
    fs.rmSync(sysFile, { force: true });
  }
}
