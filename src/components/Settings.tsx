"use client";

import { useEffect, useState } from "react";
import type { ClaudeProvider, KeyName, KeyStatus, PublicSettings, SettingsPatch } from "@/lib/settings";
import { CheckIcon } from "./icons";

const FIELD: Record<KeyName, "anthropicApiKey" | "perplexityApiKey"> = { anthropic: "anthropicApiKey", perplexity: "perplexityApiKey" };

async function put(patch: SettingsPatch): Promise<PublicSettings> {
  const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as PublicSettings;
}

export function Settings() {
  const [s, setS] = useState<PublicSettings | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then(setS);
  }, []);

  async function apply(patch: SettingsPatch, done: string): Promise<boolean> {
    setError("");
    setNotice("");
    try {
      setS(await put(patch));
      setNotice(done);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  if (!s) return <div className="text-[13px] text-muted">Loading…</div>;

  const provider = (value: ClaudeProvider, title: string, text: string) => (
    <button
      type="button"
      data-testid={`provider-${value}`}
      onClick={() => s.claudeProvider !== value && apply({ claudeProvider: value }, `Claude now runs through ${title}.`)}
      className={`rounded-lg border p-3 text-left transition-colors ${s.claudeProvider === value ? "border-accent/70 bg-accent/5" : "border-line hover:border-line-strong"}`}
    >
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <span className={`grid h-3.5 w-3.5 place-items-center rounded-full border ${s.claudeProvider === value ? "border-accent bg-accent" : "border-line-strong"}`} />
        {title}
      </div>
      <p className="mt-1 text-xs leading-5 text-muted">{text}</p>
    </button>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-[13px] leading-5 text-muted">
          PromptForge runs on your computer and uses your own accounts. Keys you save here stay on this computer, in{" "}
          <code className="font-mono text-xs text-text">{s.settingsFile}</code>, and each key is sent only to its own service. The page only ever shows
          the start and the last 4 characters of a key.
        </p>
      </div>

      {error && <div className="rounded-lg border border-bad/30 bg-bad/5 px-4 py-3 text-[13px] text-bad">{error}</div>}
      {notice && (
        <div className="flex items-center gap-2 rounded-lg border border-good/30 bg-good/5 px-4 py-3 text-[13px] text-good">
          <CheckIcon /> {notice}
        </div>
      )}

      <section className="card space-y-4 p-5">
        <div>
          <h2 className="section-title flex items-center gap-2">
            Claude <span className="chip">needed to forge</span>
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted">Reads your idea, writes the prompt block by block and reviews it against the model&apos;s docs.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {provider("api", "Anthropic API key", "Pay per use with your own key. Each forge shows what it cost, and the Library shows this month's total.")}
          {provider("claude-code", "Claude Code", "Uses your own Claude plan through the Claude Code app installed and logged in on this computer. No key needed here.")}
        </div>
        {s.claudeProvider === "api" ? (
          <KeyField name="anthropic" label="Anthropic API key" status={s.keys.anthropic} apply={apply} />
        ) : (
          <p className="rounded-md border border-line bg-panel-2 px-3 py-2.5 text-xs leading-5 text-muted">
            Install Claude Code (see{" "}
            <a className="text-accent-2 hover:underline" href="https://code.claude.com/docs/en/setup" target="_blank" rel="noreferrer">
              code.claude.com
            </a>
            ) and run <code className="font-mono text-text">claude</code> once in a terminal to log in. PromptForge runs it as a plain model call, with its
            tools, MCP servers and settings turned off; the usage counts against your plan&apos;s limits.
          </p>
        )}
      </section>

      <section className="card space-y-4 p-5">
        <div>
          <h2 className="section-title flex items-center gap-2">
            Perplexity <span className="chip">optional</span>
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            Researches each model&apos;s official docs, so prompts follow the latest documented rules, and powers &quot;Suggest best 3 models&quot;,
            &quot;Add any model&quot; and &quot;Refresh from web&quot;. Without it, PromptForge forges from its built-in starter profiles.
          </p>
        </div>
        <KeyField name="perplexity" label="Perplexity API key" status={s.keys.perplexity} apply={apply} />
      </section>
    </div>
  );
}

function KeyField({ name, label, status, apply }: { name: KeyName; label: string; status: KeyStatus; apply: (p: SettingsPatch, done: string) => Promise<boolean> }) {
  const [value, setValue] = useState("");
  const site = new URL(status.getKeyUrl).hostname;
  return (
    <div className="space-y-2">
      <label className="label" htmlFor={`${name}-key`}>
        {label}
      </label>
      <div data-testid={`${name}-status`} className="flex min-h-7 items-center gap-2 text-[13px]">
        {status.set ? (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-good" />
            <code className="font-mono">{status.masked}</code>
            <span className="text-xs text-faint">{status.source === "env" ? `from the ${status.env} environment variable` : "saved in Settings"}</span>
          </>
        ) : (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-warn" />
            <span className="text-muted">No key yet</span>
          </>
        )}
        {status.source === "settings" && (
          <button type="button" className="btn-ghost ml-auto h-7 text-bad" onClick={() => apply({ [FIELD[name]]: null }, `${label} removed.`)}>
            Remove
          </button>
        )}
      </div>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await apply({ [FIELD[name]]: value }, `${label} saved.`)) setValue("");
        }}
      >
        <input
          id={`${name}-key`}
          type="password"
          autoComplete="off"
          spellCheck={false}
          className="input font-mono"
          placeholder={status.set ? "Paste a new key to replace it" : "Paste your key"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button className="btn-primary shrink-0" disabled={!value.trim()}>
          Save
        </button>
      </form>
      <p className="text-xs leading-5 text-faint">
        Get a key at{" "}
        <a className="text-accent-2 hover:underline" href={status.getKeyUrl} target="_blank" rel="noreferrer">
          {site}
        </a>
        . It is sent only to <code className="font-mono">{status.host}</code>. You can also set the <code className="font-mono">{status.env}</code>{" "}
        environment variable; a key saved here takes priority.
      </p>
    </div>
  );
}
