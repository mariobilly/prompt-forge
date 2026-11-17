import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { Profile } from "./types";
import { SEED_PROFILES } from "./profiles/seeds";
import { dataDir } from "./settings";

const globalForDb = globalThis as unknown as { pfDb?: Database.Database };

// The database lives in your user profile (see dataDir) and is created empty on first start.
function open(): Database.Database {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, "promptforge.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      mode TEXT NOT NULL,
      model_id TEXT NOT NULL,
      input TEXT NOT NULL,
      result_json TEXT NOT NULL,
      score INTEGER NOT NULL,
      cost_usd REAL NOT NULL,
      saved INTEGER NOT NULL DEFAULT 0,
      title TEXT,
      tags TEXT
    );
    CREATE TABLE IF NOT EXISTS spend (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      usd REAL NOT NULL
    );
  `);
  // Add new catalog models; for existing rows keep researched content but refresh platform tags.
  const now = new Date().toISOString();
  const get = db.prepare("SELECT json FROM profiles WHERE id = ?");
  const upsert = db.prepare("INSERT OR REPLACE INTO profiles (id, json, updated_at) VALUES (?, ?, ?)");
  db.transaction(() => {
    // Drop starter rows that left the catalog, unless they were researched or added by the user.
    const seedIds = new Set(SEED_PROFILES.map((p) => p.id));
    for (const row of db.prepare("SELECT id, json FROM profiles").all() as { id: string; json: string }[]) {
      const p = JSON.parse(row.json) as Profile;
      if (!seedIds.has(row.id) && !p.custom && !p.lastVerified) db.prepare("DELETE FROM profiles WHERE id = ?").run(row.id);
    }
    for (const seed of SEED_PROFILES) {
      const row = get.get(seed.id) as { json: string } | undefined;
      if (!row) {
        upsert.run(seed.id, JSON.stringify(seed), now);
        continue;
      }
      const cur = JSON.parse(row.json) as Profile;
      const platforms = [...new Set([...(cur.platforms ?? []), ...seed.platforms])];
      if (platforms.length !== (cur.platforms ?? []).length) upsert.run(seed.id, JSON.stringify({ ...cur, platforms }), now);
    }
  })();
  return db;
}

export function db(): Database.Database {
  // Reuse one connection across hot reloads in dev.
  if (!globalForDb.pfDb) globalForDb.pfDb = open();
  return globalForDb.pfDb;
}

// Rows saved before platform tags existed have no "platforms" field.
function parseProfile(json: string): Profile {
  const p = JSON.parse(json) as Profile;
  return { ...p, platforms: p.platforms ?? [] };
}

export function listProfiles(): Profile[] {
  const rows = db().prepare("SELECT json FROM profiles").all() as { json: string }[];
  return rows
    .map((r) => parseProfile(r.json))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

export function getProfile(id: string): Profile | null {
  const row = db().prepare("SELECT json FROM profiles WHERE id = ?").get(id) as { json: string } | undefined;
  return row ? parseProfile(row.json) : null;
}

export function saveProfile(p: Profile): void {
  db()
    .prepare(
      "INSERT INTO profiles (id, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at",
    )
    .run(p.id, JSON.stringify(p), new Date().toISOString());
}

export function deleteProfile(id: string): void {
  db().prepare("DELETE FROM profiles WHERE id = ?").run(id);
}

export type HistoryRow = {
  id: number;
  created_at: string;
  mode: string;
  model_id: string;
  input: string;
  result_json: string;
  score: number;
  cost_usd: number;
  saved: number;
  title: string | null;
  tags: string | null;
};

export function addHistory(h: Omit<HistoryRow, "id" | "created_at" | "saved" | "title" | "tags">): number {
  const info = db()
    .prepare(
      "INSERT INTO history (created_at, mode, model_id, input, result_json, score, cost_usd) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(new Date().toISOString(), h.mode, h.model_id, h.input, h.result_json, h.score, h.cost_usd);
  return Number(info.lastInsertRowid);
}

export function listHistory(opts: { savedOnly?: boolean; q?: string }): HistoryRow[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.savedOnly) where.push("saved = 1");
  if (opts.q) {
    where.push("(input LIKE ? OR result_json LIKE ? OR title LIKE ? OR tags LIKE ? OR model_id LIKE ?)");
    const like = `%${opts.q}%`;
    args.push(like, like, like, like, like);
  }
  const sql = `SELECT * FROM history ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT 200`;
  return db().prepare(sql).all(...args) as HistoryRow[];
}

export function updateHistory(id: number, patch: { saved?: boolean; title?: string; tags?: string }): void {
  const cur = db().prepare("SELECT * FROM history WHERE id = ?").get(id) as HistoryRow | undefined;
  if (!cur) return;
  db()
    .prepare("UPDATE history SET saved = ?, title = ?, tags = ? WHERE id = ?")
    .run(
      patch.saved === undefined ? cur.saved : patch.saved ? 1 : 0,
      patch.title ?? cur.title,
      patch.tags ?? cur.tags,
      id,
    );
}

export function deleteHistory(id: number): void {
  db().prepare("DELETE FROM history WHERE id = ?").run(id);
}

export function logSpend(provider: string, model: string, usd: number): void {
  db().prepare("INSERT INTO spend (created_at, provider, model, usd) VALUES (?, ?, ?, ?)").run(new Date().toISOString(), provider, model, usd);
}

export function spendThisMonth(): { total: number; byProvider: { provider: string; usd: number }[] } {
  const month = new Date().toISOString().slice(0, 7);
  const byProvider = db()
    .prepare("SELECT provider, SUM(usd) AS usd FROM spend WHERE substr(created_at, 1, 7) = ? GROUP BY provider")
    .all(month) as { provider: string; usd: number }[];
  return { total: byProvider.reduce((a, r) => a + r.usd, 0), byProvider };
}
