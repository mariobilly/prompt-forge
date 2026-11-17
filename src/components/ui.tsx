"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "./icons";

export function CopyButton({ text, label = "Copy", className = "btn-ghost" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <CheckIcon /> : <CopyIcon />}
      {done ? "Copied" : label}
    </button>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 90 ? "text-good bg-good/10 border-good/25" : score >= 70 ? "text-warn bg-warn/10 border-warn/25" : "text-bad bg-bad/10 border-bad/25";
  return <span className={`inline-flex h-6 items-center rounded-md border px-1.5 font-mono text-xs font-medium tabular-nums ${tone}`}>{Math.round(score)}</span>;
}

export function verifiedLabel(lastVerified: string | null): { text: string; ok: boolean } {
  if (!lastVerified) return { text: "not yet researched", ok: false };
  const days = Math.floor((Date.now() - new Date(lastVerified).getTime()) / 86_400_000);
  return { text: days === 0 ? "docs verified today" : `docs verified ${days}d ago`, ok: days <= 14 };
}
