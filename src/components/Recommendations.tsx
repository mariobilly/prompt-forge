"use client";

import type { Recommendation } from "@/lib/types";
import { CheckIcon, HammerIcon, SparkIcon, XIcon } from "./icons";
import { CATEGORY_LABEL, PlatformTags } from "./ModelPicker";

const CONF = { high: "text-good", medium: "text-warn", low: "text-bad" } as const;
const RANK_STYLE = ["bg-accent text-white", "bg-hover text-text", "bg-hover text-text"];

export function Recommendations({
  rec,
  selectedId,
  busy,
  onUse,
  onForge,
  onClose,
}: {
  rec: Recommendation;
  selectedId: string;
  busy: boolean;
  onUse: (id: string) => void;
  onForge: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <section className="card">
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h3 className="section-title flex items-center gap-1.5">
            <SparkIcon className="h-3.5 w-3.5 text-accent-2" /> Best {rec.picks.length} models for this request
          </h3>
          <p className="mt-1 text-[13px] leading-5 text-muted">{rec.summary}</p>
        </div>
        <button className="btn-ghost h-7 w-7 shrink-0 px-0" onClick={onClose} aria-label="Close recommendations">
          <XIcon />
        </button>
      </header>

      <div className="flex flex-wrap gap-1 border-b border-line px-4 py-2.5">
        <span className="chip border-accent/40 text-accent-2">{CATEGORY_LABEL[rec.analysis.category]}</span>
        {rec.analysis.requirements.map((r) => (
          <span key={r} className="chip">{r}</span>
        ))}
      </div>

      <ol className="grid gap-3 p-4 xl:grid-cols-3">
        {rec.picks.map((p) => {
          const selected = p.profile.id === selectedId;
          return (
            <li key={p.profile.id} className={`flex flex-col rounded-lg border bg-panel-2 p-4 transition-colors ${selected ? "border-accent/70" : "border-line hover:border-line-strong"}`}>
              <div className="flex items-start gap-2.5">
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md font-mono text-xs font-semibold ${RANK_STYLE[p.rank - 1]}`}>{p.rank}</span>
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold leading-6">{p.profile.name}</div>
                  <div className="flex flex-wrap items-center gap-1 text-xs text-muted">
                    {p.profile.vendor} <PlatformTags platforms={p.profile.platforms} />
                  </div>
                </div>
              </div>
              <p className="mt-3 text-[13px] leading-5">{p.verdict}</p>
              <ul className="mt-3 space-y-1.5 text-[13px] leading-5">
                {p.strengths.map((s) => (
                  <li key={s} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-good" />{s}</li>
                ))}
                {p.watchOuts.map((w) => (
                  <li key={w} className="flex gap-2 text-muted"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-warn" />{w}</li>
                ))}
              </ul>
              <p className="mt-3 rounded-md border border-line bg-panel px-2.5 py-2 text-xs leading-5 text-muted">
                <span className="font-medium text-text">Tip · </span>{p.tip}
              </p>
              <div className="mt-auto flex items-center gap-2 pt-4">
                <span className={`mr-auto text-xs capitalize ${CONF[p.confidence]}`}>{p.confidence} confidence</span>
                <button className="btn-ghost" onClick={() => onUse(p.profile.id)} disabled={selected}>
                  {selected ? <><CheckIcon /> Selected</> : "Use"}
                </button>
                <button className="btn-primary" onClick={() => onForge(p.profile.id)} disabled={busy}>
                  <HammerIcon /> Forge
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      {rec.citations.length > 0 && (
        <details className="border-t border-line px-4 py-2.5 text-[13px]">
          <summary className="cursor-pointer text-muted hover:text-text">Research sources ({rec.citations.length})</summary>
          <ul className="mt-2 space-y-1">
            {rec.citations.slice(0, 12).map((c) => (
              <li key={c.url} className="truncate">
                <a href={c.url} target="_blank" rel="noreferrer" className="text-accent-2 hover:underline">{c.title}</a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
