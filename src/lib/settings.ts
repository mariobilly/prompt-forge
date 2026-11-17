import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Your own keys and choices. A key comes from Settings (saved in your user profile, never in the app's
// folder) or from an environment variable; a key saved in Settings wins. Keys are only ever sent to their
// own service and never go back to the browser in full.

export type ClaudeProvider = "api" | "claude-code";
export type KeyName = "anthropic" | "perplexity";

type Stored = { anthropicApiKey?: string; perplexityApiKey?: string; claudeProvider?: ClaudeProvider };

const FIELD = { anthropic: "anthropicApiKey", perplexity: "perplexityApiKey" } as const;
export const KEY_ENV: Record<KeyName, string> = { anthropic: "ANTHROPIC_API_KEY", perplexity: "PERPLEXITY_API_KEY" };
export const KEY_HOST: Record<KeyName, string> = { anthropic: "api.anthropic.com", perplexity: "api.perplexity.ai" };
export const KEY_URL: Record<KeyName, string> = {
  anthropic: "https://platform.claude.com/settings/keys",
  perplexity: "https://console.perplexity.ai/project/keys",
};

// Where PromptForge keeps your data: the prompt database and settings.json.
// %LOCALAPPDATA%\PromptForge on Windows; PROMPTFORGE_DATA_DIR overrides it.
export function dataDir(): string {
  if (process.env.PROMPTFORGE_DATA_DIR) return path.resolve(process.env.PROMPTFORGE_DATA_DIR);
  if (process.platform === "win32") return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "PromptForge");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "PromptForge");
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "PromptForge");
}

export function settingsFile(): string {
  return path.join(dataDir(), "settings.json");
}

function read(): Stored {
  try {
    const s = JSON.parse(fs.readFileSync(settingsFile(), "utf8"));
    return s && typeof s === "object" ? (s as Stored) : {};
  } catch {
    return {};
  }
}

function write(s: Stored): void {
  fs.mkdirSync(dataDir(), { recursive: true });
  const tmp = `${settingsFile()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, settingsFile());
}

export function apiKey(name: KeyName): string | null {
  return read()[FIELD[name]]?.trim() || process.env[KEY_ENV[name]]?.trim() || null;
}

function keySource(name: KeyName): "settings" | "env" | null {
  if (read()[FIELD[name]]?.trim()) return "settings";
  return process.env[KEY_ENV[name]]?.trim() ? "env" : null;
}

// "api" bills your own Anthropic API key; "claude-code" runs the Claude Code CLI you installed and logged
// in to with your own Claude plan. It is never picked unless you choose it.
export function claudeProvider(): ClaudeProvider {
  const saved = read().claudeProvider;
  if (saved === "api" || saved === "claude-code") return saved;
  const env = process.env.PF_CLAUDE_PROVIDER;
  return env === "claude-code" || env === "subscription" ? "claude-code" : "api";
}

// Shows only the key's prefix and last 4 characters, e.g. "sk-...a1b2".
export function maskKey(key: string): string {
  if (key.length < 16) return "****";
  const prefix = key.match(/^[A-Za-z]{2,5}-/)?.[0] ?? "";
  return `${prefix}...${key.slice(-4)}`;
}

export class MissingKeyError extends Error {
  readonly service: KeyName;
  constructor(service: KeyName) {
    super(
      service === "anthropic"
        ? `Add your Anthropic API key in Settings to use Claude (get one at ${KEY_URL.anthropic}), or choose Claude Code in Settings if you have a Claude plan.`
        : `Add your Perplexity API key in Settings to research model docs (get one at ${KEY_URL.perplexity}).`,
    );
    this.name = "MissingKeyError";
    this.service = service;
  }
}

export function claudeReady(): boolean {
  return claudeProvider() === "claude-code" || !!apiKey("anthropic");
}

export function perplexityReady(): boolean {
  return !!apiKey("perplexity");
}

export function requireClaude(): void {
  if (!claudeReady()) throw new MissingKeyError("anthropic");
}

export function requirePerplexity(): void {
  if (!perplexityReady()) throw new MissingKeyError("perplexity");
}

export type KeyStatus = { set: boolean; source: "settings" | "env" | null; masked: string | null; env: string; host: string; getKeyUrl: string };

export type PublicSettings = {
  claudeProvider: ClaudeProvider;
  keys: Record<KeyName, KeyStatus>;
  ready: { claude: boolean; perplexity: boolean };
  settingsFile: string;
};

// What the browser may see: never a full key.
export function publicSettings(): PublicSettings {
  const status = (name: KeyName): KeyStatus => {
    const key = apiKey(name);
    return { set: !!key, source: keySource(name), masked: key ? maskKey(key) : null, env: KEY_ENV[name], host: KEY_HOST[name], getKeyUrl: KEY_URL[name] };
  };
  return {
    claudeProvider: claudeProvider(),
    keys: { anthropic: status("anthropic"), perplexity: status("perplexity") },
    ready: { claude: claudeReady(), perplexity: perplexityReady() },
    settingsFile: settingsFile(),
  };
}

export type SettingsPatch = { anthropicApiKey?: string | null; perplexityApiKey?: string | null; claudeProvider?: ClaudeProvider };

// An empty string or null removes a saved key.
export function updateSettings(patch: SettingsPatch): void {
  const next = read();
  for (const field of Object.values(FIELD)) {
    if (!(field in patch)) continue;
    const value = patch[field];
    if (value == null || value.trim() === "") {
      delete next[field];
      continue;
    }
    const key = value.trim();
    if (!/^[\x21-\x7e]{16,400}$/.test(key)) throw new Error("That doesn't look like an API key: paste the whole key, without spaces.");
    next[field] = key;
  }
  if (patch.claudeProvider !== undefined) {
    if (patch.claudeProvider !== "api" && patch.claudeProvider !== "claude-code") throw new Error("Unknown Claude provider");
    next.claudeProvider = patch.claudeProvider;
  }
  write(next);
}
