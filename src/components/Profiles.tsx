"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CATEGORIES, type Category, type Profile } from "@/lib/types";
import { CATEGORY_LABEL, PlatformTags } from "./ModelPicker";
import { verifiedLabel } from "./ui";

async function json<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as T;
}

export function Profiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState({ name: "", vendor: "", category: "video" as Category, docsUrl: "" });
  const [editing, setEditing] = useState<string | null>(null);
  // Researching docs needs Claude and your Perplexity key; browsing and editing profiles need neither.
  const [canResearch, setCanResearch] = useState(true);

  const load = () => fetch("/api/profiles").then((r) => r.json()).then(setProfiles);
  useEffect(() => {
    load();
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: { ready: { claude: boolean; perplexity: boolean } }) => setCanResearch(s.ready.claude && s.ready.perplexity));
  }, []);

  const current = profiles.find((p) => p.id === selected) ?? null;
  const shown = profiles.filter((p) => `${p.name} ${p.vendor} ${p.category} ${p.platforms.join(" ")}`.toLowerCase().includes(filter.toLowerCase()));

  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  const refresh = (id: string, deep = false) =>
    act(deep ? "Deep research (can take several minutes)…" : "Researching live docs…", () => fetch(`/api/profiles/${id}${deep ? "?deep=1" : ""}`, { method: "POST" }).then(json));

  const add = () =>
    act(`Researching ${adding.name}…`, async () => {
      const r = await json<{ profile: Profile }>(await fetch("/api/profiles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(adding) }));
      setSelected(r.profile.id);
      setAdding({ name: "", vendor: "", category: adding.category, docsUrl: "" });
    });

  return (
    <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
      <div className="space-y-4">
        <div className="card space-y-2 p-4">
          <h3 className="section-title">Add any model</h3>
          <p className="text-xs text-muted">Type any model name. Perplexity researches its official docs and Claude builds a profile and blueprint for it.</p>
          <input className="input" placeholder="Model name, e.g. Kling 3.1 or Hailuo 03" value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Vendor (optional)" value={adding.vendor} onChange={(e) => setAdding({ ...adding, vendor: e.target.value })} />
            <select className="input" value={adding.category} onChange={(e) => setAdding({ ...adding, category: e.target.value as Category })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
          </div>
          <input className="input" placeholder="Official docs URL (optional, improves accuracy)" value={adding.docsUrl} onChange={(e) => setAdding({ ...adding, docsUrl: e.target.value })} />
          <button className="btn-primary w-full" disabled={!adding.name.trim() || !!busy || !canResearch} onClick={add}>Research & add</button>
          {!canResearch && (
            <p data-testid="research-off" className="text-xs text-warn">
              Researching models needs Claude and your Perplexity API key. Add them in <Link href="/settings" className="underline">Settings</Link>.
            </p>
          )}
        </div>

        <input className="input" placeholder={`Filter ${profiles.length} models (name, vendor, krea, higgsfield, comfyui…)`} value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="card max-h-[70vh] divide-y divide-line overflow-auto">
          {shown.map((p) => {
            const v = verifiedLabel(p.lastVerified);
            return (
              <button key={p.id} onClick={() => { setSelected(p.id); setEditing(null); }} className={`block w-full px-3.5 py-2 text-left transition-colors hover:bg-hover ${selected === p.id ? "bg-hover" : ""}`}>
                <div className="flex items-center justify-between gap-2 text-[13px] font-medium">
                  {p.name}
                  <span className="shrink-0 text-[11px] font-normal text-faint">{CATEGORY_LABEL[p.category]}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-faint">
                  {p.lastVerified && <span title={v.text} className={`h-1.5 w-1.5 rounded-full ${v.ok ? "bg-good" : "bg-warn"}`} />}
                  {p.vendor}{p.custom ? " · custom" : ""}
                  <PlatformTags platforms={p.platforms} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-w-0 space-y-4">
        {busy && <div className="card flex items-center gap-2.5 px-4 py-3 text-[13px]"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" />{busy}</div>}
        {error && <div className="rounded-lg border border-bad/30 bg-bad/5 px-4 py-3 text-[13px] text-bad">{error}</div>}
        {!current && <div className="grid min-h-[420px] place-items-center rounded-lg border border-dashed border-line p-8 text-center text-[13px] text-muted">Select a model to see what the app knows about prompting it.</div>}
        {current && editing !== null && (
          <div className="card space-y-3 p-4">
            <h3 className="section-title">Edit {current.name} (JSON)</h3>
            <textarea className="input min-h-[520px] font-mono text-xs" value={editing} onChange={(e) => setEditing(e.target.value)} />
            <div className="flex gap-2">
              <button
                className="btn-primary"
                onClick={() =>
                  act("Saving…", async () => {
                    await json(await fetch(`/api/profiles/${current.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: editing }));
                    setEditing(null);
                  })
                }
              >
                Save
              </button>
              <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        )}
        {current && editing === null && <ProfileView p={current} busy={!!busy} canResearch={canResearch} onRefresh={refresh} onEdit={() => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { id, citations, lastVerified, custom, platforms, ...body } = current;
          setEditing(JSON.stringify(body, null, 2));
        }} onDelete={() => act("Deleting…", async () => { await json(await fetch(`/api/profiles/${current.id}`, { method: "DELETE" })); setSelected(null); })} />}
      </div>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section>
      <h4 className="label">{title}</h4>
      <ul className="list-disc space-y-1 pl-4 text-[13px] leading-6 marker:text-faint">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </section>
  );
}

function ProfileView({ p, busy, canResearch, onRefresh, onEdit, onDelete }: { p: Profile; busy: boolean; canResearch: boolean; onRefresh: (id: string, deep?: boolean) => void; onEdit: () => void; onDelete: () => void }) {
  const v = verifiedLabel(p.lastVerified);
  return (
    <div className="card space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{p.name}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-muted">{p.vendor} · {CATEGORY_LABEL[p.category]} · <span className={v.ok ? "text-good" : "text-faint"}>{v.text}</span> <PlatformTags platforms={p.platforms} /></p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" disabled={busy || !canResearch} title={canResearch ? undefined : "Needs Claude and your Perplexity key (Settings)"} onClick={() => onRefresh(p.id)}>Refresh from web</button>
          <button className="btn-ghost" disabled={busy || !canResearch} title={canResearch ? undefined : "Needs Claude and your Perplexity key (Settings)"} onClick={() => onRefresh(p.id, true)}>Deep research</button>
          <button className="btn-ghost" disabled={busy} onClick={onEdit}>Edit</button>
          {p.custom && <button className="btn-ghost text-bad" disabled={busy} onClick={onDelete}>Delete</button>}
        </div>
      </div>
      {p.summary && <p className="text-[13px] leading-6">{p.summary}</p>}
      <div className="grid gap-3 text-[13px] sm:grid-cols-3">
        <div><div className="label">Prompt format</div>{p.promptFormat || "—"}</div>
        <div><div className="label">Max length</div>{p.maxLength}</div>
        <div><div className="label">Negative prompt</div>{p.supportsNegativePrompt ? "Supported" : "Not supported"}</div>
      </div>

      <section>
        <h4 className="label">Blueprint (block order)</h4>
        <ol className="space-y-2">
          {p.blueprint.map((b, i) => (
            <li key={b.key} className="rounded-md border border-line bg-panel-2 px-3 py-2.5 text-[13px]">
              <span className="font-medium">{i + 1}. {b.title}</span>{!b.required && <span className="ml-2 chip">optional</span>}
              <p className="text-muted">{b.purpose}</p>
            </li>
          ))}
        </ol>
      </section>

      {p.params.length > 0 && (
        <section>
          <h4 className="label">Parameters</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <tbody className="divide-y divide-line">
                {p.params.map((x) => (
                  <tr key={x.name}><td className="py-1.5 pr-4 font-mono text-accent-2">{x.name}</td><td className="py-1.5 pr-4">{x.values}</td><td className="py-1.5 text-muted">{x.notes}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <List title="Rules (from docs)" items={p.rules} />
      <List title="Anti-patterns" items={p.antiPatterns} />
      <List title="Critic checklist" items={p.checklist} />
      <List title="Examples" items={p.examples} />

      {p.citations.length > 0 && (
        <section>
          <h4 className="label">Sources</h4>
          <ul className="space-y-1 text-[13px]">
            {p.citations.map((c) => <li key={c.url} className="truncate"><a className="text-accent-2 hover:underline" href={c.url} target="_blank" rel="noreferrer">{c.title}</a></li>)}
          </ul>
        </section>
      )}
      {!p.lastVerified && <p className="rounded-md border border-line bg-panel-2 px-3 py-2 text-[13px] text-muted">This is a starter profile. Refresh it (or forge once) to pull the rules from the official docs.</p>}
    </div>
  );
}
