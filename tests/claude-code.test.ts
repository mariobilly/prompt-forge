import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// The Claude Code CLI is replaced by a fake process: these tests never start the real CLI.
type Spawned = { cmd: string; args: string[]; env: NodeJS.ProcessEnv; stdin: string };
const spawned: Spawned[] = [];

vi.mock("node:child_process", () => ({
  spawn: (cmd: string, args: string[], opts: { env: NodeJS.ProcessEnv }) => {
    const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() }) as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      stdin: { end: (s: string) => void };
    };
    child.stdin = {
      end: (input: string) => {
        spawned.push({ cmd, args, env: opts.env, stdin: input });
        setImmediate(() => {
          const result = { type: "result", subtype: "success", is_error: false, structured_output: { ok: true } };
          child.stdout.emit("data", Buffer.from(JSON.stringify(result) + "\n"));
          child.emit("close", 0);
        });
      },
    };
    return child;
  },
}));

const ENV = ["ANTHROPIC_API_KEY", "PF_CLAUDE_PROVIDER", "PF_CLAUDE_BIN", "PROMPTFORGE_DATA_DIR"];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

beforeAll(() => {
  process.env.PROMPTFORGE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "promptforge-test-"));
  process.env.PF_CLAUDE_BIN = path.join(os.tmpdir(), "no-such-folder", "claude.exe");
  process.env.ANTHROPIC_API_KEY = "sk-ant-api03-FAKEFAKEFAKEFAKEFAKE-test-a1b2";
  delete process.env.PF_CLAUDE_PROVIDER;
});

afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("Claude Code provider", () => {
  it("runs the CLI as a plain model call, without tools, settings or an API key", async () => {
    const { updateSettings, publicSettings } = await import("../src/lib/settings");
    const { claudeJson, text } = await import("../src/lib/llm/claude");
    updateSettings({ claudeProvider: "claude-code" });
    expect(publicSettings().ready.claude).toBe(true);

    const r = await claudeJson({ model: "claude-sonnet-5", system: "Answer in JSON.", content: [text("hi")], schema: z.object({ ok: z.boolean() }) });
    expect(r).toEqual({ data: { ok: true }, costUsd: 0 });

    expect(spawned).toHaveLength(1);
    const { cmd, args, env, stdin } = spawned[0];
    expect(cmd).toBe(process.env.PF_CLAUDE_BIN);
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    for (const flag of ["-p", "--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence"]) expect(args).toContain(flag);
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args[args.indexOf("--setting-sources") + 1]).toBe("");
    expect(JSON.parse(stdin).message.content[0]).toEqual({ type: "text", text: "hi" });
  });
});
