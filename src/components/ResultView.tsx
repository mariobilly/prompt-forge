"use client";

import type { Citation, Critique, ForgedPrompt } from "@/lib/types";
import { CheckIcon } from "./icons";
import { CopyButton, ScoreBadge } from "./ui";

const SEV = { critical: "text-bad bg-bad/10", major: "text-warn bg-warn/10", minor: "text-muted bg-hover" } as const;

export function fullPromptText(r: ForgedPrompt): string {
  const parts = [r.prompt];
  if (r.negativePrompt) parts.push(`Negative prompt: ${r.negativePrompt}`);
  if (r.params.length) parts.push(r.params.map((p) => `${p.name}: ${p.value}`).join("\n"));
  return parts.join("\n\n");
}

export function ResultView({ result, critique, citations }: { result: ForgedPrompt; critique: Critique; citations?: Citation[] }) {
  return (
    <div className="space-y-4">
      <section className="card overflow-hidden">
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <div className="flex items-center gap-2">
            <h3 className="section-title">Final prompt</h3>
            <ScoreBadge score={critique.score} />
          </div>
          <CopyButton text={fullPromptText(result)} label="Copy all" />
        </header>
        <div className="relative">
          <div className="absolute right-3 top-3 z-10">
            <CopyButton text={result.prompt} label="Copy" className="btn-primary shadow-lg shadow-black/40" />
          </div>
          <pre dir="auto" className="min-h-[360px] max-h-[75vh] overflow-auto whitespace-pre-wrap bg-panel-2/60 p-5 pr-28 font-mono text-[14px] leading-7 text-text">
            {result.prompt}
          </pre>
        </div>
        {(result.negativePrompt || result.params.length > 0) && (
          <div className="space-y-3 border-t border-line p-4">
            {result.negativePrompt && (
              <div>
                <div className="label">Negative prompt</div>
                <div className="relative">
                  <div className="absolute right-2 top-2">
                    <CopyButton text={result.negativePrompt} />
                  </div>
                  <pre className="whitespace-pre-wrap rounded-md border border-line bg-panel-2 p-3 pr-24 font-mono text-[13px] leading-6">{result.negativePrompt}</pre>
                </div>
              </div>
            )}
            {result.params.length > 0 && (
              <div>
                <div className="label">Settings</div>
                <div className="flex flex-wrap gap-1.5">
                  {result.params.map((p) => (
                    <span key={p.name} className="rounded-md border border-line bg-panel-2 px-2 py-1 font-mono text-xs">
                      <span className="text-muted">{p.name}</span> <span className="text-text">{p.value}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <header className="border-b border-line px-4 py-2.5">
          <h3 className="section-title">Blueprint breakdown</h3>
        </header>
        <ol className="divide-y divide-line">
          {result.blocks.map((b, i) => (
            <li key={b.key + i} className="grid grid-cols-[28px_1fr] gap-x-2 px-4 py-3">
              <span className="mt-0.5 grid h-5 w-5 place-items-center rounded bg-hover font-mono text-[11px] text-muted">{i + 1}</span>
              <div className="min-w-0">
                <div className="text-[13px] font-medium">{b.title}</div>
                <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-6 text-text/90">{b.content}</p>
                <p className="mt-1 text-xs text-faint">{b.why}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-4">
          <h3 className="section-title mb-2">Doc checks passed</h3>
          <ul className="space-y-1.5 text-[13px]">
            {critique.passed.map((p) => (
              <li key={p} className="flex gap-2">
                <CheckIcon className="mt-1 h-3.5 w-3.5 shrink-0 text-good" />
                {p}
              </li>
            ))}
          </ul>
          {critique.issues.length > 0 && (
            <>
              <h3 className="section-title mb-2 mt-5">Remaining notes</h3>
              <ul className="space-y-2.5 text-[13px]">
                {critique.issues.map((i, n) => (
                  <li key={n}>
                    <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium capitalize ${SEV[i.severity]}`}>{i.severity}</span>
                    {i.issue}
                    <div className="mt-0.5 text-xs text-muted">Fix: {i.fix}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
        <section className="card p-4">
          {result.notes.length > 0 && (
            <>
              <h3 className="section-title mb-2">Usage notes</h3>
              <ul className="mb-5 list-disc space-y-1.5 pl-4 text-[13px] marker:text-faint">
                {result.notes.map((n) => <li key={n}>{n}</li>)}
              </ul>
            </>
          )}
          {citations && citations.length > 0 && (
            <>
              <h3 className="section-title mb-2">Grounded in</h3>
              <ul className="space-y-1 text-[13px]">
                {citations.slice(0, 10).map((c) => (
                  <li key={c.url} className="truncate">
                    <a href={c.url} target="_blank" rel="noreferrer" className="text-accent-2 hover:underline">{c.title}</a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
