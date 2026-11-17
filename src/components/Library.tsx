"use client";

import { useCallback, useEffect, useState } from "react";
import type { HistoryRow } from "@/lib/db";
import type { Critique, ForgedPrompt } from "@/lib/types";
import { ResultView } from "./ResultView";
import { ScoreBadge } from "./ui";

export function Library() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [q, setQ] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [spend, setSpend] = useState<{ total: number; byProvider: { provider: string; usd: number }[] } | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams({ q, saved: savedOnly ? "1" : "0" });
    fetch(`/api/library?${params}`).then((r) => r.json()).then(setRows);
  }, [q, savedOnly]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    fetch("/api/stats").then((r) => r.json()).then((s) => setSpend(s.spend));
  }, []);

  async function patch(id: number, body: object) {
    await fetch(`/api/library/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input className="input max-w-sm" placeholder="Search prompts, models, tags…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={savedOnly} onChange={(e) => setSavedOnly(e.target.checked)} /> Saved only
        </label>
        {spend && (
          <span className="ml-auto text-sm text-muted">
            API spend this month: <span className="text-text">${spend.total.toFixed(2)}</span>
            {spend.byProvider.map((p) => ` · ${p.provider} $${p.usd.toFixed(2)}`)}
          </span>
        )}
      </div>

      {rows.length === 0 && <div className="card p-8 text-center text-muted">Nothing here yet. Forged prompts appear automatically.</div>}

      <div className="space-y-2">
        {rows.map((r) => {
          const data = JSON.parse(r.result_json) as { result: ForgedPrompt; critique: Critique };
          const isOpen = open === r.id;
          return (
            <div key={r.id} className="card">
              <div className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3" onClick={() => setOpen(isOpen ? null : r.id)}>
                <ScoreBadge score={r.score} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.title || r.input.slice(0, 120)}</div>
                  <div className="text-xs text-muted">
                    {r.model_id} · {r.mode} · {new Date(r.created_at).toLocaleString()} · ${r.cost_usd.toFixed(3)}
                    {r.tags && ` · ${r.tags}`}
                  </div>
                </div>
                <button className={`btn-ghost px-3 py-1 text-xs ${r.saved ? "text-warn" : ""}`} onClick={(e) => { e.stopPropagation(); patch(r.id, { saved: !r.saved }); }}>
                  {r.saved ? "Saved" : "Save"}
                </button>
              </div>
              {isOpen && (
                <div className="space-y-3 border-t border-line p-4">
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <input className="input" placeholder="Title" defaultValue={r.title ?? ""} onBlur={(e) => patch(r.id, { title: e.target.value })} />
                    <input className="input" placeholder="Tags, comma separated" defaultValue={r.tags ?? ""} onBlur={(e) => patch(r.id, { tags: e.target.value })} />
                    <button className="btn-ghost text-bad" onClick={async () => { await fetch(`/api/library/${r.id}`, { method: "DELETE" }); load(); }}>Delete</button>
                  </div>
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted">Original input</summary>
                    <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-panel-2 p-3 font-mono text-xs">{r.input}</pre>
                  </details>
                  <ResultView result={data.result} critique={data.critique} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
